/**
 * Configuration Type Definitions
 *
 * Types for environment variables and configuration
 */

/**
 * Environment variables
 */
export interface RelayEnvironment {
    // Server configuration
    SERVER_URL: string;
    MAX_RECONNECT_ATTEMPTS?: string;
    CONNECTION_TIMEOUT?: string;
    RECONNECT_DELAY?: string;
    HEARTBEAT_INTERVAL?: string;

    // Relay identification
    PHONE_NUMBER: string;
    MAC_ID?: string;
    HOSTNAME?: string;

    // Redis configuration
    REDIS_URL?: string;

    // R2/S3 Storage configuration
    R2_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    R2_BUCKET_NAME?: string;
    R2_PUBLIC_URL?: string;

    // Logging configuration
    LOG_MODE?: 'text' | 'json';
    LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
    LOG_FILE?: string;
    ERROR_LOG_FILE?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
}

/**
 * Relay configuration with defaults
 */
export interface RelayConfig {
    serverUrl: string;
    macId: string;
    phoneNumber: string;
    maxReconnectAttempts: number;
    connectionTimeout: number;
    reconnectDelay: number;
    heartbeatInterval: number;
    redis?: {
        url: string;
    };
    r2?: {
        accountId: string;
        accessKeyId: string;
        secretAccessKey: string;
        bucketName: string;
        publicUrl?: string;
    };
    logging: {
        mode: 'text' | 'json';
        level: 'debug' | 'info' | 'warn' | 'error';
        file?: string;
        errorFile?: string;
    };
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
}

/**
 * Message service configuration
 */
export interface MessageServiceConfig {
    retryAttempts: number;
    retryDelay: number;
    deliveryCheckDelayText: number;
    deliveryCheckDelayMedia: number;
    maxFallbacksPerRecipient: number;
    fallbackResetInterval: number;
}
