import logger from './logger.js';
import { EventEmitter } from 'events';

/**
 * Circuit Breaker States
 */
export enum CircuitState {
    CLOSED = 'CLOSED',       // Normal operation
    OPEN = 'OPEN',           // Circuit is open, rejecting requests
    HALF_OPEN = 'HALF_OPEN'  // Testing if service recovered
}

// For backward compatibility
export const STATE = CircuitState;

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
    name?: string;
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
}

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    stats: CircuitBreakerStats;
    config: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
        resetTimeout: number;
    };
}

/**
 * Circuit breaker state change event
 */
export interface StateChangeEvent {
    from: CircuitState;
    to: CircuitState;
    name: string;
}

/**
 * Circuit breaker error with code
 */
export class CircuitBreakerError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'CircuitBreakerError';
        this.code = code;
    }
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by detecting and handling service failures
 */
export class CircuitBreaker extends EventEmitter {
    public readonly name: string;
    public readonly failureThreshold: number;
    public readonly successThreshold: number;
    public readonly timeout: number;
    public readonly resetTimeout: number;

    public state: CircuitState;
    public failureCount: number;
    public successCount: number;
    public nextAttempt: number;
    public stats: CircuitBreakerStats;

    constructor(options: CircuitBreakerOptions = {}) {
        super();

        this.name = options.name || 'default';
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 60000; // 1 minute
        this.resetTimeout = options.resetTimeout || 30000; // 30 seconds

        // State tracking
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = Date.now();
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            lastFailureTime: null,
            lastSuccessTime: null
        };
    }

    /**
     * Execute operation through circuit breaker
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        this.stats.totalRequests++;

        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                this.stats.rejectedRequests++;
                throw new CircuitBreakerError(
                    `Circuit breaker is OPEN for ${this.name}`,
                    'CIRCUIT_OPEN'
                );
            }

            // Try to recover
            this._transitionTo(CircuitState.HALF_OPEN);
        }

        try {
            const result = await this._executeWithTimeout(operation);
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure(error as Error);
            throw error;
        }
    }

    /**
     * Execute operation with timeout
     */
    private async _executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
        return Promise.race([
            operation(),
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
            )
        ]);
    }

    /**
     * Handle successful execution
     */
    private _onSuccess(): void {
        this.stats.successfulRequests++;
        this.stats.lastSuccessTime = Date.now();
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this._transitionTo(CircuitState.CLOSED);
            }
        }
    }

    /**
     * Handle failed execution
     */
    private _onFailure(error: Error): void {
        this.stats.failedRequests++;
        this.stats.lastFailureTime = Date.now();
        this.failureCount++;
        this.successCount = 0;

        logger.warn(`Circuit breaker ${this.name} recorded failure ${this.failureCount}/${this.failureThreshold}`, {
            error: error.message,
            state: this.state
        });

        if (this.failureCount >= this.failureThreshold) {
            this._transitionTo(CircuitState.OPEN);
        }
    }

    /**
     * Transition to new state
     */
    private _transitionTo(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;

        logger.info(`Circuit breaker ${this.name} transitioned: ${oldState} -> ${newState}`);
        this.emit('stateChange', { from: oldState, to: newState, name: this.name } as StateChangeEvent);

        if (newState === CircuitState.OPEN) {
            this.nextAttempt = Date.now() + this.resetTimeout;
            this.emit('open', { name: this.name });
        } else if (newState === CircuitState.CLOSED) {
            this.failureCount = 0;
            this.successCount = 0;
            this.emit('close', { name: this.name });
        } else if (newState === CircuitState.HALF_OPEN) {
            this.successCount = 0;
            this.emit('halfOpen', { name: this.name });
        }
    }

    /**
     * Manually open the circuit
     */
    open(): void {
        this._transitionTo(CircuitState.OPEN);
    }

    /**
     * Manually close the circuit
     */
    close(): void {
        this._transitionTo(CircuitState.CLOSED);
    }

    /**
     * Reset circuit breaker statistics
     */
    reset(): void {
        this.failureCount = 0;
        this.successCount = 0;
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            lastFailureTime: null,
            lastSuccessTime: null
        };
        this._transitionTo(CircuitState.CLOSED);
    }

    /**
     * Get current circuit breaker status
     */
    getStatus(): CircuitBreakerStatus {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            stats: { ...this.stats },
            config: {
                failureThreshold: this.failureThreshold,
                successThreshold: this.successThreshold,
                timeout: this.timeout,
                resetTimeout: this.resetTimeout
            }
        };
    }

    /**
     * Check if circuit is operational
     */
    isHealthy(): boolean {
        return this.state === CircuitState.CLOSED;
    }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
class CircuitBreakerManager {
    private breakers: Map<string, CircuitBreaker>;

    constructor() {
        this.breakers = new Map();
    }

    /**
     * Get or create circuit breaker for service
     */
    getBreaker(name: string, options: CircuitBreakerOptions = {}): CircuitBreaker {
        if (!this.breakers.has(name)) {
            const breaker = new CircuitBreaker({ ...options, name });
            this.breakers.set(name, breaker);

            // Log state changes
            breaker.on('stateChange', ({ from, to, name }: StateChangeEvent) => {
                logger.info(`Circuit breaker state change: ${name} ${from} -> ${to}`);
            });
        }

        return this.breakers.get(name)!;
    }

    /**
     * Get all circuit breakers status
     */
    getAllStatus(): Record<string, CircuitBreakerStatus> {
        const status: Record<string, CircuitBreakerStatus> = {};
        for (const [name, breaker] of this.breakers.entries()) {
            status[name] = breaker.getStatus();
        }
        return status;
    }

    /**
     * Check if all circuits are healthy
     */
    isAllHealthy(): boolean {
        for (const breaker of this.breakers.values()) {
            if (!breaker.isHealthy()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll(): void {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}

export default new CircuitBreakerManager();
