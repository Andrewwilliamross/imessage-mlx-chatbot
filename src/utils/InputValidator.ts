import logger from './logger.js';

/**
 * Validation result
 */
interface ValidationResult {
    valid: boolean;
    sanitized: string | number | boolean;
    error: string | null;
    type?: string;
}

/**
 * Validation options for message text
 */
interface MessageTextOptions {
    maxLength?: number;
    allowEmpty?: boolean;
}

/**
 * Validation options for integers
 */
interface IntegerOptions {
    min?: number;
    max?: number;
    defaultValue?: number;
}

/**
 * Validation options for booleans
 */
interface BooleanOptions {
    defaultValue?: boolean;
}

/**
 * Field schema for object validation
 */
interface FieldRules {
    type?: string;
    required?: boolean;
    validator?: (value: unknown, options: Record<string, unknown>) => ValidationResult;
    [key: string]: unknown;
}

/**
 * Object validation result
 */
interface ObjectValidationResult {
    valid: boolean;
    sanitized: Record<string, unknown>;
    errors: Record<string, string> | null;
}

/**
 * Input validation framework for user-supplied data
 * Prevents injection attacks and ensures data integrity
 */
class InputValidator {
    /**
     * Validate phone number format
     * @param phoneNumber - Phone number to validate
     * @returns Validation result
     */
    static validatePhoneNumber(phoneNumber: unknown): ValidationResult {
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return { valid: false, sanitized: '', error: 'Phone number is required and must be a string' };
        }

        // Remove all non-numeric characters except + for international format
        const sanitized = phoneNumber.replace(/[^\d+]/g, '');

        // Validate format: +1234567890 or 1234567890 (10-15 digits)
        const phoneRegex = /^\+?\d{10,15}$/;

        if (!phoneRegex.test(sanitized)) {
            return { valid: false, sanitized: '', error: 'Invalid phone number format. Must be 10-15 digits, optionally starting with +' };
        }

        return { valid: true, sanitized, error: null };
    }

    /**
     * Validate email address
     * @param email - Email to validate
     * @returns Validation result
     */
    static validateEmail(email: unknown): ValidationResult {
        if (!email || typeof email !== 'string') {
            return { valid: false, sanitized: '', error: 'Email is required and must be a string' };
        }

        const sanitized = email.trim().toLowerCase();

        // Basic email validation regex
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(sanitized)) {
            return { valid: false, sanitized: '', error: 'Invalid email format' };
        }

        // Check for excessive length (prevent DoS)
        if (sanitized.length > 254) {
            return { valid: false, sanitized: '', error: 'Email too long (max 254 characters)' };
        }

        return { valid: true, sanitized, error: null };
    }

    /**
     * Validate message text
     * @param text - Message text to validate
     * @param options - Validation options
     * @returns Validation result
     */
    static validateMessageText(text: unknown, options: MessageTextOptions = {}): ValidationResult {
        const {
            maxLength = 10000,
            allowEmpty = false
        } = options;

        if (text === null || text === undefined) {
            if (allowEmpty) {
                return { valid: true, sanitized: '', error: null };
            }
            return { valid: false, sanitized: '', error: 'Message text is required' };
        }

        if (typeof text !== 'string') {
            return { valid: false, sanitized: '', error: 'Message text must be a string' };
        }

        const sanitized = text.trim();

        if (!allowEmpty && sanitized.length === 0) {
            return { valid: false, sanitized: '', error: 'Message text cannot be empty' };
        }

        if (sanitized.length > maxLength) {
            return { valid: false, sanitized: '', error: `Message text too long (max ${maxLength} characters)` };
        }

        return { valid: true, sanitized, error: null };
    }

    /**
     * Validate file path (prevent directory traversal)
     * @param filePath - File path to validate
     * @returns Validation result
     */
    static validateFilePath(filePath: unknown): ValidationResult {
        if (!filePath || typeof filePath !== 'string') {
            return { valid: false, sanitized: '', error: 'File path is required and must be a string' };
        }

        // Check for directory traversal attempts
        if (filePath.includes('..') || filePath.includes('~')) {
            return { valid: false, sanitized: '', error: 'Invalid file path: directory traversal not allowed' };
        }

        // Check for null bytes (can bypass security checks)
        if (filePath.includes('\0')) {
            return { valid: false, sanitized: '', error: 'Invalid file path: null bytes not allowed' };
        }

        const sanitized = filePath.trim();

        if (sanitized.length > 4096) {
            return { valid: false, sanitized: '', error: 'File path too long (max 4096 characters)' };
        }

        return { valid: true, sanitized, error: null };
    }

    /**
     * Validate recipient identifier (phone number or email)
     * @param recipient - Recipient identifier
     * @returns Validation result with type
     */
    static validateRecipient(recipient: unknown): ValidationResult {
        if (!recipient || typeof recipient !== 'string') {
            return { valid: false, sanitized: '', type: undefined, error: 'Recipient is required and must be a string' };
        }

        // Try phone number first
        const phoneResult = this.validatePhoneNumber(recipient);
        if (phoneResult.valid) {
            return { ...phoneResult, type: 'phone' };
        }

        // Try email
        const emailResult = this.validateEmail(recipient);
        if (emailResult.valid) {
            return { ...emailResult, type: 'email' };
        }

        return { valid: false, sanitized: '', type: undefined, error: 'Recipient must be a valid phone number or email address' };
    }

    /**
     * Validate chat identifier
     * @param chatId - Chat identifier
     * @returns Validation result
     */
    static validateChatIdentifier(chatId: unknown): ValidationResult {
        if (!chatId || typeof chatId !== 'string') {
            return { valid: false, sanitized: '', error: 'Chat identifier is required and must be a string' };
        }

        const sanitized = chatId.trim();

        // Chat identifiers should not be excessively long
        if (sanitized.length > 500) {
            return { valid: false, sanitized: '', error: 'Chat identifier too long (max 500 characters)' };
        }

        // Check for suspicious characters that might indicate injection
        if (sanitized.includes('\0') || sanitized.includes('\n') || sanitized.includes('\r')) {
            return { valid: false, sanitized: '', error: 'Chat identifier contains invalid characters' };
        }

        return { valid: true, sanitized, error: null };
    }

    /**
     * Validate integer within range
     * @param value - Value to validate
     * @param options - Validation options
     * @returns Validation result
     */
    static validateInteger(value: unknown, options: IntegerOptions = {}): ValidationResult {
        const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue } = options;

        if (value === null || value === undefined) {
            if (defaultValue !== undefined) {
                return { valid: true, sanitized: defaultValue, error: null };
            }
            return { valid: false, sanitized: 0, error: 'Value is required' };
        }

        const parsed = parseInt(value as string, 10);

        if (isNaN(parsed)) {
            return { valid: false, sanitized: 0, error: 'Value must be a valid integer' };
        }

        if (parsed < min || parsed > max) {
            return { valid: false, sanitized: 0, error: `Value must be between ${min} and ${max}` };
        }

        return { valid: true, sanitized: parsed, error: null };
    }

    /**
     * Validate boolean value
     * @param value - Value to validate
     * @param options - Validation options
     * @returns Validation result
     */
    static validateBoolean(value: unknown, options: BooleanOptions = {}): ValidationResult {
        const { defaultValue } = options;

        if (value === null || value === undefined) {
            if (defaultValue !== undefined) {
                return { valid: true, sanitized: defaultValue, error: null };
            }
            return { valid: false, sanitized: false, error: 'Value is required' };
        }

        if (typeof value === 'boolean') {
            return { valid: true, sanitized: value, error: null };
        }

        // Accept string representations
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true' || lower === '1') {
                return { valid: true, sanitized: true, error: null };
            }
            if (lower === 'false' || lower === '0') {
                return { valid: true, sanitized: false, error: null };
            }
        }

        return { valid: false, sanitized: false, error: 'Value must be a boolean (true/false)' };
    }

    /**
     * Validate and sanitize object with schema
     * @param data - Data to validate
     * @param schema - Validation schema
     * @returns Object validation result
     */
    static validateObject(data: unknown, schema: Record<string, FieldRules>): ObjectValidationResult {
        if (!data || typeof data !== 'object') {
            return { valid: false, sanitized: {}, errors: { _global: 'Data must be an object' } };
        }

        const sanitized: Record<string, unknown> = {};
        const errors: Record<string, string> = {};
        let hasErrors = false;

        const dataObj = data as Record<string, unknown>;

        for (const [field, rules] of Object.entries(schema)) {
            const value = dataObj[field];
            const { type, required = false, validator, ...options } = rules;

            // Check if required field is missing
            if (required && (value === null || value === undefined)) {
                errors[field] = `${field} is required`;
                hasErrors = true;
                continue;
            }

            // Skip optional fields that are not provided
            if (!required && (value === null || value === undefined)) {
                continue;
            }

            // Apply type-specific validation
            let result: ValidationResult;
            if (validator && typeof validator === 'function') {
                result = validator(value, options);
            } else if (type === 'string') {
                result = this.validateMessageText(value, options as MessageTextOptions);
            } else if (type === 'integer') {
                result = this.validateInteger(value, options as IntegerOptions);
            } else if (type === 'boolean') {
                result = this.validateBoolean(value, options as BooleanOptions);
            } else if (type === 'phone') {
                result = this.validatePhoneNumber(value);
            } else if (type === 'email') {
                result = this.validateEmail(value);
            } else if (type === 'recipient') {
                result = this.validateRecipient(value);
            } else if (type === 'chatId') {
                result = this.validateChatIdentifier(value);
            } else if (type === 'filePath') {
                result = this.validateFilePath(value);
            } else {
                errors[field] = `Unknown validation type: ${type}`;
                hasErrors = true;
                continue;
            }

            if (!result.valid) {
                errors[field] = result.error || 'Validation failed';
                hasErrors = true;
            } else {
                sanitized[field] = result.sanitized;
            }
        }

        return {
            valid: !hasErrors,
            sanitized,
            errors: hasErrors ? errors : null
        };
    }

    /**
     * Middleware function for Express to validate request body
     * @param schema - Validation schema
     * @returns Express middleware
     */
    static validateMiddleware(schema: Record<string, FieldRules>): (req: any, res: any, next: any) => void {
        return (req: any, res: any, next: any): void => {
            const result = this.validateObject(req.body, schema);

            if (!result.valid) {
                logger.warn('Request validation failed:', { errors: result.errors });
                return res.status(400).json({
                    error: 'Validation failed',
                    details: result.errors
                });
            }

            // Replace request body with sanitized data
            req.body = result.sanitized;
            next();
        };
    }
}

export default InputValidator;
