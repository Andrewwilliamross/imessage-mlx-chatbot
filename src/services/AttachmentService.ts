import { createWriteStream, existsSync, statSync, unlinkSync, mkdirSync, readdirSync, Stats } from 'fs';
import { pipeline } from 'stream/promises';
import { join, basename, extname } from 'path';
import crypto from 'crypto';
import fetch, { Response } from 'node-fetch';
import logger from '../utils/logger.js';
import R2StorageService, { type UploadResult, type AttachmentInfo as R2AttachmentInfo } from './R2StorageService.js';
import redisPool from '../utils/RedisPool.js';
import type { RedisClientType } from 'redis';

// Constants
const ATTACHMENT_CONSTANTS = {
    UPLOAD_PATH: '/tmp/relay-attachments',
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    DOWNLOAD_TIMEOUT: 30000, // 30 seconds
    CACHE_TTL: 86400 * 7, // 7 days
    OLD_FILE_MAX_AGE: 60 * 60 * 1000, // 1 hour
    URL_HASH_LENGTH: 8,

    FILE_CATEGORIES: {
        IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'],
        VIDEO: ['.mp4', '.mov', '.avi', '.quicktime'],
        AUDIO: ['.mp3', '.aac', '.wav', '.m4a']
    },

    FILE_ICONS: {
        '.pdf': '📄',
        '.doc': '📝', '.docx': '📝',
        '.xls': '📊', '.xlsx': '📊',
        '.ppt': '📽️', '.pptx': '📽️',
        '.zip': '🗜️', '.rar': '🗜️',
        '.mp3': '🎵', '.wav': '🎵', '.aac': '🎵',
        '.mp4': '🎬', '.mov': '🎬', '.avi': '🎬',
        '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️'
    } as Record<string, string>,

    DEFAULT_ICON: '📁'
} as const;

/**
 * File validation result
 */
export interface FileValidationResult {
    success: boolean;
    localPath?: string;
    size?: number;
    temporary?: boolean;
    error?: string;
}

/**
 * Download result
 */
export interface DownloadResult extends FileValidationResult {
    originalUrl?: string;
    contentType?: string | null;
}

/**
 * Attachment cache data
 */
export interface AttachmentCacheData {
    messageGuid: string;
    r2Key: string;
    publicUrl: string | null;
    signedUrl: string | null;
    originalFilename: string;
    contentType: string;
    size: number;
    hash: string;
    uploadedAt: string;
    type: string;
    lastAccessed?: string;
    accessCount?: number;
}

/**
 * Attachment message for display
 */
export interface AttachmentMessage {
    id: string;
    type: 'attachment';
    attachment: {
        name: string;
        size: number;
        contentType: string;
        downloadUrl: string | null;
        previewUrl: string | null;
        category: 'image' | 'video' | 'audio' | 'document';
        icon: string;
        r2Key: string;
        hash?: string;
    };
    timestamp: string;
    messageGuid: string;
}

/**
 * Inbound attachment result
 */
export interface InboundAttachmentResult {
    success: boolean;
    downloadUrl: string | null;
    publicUrl?: string | null;
    type: 'inbound';
    error?: string;
    originalFilename?: string;
    messageGuid?: string;
    key?: string;
    contentType?: string;
    size?: number;
    hash?: string;
    uploadedAt?: string;
    validated?: boolean;
    validation?: {
        url: string;
        accessible: boolean;
    };
    signedUrl?: string | null;
}

/**
 * Outbound attachment result
 */
export interface OutboundAttachmentResult {
    success: boolean;
    localPath?: string;
    r2Key: string;
    signedUrl?: string;
    temporary?: boolean;
    attachmentInfo?: AttachmentCacheData | null;
    type: 'outbound';
    error?: string;
    messageGuid?: string;
}

/**
 * Attachment info result
 */
export interface AttachmentInfoResult {
    r2Key: string;
    contentType: string;
    size: number;
    lastModified: Date;
    publicUrl: string | null;
    metadata: Record<string, string>;
}

/**
 * Service statistics
 */
export interface AttachmentServiceStats {
    service: string;
    uploadPath?: string;
    temporaryFiles?: number;
    totalSize?: number;
    maxFileSize?: number;
    r2Enabled?: boolean;
    redisConnected?: boolean;
    timestamp: string;
    error?: string;
}

class AttachmentService {
    private uploadPath: string;
    private maxFileSize: number;
    private r2Storage: R2StorageService;
    private redisClient: RedisClientType | null;
    private phoneNumber: string | undefined;
    private redisPrefix: string;

    constructor() {
        this.uploadPath = ATTACHMENT_CONSTANTS.UPLOAD_PATH;
        this.maxFileSize = ATTACHMENT_CONSTANTS.MAX_FILE_SIZE;

        this.r2Storage = new R2StorageService();
        this.redisClient = null;
        this.phoneNumber = process.env.PHONE_NUMBER;
        this.redisPrefix = `attachments:${this.phoneNumber}`;

        this.ensureUploadDirectory();
        this.initializeServices();
    }

    async initializeServices(): Promise<void> {
        try {
            // Initialize R2
            await this.r2Storage.initialize();
            logger.info('R2 Storage initialized for attachments');

            // Initialize Redis via RedisPool
            if (process.env.REDIS_URL) {
                this.redisClient = await redisPool.getClient();
                logger.info('✅ Redis connected via RedisPool for attachment caching');
            }
        } catch (error) {
            logger.warn('Failed to initialize some attachment services:', { error: error as Error });
        }
    }

    /**
     * Ensure upload directory exists
     */
    ensureUploadDirectory(): void {
        try {
            if (!existsSync(this.uploadPath)) {
                mkdirSync(this.uploadPath, { recursive: true });
                logger.info(`Created attachment directory: ${this.uploadPath}`);
            }
        } catch (error) {
            logger.error('Failed to create attachment directory:', { error: error as Error });
        }
    }

    /**
     * Prepare attachment for sending (download if URL, validate if local path)
     */
    async prepareAttachment(attachmentUrl: string): Promise<FileValidationResult | DownloadResult> {
        try {
            // Check if it's a local file path
            if (existsSync(attachmentUrl)) {
                return this.validateLocalFile(attachmentUrl);
            }

            // Check if it's a URL
            if (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://')) {
                return await this.downloadAttachment(attachmentUrl);
            }

            throw new Error('Invalid attachment URL or file path');

        } catch (error) {
            const err = error as Error;
            logger.error('Failed to prepare attachment:', { error: error as Error });
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Validate local file
     */
    validateLocalFile(filePath: string): FileValidationResult {
        try {
            if (!existsSync(filePath)) {
                throw new Error('File does not exist');
            }

            const stats = statSync(filePath);

            if (!stats.isFile()) {
                throw new Error('Path is not a file');
            }

            if (stats.size > this.maxFileSize) {
                throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize})`);
            }

            logger.info(`Validated local file: ${filePath} (${stats.size} bytes)`);

            return {
                success: true,
                localPath: filePath,
                size: stats.size,
                temporary: false
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`Failed to validate local file ${filePath}:`, { error: error as Error });
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Download attachment from URL
     */
    async downloadAttachment(url: string): Promise<DownloadResult> {
        try {
            logger.info(`Downloading attachment from: ${url}`);

            const localPath = this._generateLocalPath(url);
            const response = await this._fetchUrl(url);

            this._validateHttpResponse(response);
            this._validateContentSize(response);

            await this._saveFile(response.body!, localPath);

            const stats = statSync(localPath);
            const contentType = response.headers.get('content-type');
            logger.info(`Downloaded attachment: ${basename(localPath)} (${stats.size} bytes)`);

            return {
                success: true,
                localPath,
                originalUrl: url,
                size: stats.size,
                contentType,
                temporary: true
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`Failed to download attachment from ${url}:`, { error: error as Error });
            return {
                success: false,
                error: err.message,
                originalUrl: url
            };
        }
    }

    /**
     * Generate unique local path for downloaded file
     */
    private _generateLocalPath(url: string): string {
        const urlHash = crypto
            .createHash('md5')
            .update(url)
            .digest('hex')
            .substring(0, ATTACHMENT_CONSTANTS.URL_HASH_LENGTH);
        const extension = this.getExtensionFromUrl(url) || '.bin';
        const filename = `attachment_${Date.now()}_${urlHash}${extension}`;
        return join(this.uploadPath, filename);
    }

    /**
     * Fetch URL with timeout
     */
    private async _fetchUrl(url: string): Promise<Response> {
        return await fetch(url, {
            signal: AbortSignal.timeout(ATTACHMENT_CONSTANTS.DOWNLOAD_TIMEOUT),
            headers: {
                'User-Agent': 'iMessage-Relay/1.0'
            }
        });
    }

    /**
     * Validate HTTP response
     */
    private _validateHttpResponse(response: Response): void {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    /**
     * Validate content size
     */
    private _validateContentSize(response: Response): void {
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        if (contentLength > this.maxFileSize) {
            throw new Error(`File too large: ${contentLength} bytes (max: ${this.maxFileSize})`);
        }
    }

    /**
     * Save file from stream
     */
    private async _saveFile(body: NodeJS.ReadableStream, localPath: string): Promise<void> {
        const writeStream = createWriteStream(localPath);
        await pipeline(body, writeStream);
    }

    /**
     * Get file extension from URL
     */
    getExtensionFromUrl(url: string): string | null {
        try {
            const urlPath = new URL(url).pathname;
            const extension = extname(urlPath);
            return extension || null;
        } catch {
            return null;
        }
    }

    /**
     * Clean up temporary file
     */
    cleanupTemporaryFile(filePath: string): void {
        try {
            if (existsSync(filePath) && filePath.includes(this.uploadPath)) {
                unlinkSync(filePath);
                logger.debug(`Cleaned up temporary file: ${filePath}`);
            }
        } catch (error) {
            logger.warn(`Failed to clean up temporary file ${filePath}:`, { error: error as Error });
        }
    }

    /**
     * Clean up old temporary files
     */
    cleanupOldFiles(maxAge: number = ATTACHMENT_CONSTANTS.OLD_FILE_MAX_AGE): void {
        try {
            const files = readdirSync(this.uploadPath);
            const cleanedCount = this._removeOldFiles(files, maxAge);

            if (cleanedCount > 0) {
                logger.info(`Cleaned up ${cleanedCount} old temporary files`);
            }

        } catch (error) {
            logger.error('Failed to clean up old files:', { error: error as Error });
        }
    }

    /**
     * Remove old files from upload directory
     */
    private _removeOldFiles(files: string[], maxAge: number): number {
        const now = Date.now();
        let cleanedCount = 0;

        for (const file of files) {
            const filePath = join(this.uploadPath, file);
            if (this._isFileOld(filePath, now, maxAge)) {
                unlinkSync(filePath);
                cleanedCount++;
            }
        }

        return cleanedCount;
    }

    /**
     * Check if file is older than max age
     */
    private _isFileOld(filePath: string, now: number, maxAge: number): boolean {
        const stats = statSync(filePath);
        return now - stats.mtime.getTime() > maxAge;
    }

    /**
     * Handle inbound attachment from iMessage (upload to R2 and cache in Redis)
     */
    async handleInboundAttachment(filePath: string, messageGuid: string, originalFilename: string): Promise<InboundAttachmentResult> {
        try {
            logger.info(`Processing inbound attachment: ${originalFilename}`);

            this._validateFileForInbound(filePath);
            this._ensureR2Available();

            const uploadResult = await this.r2Storage.uploadAttachment(filePath, messageGuid, originalFilename);

            await this._cacheAttachmentMetadata(messageGuid, uploadResult, originalFilename, 'inbound');

            logger.info(`Inbound attachment processed successfully: ${originalFilename} -> ${uploadResult.key}`);

            return {
                success: true,
                ...uploadResult,
                downloadUrl: uploadResult.publicUrl,
                type: 'inbound'
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`Failed to handle inbound attachment: ${originalFilename}:`, { error: error as Error });
            return {
                success: false,
                error: err.message,
                originalFilename,
                messageGuid,
                type: 'inbound'
            } as InboundAttachmentResult;
        }
    }

    /**
     * Validate file for inbound processing
     */
    private _validateFileForInbound(filePath: string): void {
        const validation = this.validateLocalFile(filePath);
        if (!validation.success) {
            throw new Error(`File validation failed: ${validation.error}`);
        }
    }

    /**
     * Ensure R2 storage is available
     */
    private _ensureR2Available(): void {
        if (!this.r2Storage.isEnabled()) {
            throw new Error('R2 storage is not available');
        }
    }

    /**
     * Cache attachment metadata in Redis
     */
    private async _cacheAttachmentMetadata(messageGuid: string, uploadResult: UploadResult, originalFilename: string, type: string): Promise<void> {
        if (!this.redisClient) {
            return;
        }

        const cacheKey = this._buildCacheKey(messageGuid, uploadResult.key);
        const cacheData = this._buildCacheData(messageGuid, uploadResult, originalFilename, type);

        await this.redisClient.setEx(cacheKey, ATTACHMENT_CONSTANTS.CACHE_TTL, JSON.stringify(cacheData));
        logger.debug(`Cached attachment metadata: ${cacheKey}`);
    }

    /**
     * Build cache key
     */
    private _buildCacheKey(messageGuid: string, r2Key: string): string {
        return `${this.redisPrefix}:${messageGuid}:${r2Key}`;
    }

    /**
     * Build cache data object
     */
    private _buildCacheData(messageGuid: string, uploadResult: UploadResult, originalFilename: string, type: string): AttachmentCacheData {
        return {
            messageGuid,
            r2Key: uploadResult.key,
            publicUrl: uploadResult.publicUrl,
            signedUrl: uploadResult.signedUrl,
            originalFilename,
            contentType: uploadResult.contentType,
            size: uploadResult.size,
            hash: uploadResult.hash,
            uploadedAt: uploadResult.uploadedAt,
            type
        };
    }

    /**
     * Handle outbound attachment (download from R2 for iMessage sending)
     */
    async handleOutboundAttachment(r2Key: string, messageGuid: string): Promise<OutboundAttachmentResult> {
        try {
            logger.info(`Processing outbound attachment: ${r2Key}`);

            const attachmentInfo = await this._getCachedAttachmentInfo(messageGuid, r2Key);

            this._ensureR2Available();

            const signedUrl = await this.r2Storage.getSignedUrl(r2Key);
            const downloadResult = await this._downloadFromR2(signedUrl);

            await this._updateAccessTracking(messageGuid, r2Key, attachmentInfo);

            logger.info(`Outbound attachment ready: ${r2Key} -> ${downloadResult.localPath}`);

            return {
                success: true,
                localPath: downloadResult.localPath,
                r2Key,
                signedUrl,
                temporary: true,
                attachmentInfo,
                type: 'outbound'
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`Failed to handle outbound attachment: ${r2Key}:`, { error: error as Error });
            return {
                success: false,
                error: err.message,
                r2Key,
                messageGuid,
                type: 'outbound'
            };
        }
    }

    /**
     * Get cached attachment info
     */
    private async _getCachedAttachmentInfo(messageGuid: string, r2Key: string): Promise<AttachmentCacheData | null> {
        if (!this.redisClient) {
            return null;
        }

        const cacheKey = this._buildCacheKey(messageGuid, r2Key);
        const cached = await this.redisClient.get(cacheKey);

        if (cached) {
            logger.debug(`Found cached attachment info: ${cacheKey}`);
            return JSON.parse(cached) as AttachmentCacheData;
        }

        return null;
    }

    /**
     * Download from R2 storage
     */
    private async _downloadFromR2(signedUrl: string): Promise<DownloadResult> {
        const downloadResult = await this.downloadAttachment(signedUrl);
        if (!downloadResult.success) {
            throw new Error(`Download failed: ${downloadResult.error}`);
        }
        return downloadResult;
    }

    /**
     * Update access tracking in cache
     */
    private async _updateAccessTracking(messageGuid: string, r2Key: string, attachmentInfo: AttachmentCacheData | null): Promise<void> {
        if (!this.redisClient || !attachmentInfo) {
            return;
        }

        attachmentInfo.lastAccessed = new Date().toISOString();
        attachmentInfo.accessCount = (attachmentInfo.accessCount || 0) + 1;

        const cacheKey = this._buildCacheKey(messageGuid, r2Key);
        await this.redisClient.setEx(cacheKey, ATTACHMENT_CONSTANTS.CACHE_TTL, JSON.stringify(attachmentInfo));
    }

    /**
     * Get attachment info from cache or R2
     */
    async getAttachmentInfo(r2Key: string, messageGuid: string | null = null): Promise<AttachmentCacheData | AttachmentInfoResult | null> {
        try {
            // Check Redis cache first
            if (this.redisClient && messageGuid) {
                const cacheKey = `${this.redisPrefix}:${messageGuid}:${r2Key}`;
                const cached = await this.redisClient.get(cacheKey);
                if (cached) {
                    const info = JSON.parse(cached) as AttachmentCacheData;
                    logger.debug(`Retrieved attachment info from cache: ${cacheKey}`);
                    return info;
                }
            }

            // Fallback to R2
            if (this.r2Storage.isEnabled()) {
                const r2Info = await this.r2Storage.getAttachmentInfo(r2Key);
                if (r2Info) {
                    logger.debug(`Retrieved attachment info from R2: ${r2Key}`);
                    return {
                        r2Key,
                        contentType: r2Info.contentType,
                        size: r2Info.size,
                        lastModified: r2Info.lastModified,
                        publicUrl: r2Info.publicUrl,
                        metadata: r2Info.metadata
                    };
                }
            }

            return null;
        } catch (error) {
            logger.error(`Failed to get attachment info: ${r2Key}:`, { error: error as Error });
            return null;
        }
    }

    /**
     * Create a clean attachment message for display
     */
    createAttachmentMessage(attachment: AttachmentCacheData & { downloadUrl?: string | null; publicUrl?: string | null }): AttachmentMessage {
        const extension = extname(attachment.originalFilename || '').toLowerCase();
        const category = this._determineFileCategory(extension);
        const downloadUrl = attachment.downloadUrl || attachment.publicUrl;

        return {
            id: crypto.randomUUID(),
            type: 'attachment',
            attachment: {
                name: attachment.originalFilename || 'Unknown File',
                size: attachment.size,
                contentType: attachment.contentType,
                downloadUrl,
                previewUrl: this._getPreviewUrl(category, downloadUrl),
                category,
                icon: this.getFileIcon(extension),
                r2Key: attachment.r2Key,
                hash: attachment.hash
            },
            timestamp: attachment.uploadedAt || new Date().toISOString(),
            messageGuid: attachment.messageGuid
        };
    }

    /**
     * Determine file category from extension
     */
    private _determineFileCategory(extension: string): 'image' | 'video' | 'audio' | 'document' {
        if ((ATTACHMENT_CONSTANTS.FILE_CATEGORIES.IMAGE as readonly string[]).includes(extension)) {
            return 'image';
        }
        if ((ATTACHMENT_CONSTANTS.FILE_CATEGORIES.VIDEO as readonly string[]).includes(extension)) {
            return 'video';
        }
        if ((ATTACHMENT_CONSTANTS.FILE_CATEGORIES.AUDIO as readonly string[]).includes(extension)) {
            return 'audio';
        }
        return 'document';
    }

    /**
     * Get preview URL for attachment
     */
    private _getPreviewUrl(category: string, downloadUrl: string | null): string | null {
        return category === 'image' ? downloadUrl : null;
    }

    /**
     * Get file icon based on extension
     */
    getFileIcon(extension: string): string {
        return ATTACHMENT_CONSTANTS.FILE_ICONS[extension] || ATTACHMENT_CONSTANTS.DEFAULT_ICON;
    }

    /**
     * Get service statistics
     */
    getStats(): AttachmentServiceStats {
        try {
            const files = readdirSync(this.uploadPath);
            const totalSize = this._calculateTotalFileSize(files);

            return this._buildStatsResponse(files.length, totalSize);

        } catch (error) {
            const err = error as Error;
            logger.error('Failed to get attachment service stats:', { error: error as Error });
            return this._buildErrorStatsResponse(err);
        }
    }

    /**
     * Calculate total size of all files
     */
    private _calculateTotalFileSize(files: string[]): number {
        let totalSize = 0;
        for (const file of files) {
            const filePath = join(this.uploadPath, file);
            const stats = statSync(filePath);
            totalSize += stats.size;
        }
        return totalSize;
    }

    /**
     * Build stats response object
     */
    private _buildStatsResponse(fileCount: number, totalSize: number): AttachmentServiceStats {
        return {
            service: 'AttachmentService',
            uploadPath: this.uploadPath,
            temporaryFiles: fileCount,
            totalSize,
            maxFileSize: this.maxFileSize,
            r2Enabled: this.r2Storage?.isEnabled() || false,
            redisConnected: this.redisClient?.isReady || false,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Build error stats response
     */
    private _buildErrorStatsResponse(error: Error): AttachmentServiceStats {
        return {
            service: 'AttachmentService',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

export default AttachmentService;
