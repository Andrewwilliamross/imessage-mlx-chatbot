import winston from 'winston';
import path from 'path';
import { randomUUID } from 'crypto';
import LogSanitizer from './LogSanitizer.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Environment-based configuration
const LOG_MODE = (process.env.LOG_MODE || 'text') as 'text' | 'json';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Logger metadata type
 */
export type LogMetadata = Record<string, unknown> | Error;

/**
 * Correlation ID store for async context tracking
 */
class CorrelationStore {
    private store: Map<string, string>;

    constructor() {
        this.store = new Map();
    }

    set(correlationId: string): void {
        this.store.set('current', correlationId);
    }

    get(): string | undefined {
        return this.store.get('current');
    }

    clear(): void {
        this.store.delete('current');
    }

    generate(): string {
        const id = randomUUID();
        this.set(id);
        return id;
    }
}

const correlationStore = new CorrelationStore();

/**
 * JSON format for structured logging (production/monitoring systems)
 */
const jsonFormat = combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format((info) => {
        // Add correlation ID if available
        const correlationId = correlationStore.get();
        if (correlationId) {
            info.correlationId = correlationId;
        }

        // Sanitize sensitive data
        if (typeof info.message === 'string') {
            info.message = LogSanitizer.sanitize(info.message) as string;
        }

        // Sanitize metadata
        const sanitizedInfo = { ...info };
        Object.keys(sanitizedInfo).forEach(key => {
            if (key !== 'level' && key !== 'timestamp' && key !== 'service' && key !== 'context') {
                sanitizedInfo[key] = LogSanitizer.sanitize(sanitizedInfo[key]);
            }
        });

        return sanitizedInfo;
    })(),
    json()
);

/**
 * Text format for human-readable console output (development)
 */
const textFormat = printf(({ level, message, timestamp, context, correlationId, ...meta }: winston.Logform.TransformableInfo) => {
    // Sanitize message
    const sanitizedMessage = LogSanitizer.sanitize(message);

    // Build log components
    const contextStr = context ? `[${context}]` : '';
    const correlationStr = correlationId ? `[${(correlationId as string).substring(0, 8)}]` : '';

    let log = `${timestamp} ${level} ${contextStr}${correlationStr}: ${sanitizedMessage}`;

    // Add metadata if present (exclude service, context, correlationId)
    const metaWithoutInternal: Record<string, unknown> = { ...meta };
    delete metaWithoutInternal.service;
    delete metaWithoutInternal.context;
    delete metaWithoutInternal.correlationId;

    if (Object.keys(metaWithoutInternal).length > 0) {
        // Sanitize metadata before logging
        const sanitizedMeta = LogSanitizer.sanitize(metaWithoutInternal);
        log += `\n${JSON.stringify(sanitizedMeta, null, 2)}`;
    }

    return log;
});

/**
 * Console format with color (development)
 */
const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    textFormat
);

/**
 * File format selection based on LOG_MODE
 */
const fileFormat = LOG_MODE === 'json' ? jsonFormat : combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    textFormat
);

/**
 * Create Winston logger instance
 */
function createWinstonLogger(context: string = 'relay'): winston.Logger {
    const logger = winston.createLogger({
        level: LOG_LEVEL,
        defaultMeta: {
            service: 'imessage-relay',
            context: context,
            hostname: process.env.HOSTNAME || 'unknown',
            macId: process.env.MAC_ID || 'unknown'
        },
        format: LOG_MODE === 'json' ? jsonFormat : combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true })
        ),
        transports: []
    });

    // Console transport (always enabled for development)
    if (NODE_ENV !== 'production' || LOG_MODE === 'text') {
        logger.add(new winston.transports.Console({
            format: consoleFormat,
            level: NODE_ENV === 'production' ? 'info' : 'debug'
        }));
    }

    // File transports for production
    if (NODE_ENV === 'production') {
        // Error log file
        logger.add(new winston.transports.File({
            filename: process.env.ERROR_LOG_FILE || 'logs/error.log',
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true,
            format: fileFormat
        }));

        // Combined log file
        logger.add(new winston.transports.File({
            filename: process.env.LOG_FILE || 'logs/relay.log',
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true,
            format: fileFormat
        }));

        // JSON console output for production if LOG_MODE=json
        if (LOG_MODE === 'json') {
            logger.add(new winston.transports.Console({
                format: jsonFormat,
                level: 'info'
            }));
        }
    }

    return logger;
}

/**
 * Logger class with context support and correlation IDs
 */
export class Logger {
    public readonly context: string;
    public readonly logger: winston.Logger;

    constructor(context: string = 'relay') {
        this.context = context;
        this.logger = createWinstonLogger(context);
    }

    /**
     * Generate and set a new correlation ID for request tracking
     */
    generateCorrelationId(): string {
        return correlationStore.generate();
    }

    /**
     * Set a correlation ID for request tracking
     */
    setCorrelationId(correlationId: string): void {
        correlationStore.set(correlationId);
    }

    /**
     * Get the current correlation ID
     */
    getCorrelationId(): string | undefined {
        return correlationStore.get();
    }

    /**
     * Clear the correlation ID
     */
    clearCorrelationId(): void {
        correlationStore.clear();
    }

    /**
     * Log with correlation ID context
     */
    async withCorrelationId<T>(
        operation: () => Promise<T>,
        correlationId: string | null = null
    ): Promise<T> {
        const id = correlationId || this.generateCorrelationId();
        this.setCorrelationId(id);

        try {
            return await operation();
        } finally {
            this.clearCorrelationId();
        }
    }

    /**
     * Log error message
     */
    error(message: string, metadata: LogMetadata = {}): void {
        const meta = this._buildMetadata(metadata);
        this.logger.error(message, { ...meta, context: this.context });
    }

    /**
     * Log warning message
     */
    warn(message: string, metadata: LogMetadata = {}): void {
        const meta = this._buildMetadata(metadata);
        this.logger.warn(message, { ...meta, context: this.context });
    }

    /**
     * Log info message
     */
    info(message: string, metadata: LogMetadata = {}): void {
        const meta = this._buildMetadata(metadata);
        this.logger.info(message, { ...meta, context: this.context });
    }

    /**
     * Log debug message
     */
    debug(message: string, metadata: LogMetadata = {}): void {
        const meta = this._buildMetadata(metadata);
        this.logger.debug(message, { ...meta, context: this.context });
    }

    /**
     * Create a child logger with additional context
     */
    child(childContext: string): Logger {
        return new Logger(`${this.context}:${childContext}`);
    }

    /**
     * Measure performance of an async operation
     */
    async measureAsync<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        const start = Date.now();
        const correlationId = this.getCorrelationId();

        try {
            const result = await operation();
            const duration = Date.now() - start;

            if (duration > 1000) {
                this.warn(`Slow operation: ${operationName}`, {
                    duration: `${duration}ms`,
                    correlationId
                });
            } else {
                this.debug(`Operation completed: ${operationName}`, {
                    duration: `${duration}ms`,
                    correlationId
                });
            }

            return result;
        } catch (error) {
            const duration = Date.now() - start;
            const err = error as Error;
            this.error(`Operation failed: ${operationName}`, {
                duration: `${duration}ms`,
                error: err.message,
                stack: err.stack,
                correlationId
            });
            throw error;
        }
    }

    /**
     * Build metadata object
     */
    private _buildMetadata(metadata: LogMetadata): Record<string, unknown> {
        if (metadata instanceof Error) {
            return {
                error: metadata.message,
                name: metadata.name,
                stack: metadata.stack
            };
        }

        if (typeof metadata === 'object' && metadata !== null) {
            return metadata;
        }

        return {};
    }
}

/**
 * Create a namespaced logger
 */
export function createLogger(context: string): Logger {
    return new Logger(context);
}

/**
 * Default logger instance
 */
const defaultLogger = new Logger('relay');

export default defaultLogger;

/**
 * Export correlation store for advanced use cases
 */
export { correlationStore };
