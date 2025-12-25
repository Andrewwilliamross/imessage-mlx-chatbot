import { ValidationError } from './ErrorHandler.js';

/**
 * Field schema definition
 */
interface FieldSchema {
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    enum?: string[];
    min?: number;
    max?: number;
    integer?: boolean;
    minItems?: number;
    maxItems?: number;
    items?: FieldSchema;
    validator?: (value: unknown) => boolean;
    message?: string;
}

/**
 * Object schema
 */
type ObjectSchema = Record<string, FieldSchema>;

/**
 * Lightweight schema validation utility
 * Validates input data against defined schemas
 */
class SchemaValidator {
    /**
     * Validate value against type
     * @private
     */
    private _validateType(value: unknown, type: string, fieldName: string): void {
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (type === 'array' && !Array.isArray(value)) {
            throw new ValidationError(`${fieldName} must be an array`);
        }

        if (type !== 'array' && actualType !== type) {
            throw new ValidationError(`${fieldName} must be of type ${type}, got ${actualType}`);
        }
    }

    /**
     * Validate required field
     * @private
     */
    private _validateRequired(value: unknown, fieldName: string): void {
        if (value === null || value === undefined || value === '') {
            throw new ValidationError(`${fieldName} is required`);
        }
    }

    /**
     * Validate string constraints
     * @private
     */
    private _validateString(value: unknown, constraints: FieldSchema, fieldName: string): void {
        if (typeof value !== 'string') return;

        if (constraints.minLength && value.length < constraints.minLength) {
            throw new ValidationError(
                `${fieldName} must be at least ${constraints.minLength} characters`
            );
        }

        if (constraints.maxLength && value.length > constraints.maxLength) {
            throw new ValidationError(
                `${fieldName} must be at most ${constraints.maxLength} characters`
            );
        }

        if (constraints.pattern && !constraints.pattern.test(value)) {
            throw new ValidationError(
                `${fieldName} does not match required pattern`
            );
        }

        if (constraints.enum && !constraints.enum.includes(value)) {
            throw new ValidationError(
                `${fieldName} must be one of: ${constraints.enum.join(', ')}`
            );
        }
    }

    /**
     * Validate number constraints
     * @private
     */
    private _validateNumber(value: unknown, constraints: FieldSchema, fieldName: string): void {
        if (typeof value !== 'number') return;

        if (constraints.min !== undefined && value < constraints.min) {
            throw new ValidationError(
                `${fieldName} must be at least ${constraints.min}`
            );
        }

        if (constraints.max !== undefined && value > constraints.max) {
            throw new ValidationError(
                `${fieldName} must be at most ${constraints.max}`
            );
        }

        if (constraints.integer && !Number.isInteger(value)) {
            throw new ValidationError(`${fieldName} must be an integer`);
        }
    }

    /**
     * Validate array constraints
     * @private
     */
    private _validateArray(value: unknown, constraints: FieldSchema, fieldName: string): void {
        if (!Array.isArray(value)) return;

        if (constraints.minItems && value.length < constraints.minItems) {
            throw new ValidationError(
                `${fieldName} must have at least ${constraints.minItems} items`
            );
        }

        if (constraints.maxItems && value.length > constraints.maxItems) {
            throw new ValidationError(
                `${fieldName} must have at most ${constraints.maxItems} items`
            );
        }

        if (constraints.items) {
            value.forEach((item, index) => {
                this.validateField(item, constraints.items!, `${fieldName}[${index}]`);
            });
        }
    }

    /**
     * Validate a single field
     */
    validateField(value: unknown, schema: FieldSchema, fieldName: string = 'field'): void {
        // Handle required
        if (schema.required) {
            this._validateRequired(value, fieldName);
        } else if (value === undefined || value === null) {
            return; // Optional field not provided
        }

        // Validate type
        if (schema.type) {
            this._validateType(value, schema.type, fieldName);
        }

        // Type-specific validations
        if (schema.type === 'string') {
            this._validateString(value, schema, fieldName);
        } else if (schema.type === 'number') {
            this._validateNumber(value, schema, fieldName);
        } else if (schema.type === 'array') {
            this._validateArray(value, schema, fieldName);
        }

        // Custom validator
        if (schema.validator && typeof schema.validator === 'function') {
            if (!schema.validator(value)) {
                throw new ValidationError(
                    schema.message || `${fieldName} validation failed`
                );
            }
        }
    }

    /**
     * Validate object against schema
     */
    validate(data: unknown, schema: ObjectSchema): boolean {
        if (!data || typeof data !== 'object') {
            throw new ValidationError('Data must be an object');
        }

        const errors: string[] = [];
        const dataObj = data as Record<string, unknown>;

        // Validate each field in schema
        for (const [fieldName, fieldSchema] of Object.entries(schema)) {
            try {
                this.validateField(dataObj[fieldName], fieldSchema, fieldName);
            } catch (error) {
                if (error instanceof ValidationError) {
                    errors.push(error.message);
                } else {
                    throw error;
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(
                'Validation failed',
                { errors }
            );
        }

        return true;
    }

    /**
     * Create validation middleware for async functions
     */
    middleware(schema: ObjectSchema): (data: unknown) => Promise<unknown> {
        return async (data: unknown): Promise<unknown> => {
            this.validate(data, schema);
            return data;
        };
    }
}

/**
 * Common schema definitions
 */
export const Schemas: Record<string, ObjectSchema> = {
    // Message schemas
    sendMessage: {
        recipient: {
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 255
        },
        message: {
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 10000
        },
        attachments: {
            type: 'array',
            required: false,
            maxItems: 10
        }
    },

    // Conversation schemas
    getMessages: {
        conversationId: {
            type: 'string',
            required: true,
            minLength: 1
        },
        limit: {
            type: 'number',
            required: false,
            min: 1,
            max: 500,
            integer: true
        },
        offset: {
            type: 'number',
            required: false,
            min: 0,
            integer: true
        }
    },

    searchConversations: {
        query: {
            type: 'string',
            required: true,
            minLength: 2,
            maxLength: 100
        }
    },

    // Attachment schemas
    uploadAttachment: {
        filePath: {
            type: 'string',
            required: true,
            minLength: 1
        },
        messageGuid: {
            type: 'string',
            required: true,
            pattern: /^[a-zA-Z0-9_-]+$/
        },
        filename: {
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 255
        }
    },

    // Configuration schemas
    updateConfig: {
        serverUrl: {
            type: 'string',
            required: false,
            validator: (value: unknown): boolean => {
                try {
                    new URL(value as string);
                    return true;
                } catch {
                    return false;
                }
            },
            message: 'Invalid URL format'
        }
    }
};

export default new SchemaValidator();
