import logger from '../utils/logger.js';
import redisPool from '../utils/RedisPool.js';
import type { RedisClientType } from 'redis';

// Constants
const REDIS_CONSTANTS = {
    DEFAULT_MESSAGE_LIMIT: 50,
    DEFAULT_CONVERSATION_LIMIT: 20,
    MESSAGE_TEXT_PREVIEW_LENGTH: 100,
    TTL_30_DAYS: 86400 * 30,

    KEY_TYPES: {
        MESSAGE: 'message',
        CONVERSATION: 'conversation',
        CONVERSATION_META: 'conversation_meta',
        CONVERSATIONS: 'conversations',
        TIMELINE: 'timeline',
        CONTACTS: 'contacts',
        LAST_MESSAGE_ID: 'last_message_id',
        ATTACHMENT: 'attachment'
    },

    BOOLEAN_FLAGS: {
        TRUE: '1',
        FALSE: '0'
    }
} as const;

/**
 * Message data for Redis storage
 */
export interface RedisMessageData {
    guid: string;
    text: string;
    handle: string;
    chat: string;
    is_from_me: '0' | '1';
    is_delivered: '0' | '1';
    is_read: '0' | '1';
    date: string;
    service: string;
    has_attachments: '0' | '1';
    attachments: string; // JSON string
    timestamp: string;
}

/**
 * Parsed message from Redis
 */
export interface ParsedMessage {
    guid: string;
    text: string;
    handle: string;
    chat: string;
    is_from_me: boolean;
    is_delivered: boolean;
    is_read: boolean;
    date: number;
    service: string;
    has_attachments: boolean;
    attachments: unknown[];
    timestamp: string;
}

/**
 * Conversation metadata
 */
export interface ConversationMeta {
    chat_identifier: string;
    last_message_date: number;
    last_message_text: string;
    last_message_from_me: boolean;
    service: string;
    updated_at: string;
}

/**
 * Contact data
 */
export interface ContactData {
    handle: string;
    last_seen: number;
    service: string;
}

/**
 * Redis sync statistics
 */
export interface RedisSyncStats {
    totalMessages: number;
    totalConversations: number;
    totalContacts: number;
    phoneNumber: string | undefined;
    redisPrefix: string;
}

/**
 * Message input (from chat.db or other sources)
 */
export interface MessageInput {
    guid: string;
    text?: string | null;
    handle_id?: string;
    chat_identifier: string;
    is_from_me?: boolean;
    is_delivered?: boolean;
    is_read?: boolean;
    date?: number;
    service?: string;
    has_attachments?: boolean;
    attachments?: unknown[];
}

class RedisSync {
    public client: RedisClientType | null;
    private phoneNumber: string | undefined;
    public redisPrefix: string;

    constructor() {
        this.client = null;
        this.phoneNumber = process.env.PHONE_NUMBER;
        this.redisPrefix = `imessage:${this.phoneNumber}`;
    }

    async connect(): Promise<boolean> {
        try {
            // Use RedisPool instead of creating own client
            this.client = await redisPool.getClient();
            logger.info('✅ Redis connected via RedisPool (with circuit breaker)');
            return true;
        } catch (error) {
            logger.error('Redis connection failed:', { error: error as Error });
            return false;
        }
    }

    /**
     * Build Redis key
     */
    private _buildKey(type: string, identifier: string = ''): string {
        if (identifier) {
            return `${this.redisPrefix}:${type}:${identifier}`;
        }
        return `${this.redisPrefix}:${type}`;
    }

    /**
     * Convert boolean to Redis flag
     */
    private _toFlag(value?: boolean): '0' | '1' {
        return value ? REDIS_CONSTANTS.BOOLEAN_FLAGS.TRUE : REDIS_CONSTANTS.BOOLEAN_FLAGS.FALSE;
    }

    /**
     * Convert Redis flag to boolean
     */
    private _fromFlag(flag?: string): boolean {
        return flag === REDIS_CONSTANTS.BOOLEAN_FLAGS.TRUE;
    }

    /**
     * Ensure client is connected and ready
     */
    private _ensureClient(): boolean {
        if (!this.client) {
            logger.error('Redis client is not initialized');
            return false;
        }

        if (!this.client.isReady) {
            logger.error('Redis client is not ready');
            return false;
        }

        return true;
    }

    async saveMessage(message: MessageInput): Promise<boolean> {
        if (!this._ensureClient()) return false;

        // Validate required message fields
        if (!this._validateMessage(message)) {
            logger.warn('Invalid message data, skipping Redis save', {
                guid: message?.guid,
                chatIdentifier: message?.chat_identifier,
                hasGuid: !!message?.guid,
                hasChatIdentifier: !!message?.chat_identifier,
                hasDate: !!message?.date
            });
            return false;
        }

        // Wrap critical operation in retry logic
        return await this._withRetry(async () => {
            let messageTimestamp = Number(message.date) || Date.now();

            // Ensure timestamp is a valid number
            if (isNaN(messageTimestamp) || !isFinite(messageTimestamp)) {
                logger.warn('Invalid message timestamp, using current time', {
                    guid: message.guid,
                    originalDate: message.date,
                    fallbackTimestamp: Date.now()
                });
                messageTimestamp = Date.now();
            }

            const messageData = this._buildMessageData(message, messageTimestamp);

            await this._storeMessage(message.guid, messageData);
            await this._addToTimelines(message.guid, message.chat_identifier, messageTimestamp);
            await this._updateConversationMeta(message, messageTimestamp);
            await this._trackContact(message, messageTimestamp);
            await this._setMessageExpiry(message.guid, message.chat_identifier);

            logger.debug('Message saved to Redis', {
                guid: message.guid,
                chatIdentifier: message.chat_identifier,
                isFromMe: message.is_from_me,
                hasAttachments: message.has_attachments
            });

            return true;
        }, 'saveMessage', message.guid);
    }

    /**
     * Validate message has required fields for Redis storage
     */
    private _validateMessage(message: MessageInput): boolean {
        if (!message) return false;
        if (!message.guid || typeof message.guid !== 'string') return false;
        if (!message.chat_identifier || typeof message.chat_identifier !== 'string') return false;
        return true;
    }

    /**
     * Build message data object
     */
    private _buildMessageData(message: MessageInput, messageTimestamp: number): RedisMessageData {
        return {
            guid: message.guid,
            text: message.text || '',
            handle: message.handle_id || '',
            chat: message.chat_identifier || '',
            is_from_me: this._toFlag(message.is_from_me),
            is_delivered: this._toFlag(message.is_delivered),
            is_read: this._toFlag(message.is_read),
            date: String(messageTimestamp),
            service: message.service || 'iMessage',
            has_attachments: this._toFlag(message.has_attachments),
            attachments: JSON.stringify(message.attachments || []),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Store message in Redis
     */
    private async _storeMessage(guid: string, messageData: RedisMessageData): Promise<void> {
        const messageKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.MESSAGE, guid);
        await this.client!.hSet(messageKey, messageData as unknown as Record<string, string>);
    }

    /**
     * Add message to timelines
     */
    private async _addToTimelines(guid: string, chatIdentifier: string, timestamp: number): Promise<void> {
        const conversationKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATION, chatIdentifier);
        const timelineKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.TIMELINE);
        const conversationsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATIONS);

        await Promise.all([
            this.client!.zAdd(conversationKey, { score: timestamp, value: guid }),
            this.client!.zAdd(timelineKey, { score: timestamp, value: guid }),
            this.client!.zAdd(conversationsKey, { score: timestamp, value: chatIdentifier })
        ]);
    }

    /**
     * Update conversation metadata
     */
    private async _updateConversationMeta(message: MessageInput, timestamp: number): Promise<void> {
        const conversationMetaKey = this._buildKey(
            REDIS_CONSTANTS.KEY_TYPES.CONVERSATION_META,
            message.chat_identifier
        );

        const conversationMeta = {
            chat_identifier: message.chat_identifier,
            last_message_date: String(timestamp),
            last_message_text: (message.text || '').substring(0, REDIS_CONSTANTS.MESSAGE_TEXT_PREVIEW_LENGTH),
            last_message_from_me: this._toFlag(message.is_from_me),
            service: message.service || 'iMessage',
            updated_at: new Date().toISOString()
        };

        await this.client!.hSet(conversationMetaKey, conversationMeta);
    }

    /**
     * Track contact information
     */
    private async _trackContact(message: MessageInput, timestamp: number): Promise<void> {
        if (!message.handle_id || message.is_from_me) {
            return;
        }

        const contactsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONTACTS);
        const contactData: ContactData = {
            handle: message.handle_id,
            last_seen: timestamp,
            service: message.service || 'iMessage'
        };

        await this.client!.hSet(contactsKey, message.handle_id, JSON.stringify(contactData));
    }

    /**
     * Set expiry for message-related keys
     */
    private async _setMessageExpiry(guid: string, chatIdentifier: string): Promise<void> {
        const messageKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.MESSAGE, guid);
        const conversationMetaKey = this._buildKey(
            REDIS_CONSTANTS.KEY_TYPES.CONVERSATION_META,
            chatIdentifier
        );

        await Promise.all([
            this.client!.expire(messageKey, REDIS_CONSTANTS.TTL_30_DAYS),
            this.client!.expire(conversationMetaKey, REDIS_CONSTANTS.TTL_30_DAYS)
        ]);
    }

    parseMessageData(messageData: Record<string, string>): ParsedMessage | null {
        if (!messageData || !messageData.guid) return null;

        return {
            ...messageData,
            attachments: this._parseAttachments(messageData.attachments),
            is_from_me: this._fromFlag(messageData.is_from_me),
            is_delivered: this._fromFlag(messageData.is_delivered),
            is_read: this._fromFlag(messageData.is_read),
            has_attachments: this._fromFlag(messageData.has_attachments),
            date: Number(messageData.date)
        } as ParsedMessage;
    }

    /**
     * Parse attachments JSON
     */
    private _parseAttachments(attachmentsString: string): unknown[] {
        try {
            return JSON.parse(attachmentsString || '[]') as unknown[];
        } catch {
            return [];
        }
    }

    async getRecentMessages(limit: number = REDIS_CONSTANTS.DEFAULT_MESSAGE_LIMIT): Promise<ParsedMessage[]> {
        if (!this._ensureClient()) return [];

        try {
            const timelineKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.TIMELINE);
            const messageGuids = await this._getMessageGuids(timelineKey, limit);

            return await this._fetchMessages(messageGuids);
        } catch (error) {
            logger.error('Failed to get recent messages:', { error: error as Error });
            return [];
        }
    }

    async getConversation(chatIdentifier: string, limit: number = REDIS_CONSTANTS.DEFAULT_MESSAGE_LIMIT): Promise<ParsedMessage[]> {
        if (!this._ensureClient()) return [];

        try {
            const conversationKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATION, chatIdentifier);
            const messageGuids = await this._getMessageGuids(conversationKey, limit);

            return await this._fetchMessages(messageGuids);
        } catch (error) {
            logger.error('Failed to get conversation:', { error: error as Error });
            return [];
        }
    }

    /**
     * Get message GUIDs from sorted set
     */
    private async _getMessageGuids(key: string, limit: number): Promise<string[]> {
        return await this.client!.zRange(key, 0, limit - 1, { REV: true });
    }

    /**
     * Fetch messages by GUIDs using batch operations
     * Optimized to reduce N+1 query problem by fetching all messages in parallel
     */
    private async _fetchMessages(guids: string[]): Promise<ParsedMessage[]> {
        if (guids.length === 0) {
            return [];
        }

        // Batch fetch all messages in parallel instead of sequential loop
        const fetchPromises = guids.map(async (guid) => {
            const messageKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.MESSAGE, guid);
            const messageData = await this.client!.hGetAll(messageKey);
            return this.parseMessageData(messageData);
        });

        const results = await Promise.all(fetchPromises);

        // Filter out null/invalid messages
        return results.filter((message): message is ParsedMessage => message !== null);
    }

    async getLastMessageId(): Promise<number> {
        if (!this._ensureClient()) return 0;

        try {
            const lastIdKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.LAST_MESSAGE_ID);
            const lastId = await this.client!.get(lastIdKey);
            return parseInt(lastId || '0') || 0;
        } catch (error) {
            logger.error('Failed to get last message ID:', { error: error as Error });
            return 0;
        }
    }

    async setLastMessageId(messageId: number): Promise<boolean> {
        if (!this._ensureClient()) return false;

        try {
            const lastIdKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.LAST_MESSAGE_ID);
            await this.client!.set(lastIdKey, messageId.toString());
            return true;
        } catch (error) {
            logger.error('Failed to set last message ID:', { error: error as Error });
            return false;
        }
    }

    async getConversations(limit: number = REDIS_CONSTANTS.DEFAULT_CONVERSATION_LIMIT): Promise<ConversationMeta[]> {
        if (!this._ensureClient()) return [];

        try {
            const conversationsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATIONS);
            const chatIdentifiers = await this.client!.zRange(conversationsKey, 0, limit - 1, { REV: true });

            return await this._fetchConversations(chatIdentifiers);
        } catch (error) {
            logger.error('Failed to get conversations:', { error: error as Error });
            return [];
        }
    }

    /**
     * Fetch conversations metadata using batch operations
     * Optimized to reduce N+1 query problem by fetching all conversations in parallel
     */
    private async _fetchConversations(chatIdentifiers: string[]): Promise<ConversationMeta[]> {
        if (chatIdentifiers.length === 0) {
            return [];
        }

        // Batch fetch all conversation metadata in parallel
        const fetchPromises = chatIdentifiers.map(async (chatId) => {
            const metaKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATION_META, chatId);
            const meta = await this.client!.hGetAll(metaKey);

            if (meta && meta.chat_identifier) {
                return this._parseConversationMeta(meta);
            }
            return null;
        });

        const results = await Promise.all(fetchPromises);

        // Filter out null/invalid conversations
        return results.filter((conversation): conversation is ConversationMeta => conversation !== null);
    }

    /**
     * Parse conversation metadata
     */
    private _parseConversationMeta(meta: Record<string, string>): ConversationMeta {
        return {
            ...meta,
            last_message_from_me: this._fromFlag(meta.last_message_from_me),
            last_message_date: Number(meta.last_message_date)
        } as ConversationMeta;
    }

    async getContacts(): Promise<ContactData[]> {
        if (!this._ensureClient()) return [];

        try {
            const contactsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONTACTS);
            const contactsData = await this.client!.hGetAll(contactsKey);

            const contacts = this._parseContacts(contactsData);
            return this._sortContactsByLastSeen(contacts);
        } catch (error) {
            logger.error('Failed to get contacts:', { error: error as Error });
            return [];
        }
    }

    /**
     * Parse contacts data
     */
    private _parseContacts(contactsData: Record<string, string>): ContactData[] {
        const contacts: ContactData[] = [];

        for (const [_, data] of Object.entries(contactsData)) {
            try {
                const contact = JSON.parse(data) as ContactData;
                contacts.push(contact);
            } catch {
                // Skip invalid contact data
            }
        }

        return contacts;
    }

    /**
     * Sort contacts by last seen
     */
    private _sortContactsByLastSeen(contacts: ContactData[]): ContactData[] {
        return contacts.sort((a, b) => b.last_seen - a.last_seen);
    }

    async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        if (!this._ensureClient()) return false;

        try {
            await this.client!.setEx(key, ttlSeconds, value);
            return true;
        } catch (error) {
            logger.error('Failed to set key with expiry:', { error: error as Error });
            return false;
        }
    }

    async getAttachment(attachmentId: string): Promise<unknown | null> {
        if (!this._ensureClient()) return null;

        try {
            const attachmentKey = `${REDIS_CONSTANTS.KEY_TYPES.ATTACHMENT}:${attachmentId}`;
            const data = await this.client!.get(attachmentKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Failed to get attachment:', { error: error as Error });
            return null;
        }
    }

    isConnected(): boolean {
        return !!(this.client && this.client.isReady);
    }

    async getStats(): Promise<RedisSyncStats | null> {
        if (!this._ensureClient()) return null;

        try {
            const timelineKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.TIMELINE);
            const conversationsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONVERSATIONS);
            const contactsKey = this._buildKey(REDIS_CONSTANTS.KEY_TYPES.CONTACTS);

            const [totalMessages, totalConversations, totalContacts] = await Promise.all([
                this.client!.zCard(timelineKey),
                this.client!.zCard(conversationsKey),
                this.client!.hLen(contactsKey)
            ]);

            return this._buildStatsResponse(totalMessages, totalConversations, totalContacts);
        } catch (error) {
            logger.error('Failed to get stats:', { error: error as Error });
            return null;
        }
    }

    /**
     * Build stats response object
     */
    private _buildStatsResponse(totalMessages: number, totalConversations: number, totalContacts: number): RedisSyncStats {
        return {
            totalMessages,
            totalConversations,
            totalContacts,
            phoneNumber: this.phoneNumber,
            redisPrefix: this.redisPrefix
        };
    }

    /**
     * Execute Redis operation with retry logic and exponential backoff
     */
    private async _withRetry<T>(
        operation: () => Promise<T>,
        operationName: string = 'operation',
        context: string = '',
        maxRetries: number = 3
    ): Promise<T | false> {
        let lastError: unknown;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (attempt < maxRetries - 1) {
                    // Exponential backoff: 100ms, 200ms, 400ms
                    const baseDelay = 100 * Math.pow(2, attempt);
                    // Add jitter (0-100ms) to prevent thundering herd
                    const jitter = Math.random() * 100;
                    const delay = baseDelay + jitter;

                    const err = error as Error;
                    logger.warn(
                        `Redis ${operationName} failed (attempt ${attempt + 1}/${maxRetries})${context ? ` for ${context}` : ''}, ` +
                        `retrying in ${Math.round(delay)}ms: ${err.message}`
                    );

                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    const err = error as Error;
                    logger.error(
                        `Redis ${operationName} failed after ${maxRetries} attempts${context ? ` for ${context}` : ''}: ${err.message}`
                    );
                }
            }
        }

        // Return false for non-critical failures to allow relay to continue
        return false;
    }
}

export default RedisSync;
