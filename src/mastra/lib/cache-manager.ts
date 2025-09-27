import NodeCache from 'node-cache';

import { logger } from './logger';

interface CacheManagerOptions {
  /** TTL in seconds (default: 60 seconds) */
  ttl?: number;
  /** Check period in seconds for automatic cleanup (default: 120 seconds) */
  checkPeriod?: number;
  /** Enable logging (default: true) */
  enableLogging?: boolean;
  /** Custom cache name for logging */
  cacheName?: string;
}

/**
 * Generic cache manager using node-cache with automatic TTL refresh
 */
export class CacheManager<T> {
  private cache: NodeCache;
  private enableLogging: boolean;
  private cacheName: string;

  constructor(
    private dataFetcher: (key: string) => Promise<T>,
    options: CacheManagerOptions = {}
  ) {
    const {
      ttl = 60, // 1 minute default
      checkPeriod = 120, // 2 minutes cleanup check
      enableLogging = true,
      cacheName = 'CacheManager',
    } = options;

    this.enableLogging = enableLogging;
    this.cacheName = cacheName;

    this.cache = new NodeCache({
      stdTTL: ttl,
      checkperiod: checkPeriod,
      useClones: false, // Better performance, be careful with object mutations
    });

    // Log cache events if logging is enabled
    if (this.enableLogging) {
      this.cache.on('set', (key: string, _value: T) => {
        logger.info(`${this.cacheName}: Cache set for key '${key}'`);
      });

      this.cache.on('del', (key: string, _value: T) => {
        logger.info(`${this.cacheName}: Cache deleted for key '${key}'`);
      });

      this.cache.on('expired', (key: string, _value: T) => {
        logger.info(`${this.cacheName}: Cache expired for key '${key}'`);
      });
    }
  }

  /**
   * Get data from cache or fetch if not cached/expired
   */
  async get(key: string): Promise<T> {
    const cached = this.cache.get<T>(key);

    if (cached !== undefined) {
      if (this.enableLogging) {
        logger.debug(`${this.cacheName}: Cache hit for key '${key}'`);
      }
      return cached;
    }

    // Cache miss - fetch fresh data
    try {
      if (this.enableLogging) {
        logger.debug(
          `${this.cacheName}: Cache miss for key '${key}', fetching fresh data`
        );
      }

      const data = await this.dataFetcher(key);
      this.cache.set(key, data);
      return data;
    } catch (error) {
      if (this.enableLogging) {
        logger.error(
          `${this.cacheName}: Failed to fetch data for key '${key}':`,
          error as Error
        );
      }
      throw error;
    }
  }

  /**
   * Manually set cache entry
   */
  set(key: string, data: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, data, ttl);
    }
    return this.cache.set(key, data);
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get TTL for a specific key
   */
  getTtl(key: string): number {
    const ttl = this.cache.getTtl(key);
    return ttl ?? 0;
  }

  /**
   * Clear cache for specific key
   */
  clear(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.cache.flushAll();
    if (this.enableLogging) {
      logger.info(`${this.cacheName}: All cache entries cleared`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const stats = this.cache.getStats();
    const keys = this.cache.keys();

    return {
      ...stats,
      keys,
      keyCount: keys.length,
    };
  }

  /**
   * Force refresh cache for specific key
   */
  async refresh(key: string): Promise<T> {
    this.cache.del(key);
    return this.get(key);
  }

  /**
   * Get all cached keys
   */
  getKeys(): string[] {
    return this.cache.keys();
  }

  /**
   * Take a snapshot of all cached data
   */
  exportData(): Record<string, T> {
    const keys = this.cache.keys();
    const data: Record<string, T> = {};

    keys.forEach((key: string) => {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        data[key] = value;
      }
    });

    return data;
  }

  /**
   * Cleanup and destroy the cache manager
   */
  destroy(): void {
    this.cache.close();
    if (this.enableLogging) {
      logger.info(`${this.cacheName}: Cache manager destroyed`);
    }
  }
}

/**
 * Create a cache manager instance
 */
export const createCacheManager = <T>(
  dataFetcher: (key: string) => Promise<T>,
  options?: CacheManagerOptions
): CacheManager<T> => new CacheManager(dataFetcher, options);
