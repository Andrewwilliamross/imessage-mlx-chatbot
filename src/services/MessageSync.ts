import Database from 'better-sqlite3';
import { watch, FSWatcher } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import R2StorageService from './R2StorageService.js';
import LRUCache from '../utils/LRUCache.js';
import type RedisSync from './RedisSync.js';
import type { MessageInput } from './RedisSync.js';

// SQL Query for fetching messages
const MESSAGE_QUERY = `
    SELECT
        m.ROWID as id,
        m.guid,
        m.text,
        m.attributedBody,
        m.handle_id,
        m.is_from_me,
        m.is_delivered,
        m.is_sent,
        m.error,
        m.is_read,
        m.date,
        m.service,
        c.chat_identifier,
        c.display_name,
        h.id as recipient_handle,
        (SELECT COUNT(*) FROM message_attachment_join maj WHERE maj.message_id = m.ROWID) > 0 as has_attachments
    FROM message m
    LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN chat c ON cmj.chat_id = c.ROWID
    LEFT JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
    LEFT JOIN handle h ON chj.handle_id = h.ROWID`;

/**
 * Message row from database query
 */
export interface MessageRow {
    id: number;
    guid: string;
    text: string | null;
    attributedBody: Buffer | null;
    handle_id: string | null;
    is_from_me: number;
    is_delivered: number;
    is_sent: number;
    error: number;
    is_read: number;
    date: number;
    service: string | null;
    chat_identifier: string | null;
    display_name: string | null;
    recipient_handle: string | null;
    has_attachments: number;
}

/**
 * Attachment row from database
 */
interface AttachmentRow {
    filename: string | null;
    mime_type: string | null;
    total_bytes: number | null;
}

/**
 * Processed attachment data
 */
export interface ProcessedAttachment {
    id?: string;
    filename: string;
    mimeType: string | null;
    size: number | null;
    url?: string | null;
    downloadUrl?: string | null;
    r2Key?: string;
    type?: string;
    error?: string;
    localPath?: string;
}

/**
 * Processed message with enhanced fields
 */
export interface ProcessedMessage extends MessageRow {
    handle: string;
    chat: string;
    attachments: ProcessedAttachment[];
    attachment_url: string | null;
    timestamp: string;
    ruaMessageId?: string; // Correlation ID for optimistic UI updates (outbound messages only)
}

/**
 * Attachment data for Redis storage
 */
interface AttachmentData {
    id: string;
    r2Key: string;
    publicUrl: string | null;
    signedUrl: string | null;
    filename: string;
    mimeType: string | null;
    size: number | null;
    messageGuid: string;
    uploadedAt: string;
    localPath: string;
}

/**
 * MessageSync events
 */
export interface MessageSyncEvents {
    new_message: (message: ProcessedMessage) => void;
}

class MessageSync extends EventEmitter {
    private redisSync: RedisSync;
    private r2Storage: R2StorageService;
    private dbPath: string;
    private db: Database.Database | null;
    private watcher: FSWatcher | null;
    private lastMessageId: number;
    private syncInterval: NodeJS.Timeout | null;
    private syncTimeout?: NodeJS.Timeout;
    private processedMessages: LRUCache<string, boolean>;
    private retryTimeouts: Map<string, NodeJS.Timeout>;
    private readonly concurrencyLimit: number;

    constructor(redisSync: RedisSync, r2Storage: R2StorageService | null = null) {
        super();
        this.redisSync = redisSync;
        this.r2Storage = r2Storage || new R2StorageService();
        this.dbPath = path.join(process.env.HOME || '', 'Library/Messages/chat.db');
        this.db = null;
        this.watcher = null;
        this.lastMessageId = 0;
        this.syncInterval = null;
        this.processedMessages = new LRUCache<string, boolean>(10000); // Track processed messages with LRU cache (10k limit)
        this.retryTimeouts = new Map(); // Track retry timeouts
        this.concurrencyLimit = 5; // Process 5 messages concurrently
    }

    async init(): Promise<boolean> {
        try {
            // Connect to Messages database
            this.db = new Database(this.dbPath, { readonly: true });
            logger.info('Connected to Messages database', {
                dbPath: this.dbPath,
                cacheSize: this.processedMessages.maxSize
            });

            // Get last synced message ID
            this.lastMessageId = await this.redisSync.getLastMessageId();
            logger.info('Resuming sync from last message', {
                lastMessageId: this.lastMessageId,
                redisConnected: this.redisSync.isConnected()
            });

            // Start watching for changes
            this.startWatching();

            // Initial sync of recent messages
            await this.syncRecentMessages();

            // Start periodic sync
            this.syncInterval = setInterval(() => this.syncNewMessages(), 2000);

            return true;
        } catch (error) {
            const err = error as Error;
            logger.error('Failed to initialize MessageSync', {
                error: err.message,
                stack: err.stack,
                dbPath: this.dbPath
            });
            return false;
        }
    }

    startWatching(): void {
        this.watcher = watch(this.dbPath, { persistent: false }, (eventType) => {
            if (eventType === 'change') {
                // Debounce rapid changes
                clearTimeout(this.syncTimeout);
                this.syncTimeout = setTimeout(() => this.syncNewMessages(), 500);
            }
        });
        logger.info('Started watching for new messages');
    }

    async syncRecentMessages(limit: number = 20): Promise<void> {
        try {
            const query = `${MESSAGE_QUERY}
                WHERE m.ROWID > ?
                ORDER BY m.date DESC
                LIMIT ?`;

            const messages = this.db!.prepare(query).all(this.lastMessageId, limit) as MessageRow[];

            for (const message of messages.reverse()) {
                await this.processMessage(message);
            }

            logger.info(`Synced ${messages.length} recent messages`);
        } catch (error) {
            logger.error('Failed to sync recent messages:', { error: error as Error });
        }
    }

    async syncNewMessages(): Promise<void> {
        try {
            const query = `${MESSAGE_QUERY}
                WHERE m.ROWID > ?
                ORDER BY m.date ASC`;

            const newMessages = this.db!.prepare(query).all(this.lastMessageId) as MessageRow[];

            if (newMessages.length > 0) {
                logger.info(`Found ${newMessages.length} new messages to sync`);

                // Process messages in parallel with concurrency limit
                await this._processMessagesInBatches(newMessages);

                logger.info(`Synced ${newMessages.length} new messages. Latest ID: ${this.lastMessageId}`);
            }
        } catch (error) {
            logger.error('Failed to sync new messages:', { error: error as Error });
        }
    }

    /**
     * Process messages in batches with concurrency limit
     */
    private async _processMessagesInBatches(messages: MessageRow[]): Promise<void> {
        const batches: MessageRow[][] = [];
        for (let i = 0; i < messages.length; i += this.concurrencyLimit) {
            batches.push(messages.slice(i, i + this.concurrencyLimit));
        }

        for (const batch of batches) {
            await Promise.all(batch.map(msg => this.processMessage(msg).catch(err => {
                logger.error(`Error processing message ${msg.id}:`, err);
            })));
        }
    }

    /**
     * Extract text from attributedBody blob (for SMS/RCS messages)
     */
    private extractTextFromAttributedBody(attributedBody: Buffer): string | null {
        if (!attributedBody || attributedBody.length === 0) {
            return null;
        }

        try {
            // attributedBody is a binary plist with NSAttributedString
            // Convert to string and extract all readable text segments
            const bufferStr = attributedBody.toString('utf8');

            // Find all readable ASCII text segments (1+ chars to support single character messages)
            const readableSegments = bufferStr.match(/[\x20-\x7E]+/g);

            if (!readableSegments || readableSegments.length === 0) {
                return null;
            }

            // Filter out known plist structure keywords and common noise patterns
            const plistKeywords = [
                'streamtyped', 'NSMutableAttributedString', 'NSAttributedString',
                'NSObject', 'NSMutableString', 'NSString', 'NSDictionary',
                'NSNumber', 'NSValue', '__kIM', 'NSArray', 'NSData',
                'NSMutableData', 'NSKeyedArchiver'
            ];

            // Common 2-character plist noise patterns
            const noisePatterns = ['iI', 'li', 'Il', 'lI', 'II', 'll'];

            const textSegments = readableSegments.filter(segment => {
                // Skip if it's a plist keyword
                if (plistKeywords.some(keyword => segment.includes(keyword))) {
                    return false;
                }
                // Skip common 2-character noise patterns
                if (noisePatterns.includes(segment)) {
                    return false;
                }
                // Skip if it starts with $ or special chars
                if (segment.startsWith('$') || segment.startsWith('*')) {
                    return false;
                }
                // Skip single special characters that aren't alphanumeric
                if (segment.length === 1 && !/[a-zA-Z0-9]/.test(segment)) {
                    return false;
                }
                // Skip very short segments that don't contain letters (likely noise)
                if (segment.length < 3 && !/[a-zA-Z]/.test(segment)) {
                    return false;
                }
                // Keep segments that have at least one letter or are reasonable length
                return /[a-zA-Z]/.test(segment) || segment.length >= 3;
            });

            // Return the first valid text segment, trimming whitespace only
            if (textSegments.length > 0) {
                // Preserve all punctuation - only trim whitespace for 1-1 text matching
                const cleanedText = textSegments[0].trim();
                return cleanedText || null;
            }

            return null;
        } catch (error) {
            const err = error as Error;
            logger.debug('Failed to extract text from attributedBody:', { error: err.message });
            return null;
        }
    }

    async processMessage(message: MessageRow, retryCount: number = 0): Promise<void> {
        try {
            // Extract text from attributedBody if text field is empty (SMS/RCS messages)
            if (!message.text && message.attributedBody) {
                const extractedText = this.extractTextFromAttributedBody(message.attributedBody);
                // Filter out single-character artifacts from attachment metadata
                // These are often binary parsing artifacts (e.g., "i" from image attachments)
                if (extractedText && extractedText.length > 1) {
                    message.text = extractedText;
                    logger.debug(`Extracted text from attributedBody for message ${message.id}: ${extractedText.substring(0, 30)}...`);
                } else if (extractedText && extractedText.length === 1 && message.has_attachments) {
                    // Single character with attachment = likely parsing artifact
                    logger.debug(`Ignoring single-character artifact from attributedBody for message with attachment: "${extractedText}"`);
                } else if (extractedText && extractedText.length === 1) {
                    // Single character without attachment might be legitimate (rare but possible)
                    message.text = extractedText;
                    logger.debug(`Extracted single-character text from attributedBody for message ${message.id}: "${extractedText}"`);
                }
            }

            // Avoid processing the same message multiple times
            if (this.processedMessages.has(message.guid) && retryCount === 0) {
                logger.debug(`Message ${message.id} already processed, skipping`);
                // Clean up any pending retry timeout for this message
                if (this.retryTimeouts.has(message.guid)) {
                    clearTimeout(this.retryTimeouts.get(message.guid));
                    this.retryTimeouts.delete(message.guid);
                }
                return;
            }

            // Mark as processed IMMEDIATELY to prevent race conditions
            // (file watcher + periodic sync can both trigger for the same message)
            this.processedMessages.set(message.guid, true);

            // Check if this message is recent (within last 5 minutes) and might need retrying
            // Convert message.date from nanoseconds to milliseconds if needed
            let messageTime = Number(message.date);
            if (messageTime > 1e15) { // If looks like nanoseconds
                messageTime = Math.floor(messageTime / 1e6); // Convert to milliseconds
            }

            const messageAge = Date.now() - messageTime;
            const isRecentMessage = messageAge < 300000; // 5 minutes

            // Only retry for recent messages with null text
            if (!message.text && message.has_attachments == 0 && retryCount < 3 && isRecentMessage) {
                // Clear any existing timeout for this message
                if (this.retryTimeouts.has(message.guid)) {
                    clearTimeout(this.retryTimeouts.get(message.guid));
                }

                const timeout = setTimeout(async () => {
                    this.retryTimeouts.delete(message.guid);

                    // Re-fetch the message from database
                    const updatedMessage = await this.getMessageById(message.id);
                    if (updatedMessage && updatedMessage.text) {
                        logger.debug(`Retry successful! Message ${message.id} now has text: ${updatedMessage.text.substring(0, 30)}...`);
                        await this.processMessage(updatedMessage, retryCount + 1);
                    } else if (retryCount < 2) {
                        await this.processMessage(message, retryCount + 1);
                    } else {
                        logger.warn(`Message ${message.id} still has null text after 3 retries, processing with fallback`);
                        await this.processMessage(message, 99); // Skip further retries
                    }
                }, (retryCount + 1) * 1000);

                this.retryTimeouts.set(message.guid, timeout);
                return; // Don't process now, wait for retry
            }

            // Clear any pending retry timeout since we're processing the message now
            if (this.retryTimeouts.has(message.guid)) {
                clearTimeout(this.retryTimeouts.get(message.guid));
                this.retryTimeouts.delete(message.guid);
            }

            // Get attachments if any
            let attachments: ProcessedAttachment[] = [];
            if (message.has_attachments) {
                attachments = await this.getMessageAttachments(message.id);
            }

            // 🔄 Correlation: Check if this is a sent message that needs correlation
            let ruaMessageId: string | undefined;
            if (message.is_from_me === 1) {
                ruaMessageId = await this._findRuaMessageId(message);
            }

            // Enhanced message processing with proper field mapping
            const processedMessage: ProcessedMessage = {
                ...message,
                // Better handle resolution - prioritize actual phone number over database ID
                handle: message.recipient_handle || message.chat_identifier || message.handle_id || 'unknown',
                chat: message.chat_identifier || message.recipient_handle || message.handle_id || 'unknown',
                text: message.text || (message.has_attachments ? '[Attachment]' : ''),  // Empty string for legitimately empty messages
                display_name: message.display_name || null,
                attachments: attachments,
                // Add attachment URLs for frontend compatibility
                attachment_url: attachments.length > 0 ? attachments[0].downloadUrl || null : null,
                // Add timestamp conversion for frontend
                timestamp: new Date(Number(message.date) / 1000000 + 978307200000).toISOString(), // Convert Core Data timestamp to ISO
                // Add Rua message ID for optimistic UI correlation
                ruaMessageId
            };

            // Save message to Redis
            if (this.redisSync && this.redisSync.isConnected()) {
                try {
                    await this.redisSync.saveMessage(processedMessage as unknown as MessageInput);
                } catch (redisError) {
                    logger.warn('⚠️ Failed to save message to Redis:', { error: redisError as Error });
                }
            }

            // Update last message ID only for new messages
            if (message.id > this.lastMessageId) {
                this.lastMessageId = message.id;
                await this.redisSync.setLastMessageId(this.lastMessageId);
            }

            // Only emit if message has meaningful content or attachments
            if (processedMessage.text || processedMessage.has_attachments) {
                logger.info(`📤 Emitting new_message event for: ${processedMessage.guid}`);
                this.emit('new_message', processedMessage);
            } else {
                logger.debug(`🚫 Skipping new_message emit for: ${processedMessage.guid} (no text: ${!processedMessage.text}, no attachments: ${!processedMessage.has_attachments})`, {
                    text: processedMessage.text,
                    has_attachments: processedMessage.has_attachments,
                    guid: processedMessage.guid
                });
            }

        } catch (error) {
            logger.error('Failed to process message:', { error: error as Error });
        }
    }

    async getMessageById(messageId: number): Promise<MessageRow | null> {
        try {
            const query = `${MESSAGE_QUERY}
                WHERE m.ROWID = ?`;

            return this.db!.prepare(query).get(messageId) as MessageRow | undefined || null;
        } catch (error) {
            logger.error('Failed to get message by ID:', { error: error as Error });
            return null;
        }
    }

    async getMessageAttachments(messageId: number): Promise<ProcessedAttachment[]> {
        try {
            logger.info(`🔍 Looking for attachments for message ID: ${messageId}`);

            const query = `
                SELECT
                    a.filename,
                    a.mime_type,
                    a.total_bytes
                FROM attachment a
                JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
                WHERE maj.message_id = ?
            `;

            const attachments = this.db!.prepare(query).all(messageId) as AttachmentRow[];

            // Process attachments through R2 storage and cache in Redis
            const processedAttachments: ProcessedAttachment[] = [];
            for (const attachment of attachments) {
                try {
                    if (!attachment.filename) {
                        logger.warn('Attachment has no filename, skipping');
                        continue;
                    }

                    const messageGuid = `msg_${messageId}_${Date.now()}`;
                    const originalFilename = attachment.filename.split('/').pop() || 'attachment';

                    // Upload to R2
                    const r2Result = await this.r2Storage.uploadAttachment(
                        attachment.filename,
                        messageGuid,
                        originalFilename
                    );

                    if (r2Result && r2Result.key) {
                        const attachmentData: AttachmentData = {
                            id: crypto.randomUUID(),
                            r2Key: r2Result.key,
                            publicUrl: r2Result.publicUrl,
                            signedUrl: r2Result.signedUrl,
                            filename: originalFilename,
                            mimeType: attachment.mime_type,
                            size: attachment.total_bytes,
                            messageGuid,
                            uploadedAt: r2Result.uploadedAt,
                            localPath: attachment.filename
                        };

                        // Store in Redis with 7-day expiry
                        if (this.redisSync && this.redisSync.isConnected()) {
                            await this.redisSync.setWithExpiry(
                                `attachment:${attachmentData.id}`,
                                JSON.stringify(attachmentData),
                                7 * 24 * 60 * 60
                            );
                        }

                        processedAttachments.push({
                            id: attachmentData.id,
                            filename: originalFilename,
                            mimeType: attachment.mime_type,
                            size: attachment.total_bytes,
                            url: r2Result.publicUrl,
                            downloadUrl: r2Result.signedUrl,
                            r2Key: r2Result.key,
                            type: 'attachment'
                        });
                    } else {
                        logger.error(`❌ R2 upload failed for ${originalFilename}`, { result: r2Result });
                        processedAttachments.push({
                            filename: originalFilename,
                            mimeType: attachment.mime_type,
                            size: attachment.total_bytes,
                            error: 'R2 upload failed',
                            localPath: attachment.filename
                        });
                    }
                } catch (error) {
                    const err = error as Error;
                    logger.error(`❌ Failed to process attachment ${attachment.filename}:`, {
                        error: err.message,
                        stack: err.stack,
                        attachment: attachment
                    });
                    processedAttachments.push({
                        filename: attachment.filename?.split('/').pop() || 'unknown',
                        mimeType: attachment.mime_type,
                        size: attachment.total_bytes,
                        error: `Processing failed: ${err.message}`,
                        localPath: attachment.filename || undefined
                    });
                }
            }

            logger.info(`📊 Attachment processing complete. Processed ${processedAttachments.length}/${attachments.length} attachments`);
            return processedAttachments;
        } catch (error) {
            const err = error as Error;
            logger.error('❌ Failed to get message attachments:', {
                error: err.message,
                stack: err.stack,
                messageId: messageId
            });
            return [];
        }
    }

    /**
     * Find Rua message ID for correlation with optimistic messages
     * Matches sent messages by recipient, text, and timestamp proximity
     * @private
     */
    private async _findRuaMessageId(message: MessageRow): Promise<string | undefined> {
        if (!this.redisSync || !this.redisSync.isConnected()) {
            return undefined;
        }

        try {
            // Get all pending message keys from Redis
            const keys = await this.redisSync.client!.keys('pending_message:*');

            if (keys.length === 0) {
                return undefined;
            }

            logger.debug(`Checking ${keys.length} pending messages for correlation`, {
                guid: message.guid,
                text: message.text?.substring(0, 30)
            });

            // Convert message timestamp to JS timestamp
            const messageTime = Number(message.date) / 1000000 + 978307200000;

            // Check each pending message for a match
            for (const key of keys) {
                const data = await this.redisSync.client!.get(key);
                if (!data) continue;

                const pending = JSON.parse(data);

                // Match criteria
                const textMatch = message.text === pending.text;
                const recipientMatch = (
                    message.chat_identifier === pending.to ||
                    message.handle_id === pending.to ||
                    message.recipient_handle === pending.to
                );
                const timeDiff = Math.abs(messageTime - pending.timestamp);
                const timeMatch = timeDiff < 5000; // 5 seconds tolerance

                if (textMatch && recipientMatch && timeMatch) {
                    logger.info('✅ Matched sent message to Rua ID', {
                        ruaMessageId: pending.ruaMessageId,
                        guid: message.guid,
                        recipient: pending.to,
                        timeDiff,
                        text: message.text?.substring(0, 30)
                    });

                    // Delete the pending message (it's been matched)
                    await this.redisSync.client!.del(key);

                    return pending.ruaMessageId;
                }
            }

            logger.debug('No Rua ID match found for sent message', {
                guid: message.guid,
                text: message.text?.substring(0, 30),
                pendingCount: keys.length
            });

            return undefined;
        } catch (error) {
            logger.error('Error finding Rua message ID:', error as Error);
            return undefined;
        }
    }

    async cleanup(): Promise<void> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        if (this.watcher) {
            this.watcher.close();
        }
        if (this.db) {
            this.db.close();
        }
        // Clear all retry timeouts
        for (const timeout of this.retryTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.retryTimeouts.clear();
        this.processedMessages.clear();
        logger.info('MessageSync cleaned up');
    }

    // EventEmitter method overrides for type safety
}

export default MessageSync;
