/**
 * Message Type Definitions
 *
 * Core types for iMessage messages, attachments, and related data structures
 */

/**
 * Message row as returned from chat.db SQLite database
 */
export interface MessageRow {
    id: number;
    guid: string;
    text: string | null;
    attributedBody: Buffer | null;
    handle_id: string;
    is_from_me: number;  // 0 or 1
    is_delivered: number;
    is_sent: number;
    error: number;
    is_read: number;
    date: number;  // Cocoa timestamp
    service: string;
    chat_identifier: string;
    display_name: string | null;
    recipient_handle: string | null;
    has_attachments: number;  // 0 or 1
}

/**
 * Processed message with boolean flags
 */
export interface Message {
    id?: number;
    guid: string;
    text: string | null;
    attributedBody?: Buffer | null;
    handle_id: string;
    is_from_me: boolean;
    is_delivered: boolean;
    is_sent?: boolean;
    error?: number;
    is_read: boolean;
    date: number;
    service: string;
    chat_identifier: string;
    display_name?: string | null;
    recipient_handle?: string | null;
    has_attachments: boolean;
    attachment_path?: string;
    attachments?: Attachment[];
}

/**
 * Enhanced message with additional metadata
 */
export interface EnhancedMessage extends Message {
    conversationInfo?: ConversationInfo;
    attachment_url?: string;
    attachment_status?: 'available' | 'uploading' | 'error';
    macId?: string;
    timestamp?: string;
}

/**
 * Conversation metadata
 */
export interface ConversationInfo {
    displayName: string | null;
    isGroup: boolean;
    participants: string[];
}

/**
 * Message attachment information
 */
export interface Attachment {
    id?: number;
    guid: string;
    filename: string;
    mime_type: string;
    total_bytes: number;
    path: string;
    url?: string;
}

/**
 * Result of sending a message
 */
export interface SendMessageResult {
    success: boolean;
    recipient?: string;
    text?: string;
    timestamp?: string;
    type?: 'text' | 'media';
    service?: string;
    method?: string;
    guid?: string;
    error?: string;
    warning?: string;
    fallbackReason?: string;
    originalDeliveryStatus?: DeliveryStatus | null;
    duration?: number;
}

/**
 * Delivery status from chat.db
 */
export interface DeliveryStatus {
    guid: string;
    is_delivered: number;
    is_sent: number;
    error: number;
    date_delivered: number | null;
}

/**
 * Conversation from chat.db
 */
export interface Conversation {
    chat_id: number;
    chat_identifier: string;
    display_name: string | null;
    is_group: number;
    participants: string;
    last_message_date: number | null;
    last_message_text: string | null;
    unread_count?: number;
}

/**
 * Message for Redis storage
 */
export interface RedisMessage {
    guid: string;
    text: string;
    handle: string;
    chat_identifier: string;
    is_from_me: boolean;
    is_delivered?: boolean;
    is_read?: boolean;
    date: number;
    service: string;
    has_attachments?: boolean;
    attachments?: Attachment[];
    timestamp: string;
}

/**
 * SMS fallback tracking data
 */
export interface SMSFallbackData {
    count: number;
    lastReset: number;
}
