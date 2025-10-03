import { createHash as cryptoCreateHash } from 'crypto';
import NodeCache from 'node-cache';

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface CacheManagerOptions<T> {
  name: string;
  ttlSeconds?: number;
  checkPeriodSeconds?: number;
  loadData: () => Promise<Map<string, T>>;
  getChangeHash: () => Promise<string>;
}

interface HashCheckRecord {
  hash: string;
  timestamp: number;
}

// ============================================================================
// Hash Utility - Uses SHA-256 for collision-resistant hashing
// ============================================================================

export function createHash(str: string): string {
  return cryptoCreateHash('sha256').update(str).digest('hex');
}

// ============================================================================
// Cache Manager - Provides caching with automatic change detection
// ============================================================================

export class CacheManager<T> {
  private readonly cache: NodeCache;
  private readonly name: string;
  private readonly checkThrottleMs: number;
  private readonly loadData: () => Promise<Map<string, T>>;
  private readonly getChangeHash: () => Promise<string>;
  private readonly hashCheckCache = new Map<string, HashCheckRecord>();

  private isInitialized = false;
  private lastHash: string | null = null;
  private lastCheckTime = 0;

  constructor(options: CacheManagerOptions<T>) {
    this.name = options.name;
    this.loadData = options.loadData;
    this.getChangeHash = options.getChangeHash;

    const ttlSeconds = options.ttlSeconds ?? 3600;
    const checkPeriodSeconds = options.checkPeriodSeconds ?? 600;

    this.checkThrottleMs = checkPeriodSeconds * 1000;

    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: checkPeriodSeconds,
      useClones: false,
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug(`${this.name} already initialized`);
      return;
    }

    logger.info(`Initializing ${this.name}...`);

    try {
      await this.reload();
      this.isInitialized = true;
      logger.info(
        `${this.name} initialized with ${this.cache.keys().length} item(s)`
      );
    } catch (error) {
      logger.error(`Failed to initialize ${this.name}:`, error as Error);
      throw error;
    }
  }

  private async reload(): Promise<void> {
    try {
      const data = await this.loadData();

      this.cache.flushAll();

      for (const [key, value] of data.entries()) {
        this.cache.set(key, value);
      }

      this.lastHash = await this.getChangeHash();
      logger.info(`${this.name} loaded ${this.cache.keys().length} item(s)`);
    } catch (error) {
      logger.error(`Failed to reload ${this.name}:`, error as Error);
      throw error;
    }
  }

  private async checkForChanges(): Promise<void> {
    const now = Date.now();

    if (now - this.lastCheckTime < this.checkThrottleMs) {
      const nextCheckIn = Math.round(
        (this.checkThrottleMs - (now - this.lastCheckTime)) / 1000
      );
      logger.debug(
        `[${this.name}] Change check throttled, next check in ${nextCheckIn}s`
      );
      return;
    }

    this.lastCheckTime = now;
    logger.debug(`[${this.name}] Checking for changes...`);

    try {
      const currentHash = await this.getChangeHash();

      if (currentHash !== this.lastHash) {
        logger.info(`${this.name} changed, reloading...`);
        await this.reload();
      } else {
        logger.debug(`[${this.name}] No changes detected`);
      }
    } catch (error) {
      logger.error(`Failed to check ${this.name} changes:`, error as Error);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async get(key: string): Promise<T | null> {
    await this.checkForChanges();

    const value = this.cache.get<T>(key) ?? null;

    if (value !== null) {
      logger.debug(`[${this.name}] Cache hit: '${key}'`);
    } else {
      logger.debug(`[${this.name}] Cache miss: '${key}'`);
    }

    return value;
  }

  async getAll(): Promise<Map<string, T>> {
    await this.checkForChanges();

    const items = new Map<string, T>();
    const keys = this.cache.keys();

    for (const key of keys) {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        items.set(key, value);
      }
    }

    return items;
  }

  shutdown(): void {
    this.cache.close();
  }

  setWithHash(key: string, value: T, hash: string): void {
    this.cache.set(`${key}:data`, value);
    this.cache.set(`${key}:hash`, hash);
  }

  async getWithHash(
    key: string,
    getCurrentHash: () => Promise<string>,
    reload: () => Promise<T>
  ): Promise<T> {
    const cachedData = this.cache.get<T>(`${key}:data`);
    const cachedHash = this.cache.get<string>(`${key}:hash`);

    if (cachedData !== undefined && cachedHash !== undefined) {
      const now = Date.now();
      const lastHashCheck = this.hashCheckCache.get(key);

      if (
        lastHashCheck &&
        now - lastHashCheck.timestamp < this.checkThrottleMs
      ) {
        const verifiedAgo = Math.round((now - lastHashCheck.timestamp) / 1000);
        logger.debug(
          `[${this.name}] Cache hit: '${key}' (verified ${verifiedAgo}s ago)`
        );
        return cachedData;
      }

      const currentHash = await getCurrentHash();
      this.hashCheckCache.set(key, { hash: currentHash, timestamp: now });

      if (currentHash === cachedHash) {
        logger.debug(`[${this.name}] Cache hit: '${key}' (hash verified)`);
        return cachedData;
      }

      logger.debug(`[${this.name}] Cache invalidated: '${key}' (hash changed)`);
    } else {
      logger.debug(`[${this.name}] Cache miss: '${key}'`);
    }

    const newData = await reload();
    const newHash = await getCurrentHash();
    this.setWithHash(key, newData, newHash);
    this.hashCheckCache.set(key, { hash: newHash, timestamp: Date.now() });
    logger.debug(`[${this.name}] Loaded and cached: '${key}'`);

    return newData;
  }
}
