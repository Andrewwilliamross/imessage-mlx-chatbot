/**
 * Database Type Definitions
 *
 * Types for SQLite chat.db structures and better-sqlite3 usage
 */

import type Database from 'better-sqlite3';

/**
 * Chat row from chat table
 */
export interface ChatRow {
    ROWID: number;
    chat_identifier: string;
    display_name: string | null;
    service_name: string;
    group_id: string | null;
    is_archived: number;
    is_filtered: number;
    last_addressed_handle: string | null;
}

/**
 * Handle row from handle table
 */
export interface HandleRow {
    ROWID: number;
    id: string;
    country: string | null;
    service: string;
    uncanonicalized_id: string | null;
}

/**
 * Attachment row from attachment table
 */
export interface AttachmentRow {
    ROWID: number;
    guid: string;
    filename: string;
    mime_type: string;
    total_bytes: number;
    created_date: number;
    start_date: number;
    transfer_name: string;
    transfer_state: number;
}

/**
 * Message attachment join row
 */
export interface MessageAttachmentJoinRow {
    message_id: number;
    attachment_id: number;
}

/**
 * Chat message join row
 */
export interface ChatMessageJoinRow {
    chat_id: number;
    message_id: number;
    message_date: number;
}

/**
 * Chat handle join row
 */
export interface ChatHandleJoinRow {
    chat_id: number;
    handle_id: number;
}

/**
 * Typed database instance
 */
export type ChatDatabase = Database.Database;

/**
 * Typed prepared statement
 */
export type PreparedStatement<T> = Database.Statement<T[]>;

/**
 * Database query options
 */
export interface QueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
}

/**
 * Conversation query result
 */
export interface ConversationQueryResult {
    chat_id: number;
    chat_identifier: string;
    display_name: string | null;
    is_group: number;
    participants: string;
    last_message_date: number | null;
    last_message_text: string | null;
    unread_count: number;
}
