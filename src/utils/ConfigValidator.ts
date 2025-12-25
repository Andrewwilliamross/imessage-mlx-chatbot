import logger from './logger.js';

/**
 * Configuration validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Configuration validator for environment variables
 * Ensures all required configuration is present before relay starts
 */
class ConfigValidator {
    private errors: string[];
    private warnings: string[];

    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate all required environment variables
     */
    validate(): ValidationResult {
        this.errors = [];
        this.warnings = [];

        // Core relay configuration
        this._validateRequired('RELAY_ID', 'Unique relay identifier');
        this._validateRequired('DEVICE_NAME', 'Device name for identification');

        // Server connection
        this._validateOptional('SERVER_URL', 'Server connection URL', 'http://localhost:3000');

        // R2 Storage (Cloudflare) - Required for attachments
        this._validateRequired('R2_ACCOUNT_ID', 'Cloudflare R2 Account ID');
        this._validateRequired('R2_ACCESS_KEY_ID', 'R2 Access Key ID');
        this._validateRequired('R2_SECRET_ACCESS_KEY', 'R2 Secret Access Key');
        this._validateRequired('R2_BUCKET_NAME', 'R2 Bucket Name');

        // R2 Public URLs (Optional but recommended)
        this._validateOptional('R2_PUBLIC_URL', 'R2 Public URL for direct access');
        this._validateOptional('R2_FALLBACK_URL', 'R2 Fallback URL');

        // Redis configuration (if external Redis is used)
        this._validateOptional('REDIS_URL', 'Redis connection URL', 'redis://localhost:6379');

        // Optional performance tuning
        this._validateNumeric('S3_SIGNED_URL_EXPIRY', 'Signed URL expiry (seconds)', 3600);
        this._validateNumeric('MAX_RECONNECT_ATTEMPTS', 'Max reconnection attempts', 10);

        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }

    /**
     * Validate required environment variable
     */
    private _validateRequired(key: string, description: string): boolean {
        if (!process.env[key]) {
            this.errors.push(`Missing required environment variable: ${key} (${description})`);
            return false;
        }
        return true;
    }

    /**
     * Validate optional environment variable
     */
    private _validateOptional(key: string, description: string, defaultValue: string | null = null): boolean {
        if (!process.env[key]) {
            const message = defaultValue
                ? `Optional ${key} not set (${description}). Using default: ${defaultValue}`
                : `Optional ${key} not set (${description})`;
            this.warnings.push(message);
            return false;
        }
        return true;
    }

    /**
     * Validate numeric environment variable
     */
    private _validateNumeric(key: string, description: string, defaultValue: number | null = null): boolean {
        if (!process.env[key]) {
            if (defaultValue !== null) {
                this.warnings.push(`Optional ${key} not set (${description}). Using default: ${defaultValue}`);
            }
            return false;
        }

        const value = parseInt(process.env[key]!, 10);
        if (isNaN(value)) {
            this.errors.push(`Invalid ${key}: must be a number (${description}). Got: ${process.env[key]}`);
            return false;
        }

        return true;
    }

    /**
     * Validate URL format
     */
    private _validateUrl(key: string, description: string): boolean {
        if (!this._validateRequired(key, description)) {
            return false;
        }

        try {
            new URL(process.env[key]!);
            return true;
        } catch (error) {
            this.errors.push(`Invalid ${key}: must be a valid URL (${description}). Got: ${process.env[key]}`);
            return false;
        }
    }

    /**
     * Print validation results
     */
    printResults(result: ValidationResult): boolean {
        if (result.warnings.length > 0) {
            logger.warn('Configuration warnings:');
            result.warnings.forEach(warning => logger.warn(`  ⚠️  ${warning}`));
        }

        if (result.errors.length > 0) {
            logger.error('Configuration validation failed:');
            result.errors.forEach(error => logger.error(`  ❌ ${error}`));
            logger.error('\nPlease set the required environment variables and restart the relay.');
            return false;
        }

        logger.info('✅ Configuration validation passed');
        return true;
    }

    /**
     * Validate and exit if invalid
     */
    validateOrExit(): ValidationResult {
        const result = this.validate();
        const success = this.printResults(result);

        if (!success) {
            process.exit(1);
        }

        return result;
    }
}

export default new ConfigValidator();
