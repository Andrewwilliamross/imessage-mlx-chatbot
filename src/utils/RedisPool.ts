import { createClient, RedisClientType } from 'redis';
import logger from './logger.js';
import CircuitBreaker, { CircuitBreaker as CircuitBreakerType, CircuitBreakerStatus } from './CircuitBreaker.js';

/**
 * Redis connection pool statistics
 */
export interface RedisPoolStats {
    connected: boolean;
    connecting: boolean;
    subscribers: number;
    circuitBreakerStatus: CircuitBreakerStatus;
}

/**
 * Redis Connection Pool Manager
 * Manages a pool of Redis connections for better performance
 */
class RedisPool {
    private client: RedisClientType | null;
    private connected: boolean;
    private connecting: boolean;
    private subscribers: Set<RedisClientType>;
    private circuitBreaker: CircuitBreakerType;

    constructor() {
        this.client = null;
        this.connected = false;
        this.connecting = false;
        this.subscribers = new Set();
        this.circuitBreaker = CircuitBreaker.getBreaker('redis', {
            failureThreshold: 3,
            timeout: 5000,
            resetTimeout: 30000
        });
    }

    /**
     * Initialize Redis connection
     */
    async connect(): Promise<RedisClientType> {
        if (this.connected && this.client) {
            return this.client;
        }

        if (this.connecting) {
            // Wait for existing connection attempt
            await this._waitForConnection();
            if (!this.client) {
                throw new Error('Redis connection failed');
            }
            return this.client;
        }

        this.connecting = true;

        try {
            await this.circuitBreaker.execute(async () => {
                this.client = createClient({
                    url: process.env.REDIS_URL || 'redis://localhost:6379',
                    socket: {
                        reconnectStrategy: (retries: number): number | Error => {
                            if (retries > 10) {
                                logger.error('Redis reconnection limit reached');
                                return new Error('Redis reconnection limit exceeded');
                            }
                            const delay = Math.min(retries * 100, 3000);
                            logger.debug(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
                            return delay;
                        }
                    }
                });

                this._setupEventHandlers();
                await this.client.connect();
                this.connected = true;
                this.connecting = false;

                logger.info('✅ Redis pool connected');
            });

            if (!this.client) {
                throw new Error('Redis client not initialized');
            }

            return this.client;
        } catch (error) {
            this.connecting = false;
            logger.error('Failed to connect to Redis:', { error: error as Error });
            throw error;
        }
    }

    /**
     * Setup Redis client event handlers
     */
    private _setupEventHandlers(): void {
        if (!this.client) {
            return;
        }

        this.client.on('error', (error: Error) => {
            logger.error('Redis client error:', { error: error as Error });
            this.connected = false;
        });

        this.client.on('connect', () => {
            logger.debug('Redis client connected');
        });

        this.client.on('ready', () => {
            logger.debug('Redis client ready');
            this.connected = true;
        });

        this.client.on('reconnecting', () => {
            logger.warn('Redis client reconnecting...');
            this.connected = false;
        });

        this.client.on('end', () => {
            logger.warn('Redis client connection ended');
            this.connected = false;
        });
    }

    /**
     * Wait for connection attempt to complete
     */
    private async _waitForConnection(maxWait: number = 10000): Promise<void> {
        const startTime = Date.now();
        while (this.connecting && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!this.connected) {
            throw new Error('Redis connection timeout');
        }
    }

    /**
     * Get Redis client (auto-connect if needed)
     */
    async getClient(): Promise<RedisClientType> {
        if (!this.connected) {
            await this.connect();
        }
        if (!this.client) {
            throw new Error('Redis client not available');
        }
        return this.client;
    }

    /**
     * Execute Redis command with circuit breaker
     * @deprecated Use typed client methods directly instead
     */
    async execute<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
        const client = await this.getClient();
        return await this.circuitBreaker.execute(async () => {
            // Type assertion needed for dynamic command execution
            const clientAny = client as unknown as Record<string, (...args: unknown[]) => Promise<T>>;
            if (typeof clientAny[command] !== 'function') {
                throw new Error(`Redis command '${command}' not found`);
            }
            return await clientAny[command](...args);
        });
    }

    /**
     * Create a duplicate connection for pub/sub
     */
    async createSubscriber(): Promise<RedisClientType> {
        if (!this.client) {
            throw new Error('Main Redis client not connected');
        }
        const subscriber = this.client.duplicate();
        await subscriber.connect();
        this.subscribers.add(subscriber);
        logger.debug('Created Redis subscriber connection');
        return subscriber;
    }

    /**
     * Check if Redis is connected
     */
    isConnected(): boolean {
        return this.connected && this.client !== null && this.client.isOpen;
    }

    /**
     * Get connection stats
     */
    getStats(): RedisPoolStats {
        return {
            connected: this.connected,
            connecting: this.connecting,
            subscribers: this.subscribers.size,
            circuitBreakerStatus: this.circuitBreaker.getStatus()
        };
    }

    /**
     * Ping Redis to check connection
     */
    async ping(): Promise<boolean> {
        try {
            const client = await this.getClient();
            await client.ping();
            return true;
        } catch (error) {
            logger.error('Redis ping failed:', { error: error as Error });
            return false;
        }
    }

    /**
     * Disconnect all Redis connections
     */
    async disconnect(): Promise<void> {
        logger.info('Disconnecting Redis pool...');

        try {
            // Close all subscribers
            for (const subscriber of this.subscribers) {
                await subscriber.quit();
            }
            this.subscribers.clear();

            // Close main client
            if (this.client) {
                await this.client.quit();
                this.client = null;
            }

            this.connected = false;
            logger.info('Redis pool disconnected');
        } catch (error) {
            logger.error('Error disconnecting Redis pool:', { error: error as Error });
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        await this.disconnect();
    }
}

export default new RedisPool();
