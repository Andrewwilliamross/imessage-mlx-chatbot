import { config as dotenvConfig } from 'dotenv';
import { readFile, writeFile, access, mkdir, unlink } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from './logger.js';

// Load environment variables
dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../../config/client-config.json');
const CONFIG_DIR = dirname(CONFIG_PATH);

/**
 * Server configuration
 */
interface ServerConfig {
    url: string;
    reconnectAttempts: number;
    reconnectDelay: number;
    timeout: number;
}

/**
 * Authentication configuration
 */
interface AuthConfig {
    apiKey: string;
    macId: string | null;
}

/**
 * Features configuration
 */
interface FeaturesConfig {
    heartbeat: boolean;
    heartbeatInterval: number;
    autoReconnect: boolean;
    statusLogging: boolean;
    statusInterval: number;
}

/**
 * Security configuration
 */
interface SecurityConfig {
    validateServerCert: boolean;
    allowSelfSigned: boolean;
}

/**
 * Redis configuration
 */
interface RedisConfig {
    url?: string;
    retryAttempts: number;
    retryDelay: number;
}

/**
 * Cloudflare R2 configuration
 */
interface CloudflareConfig {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
}

/**
 * Logging configuration
 */
interface LoggingConfig {
    level: string;
    file?: string;
}

/**
 * Complete client configuration
 */
interface ClientConfiguration {
    server: ServerConfig;
    auth: AuthConfig;
    features: FeaturesConfig;
    security: SecurityConfig;
    redis: RedisConfig;
    cloudflare: CloudflareConfig;
    logging: LoggingConfig;
}

/**
 * Socket.IO connection options
 */
interface SocketOptions {
    timeout: number;
    retries: number;
    transports: string[];
    auth: {
        macId: string | null;
        apiKey: string;
    };
    rejectUnauthorized: boolean;
}

class ClientConfig {
    private config: ClientConfiguration | null;
    private initialized: boolean;

    constructor() {
        this.config = null;
        this.initialized = false;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this.ensureConfigDir();
        await this.loadConfig();
        this.initialized = true;
    }

    private async ensureConfigDir(): Promise<void> {
        try {
            await access(CONFIG_DIR, fsConstants.F_OK);
        } catch {
            // Directory doesn't exist, create it
            try {
                await mkdir(CONFIG_DIR, { recursive: true });
            } catch (error) {
                logger.error('Failed to create config directory:', { error: error as Error });
            }
        }
    }

    /**
     * Load configuration from file and environment variables
     */
    private async loadConfig(): Promise<void> {
        // Default configuration
        this.config = {
            server: {
                url: process.env.SERVER_URL || 'http://localhost:3000',
                reconnectAttempts: 5,
                reconnectDelay: 1000,
                timeout: 10000
            },
            auth: {
                apiKey: process.env.MAC_API_KEY || this.generateApiKey(),
                macId: null // Will be set by macIdentifier
            },
            features: {
                heartbeat: true,
                heartbeatInterval: 30000,
                autoReconnect: true,
                statusLogging: true,
                statusInterval: 60000
            },
            security: {
                validateServerCert: process.env.NODE_ENV === 'production',
                allowSelfSigned: process.env.NODE_ENV === 'development'
            },
            redis: {
                url: process.env.REDIS_URL,
                retryAttempts: 3,
                retryDelay: 1000
            },
            cloudflare: {
                accountId: process.env.R2_ACCOUNT_ID,
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
                bucketName: process.env.R2_BUCKET_NAME,
                publicUrl: process.env.R2_PUBLIC_URL
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                file: process.env.LOG_FILE
            }
        };

        // Load existing config file if it exists
        await this.loadFromFile();

        // Save current config
        await this.saveConfig();
    }

    /**
     * Load configuration from file
     */
    private async loadFromFile(): Promise<void> {
        try {
            await access(CONFIG_PATH, fsConstants.F_OK);
            const fileContent = await readFile(CONFIG_PATH, 'utf8');
            const fileConfig = JSON.parse(fileContent) as Partial<ClientConfiguration>;

            // Merge file config with defaults
            this.config = this.mergeConfig(this.config!, fileConfig);

            logger.info('Loaded configuration from file');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
                logger.warn('Failed to load config file, using defaults:', { error: err.message });
            }
        }
    }

    /**
     * Deep merge configuration objects
     */
    private mergeConfig(target: ClientConfiguration, source: Partial<ClientConfiguration>): ClientConfiguration {
        const result = { ...target };

        for (const key in source) {
            const sourceValue = source[key as keyof ClientConfiguration];
            const targetValue = target[key as keyof ClientConfiguration];

            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                result[key as keyof ClientConfiguration] = this.mergeConfig(
                    targetValue as any,
                    sourceValue as any
                ) as any;
            } else {
                result[key as keyof ClientConfiguration] = sourceValue as any;
            }
        }

        return result;
    }

    /**
     * Save current configuration to file
     */
    private async saveConfig(): Promise<void> {
        try {
            const configToSave = {
                ...this.config,
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            };

            await writeFile(CONFIG_PATH, JSON.stringify(configToSave, null, 2));
            logger.debug(`Configuration saved to ${CONFIG_PATH}`);
        } catch (error) {
            logger.error('Failed to save configuration:', { error: error as Error });
        }
    }

    /**
     * Generate a secure API key
     */
    private generateApiKey(): string {
        const apiKey = crypto.randomBytes(32).toString('hex');
        logger.info('Generated new API key for Mac authentication');
        return apiKey;
    }

    /**
     * Get server configuration
     */
    getServerConfig(): ServerConfig {
        return this.config!.server;
    }

    /**
     * Get authentication configuration
     */
    getAuthConfig(): AuthConfig {
        return this.config!.auth;
    }

    /**
     * Get features configuration
     */
    getFeaturesConfig(): FeaturesConfig {
        return this.config!.features;
    }

    /**
     * Get security configuration
     */
    getSecurityConfig(): SecurityConfig {
        return this.config!.security;
    }

    /**
     * Get Redis configuration
     */
    getRedisConfig(): RedisConfig {
        return this.config!.redis;
    }

    /**
     * Get Cloudflare R2 configuration
     */
    getCloudflareConfig(): CloudflareConfig {
        return this.config!.cloudflare;
    }

    /**
     * Get logging configuration
     */
    getLoggingConfig(): LoggingConfig {
        return this.config!.logging;
    }

    /**
     * Update Mac ID in configuration
     */
    async setMacId(macId: string): Promise<void> {
        this.config!.auth.macId = macId;
        await this.saveConfig();
    }

    /**
     * Update server URL
     */
    async setServerUrl(url: string): Promise<void> {
        this.config!.server.url = url;
        await this.saveConfig();
        logger.info(`Server URL updated to: ${url}`);
    }

    /**
     * Update API key
     */
    async setApiKey(apiKey: string): Promise<void> {
        this.config!.auth.apiKey = apiKey;
        await this.saveConfig();
        logger.info('API key updated');
    }

    /**
     * Validate configuration
     */
    validate(): boolean {
        const errors: string[] = [];

        // Validate server URL
        if (!this.config!.server.url) {
            errors.push('Server URL is required');
        } else {
            try {
                new URL(this.config!.server.url);
            } catch (error) {
                errors.push('Invalid server URL format');
            }
        }

        // Validate API key
        if (!this.config!.auth.apiKey) {
            errors.push('API key is required');
        } else if (this.config!.auth.apiKey.length < 16) {
            errors.push('API key must be at least 16 characters');
        }

        // Validate Mac ID
        if (!this.config!.auth.macId) {
            logger.warn('Mac ID not set - will be generated automatically');
        }

        // Validate Redis URL
        if (!this.config!.redis.url) {
            errors.push('Redis URL is required');
        }

        if (errors.length > 0) {
            logger.error('Configuration validation failed:', { errors });
            return false;
        }

        logger.info('Configuration validation passed');
        return true;
    }

    /**
     * Get Socket.IO connection options
     */
    getSocketOptions(): SocketOptions {
        return {
            timeout: this.config!.server.timeout,
            retries: this.config!.server.reconnectAttempts,
            transports: ['websocket', 'polling'],
            auth: {
                macId: this.config!.auth.macId,
                apiKey: this.config!.auth.apiKey
            },
            rejectUnauthorized: this.config!.security.validateServerCert
        };
    }

    /**
     * Get complete configuration for debugging
     */
    getConfig(): Record<string, unknown> {
        // Return config without sensitive data for logging
        const safeConfig = JSON.parse(JSON.stringify(this.config));
        if (safeConfig.auth.apiKey) {
            safeConfig.auth.apiKey = '[REDACTED]';
        }
        if (safeConfig.cloudflare.secretAccessKey) {
            safeConfig.cloudflare.secretAccessKey = '[REDACTED]';
        }
        if (safeConfig.redis.url && safeConfig.redis.url.includes('@')) {
            safeConfig.redis.url = safeConfig.redis.url.replace(/:([^:@]*@)/, ':[REDACTED]@');
        }
        return safeConfig;
    }

    /**
     * Reset configuration to defaults
     */
    async reset(): Promise<void> {
        try {
            try {
                await access(CONFIG_PATH, fsConstants.F_OK);
                await unlink(CONFIG_PATH);
            } catch (error) {
                // File doesn't exist, nothing to delete
                const err = error as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') throw error;
            }
            await this.loadConfig();
            logger.info('Configuration reset to defaults');
        } catch (error) {
            logger.error('Failed to reset configuration:', { error: error as Error });
        }
    }
}

const clientConfig = new ClientConfig();

// Initialize config asynchronously (non-blocking)
clientConfig.initialize().catch(error => {
    logger.error('Failed to initialize config:', { error: error as Error });
});

export default clientConfig;
