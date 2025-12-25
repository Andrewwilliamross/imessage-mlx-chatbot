/**
 * Socket.IO Event Type Definitions
 *
 * Defines all socket events between relay and backend server
 */

import type { Message, EnhancedMessage, Conversation, SendMessageResult } from './message.js';

/**
 * Standard socket callback type
 */
export type SocketCallback<T = unknown> = (response: {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: string;
    [key: string]: unknown;
}) => void;

/**
 * Send message request data
 */
export interface SendMessageData {
    to: string;
    text: string;
    attachmentUrl?: string;
    ruaMessageId?: string; // Correlation ID for optimistic UI updates
}

/**
 * Get conversations request data
 */
export interface GetConversationsData {
    limit?: number;
}

/**
 * Get conversation messages request data
 */
export interface GetConversationMessagesData {
    chatIdentifier: string;
    limit?: number;
    beforeDate?: number;
}

/**
 * Search conversations request data
 */
export interface SearchConversationsData {
    query: string;
    limit?: number;
}

/**
 * Export conversation request data
 */
export interface ExportConversationData {
    chatIdentifier: string;
    format?: 'json' | 'csv' | 'txt';
    options?: {
        limit?: number;
        includeAttachments?: boolean;
    };
}

/**
 * Health check request data
 */
export interface HealthCheckData {
    detailed?: boolean;
}

/**
 * Relay update event data
 */
export interface RelayUpdateData {
    type: 'new_message' | 'message_sent' | 'message_failed' | 'message_updated' | 'campaign_tick' | 'relay_health';
    data: unknown;
    timestamp: string;
    macId: string;
}

/**
 * Relay registration data
 */
export interface RelayRegistrationData {
    macId: string;
    phoneNumber: string;
    capabilities: RelayCapabilities;
    hardwareInfo: HardwareInfo;
    stats: RelayStats;
    timestamp: string;
}

/**
 * Relay capabilities
 */
export interface RelayCapabilities {
    sendMessages: boolean;
    receiveMessages: boolean;
    realTimeSync: boolean;
    conversationAccess: boolean;
    conversationExport: boolean;
    attachmentSupport: boolean;
    r2Storage: boolean;
    search: boolean;
}

/**
 * Hardware info for relay identification
 */
export interface HardwareInfo {
    macId: string;
    serialNumber: string;
    model: string;
    osVersion: string;
    hostname: string;
}

/**
 * Relay statistics
 */
export interface RelayStats {
    startTime: number;
    messagesProcessed: number;
    messagesSent: number;
    lastActivity: number;
    errors: number;
    uptime: number;
    performance?: PerformanceMetrics;
    services?: ServiceStatus;
    memory?: NodeJS.MemoryUsage;
    timestamp: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    messagesPerMinute: number;
    errorRate: number;
    lastActivityAge: number;
}

/**
 * Service status
 */
export interface ServiceStatus {
    redis: boolean;
    messageSync: boolean;
    conversationService: boolean;
    r2Storage: boolean;
}

/**
 * Health status response
 */
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'limited' | 'unavailable';
    services: {
        messages: {
            status: string;
            error?: string;
        };
        conversations: {
            status: string;
        };
        redis: {
            status: string;
        };
        r2Storage: {
            status: string;
        };
    };
    performance: PerformanceMetrics;
    uptime: number;
    memory: NodeJS.MemoryUsage;
    timestamp: string;
}

/**
 * Socket.IO server-to-client events (relay receives)
 */
export interface ServerToClientEvents {
    send_message: (data: SendMessageData, callback: SocketCallback<SendMessageResult>) => void;
    get_conversations: (data: GetConversationsData, callback: SocketCallback<{ conversations: Conversation[]; total: number; limit: number }>) => void;
    get_conversation_messages: (data: GetConversationMessagesData, callback: SocketCallback<{ messages: EnhancedMessage[]; total: number }>) => void;
    search_conversations: (data: SearchConversationsData, callback: SocketCallback<{ conversations: Conversation[]; total: number }>) => void;
    export_conversation: (data: ExportConversationData, callback: SocketCallback<{ messages: Message[]; messageCount: number }>) => void;
    health_check: (data: HealthCheckData, callback: SocketCallback<HealthStatus>) => void;
    heartbeat: (callback?: SocketCallback<{ macId: string; timestamp: string; uptime: number; stats: RelayStats }>) => void;
    relay_registered: (data: unknown) => void;
}

/**
 * Socket.IO client-to-server events (relay sends)
 */
export interface ClientToServerEvents {
    relay_register: (data: RelayRegistrationData) => void;
    relay_update: (data: RelayUpdateData) => void;
    relay_heartbeat: (data: { macId: string; timestamp: string; uptime: number; stats: RelayStats; health: string }) => void;
    relay_disconnect: (data: { macId: string; stats: RelayStats; timestamp: string; reason: string }) => void;
}

/**
 * Socket.IO auth data
 */
export interface SocketAuthData {
    macId: string;
    phoneNumber: string;
    type: 'relay';
    capabilities: RelayCapabilities;
}
