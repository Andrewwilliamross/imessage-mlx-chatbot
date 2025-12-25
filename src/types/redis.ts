/**
 * Redis Type Definitions
 *
 * Types for Redis data structures and operations
 */

/**
 * Redis message data (stored as hash)
 */
export interface RedisMessageData {
    guid: string;
    text: string;
    handle: string;
    chat: string;
    is_from_me: '0' | '1';
    is_delivered: '0' | '1';
    is_read: '0' | '1';
    date: string;  // Number as string
    service: string;
    has_attachments: '0' | '1';
    attachments: string;  // JSON string
    timestamp: string;  // ISO date string
}

/**
 * Redis conversation metadata
 */
export interface RedisConversationMeta {
    chat_identifier: string;
    last_message_date: string;  // Number as string
    last_message_text: string;
    last_message_from_me: '0' | '1';
    service: string;
    updated_at: string;  // ISO date string
}

/**
 * Redis contact data
 */
export interface RedisContactData {
    handle: string;
    last_seen: number;
    service: string;
}

/**
 * Redis statistics
 */
export interface RedisStats {
    totalMessages: number;
    totalConversations: number;
    totalContacts: number;
    phoneNumber: string;
    redisPrefix: string;
}

/**
 * Redis key types
 */
export type RedisKeyType =
    | 'message'
    | 'conversation'
    | 'conversation_meta'
    | 'conversations'
    | 'timeline'
    | 'contacts'
    | 'last_message_id'
    | 'attachment';

/**
 * Redis connection options
 */
export interface RedisConnectionOptions {
    url?: string;
    socket?: {
        reconnectStrategy?: (retries: number) => number | Error;
        connectTimeout?: number;
    };
}
