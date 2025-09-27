import { type CacheManager, createCacheManager } from './cache-manager';
import { logger } from './logger';

interface ChangeAwareCacheOptions {
  /** TTL for change detection polling in seconds (default: 10) */
  checkInterval?: number;
  /** TTL for actual data cache in seconds (default: 3600 - 1 hour) */
  dataCacheTtl?: number;
  /** Function to check if data has changed */
  changeDetector: (key: string) => Promise<boolean>;
  /** Cache name for logging */
  cacheName?: string;
  /** Enable logging */
  enableLogging?: boolean;
}

/**
 * Cache manager that only fetches fresh data when changes are detected
 */
export class ChangeAwareCache<T> {
  private dataCache: CacheManager<T>;
  private changeCheckCache: CacheManager<boolean>;
  private changeDetector: (key: string) => Promise<boolean>;
  private enableLogging: boolean;
  private cacheName: string;

  constructor(
    private dataFetcher: (key: string) => Promise<T>,
    options: ChangeAwareCacheOptions
  ) {
    const {
      checkInterval = 10, // Check for changes every 10 seconds
      dataCacheTtl = 3600, // Data cache lasts 1 hour (until change detected)
      changeDetector,
      cacheName = 'ChangeAwareCache',
      enableLogging = true,
    } = options;

    this.changeDetector = changeDetector;
    this.enableLogging = enableLogging;
    this.cacheName = cacheName;

    // Cache for actual data (long TTL, invalidated by changes)
    this.dataCache = createCacheManager<T>(
      async (key: string) => {
        if (this.enableLogging) {
          logger.info(
            `${this.cacheName}: Fetching fresh data for key '${key}'`
          );
        }
        return this.dataFetcher(key);
      },
      {
        ttl: dataCacheTtl,
        cacheName: `${cacheName}:Data`,
        enableLogging: this.enableLogging,
      }
    );

    // Cache for change detection results (short TTL)
    this.changeCheckCache = createCacheManager<boolean>(
      async (key: string) => {
        if (this.enableLogging) {
          logger.debug(
            `${this.cacheName}: Checking for changes for key '${key}'`
          );
        }
        const hasChanged = await this.changeDetector(key);

        if (hasChanged) {
          // Invalidate data cache when change detected
          this.dataCache.clear(key);
          if (this.enableLogging) {
            logger.info(
              `${this.cacheName}: Change detected for key '${key}', invalidated data cache`
            );
          }
        }

        return hasChanged;
      },
      {
        ttl: checkInterval,
        cacheName: `${cacheName}:ChangeCheck`,
        enableLogging: false, // Reduce noise from frequent checks
      }
    );
  }

  /**
   * Get data, fetching fresh only if changes detected
   */
  async get(key: string): Promise<T> {
    // Check for changes (cached for checkInterval seconds)
    await this.changeCheckCache.get(key);

    // Get data (will be fresh if change was detected above)
    return this.dataCache.get(key);
  }

  /**
   * Manually invalidate cache for a specific key
   */
  invalidate(key: string): void {
    this.dataCache.clear(key);
    this.changeCheckCache.clear(key);
    if (this.enableLogging) {
      logger.info(
        `${this.cacheName}: Manually invalidated cache for key '${key}'`
      );
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.dataCache.clearAll();
    this.changeCheckCache.clearAll();
    if (this.enableLogging) {
      logger.info(`${this.cacheName}: Cleared all caches`);
    }
  }

  /**
   * Force refresh data for a key (bypasses change detection)
   */
  async forceRefresh(key: string): Promise<T> {
    this.invalidate(key);
    return this.get(key);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      dataCache: this.dataCache.getStats(),
      changeCheckCache: this.changeCheckCache.getStats(),
      cacheName: this.cacheName,
    };
  }

  /**
   * Check if key exists in data cache
   */
  has(key: string): boolean {
    return this.dataCache.has(key);
  }

  /**
   * Manually set data in cache
   */
  set(key: string, data: T): void {
    this.dataCache.set(key, data);
  }

  /**
   * Destroy the cache
   */
  destroy(): void {
    this.dataCache.destroy();
    this.changeCheckCache.destroy();
  }
}

/**
 * Create a change-aware cache manager
 */
export const createChangeAwareCache = <T>(
  dataFetcher: (key: string) => Promise<T>,
  options: ChangeAwareCacheOptions
): ChangeAwareCache<T> => new ChangeAwareCache(dataFetcher, options);
