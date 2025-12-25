/**
 * Simple LRU (Least Recently Used) Cache implementation
 * Automatically evicts oldest items when max size is reached
 */

export interface CacheStats {
    size: number;
    maxSize: number;
    utilizationPercent: number;
}

class LRUCache<K = string, V = unknown> {
    public readonly maxSize: number;
    private cache: Map<K, V>;

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map<K, V>();
    }

    /**
     * Get value from cache
     */
    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }

        // Move to end (most recently used)
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    /**
     * Set value in cache
     */
    set(key: K, value: V): void {
        // Remove if exists (to update position)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Add to end
        this.cache.set(key, value);

        // Evict oldest if over limit
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value as K;
            this.cache.delete(firstKey);
        }
    }

    /**
     * Check if key exists in cache
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete key from cache
     */
    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get current cache size
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100)
        };
    }
}

export default LRUCache;
