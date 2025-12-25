import LRUCache from './LRUCache.js';
import logger from './logger.js';
import crypto from 'crypto';

/**
 * Query cache options
 */
interface QueryCacheOptions {
    name?: string;
    maxSize?: number;
    ttl?: number;
}

/**
 * Cache metadata
 */
interface CacheMetadata {
    timestamp: number;
    ttl: number;
    query: string;
    params: unknown;
}

/**
 * Cache statistics
 */
interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    evictions: number;
    invalidations: number;
}

/**
 * Query Cache
 * Caches database query results to reduce load
 */
class QueryCache {
    private name: string;
    private maxSize: number;
    private ttl: number;
    private cache: LRUCache<string, unknown>;
    private metadata: Map<string, CacheMetadata>;
    private stats: CacheStats;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(options: QueryCacheOptions = {}) {
        this.name = options.name || 'default';
        this.maxSize = options.maxSize || 1000;
        this.ttl = options.ttl || 300000; // 5 minutes default
        this.cache = new LRUCache<string, unknown>(this.maxSize);
        this.metadata = new Map();

        // Statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0,
            invalidations: 0
        };
    }

    /**
     * Generate cache key from query and params
     * @param query - Query identifier
     * @param params - Query parameters
     * @returns Cache key
     */
    private _generateKey(query: string, params: unknown = {}): string {
        const paramsStr = JSON.stringify(params);
        const hash = crypto.createHash('sha256')
            .update(`${query}:${paramsStr}`)
            .digest('hex')
            .substring(0, 16);
        return `${query}:${hash}`;
    }

    /**
     * Check if cached value is still valid
     * @private
     */
    private _isValid(key: string): boolean {
        const meta = this.metadata.get(key);
        if (!meta) return false;

        const age = Date.now() - meta.timestamp;
        return age < meta.ttl;
    }

    /**
     * Get value from cache
     * @param query - Query identifier
     * @param params - Query parameters
     * @returns Cached value or undefined
     */
    get(query: string, params: unknown = {}): unknown {
        const key = this._generateKey(query, params);

        if (!this.cache.has(key)) {
            this.stats.misses++;
            return undefined;
        }

        if (!this._isValid(key)) {
            this.invalidate(query, params);
            this.stats.misses++;
            return undefined;
        }

        this.stats.hits++;
        const value = this.cache.get(key);

        logger.debug(`Cache hit: ${this.name}/${query}`, {
            hitRate: this.getHitRate()
        });

        return value;
    }

    /**
     * Set value in cache
     * @param query - Query identifier
     * @param params - Query parameters
     * @param value - Value to cache
     * @param ttl - Time to live (optional, uses default if not provided)
     */
    set(query: string, params: unknown, value: unknown, ttl: number | null = null): void {
        const key = this._generateKey(query, params);

        this.cache.set(key, value);
        this.metadata.set(key, {
            timestamp: Date.now(),
            ttl: ttl || this.ttl,
            query,
            params
        });

        this.stats.sets++;

        logger.debug(`Cache set: ${this.name}/${query}`, {
            size: this.cache.size,
            maxSize: this.maxSize
        });
    }

    /**
     * Get or compute value
     * @param query - Query identifier
     * @param params - Query parameters
     * @param computeFn - Function to compute value if not cached
     * @param ttl - Time to live (optional)
     * @returns Cached or computed value
     */
    async getOrCompute<T>(query: string, params: unknown, computeFn: () => Promise<T>, ttl: number | null = null): Promise<T> {
        const cached = this.get(query, params);
        if (cached !== undefined) {
            return cached as T;
        }

        const value = await computeFn();
        this.set(query, params, value, ttl);
        return value;
    }

    /**
     * Invalidate specific cache entry
     * @param query - Query identifier
     * @param params - Query parameters
     */
    invalidate(query: string, params: unknown = {}): void {
        const key = this._generateKey(query, params);

        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.metadata.delete(key);
            this.stats.invalidations++;

            logger.debug(`Cache invalidated: ${this.name}/${query}`);
        }
    }

    /**
     * Invalidate all entries matching a query pattern
     * @param pattern - Query pattern to match
     */
    invalidatePattern(pattern: string): void {
        let count = 0;

        for (const [key, meta] of this.metadata.entries()) {
            if (meta.query.includes(pattern)) {
                this.cache.delete(key);
                this.metadata.delete(key);
                count++;
            }
        }

        this.stats.invalidations += count;
        logger.debug(`Cache pattern invalidated: ${this.name}/${pattern}`, { count });
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
        this.metadata.clear();
        logger.debug(`Cache cleared: ${this.name}`);
    }

    /**
     * Clean expired entries
     */
    cleanExpired(): number {
        let cleaned = 0;

        for (const [key, meta] of this.metadata.entries()) {
            const age = Date.now() - meta.timestamp;
            if (age >= meta.ttl) {
                this.cache.delete(key);
                this.metadata.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired cache entries from ${this.name}`);
        }

        return cleaned;
    }

    /**
     * Get cache hit rate
     */
    getHitRate(): string {
        const total = this.stats.hits + this.stats.misses;
        if (total === 0) return '0.00';
        return (this.stats.hits / total * 100).toFixed(2);
    }

    /**
     * Get cache statistics
     */
    getStats(): Record<string, unknown> {
        return {
            name: this.name,
            size: this.cache.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            hitRate: `${this.getHitRate()}%`,
            stats: { ...this.stats },
            utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100)
        };
    }

    /**
     * Start automatic cleanup of expired entries
     * @param interval - Cleanup interval in ms
     */
    startAutoCleanup(interval: number = 60000): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanExpired();
        }, interval);

        logger.debug(`Started auto-cleanup for ${this.name} (interval: ${interval}ms)`);
    }

    /**
     * Stop automatic cleanup
     */
    stopAutoCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
            logger.debug(`Stopped auto-cleanup for ${this.name}`);
        }
    }
}

/**
 * Query Cache Manager
 * Manages multiple query caches
 */
class QueryCacheManager {
    private caches: Map<string, QueryCache>;

    constructor() {
        this.caches = new Map();
    }

    /**
     * Get or create query cache
     * @param name - Cache name
     * @param options - Cache options
     */
    getCache(name: string, options: QueryCacheOptions = {}): QueryCache {
        if (!this.caches.has(name)) {
            const cache = new QueryCache({ ...options, name });
            this.caches.set(name, cache);
            logger.debug(`Created query cache: ${name}`, { options });
        }

        return this.caches.get(name)!;
    }

    /**
     * Get all cache stats
     */
    getAllStats(): Record<string, unknown> {
        const stats: Record<string, unknown> = {};
        for (const [name, cache] of this.caches.entries()) {
            stats[name] = cache.getStats();
        }
        return stats;
    }

    /**
     * Clear all caches
     */
    clearAll(): void {
        for (const cache of this.caches.values()) {
            cache.clear();
        }
    }

    /**
     * Start auto-cleanup for all caches
     */
    startAllAutoCleanup(interval: number = 60000): void {
        for (const cache of this.caches.values()) {
            cache.startAutoCleanup(interval);
        }
    }

    /**
     * Stop auto-cleanup for all caches
     */
    stopAllAutoCleanup(): void {
        for (const cache of this.caches.values()) {
            cache.stopAutoCleanup();
        }
    }

    /**
     * Cleanup all expired entries across all caches
     */
    cleanAllExpired(): number {
        let totalCleaned = 0;
        for (const cache of this.caches.values()) {
            totalCleaned += cache.cleanExpired();
        }
        return totalCleaned;
    }
}

export default new QueryCacheManager();
export { QueryCache };
