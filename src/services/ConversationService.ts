import Database from 'better-sqlite3';
import path from 'path';
import logger from '../utils/logger.js';

// Constants
const CONVERSATION_CONSTANTS = {
    DEFAULT_CONVERSATIONS_LIMIT: 50,
    DEFAULT_MESSAGES_LIMIT: 100,
    DEFAULT_SEARCH_LIMIT: 20,
    MIN_SEARCH_QUERY_LENGTH: 2,
    MAX_GROUP_PARTICIPANTS_DISPLAY: 3,

    GROUP_CHAT_STYLE: 43,

    APPLE_EPOCH_OFFSET: 978307200000, // Jan 1, 2001 in Unix time (ms)
    NANOSECONDS_TO_MS: 1000000,

    DEFAULT_MESSAGES: {
        NO_MESSAGES: 'No messages',
        UNKNOWN_HANDLE: 'Unknown'
    }
} as const;

// SQL Query Templates
const SQL_QUERIES = {
    BASE_CONVERSATION_SELECT: `
        SELECT DISTINCT
            c.chat_identifier,
            c.display_name,
            c.style,
            c.state,
            c.account_id,
            c.group_id,
            c.ROWID as chat_rowid,
            (CASE
                WHEN c.style = 43 THEN 1
                WHEN (SELECT COUNT(*) FROM chat_handle_join WHERE chat_id = c.ROWID) > 1 THEN 1
                ELSE 0
            END) as is_group`,

    LAST_MESSAGE_SUBQUERY: `
        (SELECT text FROM message m
         JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
         WHERE cmj.chat_id = c.ROWID
         ORDER BY m.date DESC LIMIT 1) as last_message_text,
        (SELECT date FROM message m
         JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
         WHERE cmj.chat_id = c.ROWID
         ORDER BY m.date DESC LIMIT 1) as last_message_date,
        (SELECT is_from_me FROM message m
         JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
         WHERE cmj.chat_id = c.ROWID
         ORDER BY m.date DESC LIMIT 1) as last_message_from_me`,

    UNREAD_COUNT_SUBQUERY: `
        (SELECT COUNT(*) FROM message m
         JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
         WHERE cmj.chat_id = c.ROWID AND m.is_read = 0 AND m.is_from_me = 0) as unread_count`,

    MESSAGE_SELECT: `
        SELECT
            m.ROWID as id,
            m.guid,
            m.text,
            m.date,
            m.date_read,
            m.date_delivered,
            m.is_from_me,
            m.is_read,
            m.service,
            m.account,
            m.account_guid,
            m.cache_has_attachments,
            h.id as handle,
            h.service as handle_service
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        JOIN chat c ON cmj.chat_id = c.ROWID
        LEFT JOIN handle h ON m.handle_id = h.ROWID`,

    PARTICIPANTS_SELECT: `
        SELECT h.id as handle_id, h.service
        FROM handle h
        JOIN chat_handle_join chj ON h.ROWID = chj.handle_id
        WHERE chj.chat_id = ?
        ORDER BY h.id`
} as const;

/**
 * Raw conversation row from database
 */
interface ConversationRow {
    chat_identifier: string;
    display_name: string | null;
    style: number;
    state: number;
    account_id: string | null;
    group_id: string | null;
    chat_rowid: number;
    is_group: number;
    last_message_text?: string | null;
    last_message_date?: number | null;
    last_message_from_me?: number;
    unread_count?: number;
}

/**
 * Raw message row from database
 */
interface MessageRow {
    id: number;
    guid: string;
    text: string | null;
    date: number;
    date_read: number | null;
    date_delivered: number | null;
    is_from_me: number;
    is_read: number;
    service: string | null;
    account: string | null;
    account_guid: string | null;
    cache_has_attachments: number;
    handle: string | null;
    handle_service: string | null;
}

/**
 * Participant row from database
 */
interface ParticipantRow {
    handle_id: string;
    service: string | null;
}

/**
 * Enhanced conversation object
 */
export interface EnhancedConversation {
    id: string;
    chat_identifier: string;
    display_name: string;
    last_message_text: string;
    last_message_date: Date;
    last_message_from_me: boolean;
    unread_count: number;
    is_group: boolean;
    style: number;
    state: number;
    account_id: string | null;
    group_id: string | null;
    participants: string[];
    service: string;
}

/**
 * Formatted message object
 */
export interface FormattedMessage {
    id: number;
    guid: string;
    text: string | null;
    timestamp: Date;
    dateRead: Date | null;
    dateDelivered: Date | null;
    isFromMe: boolean;
    isRead: boolean;
    service: string | null;
    account: string | null;
    accountGuid: string | null;
    hasAttachments: boolean;
    handle: string | null;
    handleService: string | null;
    conversationId: string;
}

/**
 * Direct database-backed conversation service
 * No caching, queries chat.db directly for real-time data
 */
class ConversationService {
    public db: Database.Database | null;
    private chatDbPath: string;
    private ftsAvailable: boolean;

    constructor() {
        this.db = null;
        this.chatDbPath = path.join(process.env.HOME || '', 'Library/Messages/chat.db');
        this.ftsAvailable = false;
    }

    async init(): Promise<boolean> {
        try {
            this.db = new Database(this.chatDbPath, { readonly: true });

            // Test connection
            const testQuery = this.db.prepare('SELECT COUNT(*) as count FROM chat LIMIT 1');
            const result = testQuery.get() as { count: number };

            logger.info(`ConversationService connected to chat.db, found ${result.count} chats available`);

            // Check if FTS is available and supported
            this.ftsAvailable = this._checkFTSSupport();
            if (this.ftsAvailable) {
                logger.info('✅ FTS5 search optimization available');
            } else {
                logger.warn('⚠️ FTS5 not available, using LIKE-based search (slower)');
            }

            return true;
        } catch (error) {
            logger.error('Failed to connect to chat.db:', { error: error as Error });
            return false;
        }
    }

    /**
     * Check if FTS5 is supported and available
     */
    private _checkFTSSupport(): boolean {
        try {
            // Check if FTS5 module is compiled in
            const pragmaResult = this.db!.prepare("PRAGMA compile_options").all() as Array<Record<string, unknown>>;
            const hasFTS5 = pragmaResult.some(row =>
                Object.values(row).some(val => val && val.toString().includes('ENABLE_FTS5'))
            );

            if (!hasFTS5) {
                return false;
            }

            // Check if message_fts table exists
            const tableCheck = this.db!.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='message_fts'
            `).get();

            return !!tableCheck;
        } catch (error) {
            const err = error as Error;
            logger.debug('FTS5 check failed:', { error: err.message });
            return false;
        }
    }

    /**
     * Get conversations directly from database - no caching
     */
    getConversations(limit: number = CONVERSATION_CONSTANTS.DEFAULT_CONVERSATIONS_LIMIT, offset: number = 0): EnhancedConversation[] {
        this._ensureDatabase();

        try {
            const query = this._buildConversationsQuery();
            const conversations = query.all(limit, offset) as ConversationRow[];

            return conversations.map(conv => this.enhanceConversation(conv)).filter((c): c is EnhancedConversation => c !== null);

        } catch (error) {
            logger.error('Failed to get conversations from database:', { error: error as Error });
            return [];
        }
    }

    /**
     * Build conversations query
     */
    private _buildConversationsQuery(): Database.Statement {
        const queryString = `
            ${SQL_QUERIES.BASE_CONVERSATION_SELECT},
            ${SQL_QUERIES.LAST_MESSAGE_SUBQUERY},
            ${SQL_QUERIES.UNREAD_COUNT_SUBQUERY}
            FROM chat c
            WHERE c.chat_identifier IS NOT NULL
            ORDER BY last_message_date DESC
            LIMIT ? OFFSET ?
        `;

        return this.db!.prepare(queryString);
    }

    /**
     * Ensure database is initialized
     */
    private _ensureDatabase(): asserts this is this & { db: Database.Database } {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
    }

    /**
     * Get a specific conversation by chat identifier
     */
    getConversation(chatIdentifier: string): EnhancedConversation | null {
        this._ensureDatabase();

        try {
            const query = this._buildSingleConversationQuery();
            const conversation = query.get(chatIdentifier) as ConversationRow | undefined;

            return conversation ? this.enhanceConversation(conversation) : null;

        } catch (error) {
            logger.error(`Failed to get conversation ${chatIdentifier}:`, { error: error as Error });
            return null;
        }
    }

    /**
     * Build single conversation query
     */
    private _buildSingleConversationQuery(): Database.Statement {
        const queryString = `
            ${SQL_QUERIES.BASE_CONVERSATION_SELECT}
            FROM chat c
            WHERE c.chat_identifier = ?
        `;

        return this.db!.prepare(queryString);
    }

    /**
     * Get messages for a specific conversation
     */
    getMessages(chatIdentifier: string, limit: number = CONVERSATION_CONSTANTS.DEFAULT_MESSAGES_LIMIT, beforeDate: number | null = null): FormattedMessage[] {
        this._ensureDatabase();

        try {
            const { query, params } = this._buildMessagesQuery(chatIdentifier, limit, beforeDate);
            const messages = query.all(...params) as MessageRow[];

            return this._enhanceMessages(messages, chatIdentifier);

        } catch (error) {
            logger.error(`Failed to get messages for ${chatIdentifier}:`, { error: error as Error });
            return [];
        }
    }

    /**
     * Build messages query with optional date filter
     */
    private _buildMessagesQuery(chatIdentifier: string, limit: number, beforeDate: number | null): {
        query: Database.Statement;
        params: (string | number)[];
    } {
        const baseQuery = `
            ${SQL_QUERIES.MESSAGE_SELECT}
            WHERE c.chat_identifier = ?`;

        let queryString: string;
        let params: (string | number)[];

        if (beforeDate) {
            queryString = `${baseQuery} AND m.date < ?
                ORDER BY m.date DESC
                LIMIT ?`;
            params = [chatIdentifier, beforeDate, limit];
        } else {
            queryString = `${baseQuery}
                ORDER BY m.date DESC
                LIMIT ?`;
            params = [chatIdentifier, limit];
        }

        return {
            query: this.db!.prepare(queryString),
            params
        };
    }

    /**
     * Enhance messages with converted dates and formatting
     */
    private _enhanceMessages(messages: MessageRow[], chatIdentifier: string): FormattedMessage[] {
        return messages.map(msg => this._convertMessageFormat(msg, chatIdentifier)).reverse();
    }

    /**
     * Convert message to standard format
     */
    private _convertMessageFormat(msg: MessageRow, chatIdentifier: string): FormattedMessage {
        return {
            id: msg.id,
            guid: msg.guid,
            text: msg.text,
            timestamp: this.convertAppleDate(msg.date),
            dateRead: msg.date_read ? this.convertAppleDate(msg.date_read) : null,
            dateDelivered: msg.date_delivered ? this.convertAppleDate(msg.date_delivered) : null,
            isFromMe: msg.is_from_me === 1,
            isRead: msg.is_read === 1,
            service: msg.service,
            account: msg.account,
            accountGuid: msg.account_guid,
            hasAttachments: msg.cache_has_attachments === 1,
            handle: msg.handle,
            handleService: msg.handle_service,
            conversationId: chatIdentifier
        };
    }

    /**
     * Search conversations by query (with FTS optimization when available)
     */
    searchConversations(query: string, limit: number = CONVERSATION_CONSTANTS.DEFAULT_SEARCH_LIMIT): EnhancedConversation[] {
        if (!this._isValidSearchQuery(query)) {
            return [];
        }

        try {
            // Use FTS-optimized search if available, otherwise fallback to LIKE
            if (this.ftsAvailable) {
                return this._searchConversationsWithFTS(query, limit);
            } else {
                return this._searchConversationsWithLike(query, limit);
            }
        } catch (error) {
            logger.error('Failed to search conversations:', { error: error as Error });
            return [];
        }
    }

    /**
     * Search using FTS5 (much faster for large datasets)
     */
    private _searchConversationsWithFTS(query: string, limit: number): EnhancedConversation[] {
        const searchQuery = this._buildFTSSearchQuery();
        // Pass query for chat_identifier, display_name, and FTS match, then limit
        const conversations = searchQuery.all(query, query, query, limit) as ConversationRow[];
        return conversations.map(conv => this.enhanceConversation(conv)).filter((c): c is EnhancedConversation => c !== null);
    }

    /**
     * Search using LIKE (fallback when FTS not available)
     */
    private _searchConversationsWithLike(query: string, limit: number): EnhancedConversation[] {
        const searchQuery = this._buildLikeSearchQuery();
        const searchTerm = this._formatSearchTerm(query);
        const conversations = searchQuery.all(searchTerm, searchTerm, searchTerm, limit) as ConversationRow[];
        return conversations.map(conv => this.enhanceConversation(conv)).filter((c): c is EnhancedConversation => c !== null);
    }

    /**
     * Build FTS5-based search query
     */
    private _buildFTSSearchQuery(): Database.Statement {
        const queryString = `
            ${SQL_QUERIES.BASE_CONVERSATION_SELECT},
            ${SQL_QUERIES.LAST_MESSAGE_SUBQUERY}
            FROM chat c
            WHERE c.chat_identifier IS NOT NULL
            AND (
                c.chat_identifier LIKE '%' || ? || '%'
                OR c.display_name LIKE '%' || ? || '%'
                OR c.chat_identifier IN (
                    SELECT DISTINCT c2.chat_identifier
                    FROM chat c2
                    JOIN chat_message_join cmj ON c2.ROWID = cmj.chat_id
                    JOIN message m ON cmj.message_id = m.ROWID
                    JOIN message_fts ON message_fts.rowid = m.ROWID
                    WHERE message_fts MATCH ?
                )
            )
            ORDER BY last_message_date DESC
            LIMIT ?
        `;

        return this.db!.prepare(queryString);
    }

    /**
     * Validate search query
     */
    private _isValidSearchQuery(query: string): boolean {
        return !!this.db && !!query && query.length >= CONVERSATION_CONSTANTS.MIN_SEARCH_QUERY_LENGTH;
    }

    /**
     * Format search term for SQL LIKE query
     */
    private _formatSearchTerm(query: string): string {
        return `%${query}%`;
    }

    /**
     * Build LIKE-based search query (fallback)
     */
    private _buildLikeSearchQuery(): Database.Statement {
        const queryString = `
            ${SQL_QUERIES.BASE_CONVERSATION_SELECT},
            ${SQL_QUERIES.LAST_MESSAGE_SUBQUERY}
            FROM chat c
            WHERE c.chat_identifier IS NOT NULL
            AND (
                c.chat_identifier LIKE ?
                OR c.display_name LIKE ?
                OR c.chat_identifier IN (
                    SELECT DISTINCT c2.chat_identifier
                    FROM chat c2
                    JOIN chat_message_join cmj ON c2.ROWID = cmj.chat_id
                    JOIN message m ON cmj.message_id = m.ROWID
                    WHERE m.text LIKE ?
                )
            )
            ORDER BY last_message_date DESC
            LIMIT ?
        `;

        return this.db!.prepare(queryString);
    }

    /**
     * Enhance conversation with display name and participant info
     */
    enhanceConversation(conversation: ConversationRow): EnhancedConversation | null {
        if (!conversation) return null;

        try {
            const participants = this._getParticipants(conversation.chat_rowid);
            const displayName = this._determineDisplayName(conversation, participants);

            return this._buildEnhancedConversation(conversation, participants, displayName);

        } catch (error) {
            logger.error('Failed to enhance conversation:', { error: error as Error });
            return null;
        }
    }

    /**
     * Get participants for a conversation
     */
    private _getParticipants(chatRowId: number): ParticipantRow[] {
        const query = this.db!.prepare(SQL_QUERIES.PARTICIPANTS_SELECT);
        return query.all(chatRowId) as ParticipantRow[];
    }

    /**
     * Determine display name for conversation
     */
    private _determineDisplayName(conversation: ConversationRow, participants: ParticipantRow[]): string {
        if (conversation.display_name) {
            return conversation.display_name;
        }

        if (conversation.is_group) {
            return this._buildGroupDisplayName(participants);
        }

        return this.formatHandle(conversation.chat_identifier);
    }

    /**
     * Build display name for group chat
     */
    private _buildGroupDisplayName(participants: ParticipantRow[]): string {
        const maxDisplay = CONVERSATION_CONSTANTS.MAX_GROUP_PARTICIPANTS_DISPLAY;
        const participantNames = participants
            .slice(0, maxDisplay)
            .map(p => this.formatHandle(p.handle_id));

        let displayName = participantNames.join(', ');

        if (participants.length > maxDisplay) {
            displayName += ` +${participants.length - maxDisplay} more`;
        }

        return displayName;
    }

    /**
     * Build enhanced conversation object
     */
    private _buildEnhancedConversation(conversation: ConversationRow, participants: ParticipantRow[], displayName: string): EnhancedConversation {
        return {
            id: conversation.chat_identifier,
            chat_identifier: conversation.chat_identifier,
            display_name: displayName,
            last_message_text: conversation.last_message_text || CONVERSATION_CONSTANTS.DEFAULT_MESSAGES.NO_MESSAGES,
            last_message_date: conversation.last_message_date
                ? this.convertAppleDate(conversation.last_message_date)
                : new Date(),
            last_message_from_me: conversation.last_message_from_me === 1,
            unread_count: conversation.unread_count || 0,
            is_group: conversation.is_group === 1,
            style: conversation.style,
            state: conversation.state,
            account_id: conversation.account_id,
            group_id: conversation.group_id,
            participants: participants.map(p => p.handle_id),
            service: participants[0]?.service || 'iMessage'
        };
    }

    /**
     * Format handle for display
     */
    formatHandle(handle: string): string {
        if (!handle) {
            return CONVERSATION_CONSTANTS.DEFAULT_MESSAGES.UNKNOWN_HANDLE;
        }

        if (this._isPhoneNumber(handle)) {
            return this._formatPhoneNumber(handle);
        }

        // Email formatting - just return as is
        return handle;
    }

    /**
     * Check if handle is a phone number
     */
    private _isPhoneNumber(handle: string): boolean {
        return !!handle.match(/^\+\d{11}$/);
    }

    /**
     * Format phone number for display
     */
    private _formatPhoneNumber(handle: string): string {
        const cleaned = handle.replace(/\D/g, '');

        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            const areaCode = cleaned.slice(1, 4);
            const prefix = cleaned.slice(4, 7);
            const number = cleaned.slice(7);
            return `+1 (${areaCode}) ${prefix}-${number}`;
        }

        return handle;
    }

    /**
     * Convert Apple's epoch timestamp to JavaScript Date
     */
    convertAppleDate(appleTimestamp: number): Date {
        if (!appleTimestamp) return new Date();

        const timestampMs = (appleTimestamp / CONVERSATION_CONSTANTS.NANOSECONDS_TO_MS)
            + CONVERSATION_CONSTANTS.APPLE_EPOCH_OFFSET;

        return new Date(timestampMs);
    }

    async cleanup(): Promise<void> {
        if (this.db) {
            this.db.close();
            logger.info('ConversationService: Closed chat.db connection');
        }
    }
}

export default ConversationService;
