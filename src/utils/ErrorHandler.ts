import logger from './logger.js';

/**
 * Standardized error types for the application
 */
export class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    timestamp: string;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    details: unknown;

    constructor(message: string, details: unknown = null) {
        super(message, 400);
        this.name = 'ValidationError';
        this.details = details;
    }
}

export class NotFoundError extends AppError {
    resource: string;

    constructor(resource: string, identifier: string | null = null) {
        const message = identifier
            ? `${resource} not found: ${identifier}`
            : `${resource} not found`;
        super(message, 404);
        this.name = 'NotFoundError';
        this.resource = resource;
    }
}

export class DatabaseError extends AppError {
    originalError: unknown;

    constructor(message: string, originalError: unknown = null) {
        super(message, 500);
        this.name = 'DatabaseError';
        this.originalError = originalError;
    }
}

export class ExternalServiceError extends AppError {
    service: string;
    originalError: unknown;

    constructor(service: string, message: string, originalError: unknown = null) {
        super(`${service} error: ${message}`, 503);
        this.name = 'ExternalServiceError';
        this.service = service;
        this.originalError = originalError;
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed') {
        super(message, 401);
        this.name = 'AuthenticationError';
    }
}

export class RateLimitError extends AppError {
    limit: number;
    window: number;

    constructor(limit: number, window: number) {
        super(`Rate limit exceeded: ${limit} requests per ${window}ms`, 429);
        this.name = 'RateLimitError';
        this.limit = limit;
        this.window = window;
    }
}

/**
 * Standardized error handler
 */
class ErrorHandler {
    /**
     * Handle async errors with consistent pattern
     * @param fn - Async function to wrap
     * @returns Wrapped function with error handling
     */
    asyncHandler<T extends unknown[], R>(fn: (...args: T) => Promise<R>): (...args: T) => Promise<R> {
        return async (...args: T): Promise<R> => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error);
                throw error;
            }
        };
    }

    /**
     * Handle synchronous errors with consistent pattern
     * @param fn - Function to wrap
     * @returns Wrapped function with error handling
     */
    syncHandler<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
        return (...args: T): R => {
            try {
                return fn(...args);
            } catch (error) {
                this.handleError(error);
                throw error;
            }
        };
    }

    /**
     * Central error handling logic
     * @param error - Error to handle
     * @param context - Additional context
     */
    handleError(error: unknown, context: Record<string, unknown> = {}): void {
        // Log based on error type and severity
        if (error instanceof AppError) {
            if (error.isOperational) {
                logger.warn('Operational error:', {
                    name: error.name,
                    message: error.message,
                    statusCode: error.statusCode,
                    ...context
                });
            } else {
                logger.error('Programming error:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    ...context
                });
            }
        } else {
            // Unknown/unexpected errors
            const err = error as Error;
            logger.error('Unexpected error:', {
                message: err.message,
                stack: err.stack,
                ...context
            });
        }
    }

    /**
     * Wrap error with additional context
     * @param error - Original error
     * @param context - Context message
     * @returns Wrapped error
     */
    wrapError(error: unknown, context: string): AppError {
        if (error instanceof AppError) {
            error.message = `${context}: ${error.message}`;
            return error;
        }
        const err = error as Error;
        return new AppError(`${context}: ${err.message}`, 500, false);
    }

    /**
     * Handle database errors
     * @param error - Database error
     * @param operation - Operation being performed
     */
    handleDatabaseError(error: unknown, operation: string): never {
        const err = error as Error;
        const dbError = new DatabaseError(
            `Database ${operation} failed: ${err.message}`,
            error
        );
        this.handleError(dbError);
        throw dbError;
    }

    /**
     * Handle external service errors
     * @param service - Service name
     * @param error - Original error
     * @param operation - Operation being performed
     */
    handleExternalServiceError(service: string, error: unknown, operation: string): never {
        const err = error as Error;
        const serviceError = new ExternalServiceError(
            service,
            `${operation} failed: ${err.message}`,
            error
        );
        this.handleError(serviceError);
        throw serviceError;
    }

    /**
     * Validate and throw if invalid
     * @param condition - Validation condition
     * @param message - Error message
     * @param details - Validation details
     */
    validate(condition: boolean, message: string, details: unknown = null): void {
        if (!condition) {
            throw new ValidationError(message, details);
        }
    }

    /**
     * Check resource exists or throw NotFoundError
     * @param resource - Resource to check
     * @param resourceName - Resource type name
     * @param identifier - Resource identifier
     */
    assertExists<T>(resource: T | null | undefined, resourceName: string, identifier: string | null = null): T {
        if (!resource) {
            throw new NotFoundError(resourceName, identifier);
        }
        return resource;
    }

    /**
     * Retry operation with exponential backoff
     * @param operation - Async operation to retry
     * @param maxRetries - Maximum retry attempts
     * @param baseDelay - Base delay in ms
     * @returns Operation result
     */
    async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 1000): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
                    await this._sleep(delay);
                }
            }
        }

        logger.error(`Operation failed after ${maxRetries} retries`);
        throw lastError;
    }

    /**
     * Sleep helper for retry backoff
     * @private
     */
    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new ErrorHandler();
