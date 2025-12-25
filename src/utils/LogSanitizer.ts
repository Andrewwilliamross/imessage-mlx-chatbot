/**
 * Log Sanitizer - Prevents sensitive data from appearing in logs
 * Masks credentials, API keys, tokens, and other sensitive information
 */

interface SanitizationPattern {
    regex: RegExp;
    replacement: string | ((match: string, ...args: unknown[]) => string);
}

class LogSanitizer {
    private readonly patterns: SanitizationPattern[];

    constructor() {
        // Patterns for sensitive data
        this.patterns = [
            // API Keys and Tokens
            { regex: /(apikey|api_key|api-key)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-]{16,})["']?/gi, replacement: '$1=[REDACTED]' },
            { regex: /(token|access_token|refresh_token)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-.]{16,})["']?/gi, replacement: '$1=[REDACTED]' },
            { regex: /(bearer\s+)([a-zA-Z0-9_\-.]{16,})/gi, replacement: '$1[REDACTED]' },

            // AWS/R2 Credentials
            { regex: /(aws_access_key_id|r2_access_key_id|accesskeyid)["']?\s*[:=]\s*["']?([A-Z0-9]{16,})["']?/gi, replacement: '$1=[REDACTED]' },
            { regex: /(aws_secret_access_key|r2_secret_access_key|secretaccesskey)["']?\s*[:=]\s*["']?([a-zA-Z0-9/+=]{40,})["']?/gi, replacement: '$1=[REDACTED]' },

            // Passwords
            { regex: /(password|passwd|pwd)["']?\s*[:=]\s*["']?([^\s"',;]{3,})["']?/gi, replacement: '$1=[REDACTED]' },

            // Database URLs with credentials
            { regex: /(redis|mongodb|postgresql|mysql):\/\/([^:]+):([^@]+)@/gi, replacement: '$1://$2:[REDACTED]@' },

            // Email addresses (partial masking)
            { regex: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, replacement: (match: string, ...args: unknown[]) => {
                const user = args[0] as string;
                const domain = args[1] as string;
                const maskedUser = user.length > 3 ? user.substring(0, 2) + '***' : '***';
                return `${maskedUser}@${domain}`;
            }},

            // Phone numbers (partial masking)
            { regex: /(\+?1?\s*\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g, replacement: (match: string) => {
                return match.substring(0, 3) + '***-***-' + match.substring(match.length - 4);
            }},

            // Credit card numbers
            { regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, replacement: 'XXXX-XXXX-XXXX-XXXX' },

            // Session IDs and UUIDs (partial masking)
            { regex: /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4})-([0-9a-f]{12})/gi, replacement: '$1-************' },

            // Generic secret patterns
            { regex: /(secret|private_key|privatekey)["']?\s*[:=]\s*["']?([^\s"',;]{10,})["']?/gi, replacement: '$1=[REDACTED]' }
        ];
    }

    /**
     * Sanitize a string by removing/masking sensitive data
     */
    sanitize(text: unknown): unknown {
        if (typeof text !== 'string') {
            return this._sanitizeObject(text);
        }

        let sanitized = text;
        for (const { regex, replacement } of this.patterns) {
            if (typeof replacement === 'function') {
                sanitized = sanitized.replace(regex, replacement as (...args: unknown[]) => string);
            } else {
                sanitized = sanitized.replace(regex, replacement);
            }
        }
        return sanitized;
    }

    /**
     * Sanitize an object by recursively sanitizing all string values
     */
    private _sanitizeObject(obj: unknown): unknown {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this._sanitizeObject(item));
        }

        if (typeof obj === 'object') {
            const sanitized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                // Redact entire value for known sensitive keys
                if (this._isSensitiveKey(key)) {
                    sanitized[key] = '[REDACTED]';
                } else if (typeof value === 'string') {
                    sanitized[key] = this.sanitize(value);
                } else if (typeof value === 'object') {
                    sanitized[key] = this._sanitizeObject(value);
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Check if a key name suggests sensitive data
     */
    private _isSensitiveKey(key: string): boolean {
        const lowerKey = key.toLowerCase();
        const sensitiveKeys = [
            'password', 'passwd', 'pwd', 'secret', 'apikey', 'api_key', 'token',
            'access_token', 'refresh_token', 'private_key', 'privatekey',
            'aws_secret_access_key', 'r2_secret_access_key', 'secretaccesskey',
            'cookie', 'session', 'authorization', 'auth'
        ];

        return sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey));
    }

    /**
     * Sanitize environment variables for logging
     */
    sanitizeEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
        const sanitized: Record<string, string | undefined> = {};
        const sensitiveEnvKeys = [
            'r2_secret_access_key', 'r2_access_key_id',
            'mac_api_key', 'redis_url', 'database_url',
            'session_secret', 'jwt_secret', 'encryption_key'
        ];

        for (const [key, value] of Object.entries(env)) {
            const lowerKey = key.toLowerCase();
            if (sensitiveEnvKeys.some(sensitive => lowerKey.includes(sensitive))) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Sanitize error objects for logging
     */
    sanitizeError(error: unknown): Record<string, unknown> {
        if (!(error instanceof Error)) {
            return this._sanitizeObject(error) as Record<string, unknown>;
        }

        return {
            name: error.name,
            message: this.sanitize(error.message),
            stack: error.stack ? this.sanitize(error.stack) : undefined,
            code: (error as NodeJS.ErrnoException).code,
            // Sanitize any additional properties
            ...(this._sanitizeObject(Object.getOwnPropertyNames(error).reduce((acc, prop) => {
                if (!['name', 'message', 'stack', 'code'].includes(prop)) {
                    (acc as Record<string, unknown>)[prop] = (error as unknown as Record<string, unknown>)[prop];
                }
                return acc;
            }, {} as Record<string, unknown>)) as Record<string, unknown>)
        };
    }
}

export default new LogSanitizer();
