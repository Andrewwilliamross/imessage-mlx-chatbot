import { S3Client, PutObjectCommand, GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mime from 'mime-types';
import logger from '../utils/logger.js';
import LRUCache from '../utils/LRUCache.js';

// Constants
const R2_CONSTANTS = {
    DEFAULT_SIGNED_URL_EXPIRY: 3600, // 1 hour
    URL_CACHE_TTL: 3600000, // 1 hour in milliseconds
    RANDOM_BYTES_LENGTH: 6,
    DEFAULT_CONTENT_TYPE: 'application/octet-stream',
    REGION: 'auto',

    ENV_KEYS: {
        ACCOUNT_ID: 'R2_ACCOUNT_ID',
        ACCESS_KEY_ID: 'R2_ACCESS_KEY_ID',
        SECRET_ACCESS_KEY: 'R2_SECRET_ACCESS_KEY',
        BUCKET_NAME: 'R2_BUCKET_NAME',
        PUBLIC_URL: 'R2_PUBLIC_URL',
        FALLBACK_URL: 'R2_FALLBACK_URL',
        SIGNED_URL_EXPIRY: 'S3_SIGNED_URL_EXPIRY'
    },

    METADATA_KEYS: {
        MESSAGE_GUID: 'message-guid',
        ORIGINAL_FILENAME: 'original-filename',
        FILE_HASH: 'file-hash',
        UPLOAD_TIMESTAMP: 'upload-timestamp'
    },

    ERROR_CODES: {
        FILE_NOT_FOUND: 'ENOENT',
        NO_SUCH_KEY: 'NoSuchKey'
    }
} as const;

/**
 * Upload result for attachments
 */
export interface UploadResult {
    key: string;
    publicUrl: string | null;
    signedUrl: string | null;
    contentType: string;
    size: number;
    hash: string;
    uploadedAt: string;
    originalFilename: string;
    messageGuid: string;
    validated: boolean;
    validation?: {
        url: string;
        accessible: boolean;
    };
}

/**
 * Validated URL result
 */
export interface ValidatedUrlResult {
    publicUrl: string | null;
    signedUrl: string | null;
    validated: boolean;
    validation?: {
        url: string;
        accessible: boolean;
    };
    error?: string;
}

/**
 * Cached URL entry
 */
interface CachedUrlEntry {
    result: ValidatedUrlResult;
    timestamp: number;
}

/**
 * Buffer upload result
 */
export interface BufferUploadResult {
    key: string;
    publicUrl: string | null;
    contentType: string;
    size: number;
    uploadedAt: string;
}

/**
 * Attachment information
 */
export interface AttachmentInfo {
    key: string;
    contentType: string;
    size: number;
    lastModified: Date;
    metadata: Record<string, string>;
    publicUrl: string | null;
}

/**
 * R2 storage stats
 */
export interface R2Stats {
    enabled: boolean;
    bucketName: string | undefined;
    publicUrl: string | undefined;
    signedUrlExpiry: number;
}

/**
 * AWS credentials
 */
interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
}

class R2StorageService {
    private client: S3Client | null;
    private bucketName: string | undefined;
    private publicUrl: string | undefined;
    private fallbackUrl: string | undefined;
    private signedUrlExpiry: number;
    private urlCache: LRUCache<string, CachedUrlEntry>;

    constructor() {
        this.client = null;
        this.bucketName = process.env[R2_CONSTANTS.ENV_KEYS.BUCKET_NAME];
        this.publicUrl = process.env[R2_CONSTANTS.ENV_KEYS.PUBLIC_URL];
        this.fallbackUrl = process.env[R2_CONSTANTS.ENV_KEYS.FALLBACK_URL];
        this.signedUrlExpiry = parseInt(process.env[R2_CONSTANTS.ENV_KEYS.SIGNED_URL_EXPIRY] || '') || R2_CONSTANTS.DEFAULT_SIGNED_URL_EXPIRY;
        this.urlCache = new LRUCache<string, CachedUrlEntry>(5000); // LRU cache with 5k limit for URLs
    }

    async initialize(): Promise<boolean> {
        if (!this.validateConfig()) {
            logger.warn('R2 configuration is incomplete. File storage will be disabled.');
            return false;
        }

        try {
            this.client = this._createS3Client();
            logger.info('R2 Storage Service initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize R2 Storage Service:', { error: error as Error });
            throw error;
        }
    }

    /**
     * Create S3 client with R2 configuration
     */
    private _createS3Client(): S3Client {
        return new S3Client({
            region: R2_CONSTANTS.REGION,
            endpoint: this._buildEndpoint(),
            credentials: this._buildCredentials(),
        });
    }

    /**
     * Build R2 endpoint URL
     */
    private _buildEndpoint(): string {
        const accountId = process.env[R2_CONSTANTS.ENV_KEYS.ACCOUNT_ID];
        if (!accountId) {
            throw new Error('R2_ACCOUNT_ID is required');
        }
        return `https://${accountId}.r2.cloudflarestorage.com`;
    }

    /**
     * Build credentials object
     */
    private _buildCredentials(): AwsCredentials {
        const accessKeyId = process.env[R2_CONSTANTS.ENV_KEYS.ACCESS_KEY_ID];
        const secretAccessKey = process.env[R2_CONSTANTS.ENV_KEYS.SECRET_ACCESS_KEY];

        if (!accessKeyId || !secretAccessKey) {
            throw new Error('R2 credentials are required');
        }

        return {
            accessKeyId,
            secretAccessKey,
        };
    }

    validateConfig(): boolean {
        const required = [
            R2_CONSTANTS.ENV_KEYS.ACCOUNT_ID,
            R2_CONSTANTS.ENV_KEYS.ACCESS_KEY_ID,
            R2_CONSTANTS.ENV_KEYS.SECRET_ACCESS_KEY,
            R2_CONSTANTS.ENV_KEYS.BUCKET_NAME
        ];

        return this._checkRequiredEnvVars(required);
    }

    /**
     * Check if all required environment variables are set
     */
    private _checkRequiredEnvVars(required: string[]): boolean {
        for (const key of required) {
            if (!process.env[key]) {
                logger.error(`Missing required R2 configuration: ${key}`);
                return false;
            }
        }
        return true;
    }

    /**
     * Expand tilde paths to full home directory paths
     * @example
     * expandPath('~/file.txt') // returns '/Users/username/file.txt'
     */
    expandPath(filePath: string): string {
        if (filePath.startsWith('~/')) {
            return path.join(os.homedir(), filePath.slice(2));
        }
        return filePath;
    }

    async uploadAttachment(filePath: string, messageGuid: string, originalFilename: string): Promise<UploadResult> {
        this._ensureClient();

        try {
            const fullPath = this.expandPath(filePath);
            logger.info(`Path expansion: ${filePath} -> ${fullPath}`);

            const fileBuffer = await this._readFile(fullPath);
            const fileSize = fileBuffer.length;
            const key = this.generateAttachmentKey(messageGuid, originalFilename);
            const contentType = this._getContentType(originalFilename);
            const hash = this._calculateHash(fileBuffer);

            await this._uploadToR2(key, fileBuffer, contentType, messageGuid, originalFilename, hash);

            const urlResult = await this.generateValidatedUrl(key, fileSize);

            const result = this._buildUploadResult(
                key,
                urlResult,
                contentType,
                fileSize,
                hash,
                originalFilename,
                messageGuid
            );

            logger.info(`Attachment uploaded successfully: ${originalFilename} (${fileSize} bytes)`);
            return result;

        } catch (error) {
            return this._handleUploadError(error, filePath);
        }
    }

    /**
     * Ensure client is initialized
     */
    private _ensureClient(): void {
        if (!this.client || !this.bucketName) {
            throw new Error('R2 client not initialized. Check your configuration.');
        }
    }

    /**
     * Read file from filesystem
     */
    private async _readFile(fullPath: string): Promise<Buffer> {
        await fs.access(fullPath);
        return await fs.readFile(fullPath);
    }

    /**
     * Get content type for file
     */
    private _getContentType(filename: string): string {
        return mime.lookup(filename) || R2_CONSTANTS.DEFAULT_CONTENT_TYPE;
    }

    /**
     * Calculate file hash
     */
    private _calculateHash(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Upload file to R2 with retry logic and exponential backoff
     */
    private async _uploadToR2(
        key: string,
        fileBuffer: Buffer,
        contentType: string,
        messageGuid: string,
        originalFilename: string,
        hash: string
    ): Promise<void> {
        const params = this._buildUploadParams(key, fileBuffer, contentType, messageGuid, originalFilename, hash);

        logger.debug(`Uploading attachment to R2: ${key}`);
        await this._retryWithBackoff(
            async () => await this.client!.send(new PutObjectCommand(params)),
            `Upload to R2: ${key}`
        );
    }

    /**
     * Retry operation with exponential backoff
     */
    private async _retryWithBackoff<T>(
        operation: () => Promise<T>,
        operationName: string = 'R2 Operation',
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (attempt === maxRetries) {
                    logger.error(`${operationName} failed after ${maxRetries + 1} attempts:`, { error: error as Error });
                    throw error;
                }

                // Calculate exponential backoff delay with jitter
                const exponentialDelay = baseDelay * Math.pow(2, attempt);
                const jitter = Math.random() * exponentialDelay * 0.1; // Add up to 10% jitter
                const delay = exponentialDelay + jitter;

                const err = error as Error;
                logger.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`, {
                    error: err.message,
                    attempt: attempt + 1,
                    maxRetries: maxRetries + 1
                });

                await this._sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Sleep for specified milliseconds
     */
    private async _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Build upload parameters
     */
    private _buildUploadParams(
        key: string,
        fileBuffer: Buffer,
        contentType: string,
        messageGuid: string,
        originalFilename: string,
        hash: string
    ): {
        Bucket: string;
        Key: string;
        Body: Buffer;
        ContentType: string;
        Metadata: Record<string, string>;
    } {
        return {
            Bucket: this.bucketName!,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
            Metadata: this._buildMetadata(messageGuid, originalFilename, hash)
        };
    }

    /**
     * Build metadata object
     */
    private _buildMetadata(messageGuid: string, originalFilename: string, hash: string): Record<string, string> {
        return {
            [R2_CONSTANTS.METADATA_KEYS.MESSAGE_GUID]: messageGuid,
            [R2_CONSTANTS.METADATA_KEYS.ORIGINAL_FILENAME]: originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_'),
            [R2_CONSTANTS.METADATA_KEYS.FILE_HASH]: hash,
            [R2_CONSTANTS.METADATA_KEYS.UPLOAD_TIMESTAMP]: Date.now().toString()
        };
    }

    /**
     * Build upload result object
     */
    private _buildUploadResult(
        key: string,
        urlResult: ValidatedUrlResult,
        contentType: string,
        fileSize: number,
        hash: string,
        originalFilename: string,
        messageGuid: string
    ): UploadResult {
        return {
            key,
            publicUrl: urlResult.publicUrl,
            signedUrl: urlResult.signedUrl,
            contentType,
            size: fileSize,
            hash,
            uploadedAt: new Date().toISOString(),
            originalFilename,
            messageGuid,
            validated: urlResult.validated,
            validation: urlResult.validation
        };
    }

    /**
     * Handle upload error
     */
    private _handleUploadError(error: unknown, filePath: string): never {
        const err = error as NodeJS.ErrnoException;
        if (err.code === R2_CONSTANTS.ERROR_CODES.FILE_NOT_FOUND) {
            const fullPath = this.expandPath(filePath);
            throw new Error(`Attachment file not found: ${fullPath} (original: ${filePath})`);
        }
        logger.error('Error uploading attachment to R2:', { error: error as Error });
        throw error;
    }

    generateAttachmentKey(messageGuid: string, originalFilename: string): string {
        const ext = path.extname(originalFilename);
        const basename = path.basename(originalFilename, ext);
        const cleanBasename = this._sanitizeFilename(basename);
        const timestamp = Date.now();
        const randomString = this._generateRandomString();

        return `${messageGuid}_${cleanBasename}_${timestamp}_${randomString}${ext}`;
    }

    /**
     * Sanitize filename for R2 storage
     */
    private _sanitizeFilename(filename: string): string {
        return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    /**
     * Generate random string for unique filenames
     */
    private _generateRandomString(): string {
        return crypto.randomBytes(R2_CONSTANTS.RANDOM_BYTES_LENGTH).toString('hex');
    }

    generatePublicUrl(key: string): string | null {
        const urls = this._buildCandidateUrls(key);
        return urls[0] || null;
    }

    /**
     * Build candidate URLs for file
     */
    private _buildCandidateUrls(key: string): string[] {
        const urls: string[] = [];

        if (this.publicUrl) {
            urls.push(`${this.publicUrl}/${key}`);
        }

        if (this.fallbackUrl) {
            urls.push(`${this.fallbackUrl}/${key}`);
        }

        // Standard R2 public URL format
        if (this.bucketName) {
            urls.push(`https://${this.bucketName}.r2.dev/${key}`);
        }

        return urls;
    }

    async generateValidatedUrl(key: string, fileSize: number | null = null): Promise<ValidatedUrlResult> {
        const cacheKey = this._buildCacheKey(key, fileSize);

        if (this._isCacheValid(cacheKey)) {
            const cached = this.urlCache.get(cacheKey);
            return cached!.result;
        }

        try {
            const signedUrl = await this.getSignedUrl(key);
            const publicUrl = this.generatePublicUrl(key);

            const result: ValidatedUrlResult = {
                publicUrl,
                signedUrl,
                validated: true,
                validation: { url: signedUrl, accessible: true }
            };

            this._cacheUrl(cacheKey, result);

            return result;
        } catch (error) {
            return await this._handleValidationError(error, key);
        }
    }

    /**
     * Build cache key for URL
     */
    private _buildCacheKey(key: string, fileSize: number | null): string {
        return `${key}-${fileSize || 'no-size'}`;
    }

    /**
     * Check if cache is valid
     */
    private _isCacheValid(cacheKey: string): boolean {
        const cached = this.urlCache.get(cacheKey);
        if (!cached) {
            return false;
        }

        return Date.now() - cached.timestamp < R2_CONSTANTS.URL_CACHE_TTL;
    }

    /**
     * Cache URL result
     */
    private _cacheUrl(cacheKey: string, result: ValidatedUrlResult): void {
        this.urlCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });
    }

    /**
     * Handle validation error
     */
    private async _handleValidationError(error: unknown, key: string): Promise<ValidatedUrlResult> {
        const err = error as Error;
        logger.error('Error generating validated URL:', { error: error as Error });

        return {
            publicUrl: this.generatePublicUrl(key),
            signedUrl: await this.getSignedUrl(key).catch(() => null),
            validated: false,
            error: err.message
        };
    }

    async getSignedUrl(key: string, expiresIn: number | null = null): Promise<string> {
        this._ensureClient();

        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        try {
            const expiry = expiresIn || this.signedUrlExpiry;
            return await this._retryWithBackoff(
                async () => await getSignedUrl(this.client!, command, { expiresIn: expiry }),
                `Generate signed URL for ${key}`
            );
        } catch (error) {
            logger.error('Error generating signed URL:', { error: error as Error });
            throw error;
        }
    }

    async uploadBuffer(
        buffer: Buffer,
        key: string,
        contentType: string = R2_CONSTANTS.DEFAULT_CONTENT_TYPE,
        metadata: Record<string, string> = {}
    ): Promise<BufferUploadResult> {
        this._ensureClient();

        try {
            const params = this._buildBufferUploadParams(buffer, key, contentType, metadata);

            await this._retryWithBackoff(
                async () => await this.client!.send(new PutObjectCommand(params)),
                `Upload buffer to R2: ${key}`
            );

            const result = this._buildBufferUploadResult(key, contentType, buffer.length);

            logger.debug(`Buffer uploaded successfully: ${key} (${buffer.length} bytes)`);
            return result;

        } catch (error) {
            logger.error('Error uploading buffer to R2:', { error: error as Error });
            throw error;
        }
    }

    /**
     * Build buffer upload parameters
     */
    private _buildBufferUploadParams(
        buffer: Buffer,
        key: string,
        contentType: string,
        metadata: Record<string, string>
    ): {
        Bucket: string;
        Key: string;
        Body: Buffer;
        ContentType: string;
        Metadata: Record<string, string>;
    } {
        return {
            Bucket: this.bucketName!,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            Metadata: {
                ...metadata,
                [R2_CONSTANTS.METADATA_KEYS.UPLOAD_TIMESTAMP]: Date.now().toString()
            }
        };
    }

    /**
     * Build buffer upload result
     */
    private _buildBufferUploadResult(key: string, contentType: string, size: number): BufferUploadResult {
        return {
            key,
            publicUrl: this.generatePublicUrl(key),
            contentType,
            size,
            uploadedAt: new Date().toISOString()
        };
    }

    async getAttachmentInfo(key: string): Promise<AttachmentInfo | null> {
        this._ensureClient();

        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            const response = await this.client!.send(command);

            return this._buildAttachmentInfo(key, response);
        } catch (error) {
            const err = error as { name?: string };
            if (err.name === R2_CONSTANTS.ERROR_CODES.NO_SUCH_KEY) {
                return null;
            }
            logger.error('Error getting attachment info:', { error: error as Error });
            throw error;
        }
    }

    /**
     * Build attachment info object
     */
    private _buildAttachmentInfo(key: string, response: GetObjectCommandOutput): AttachmentInfo {
        return {
            key,
            contentType: response.ContentType || R2_CONSTANTS.DEFAULT_CONTENT_TYPE,
            size: response.ContentLength || 0,
            lastModified: response.LastModified || new Date(),
            metadata: response.Metadata || {},
            publicUrl: this.generatePublicUrl(key)
        };
    }

    isEnabled(): boolean {
        return this.client !== null;
    }

    /**
     * Check if R2 is configured (alias for isEnabled for backward compatibility)
     */
    get isConfigured(): boolean {
        return this.isEnabled();
    }

    /**
     * Get public URL for an attachment path (backward compatibility method)
     */
    async getPublicUrl(attachmentPath: string): Promise<string | null> {
        try {
            // Extract key from path or use path as key
            const key = attachmentPath.includes('/')
                ? attachmentPath.split('/').pop() || attachmentPath
                : attachmentPath;

            return this.generatePublicUrl(key);
        } catch (error) {
            logger.error('Failed to get public URL:', { error });
            return null;
        }
    }

    /**
     * Queue an upload (placeholder for backward compatibility)
     * In practice, uploads happen immediately via uploadAttachment
     */
    queueUpload(attachmentPath: string): void {
        logger.debug('queueUpload called (no-op in current implementation)', { attachmentPath });
        // This is a no-op for now - uploads happen immediately
        // Could be implemented with a background queue if needed
    }

    getStats(): R2Stats {
        return {
            enabled: this.isEnabled(),
            bucketName: this.bucketName,
            publicUrl: this.publicUrl,
            signedUrlExpiry: this.signedUrlExpiry
        };
    }
}

export default R2StorageService;
