import AppleScriptHandler from '../handlers/AppleScriptHandler.js';
import AttachmentService, { type FileValidationResult, type DownloadResult, type InboundAttachmentResult, type AttachmentCacheData } from './AttachmentService.js';
import DeliveryStatusChecker, { type DeliveryStatusResult } from './DeliveryStatusChecker.js';
import { PhoneNumberUtils } from '../utils/PhoneNumberUtils.js';
import CircuitBreaker, { type CircuitBreaker as CircuitBreakerType } from '../utils/CircuitBreaker.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs/promises';

// Set logger for PhoneNumberUtils
PhoneNumberUtils.setLogger(logger);

/**
 * Message send result
 */
export interface MessageResult {
    success: boolean;
    recipient: string;
    text?: string;
    timestamp: string;
    type: 'text' | 'media' | 'error';
    service?: string;
    method?: string;
    messageGuid?: string;
    deliveryStatus?: string;
    warning?: string;
    error?: string;
    attachmentSource?: string;
    attachmentPath?: string;
    r2Key?: string;
    fallbackReason?: string;
    fallbackCount?: number;
    originalDeliveryStatus?: DeliveryStatusResult;
}

/**
 * Attachment processing result
 */
export interface AttachmentProcessingResult {
    success: boolean;
    attachment?: InboundAttachmentResult;
    attachmentMessage?: unknown;
    r2Key?: string;
    downloadUrl?: string | null;
    messageGuid: string;
    type: 'incoming';
    error?: string;
    localAttachmentPath?: string;
    originalFilename?: string;
}

/**
 * Test access result
 */
export interface TestAccessResult {
    success: boolean;
    message: string;
    data?: unknown;
    error?: string;
}

/**
 * R2 download result
 */
interface R2DownloadResult {
    success: boolean;
    localPath?: string;
    r2Url?: string;
    messageGuid: string;
    temporary?: boolean;
    size?: number;
    error?: string;
}

/**
 * SMS fallback tracking data
 */
interface SMSFallbackData {
    count: number;
    firstFallbackTime: number;
    lastFallbackTime: number;
}

/**
 * Service statistics
 */
export interface MessageServiceStats {
    service: string;
    retryAttempts: number;
    retryDelay: number;
    status: string;
    timestamp: string;
}

class MessageService {
    public appleScript: AppleScriptHandler;
    private attachmentService: AttachmentService;
    private deliveryChecker: DeliveryStatusChecker;
    private retryAttempts: number;
    private retryDelay: number;
    private deliveryCheckDelayText: number;
    private deliveryCheckDelayMedia: number;
    private appleScriptBreaker: CircuitBreakerType;
    private smsFallbackCounts: Map<string, SMSFallbackData>;
    private maxFallbacksPerRecipient: number;
    private fallbackResetInterval: number;

    constructor() {
        this.appleScript = new AppleScriptHandler();
        this.attachmentService = new AttachmentService();
        this.deliveryChecker = new DeliveryStatusChecker();
        this.deliveryChecker.init();
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.deliveryCheckDelayText = 3500; // Wait 3.5 seconds for text messages
        this.deliveryCheckDelayMedia = 8000; // Wait 8 seconds for media messages (need more time to upload)

        // Circuit breaker for AppleScript calls to prevent overwhelming Messages.app
        this.appleScriptBreaker = CircuitBreaker.getBreaker('applescript', {
            failureThreshold: 5,      // Open after 5 failures
            timeout: 10000,           // 10 second timeout per operation
            resetTimeout: 60000       // Try to recover after 1 minute
        });

        // Track SMS fallback counts per recipient to limit excessive fallbacks
        this.smsFallbackCounts = new Map();
        this.maxFallbacksPerRecipient = 3;  // Limit to 3 SMS fallbacks per recipient per hour
        this.fallbackResetInterval = 60 * 60 * 1000;  // Reset counters every hour
    }

    /**
     * Send a text message
     */
    async sendTextMessage(recipient: string, text: string, options: Record<string, unknown> = {}): Promise<MessageResult> {
        const correlationId = logger.generateCorrelationId();

        try {
            logger.info('Sending text message', {
                correlationId,
                recipient,
                textLength: text?.length || 0,
                textPreview: text?.substring(0, 50)
            });

            // Validate inputs
            if (!recipient) {
                throw new Error('Recipient is required');
            }
            if (!text || text.trim() === '') {
                throw new Error('Message text is required');
            }

            // Normalize recipient
            const normalizedRecipient = this.normalizeRecipient(recipient);

            // ========== PHASE 1: Send via iMessage ==========
            logger.info('PHASE 1: Attempting iMessage send', {
                correlationId,
                recipient: normalizedRecipient
            });

            const iMessageResult = await this.withRetry(async () => {
                // Wrap AppleScript call in circuit breaker
                return await this.appleScriptBreaker.execute(async () => {
                    return await this.appleScript.sendTextMessage(normalizedRecipient, text);
                });
            });

            if (!iMessageResult.success) {
                // iMessage send failed at AppleScript level - try SMS immediately
                logger.warn('iMessage send failed at AppleScript level', {
                    correlationId,
                    recipient: normalizedRecipient,
                    error: iMessageResult.error
                });
                return await this.sendSMSFallback(normalizedRecipient, text, 'applescript_error', null, correlationId);
            }

            logger.info('PHASE 1 complete: iMessage sent', {
                correlationId,
                recipient: normalizedRecipient
            });

            // ========== PHASE 2: Wait for Messages.app to update delivery status ==========
            logger.info(`⏳ PHASE 2: Waiting ${this.deliveryCheckDelayText}ms for delivery status update...`);
            await new Promise(resolve => setTimeout(resolve, this.deliveryCheckDelayText));

            // ========== PHASE 3: Find message GUID ==========
            logger.info(`🔍 PHASE 3: Finding message GUID in chat.db...`);
            const messageGuid = this.deliveryChecker.findRecentSentMessageGuid(
                normalizedRecipient,
                text,
                10 // Search within last 10 seconds
            );

            if (!messageGuid) {
                logger.warn('⚠️ Could not find message GUID - assuming iMessage success (unverified)');
                return {
                    success: true,
                    recipient: normalizedRecipient,
                    text,
                    timestamp: new Date().toISOString(),
                    type: 'text',
                    service: 'iMessage (unverified)',
                    method: 'iMessage (unverified)',
                    warning: 'GUID not found - delivery status not verified'
                };
            }

            logger.info(`✅ PHASE 3 complete: Found GUID ${messageGuid}`);

            // ========== PHASE 4: Check delivery status ==========
            logger.info(`📊 PHASE 4: Checking delivery status for GUID ${messageGuid}...`);
            const deliveryStatus = this.deliveryChecker.checkDeliveryStatus(messageGuid);
            logger.info(`Status: ${deliveryStatus.status}${deliveryStatus.errorCode ? ` (error code: ${deliveryStatus.errorCode})` : ''}`);

            // ========== PHASE 5: Handle delivery status ==========
            if (deliveryStatus.status === 'failed') {
                logger.warn(`❌ PHASE 5: iMessage delivery failed - triggering SMS fallback`);
                return await this.sendSMSFallback(
                    normalizedRecipient,
                    text,
                    'delivery_failed',
                    deliveryStatus,
                    correlationId
                );
            } else if (deliveryStatus.status === 'pending' || deliveryStatus.status === 'unknown') {
                // Message is still being processed or in unknown state - don't trigger fallback
                logger.info(`⏳ PHASE 5: Message still processing (status: ${deliveryStatus.status}) - not triggering fallback`);
                logger.info(`✅ Assuming success - message will be delivered by Messages.app`);

                return {
                    success: true,
                    recipient: normalizedRecipient,
                    text,
                    timestamp: new Date().toISOString(),
                    type: 'text',
                    service: 'iMessage',
                    method: 'iMessage',
                    messageGuid,
                    deliveryStatus: deliveryStatus.status,
                    warning: 'Delivery status pending - message may still be sending'
                };
            }

            // Success! iMessage delivered
            logger.info(`✅ All phases complete: Text message delivered to ${normalizedRecipient} via iMessage`);
            return {
                success: true,
                recipient: normalizedRecipient,
                text,
                timestamp: new Date().toISOString(),
                type: 'text',
                service: 'iMessage',
                method: 'iMessage',
                messageGuid,
                deliveryStatus: deliveryStatus.status
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ Failed to send text message to ${recipient}:`, { error: error as Error });
            return {
                success: false,
                recipient,
                text,
                error: err.message,
                timestamp: new Date().toISOString(),
                type: 'text'
            };
        }
    }

    /**
     * Send a message with media attachment
     */
    async sendMediaMessage(recipient: string, text: string, attachmentSource: string, options: Record<string, unknown> = {}): Promise<MessageResult> {
        try {
            logger.info(`📎 Sending media message to ${recipient}`);

            if (!recipient) throw new Error('Recipient is required');
            if (!attachmentSource) throw new Error('Attachment source is required');

            const normalizedRecipient = this.normalizeRecipient(recipient);
            const messageGuid = crypto.randomUUID();

            // Determine if this is an R2 URL using proper URL parsing
            const isR2Url = this.isValidR2Url(attachmentSource);

            // Prepare attachment
            const attachmentResult: FileValidationResult | DownloadResult | R2DownloadResult = isR2Url
                ? await this.downloadR2AttachmentForSending(attachmentSource, messageGuid)
                : await this.attachmentService.prepareAttachment(attachmentSource);

            if (!attachmentResult.success || !attachmentResult.localPath) {
                throw new Error(`Attachment preparation failed: ${attachmentResult.error}`);
            }

            // ========== PHASE 1: Send via iMessage ==========
            logger.info(`📱 PHASE 1: Attempting iMessage media send to ${normalizedRecipient}`);
            const iMessageResult = await this.withRetry(async () => {
                return await this.appleScript.sendMediaMessage(
                    normalizedRecipient,
                    text || '',
                    attachmentResult.localPath!
                );
            });

            if (!iMessageResult.success) {
                // iMessage send failed at AppleScript level - try MMS immediately
                logger.warn(`⚠️ iMessage media send failed at AppleScript level: ${iMessageResult.error}`);
                return await this.sendMMSFallback(
                    normalizedRecipient,
                    text,
                    attachmentResult.localPath,
                    attachmentSource,
                    messageGuid,
                    attachmentResult,
                    'applescript_error'
                );
            }

            logger.info(`✅ PHASE 1 complete: iMessage media sent to ${normalizedRecipient}`);

            // ========== PHASE 2: Wait for Messages.app to update delivery status ==========
            logger.info(`⏳ PHASE 2: Waiting ${this.deliveryCheckDelayMedia}ms for media delivery status update...`);
            await new Promise(resolve => setTimeout(resolve, this.deliveryCheckDelayMedia));

            // ========== PHASE 3: Find message GUID ==========
            logger.info(`🔍 PHASE 3: Finding message GUID in chat.db...`);
            const dbMessageGuid = this.deliveryChecker.findRecentSentMessageGuid(
                normalizedRecipient,
                text || '',
                10
            );

            if (!dbMessageGuid) {
                logger.warn('⚠️ Could not find message GUID - assuming iMessage success (unverified)');
                if (attachmentResult.temporary) {
                    this.attachmentService.cleanupTemporaryFile(attachmentResult.localPath);
                }
                return {
                    success: true,
                    recipient: normalizedRecipient,
                    text,
                    attachmentSource,
                    attachmentPath: attachmentResult.localPath,
                    messageGuid,
                    timestamp: new Date().toISOString(),
                    type: 'media',
                    service: 'iMessage (unverified)',
                    method: 'iMessage (unverified)',
                    warning: 'GUID not found - delivery status not verified'
                };
            }

            logger.info(`✅ PHASE 3 complete: Found GUID ${dbMessageGuid}`);

            // ========== PHASE 4: Check delivery status ==========
            logger.info(`📊 PHASE 4: Checking delivery status for GUID ${dbMessageGuid}...`);
            const deliveryStatus = this.deliveryChecker.checkDeliveryStatus(dbMessageGuid);
            logger.info(`Status: ${deliveryStatus.status}${deliveryStatus.errorCode ? ` (error code: ${deliveryStatus.errorCode})` : ''}`);

            // ========== PHASE 5: Handle delivery status ==========
            if (deliveryStatus.status === 'failed') {
                logger.warn(`❌ PHASE 5: iMessage delivery failed - triggering MMS fallback`);
                return await this.sendMMSFallback(
                    normalizedRecipient,
                    text,
                    attachmentResult.localPath,
                    attachmentSource,
                    messageGuid,
                    attachmentResult,
                    'delivery_failed',
                    deliveryStatus
                );
            } else if (deliveryStatus.status === 'pending' || deliveryStatus.status === 'unknown') {
                // Media messages may take longer - double check
                logger.info(`⏳ PHASE 5a: Media message in "${deliveryStatus.status}" state - implementing double-check strategy`);
                logger.info(`⏱️  Waiting additional 7 seconds before rechecking delivery status...`);

                await new Promise(resolve => setTimeout(resolve, 7000));

                logger.info(`🔄 PHASE 5b: Second delivery check (total wait time: ~15s)...`);
                const secondCheckStatus = this.deliveryChecker.checkDeliveryStatus(dbMessageGuid);
                logger.info(`Second check status: ${secondCheckStatus.status}${secondCheckStatus.errorCode ? ` (error code: ${secondCheckStatus.errorCode})` : ''}`);

                if (secondCheckStatus.status === 'delivered') {
                    logger.info(`✅ PHASE 5b complete: Media message delivered to ${normalizedRecipient} via iMessage (verified on second check)`);

                    if (attachmentResult.temporary) {
                        this.attachmentService.cleanupTemporaryFile(attachmentResult.localPath);
                    }

                    return {
                        success: true,
                        recipient: normalizedRecipient,
                        text,
                        attachmentSource,
                        attachmentPath: attachmentResult.localPath,
                        messageGuid: dbMessageGuid,
                        timestamp: new Date().toISOString(),
                        type: 'media',
                        service: 'iMessage',
                        method: 'iMessage',
                        deliveryStatus: secondCheckStatus.status
                    };
                }

                if (secondCheckStatus.status === 'failed') {
                    logger.warn(`❌ PHASE 5b: Message failed on second check - triggering MMS fallback`);
                    return await this.sendMMSFallback(
                        normalizedRecipient,
                        text,
                        attachmentResult.localPath,
                        attachmentSource,
                        messageGuid,
                        attachmentResult,
                        'delivery_failed_after_retry',
                        secondCheckStatus
                    );
                }

                // Still pending after 15s - trigger MMS fallback
                logger.warn(`⚠️  PHASE 5b: Message still in "${secondCheckStatus.status}" state after 15s - triggering MMS fallback to ensure delivery`);
                return await this.sendMMSFallback(
                    normalizedRecipient,
                    text,
                    attachmentResult.localPath,
                    attachmentSource,
                    messageGuid,
                    attachmentResult,
                    'delivery_timeout',
                    secondCheckStatus
                );
            }

            // Success! iMessage delivered
            logger.info(`✅ All phases complete: Media message delivered to ${normalizedRecipient} via iMessage`);

            if (attachmentResult.temporary) {
                this.attachmentService.cleanupTemporaryFile(attachmentResult.localPath);
            }

            return {
                success: true,
                recipient: normalizedRecipient,
                text,
                attachmentSource,
                attachmentPath: attachmentResult.localPath,
                messageGuid: dbMessageGuid,
                timestamp: new Date().toISOString(),
                type: 'media',
                service: 'iMessage',
                method: 'iMessage',
                deliveryStatus: deliveryStatus.status
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ Failed to send media message to ${recipient}:`, { error: error as Error });
            return {
                success: false,
                recipient,
                text,
                attachmentSource,
                error: err.message,
                timestamp: new Date().toISOString(),
                type: 'media'
            };
        }
    }

    /**
     * Send a unified message (auto-detects text vs media)
     */
    async sendMessage(recipient: string, text: string, attachmentSource: string | null = null, options: Record<string, unknown> = {}): Promise<MessageResult> {
        if (attachmentSource) {
            return this.sendMediaMessage(recipient, text, attachmentSource, options);
        } else if (text && text.trim()) {
            return this.sendTextMessage(recipient, text, options);
        } else {
            return {
                success: false,
                recipient,
                text,
                error: 'Either message text or attachment is required',
                timestamp: new Date().toISOString(),
                type: 'error'
            };
        }
    }

    /**
     * Process incoming iMessage attachment and upload to R2
     */
    async processIncomingAttachment(localAttachmentPath: string, messageGuid: string, originalFilename: string): Promise<AttachmentProcessingResult> {
        try {
            logger.info(`Processing incoming attachment: ${originalFilename} for message ${messageGuid}`);

            const result = await this.attachmentService.handleInboundAttachment(
                localAttachmentPath,
                messageGuid,
                originalFilename
            );

            if (result.success) {
                logger.info(`✅ Incoming attachment processed: ${originalFilename} -> R2 key: ${result.key}`);

                const attachmentMessage = this.attachmentService.createAttachmentMessage(result as unknown as AttachmentCacheData & { downloadUrl?: string | null; publicUrl?: string | null });

                return {
                    success: true,
                    attachment: result,
                    attachmentMessage,
                    r2Key: result.key,
                    downloadUrl: result.downloadUrl,
                    messageGuid,
                    type: 'incoming'
                };
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ Failed to process incoming attachment: ${originalFilename}:`, { error: error as Error });
            return {
                success: false,
                error: err.message,
                localAttachmentPath,
                messageGuid,
                originalFilename,
                type: 'incoming'
            };
        }
    }

    /**
     * Test Messages app access
     */
    async testAccess(): Promise<TestAccessResult> {
        try {
            const result = await this.appleScript.testAccess();

            if (result.success) {
                logger.info('✅ Messages app access test successful');
                return {
                    success: true,
                    message: 'Messages app is accessible',
                    data: result.data
                };
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            const err = error as Error;
            logger.error('❌ Messages app access test failed:', { error: error as Error });
            return {
                success: false,
                error: err.message,
                message: 'Messages app is not accessible'
            };
        }
    }

    /**
     * Send message via SMS fallback (when iMessage fails)
     */
    private async sendSMSFallback(
        recipient: string,
        text: string,
        failureReason: string,
        originalDeliveryStatus: DeliveryStatusResult | null = null,
        correlationId: string | null = null
    ): Promise<MessageResult> {
        try {
            // Check if recipient has exceeded SMS fallback limit
            if (!this._canUseSMSFallback(recipient)) {
                logger.warn('SMS fallback limit exceeded', {
                    correlationId,
                    recipient,
                    limit: this.maxFallbacksPerRecipient,
                    currentCount: this._getFallbackCount(recipient)
                });
                return {
                    success: false,
                    recipient,
                    text,
                    error: 'SMS fallback limit exceeded - too many recent fallbacks for this recipient',
                    timestamp: new Date().toISOString(),
                    type: 'text',
                    service: 'SMS (fallback blocked)',
                    fallbackReason: 'rate_limited',
                    originalDeliveryStatus: originalDeliveryStatus || undefined
                };
            }

            logger.info('Triggering SMS fallback', {
                correlationId,
                recipient,
                failureReason,
                textLength: text?.length
            });

            const smsResult = await this.appleScript.executeOperation('send_sms', {
                recipient,
                message: text
            });

            if (smsResult.success) {
                this._trackSMSFallback(recipient);

                logger.info('SMS fallback successful', {
                    correlationId,
                    recipient
                });
                return {
                    success: true,
                    recipient,
                    text,
                    timestamp: new Date().toISOString(),
                    type: 'text',
                    service: 'SMS (fallback)',
                    method: 'SMS (fallback)',
                    fallbackReason: failureReason,
                    fallbackCount: this._getFallbackCount(recipient),
                    originalDeliveryStatus: originalDeliveryStatus || undefined
                };
            } else {
                throw new Error(`SMS fallback failed: ${smsResult.error}`);
            }

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ SMS fallback failed for ${recipient}:`, { error: error as Error });
            return {
                success: false,
                recipient,
                text,
                error: `SMS fallback failed: ${err.message}`,
                timestamp: new Date().toISOString(),
                type: 'text',
                service: 'SMS (fallback failed)',
                fallbackReason: failureReason,
                originalDeliveryStatus: originalDeliveryStatus || undefined
            };
        }
    }

    /**
     * Check if SMS fallback is allowed for recipient
     */
    private _canUseSMSFallback(recipient: string): boolean {
        const now = Date.now();
        const fallbackData = this.smsFallbackCounts.get(recipient);

        if (!fallbackData) {
            return true;  // First fallback
        }

        // Reset counter if interval has passed
        if (now - fallbackData.firstFallbackTime > this.fallbackResetInterval) {
            this.smsFallbackCounts.delete(recipient);
            return true;
        }

        // Check if under limit
        return fallbackData.count < this.maxFallbacksPerRecipient;
    }

    /**
     * Track SMS fallback for recipient
     */
    private _trackSMSFallback(recipient: string): void {
        const now = Date.now();
        const existing = this.smsFallbackCounts.get(recipient);

        if (existing) {
            existing.count++;
            existing.lastFallbackTime = now;
        } else {
            this.smsFallbackCounts.set(recipient, {
                count: 1,
                firstFallbackTime: now,
                lastFallbackTime: now
            });
        }

        logger.debug(`SMS fallback tracked for ${recipient}: ${this.smsFallbackCounts.get(recipient)!.count}/${this.maxFallbacksPerRecipient}`);
    }

    /**
     * Get current fallback count for recipient
     */
    private _getFallbackCount(recipient: string): number {
        const data = this.smsFallbackCounts.get(recipient);
        return data ? data.count : 0;
    }

    /**
     * Send media message via MMS fallback (when iMessage fails)
     */
    private async sendMMSFallback(
        recipient: string,
        text: string,
        attachmentPath: string,
        attachmentSource: string,
        messageGuid: string,
        attachmentResult: FileValidationResult | DownloadResult | R2DownloadResult,
        failureReason: string,
        originalDeliveryStatus: DeliveryStatusResult | null = null
    ): Promise<MessageResult> {
        try {
            logger.info(`🔄 Triggering MMS fallback for ${recipient} (reason: ${failureReason})`);

            const mmsResult = await this.appleScript.executeOperation('send_mms', {
                recipient,
                message: text || '',
                file: attachmentPath
            });

            // Clean up temporary file
            if (attachmentResult.temporary) {
                this.attachmentService.cleanupTemporaryFile(attachmentPath);
            }

            if (mmsResult.success) {
                logger.info(`✅ MMS fallback successful for ${recipient}`);
                return {
                    success: true,
                    recipient,
                    text,
                    attachmentSource,
                    attachmentPath,
                    messageGuid,
                    timestamp: new Date().toISOString(),
                    type: 'media',
                    service: 'MMS (fallback)',
                    method: 'MMS (fallback)',
                    fallbackReason: failureReason,
                    originalDeliveryStatus: originalDeliveryStatus || undefined
                };
            } else {
                throw new Error(`MMS fallback failed: ${mmsResult.error}`);
            }

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ MMS fallback failed for ${recipient}:`, { error: error as Error });
            return {
                success: false,
                recipient,
                text,
                attachmentSource,
                error: `MMS fallback failed: ${err.message}`,
                timestamp: new Date().toISOString(),
                type: 'media',
                service: 'MMS (fallback failed)',
                fallbackReason: failureReason,
                originalDeliveryStatus: originalDeliveryStatus || undefined
            };
        }
    }

    /**
     * Normalize recipient (phone number/email formatting)
     */
    normalizeRecipient(recipient: string): string {
        if (!recipient) return recipient;

        const normalized = PhoneNumberUtils.normalizePhoneNumber(recipient);
        logger.debug(`Normalized recipient: ${recipient} -> ${normalized}`);

        return normalized;
    }

    /**
     * Execute function with retry logic using exponential backoff + jitter
     */
    private async withRetry<T>(fn: () => Promise<T>, attempts: number = this.retryAttempts): Promise<T> {
        let lastError: unknown;

        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (i < attempts - 1) {
                    const baseDelay = this.retryDelay * Math.pow(2, i);
                    const jitter = Math.random() * 1000;
                    const delay = baseDelay + jitter;

                    const err = error as Error;
                    logger.warn(`Attempt ${i + 1} failed, retrying in ${Math.round(delay)}ms (base: ${baseDelay}ms + jitter: ${Math.round(jitter)}ms):`, { error: err.message });
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * Validate if a URL is a valid R2 URL using proper URL parsing
     * @param urlString - The URL to validate
     * @returns true if the URL is a valid R2 URL, false otherwise
     */
    private isValidR2Url(urlString: string): boolean {
        try {
            const parsedUrl = new URL(urlString);

            // List of valid R2 domains for this application
            const validR2Domains = [
                '.r2.cloudflarestorage.com',
                'storage.heyrua.com'
            ];

            // Check if the hostname matches any of the valid R2 domains
            return validR2Domains.some(domain =>
                parsedUrl.hostname === domain ||
                parsedUrl.hostname.endsWith(domain)
            );
        } catch (error) {
            // Invalid URL format
            logger.warn(`Invalid URL format for R2 check: ${urlString}`, { error });
            return false;
        }
    }

    /**
     * Download R2 attachment to Messages attachment directory for sending
     */
    async downloadR2AttachmentForSending(r2Url: string, messageGuid: string): Promise<R2DownloadResult> {
        try {
            logger.info(`🌐 Downloading R2 attachment for message ${messageGuid}`);

            const attachmentsDir = `${process.env.HOME}/Library/Messages/Attachments/rua/${messageGuid}`;
            const response = await fetch(r2Url);

            if (!response.ok) {
                throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
            }

            const urlParts = r2Url.split('/');
            const filename = urlParts[urlParts.length - 1].split('?')[0] || `attachment_${Date.now()}`;

            await fs.mkdir(attachmentsDir, { recursive: true });

            const localPath = `${attachmentsDir}/${filename}`;
            const buffer = await response.arrayBuffer();
            await fs.writeFile(localPath, Buffer.from(buffer));

            return {
                success: true,
                localPath,
                r2Url,
                messageGuid,
                temporary: true,
                size: buffer.byteLength
            };

        } catch (error) {
            const err = error as Error;
            logger.error(`❌ Failed to download R2 attachment: ${err.message}`);
            return {
                success: false,
                error: err.message,
                r2Url,
                messageGuid
            };
        }
    }

    /**
     * Extract service type from AppleScript result data
     */
    extractServiceType(data: unknown): string {
        if (!data || typeof data !== 'string') {
            return 'default';
        }

        if (data.includes('via iMessage')) {
            return 'iMessage';
        } else if (data.includes('via SMS')) {
            return 'SMS';
        } else if (data.includes('via default service')) {
            return 'default';
        } else if (data.includes('via new chat')) {
            return 'new_chat';
        }

        return 'unknown';
    }

    /**
     * Get service statistics
     */
    getStats(): MessageServiceStats {
        return {
            service: 'MessageService',
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay,
            status: 'active',
            timestamp: new Date().toISOString()
        };
    }
}

export default MessageService;
