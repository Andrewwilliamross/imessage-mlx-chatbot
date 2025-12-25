import logger from './logger.js';
import CircuitBreaker from './CircuitBreaker.js';

/**
 * Health Check Status
 */
export const HEALTH_STATUS = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy'
} as const;

type HealthStatusType = typeof HEALTH_STATUS[keyof typeof HEALTH_STATUS];

/**
 * Health check function result
 */
interface HealthCheckResult {
    message: string;
    details?: Record<string, unknown>;
}

/**
 * Health check registration options
 */
interface HealthCheckOptions {
    critical?: boolean;
    timeout?: number;
}

/**
 * Individual health check status
 */
interface HealthCheckStatus {
    status: HealthStatusType;
    message: string;
    timestamp: string;
    duration: number;
    error?: string;
    details?: Record<string, unknown>;
    consecutiveFailures?: number;
}

/**
 * Registered health check
 */
interface RegisteredCheck {
    name: string;
    checkFn: () => Promise<HealthCheckResult>;
    critical: boolean;
    timeout: number;
    lastStatus: HealthCheckStatus | null;
    lastCheck: number | null;
    consecutiveFailures: number;
}

/**
 * Overall health check results
 */
interface HealthCheckResults {
    status: HealthStatusType;
    timestamp: string;
    checks: Record<string, HealthCheckStatus>;
    summary: {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
    };
    circuitBreakers?: Record<string, unknown>;
}

/**
 * Health Check System
 * Monitors the health of all system components
 */
class HealthCheck {
    private checks: Map<string, RegisteredCheck>;
    private lastCheck: HealthCheckResults | null;
    private checkInterval: NodeJS.Timeout | null;

    constructor() {
        this.checks = new Map();
        this.lastCheck = null;
        this.checkInterval = null;
    }

    /**
     * Register a health check
     * @param name - Component name
     * @param checkFn - Async function that returns health status
     * @param options - Check options
     */
    register(name: string, checkFn: () => Promise<HealthCheckResult>, options: HealthCheckOptions = {}): void {
        this.checks.set(name, {
            name,
            checkFn,
            critical: options.critical !== false, // Default to critical
            timeout: options.timeout || 5000,
            lastStatus: null,
            lastCheck: null,
            consecutiveFailures: 0
        });

        logger.debug(`Registered health check: ${name}`);
    }

    /**
     * Run a single health check with timeout
     * @private
     */
    private async _runCheck(check: RegisteredCheck): Promise<HealthCheckStatus> {
        const startTime = Date.now();

        try {
            const result = await Promise.race([
                check.checkFn(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
                )
            ]);

            const duration = Date.now() - startTime;

            check.lastStatus = {
                status: HEALTH_STATUS.HEALTHY,
                message: result?.message || 'OK',
                timestamp: new Date().toISOString(),
                duration,
                details: result?.details || {}
            };
            check.lastCheck = Date.now();
            check.consecutiveFailures = 0;

            return check.lastStatus;
        } catch (error) {
            const duration = Date.now() - startTime;
            check.consecutiveFailures++;

            const err = error as Error;
            check.lastStatus = {
                status: HEALTH_STATUS.UNHEALTHY,
                message: err.message,
                timestamp: new Date().toISOString(),
                duration,
                error: err.message,
                consecutiveFailures: check.consecutiveFailures
            };
            check.lastCheck = Date.now();

            if (check.critical) {
                logger.error(`Critical health check failed: ${check.name}`, {
                    error: err.message,
                    consecutiveFailures: check.consecutiveFailures
                });
            } else {
                logger.warn(`Health check failed: ${check.name}`, {
                    error: err.message
                });
            }

            return check.lastStatus;
        }
    }

    /**
     * Run all health checks
     */
    async checkAll(): Promise<HealthCheckResults> {
        const results: HealthCheckResults = {
            status: HEALTH_STATUS.HEALTHY,
            timestamp: new Date().toISOString(),
            checks: {},
            summary: {
                total: this.checks.size,
                healthy: 0,
                degraded: 0,
                unhealthy: 0
            }
        };

        // Run all checks in parallel
        const checkPromises = Array.from(this.checks.values()).map(async (check) => {
            const result = await this._runCheck(check);
            return { name: check.name, result, critical: check.critical };
        });

        const checkResults = await Promise.all(checkPromises);

        // Process results
        for (const { name, result, critical } of checkResults) {
            results.checks[name] = result;

            if (result.status === HEALTH_STATUS.HEALTHY) {
                results.summary.healthy++;
            } else if (result.status === HEALTH_STATUS.DEGRADED) {
                results.summary.degraded++;
                if (results.status === HEALTH_STATUS.HEALTHY) {
                    results.status = HEALTH_STATUS.DEGRADED;
                }
            } else {
                results.summary.unhealthy++;
                if (critical) {
                    results.status = HEALTH_STATUS.UNHEALTHY;
                } else if (results.status === HEALTH_STATUS.HEALTHY) {
                    results.status = HEALTH_STATUS.DEGRADED;
                }
            }
        }

        // Add circuit breaker status
        results.circuitBreakers = CircuitBreaker.getAllStatus();

        this.lastCheck = results;
        return results;
    }

    /**
     * Get last health check results (without running checks)
     */
    getLastCheck(): HealthCheckResults | null {
        return this.lastCheck;
    }

    /**
     * Start periodic health checks
     * @param interval - Check interval in ms
     */
    startPeriodicChecks(interval: number = 30000): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(async () => {
            try {
                const results = await this.checkAll();
                if (results.status !== HEALTH_STATUS.HEALTHY) {
                    logger.warn('System health degraded:', {
                        status: results.status,
                        summary: results.summary
                    });
                }
            } catch (error) {
                logger.error('Periodic health check failed:', { error: error as Error });
            }
        }, interval);

        logger.info(`Started periodic health checks (interval: ${interval}ms)`);
    }

    /**
     * Stop periodic health checks
     */
    stopPeriodicChecks(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            logger.info('Stopped periodic health checks');
        }
    }

    /**
     * Check if system is healthy
     */
    async isHealthy(): Promise<boolean> {
        const results = await this.checkAll();
        return results.status === HEALTH_STATUS.HEALTHY;
    }

    /**
     * Get system status summary
     */
    getStatusSummary(): Record<string, unknown> {
        if (!this.lastCheck) {
            return {
                status: HEALTH_STATUS.UNHEALTHY,
                message: 'No health checks performed yet'
            };
        }

        return {
            status: this.lastCheck.status,
            timestamp: this.lastCheck.timestamp,
            summary: this.lastCheck.summary
        };
    }

    /**
     * Clear all health checks
     */
    clear(): void {
        this.stopPeriodicChecks();
        this.checks.clear();
        this.lastCheck = null;
    }
}

/**
 * Redis client interface for health check
 */
interface RedisClient {
    isConnected(): boolean;
    ping(): Promise<void>;
}

/**
 * Database interface for health check
 */
interface DatabaseClient {
    prepare(sql: string): {
        get(): { test: number };
    };
}

/**
 * R2 Service interface for health check
 */
interface R2Service {
    isEnabled(): boolean;
    getStats(): Record<string, unknown>;
}

/**
 * Socket interface for health check
 */
interface SocketClient {
    connected: boolean;
}

/**
 * Common health check functions
 */
export const CommonChecks = {
    /**
     * Redis connection check
     */
    redis: (redisClient: RedisClient) => async (): Promise<HealthCheckResult> => {
        if (!redisClient || !redisClient.isConnected()) {
            throw new Error('Redis not connected');
        }
        await redisClient.ping();
        return { message: 'Redis connection healthy' };
    },

    /**
     * Database connection check
     */
    database: (db: DatabaseClient) => async (): Promise<HealthCheckResult> => {
        if (!db) {
            throw new Error('Database not initialized');
        }
        // Try a simple query
        const result = db.prepare('SELECT 1 as test').get();
        if (result.test !== 1) {
            throw new Error('Database query failed');
        }
        return { message: 'Database connection healthy' };
    },

    /**
     * R2 Storage check
     */
    r2Storage: (r2Service: R2Service) => async (): Promise<HealthCheckResult> => {
        if (!r2Service || !r2Service.isEnabled()) {
            throw new Error('R2 Storage not enabled');
        }
        const stats = r2Service.getStats();
        return {
            message: 'R2 Storage healthy',
            details: stats
        };
    },

    /**
     * Socket connection check
     */
    socket: (socket: SocketClient) => async (): Promise<HealthCheckResult> => {
        if (!socket || !socket.connected) {
            throw new Error('Socket not connected');
        }
        return { message: 'Socket connection healthy' };
    },

    /**
     * Memory usage check
     */
    memory: (maxMemoryMB: number = 1024) => async (): Promise<HealthCheckResult> => {
        const usage = process.memoryUsage();
        const usedMB = Math.round(usage.heapUsed / 1024 / 1024);

        if (usedMB > maxMemoryMB) {
            throw new Error(`Memory usage too high: ${usedMB}MB (limit: ${maxMemoryMB}MB)`);
        }

        return {
            message: 'Memory usage healthy',
            details: {
                heapUsedMB: usedMB,
                heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
                limitMB: maxMemoryMB
            }
        };
    },

    /**
     * Disk space check (for log files, attachments, etc.)
     */
    diskSpace: () => async (): Promise<HealthCheckResult> => {
        // Basic check - could be enhanced with actual disk space monitoring
        return { message: 'Disk space check not implemented' };
    }
};

export default new HealthCheck();
