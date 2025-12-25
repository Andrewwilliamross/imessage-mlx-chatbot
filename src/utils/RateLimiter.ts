import logger from './logger.js';
import { RateLimitError } from './ErrorHandler.js';

/**
 * Token Bucket Rate Limiter
 * Implements token bucket algorithm for smooth rate limiting
 */
class TokenBucket {
    private capacity: number;
    private tokens: number;
    private refillRate: number;
    private refillInterval: number;
    private lastRefill: number;

    constructor(capacity: number, refillRate: number, refillInterval: number = 1000) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.refillRate = refillRate;
        this.refillInterval = refillInterval;
        this.lastRefill = Date.now();
    }

    /**
     * Refill tokens based on time elapsed
     * @private
     */
    private _refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const intervalsElapsed = Math.floor(elapsed / this.refillInterval);

        if (intervalsElapsed > 0) {
            this.tokens = Math.min(
                this.capacity,
                this.tokens + (intervalsElapsed * this.refillRate)
            );
            this.lastRefill = now;
        }
    }

    /**
     * Try to consume tokens
     * @param tokens - Number of tokens to consume
     * @returns True if tokens were consumed
     */
    tryConsume(tokens: number = 1): boolean {
        this._refill();

        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }

        return false;
    }

    /**
     * Get current token count
     */
    getTokens(): number {
        this._refill();
        return Math.floor(this.tokens);
    }

    /**
     * Get time until next token available
     */
    getTimeUntilNextToken(): number {
        if (this.tokens >= 1) return 0;

        const tokensNeeded = 1 - this.tokens;
        const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
        return intervalsNeeded * this.refillInterval;
    }
}

/**
 * Sliding Window Rate Limiter
 * Implements sliding window algorithm for precise rate limiting
 */
class SlidingWindow {
    private maxRequests: number;
    private windowMs: number;
    private requests: number[];

    constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    /**
     * Clean old requests outside window
     * @private
     */
    private _cleanOldRequests(): void {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        this.requests = this.requests.filter(timestamp => timestamp > cutoff);
    }

    /**
     * Try to record a request
     * @returns True if request is allowed
     */
    tryRequest(): boolean {
        this._cleanOldRequests();

        if (this.requests.length < this.maxRequests) {
            this.requests.push(Date.now());
            return true;
        }

        return false;
    }

    /**
     * Get current request count
     */
    getCount(): number {
        this._cleanOldRequests();
        return this.requests.length;
    }

    /**
     * Get time until next request is allowed
     */
    getTimeUntilReset(): number {
        if (this.requests.length === 0) return 0;
        if (this.requests.length < this.maxRequests) return 0;

        const oldestRequest = this.requests[0];
        const resetTime = oldestRequest + this.windowMs;
        return Math.max(0, resetTime - Date.now());
    }

    /**
     * Reset the window
     */
    reset(): void {
        this.requests = [];
    }
}

/**
 * Rate limiter options
 */
interface RateLimiterOptions {
    name?: string;
    strategy?: 'sliding-window' | 'token-bucket';
    maxRequests?: number;
    windowMs?: number;
    burstLimit?: number;
}

/**
 * Rate limiter statistics
 */
interface RateLimiterStats {
    totalRequests: number;
    allowedRequests: number;
    blockedRequests: number;
    lastReset: number;
}

/**
 * Rate Limiter with multiple strategies
 */
class RateLimiter {
    private name: string;
    private strategy: 'sliding-window' | 'token-bucket';
    private maxRequests: number;
    private windowMs: number;
    private burstLimit: number;
    private limiter: TokenBucket | SlidingWindow;
    private stats: RateLimiterStats;

    constructor(options: RateLimiterOptions = {}) {
        this.name = options.name || 'default';
        this.strategy = options.strategy || 'sliding-window';
        this.maxRequests = options.maxRequests || 30;
        this.windowMs = options.windowMs || 60000;
        this.burstLimit = options.burstLimit || this.maxRequests;

        // Initialize limiter based on strategy
        if (this.strategy === 'token-bucket') {
            const refillRate = this.maxRequests / (this.windowMs / 1000);
            this.limiter = new TokenBucket(this.burstLimit, refillRate, 1000);
        } else {
            this.limiter = new SlidingWindow(this.maxRequests, this.windowMs);
        }

        // Statistics
        this.stats = {
            totalRequests: 0,
            allowedRequests: 0,
            blockedRequests: 0,
            lastReset: Date.now()
        };
    }

    /**
     * Check if request is allowed
     * @param cost - Token/request cost (default: 1)
     * @returns True if request is allowed
     */
    tryRequest(cost: number = 1): boolean {
        this.stats.totalRequests++;

        const allowed = this.strategy === 'token-bucket'
            ? (this.limiter as TokenBucket).tryConsume(cost)
            : (this.limiter as SlidingWindow).tryRequest();

        if (allowed) {
            this.stats.allowedRequests++;
            return true;
        }

        this.stats.blockedRequests++;
        logger.warn(`Rate limit exceeded for ${this.name}`, {
            current: this.getCurrentCount(),
            limit: this.maxRequests,
            window: this.windowMs
        });

        return false;
    }

    /**
     * Execute operation with rate limiting
     * @param operation - Operation to execute
     * @param cost - Token/request cost
     * @throws RateLimitError if rate limit is exceeded
     */
    async execute<T>(operation: () => Promise<T>, cost: number = 1): Promise<T> {
        if (!this.tryRequest(cost)) {
            throw new RateLimitError(this.maxRequests, this.windowMs);
        }

        return await operation();
    }

    /**
     * Get current request count or token count
     */
    getCurrentCount(): number {
        return this.strategy === 'token-bucket'
            ? (this.limiter as TokenBucket).getTokens()
            : (this.limiter as SlidingWindow).getCount();
    }

    /**
     * Get time until next request is allowed
     */
    getTimeUntilReset(): number {
        return this.strategy === 'token-bucket'
            ? (this.limiter as TokenBucket).getTimeUntilNextToken()
            : (this.limiter as SlidingWindow).getTimeUntilReset();
    }

    /**
     * Get rate limiter statistics
     */
    getStats(): Record<string, unknown> {
        return {
            name: this.name,
            strategy: this.strategy,
            current: this.getCurrentCount(),
            limit: this.maxRequests,
            windowMs: this.windowMs,
            timeUntilReset: this.getTimeUntilReset(),
            stats: { ...this.stats }
        };
    }

    /**
     * Reset rate limiter
     */
    reset(): void {
        if (this.strategy === 'token-bucket') {
            const bucket = this.limiter as TokenBucket;
            // Access private properties for reset
            (bucket as any).tokens = (bucket as any).capacity;
            (bucket as any).lastRefill = Date.now();
        } else {
            (this.limiter as SlidingWindow).reset();
        }

        this.stats.lastReset = Date.now();
    }
}

/**
 * Rate Limiter Manager
 * Manages multiple rate limiters
 */
class RateLimiterManager {
    private limiters: Map<string, RateLimiter>;

    constructor() {
        this.limiters = new Map();
    }

    /**
     * Get or create rate limiter
     * @param name - Limiter name
     * @param options - Limiter options
     */
    getLimiter(name: string, options: RateLimiterOptions = {}): RateLimiter {
        if (!this.limiters.has(name)) {
            this.limiters.set(name, new RateLimiter({ ...options, name }));
            logger.debug(`Created rate limiter: ${name}`, { options });
        }

        return this.limiters.get(name)!;
    }

    /**
     * Get all rate limiter stats
     */
    getAllStats(): Record<string, unknown> {
        const stats: Record<string, unknown> = {};
        for (const [name, limiter] of this.limiters.entries()) {
            stats[name] = limiter.getStats();
        }
        return stats;
    }

    /**
     * Reset all rate limiters
     */
    resetAll(): void {
        for (const limiter of this.limiters.values()) {
            limiter.reset();
        }
    }
}

export default new RateLimiterManager();
export { RateLimiter, TokenBucket, SlidingWindow };
