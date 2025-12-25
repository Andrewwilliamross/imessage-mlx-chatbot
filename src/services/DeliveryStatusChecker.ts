import Database from 'better-sqlite3';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Message row from chat.db query
 */
interface MessageQueryRow {
    guid: string;
    ROWID: number;
    date: number;
    text: string | null;
    handle_id: string;
}

/**
 * Delivery status query row from chat.db
 */
interface DeliveryStatusRow {
    guid: string;
    ROWID: number;
    is_delivered: number;
    is_sent: number;
    error: number;
    date: number;
    date_delivered: number | null;
    service: string | null;
}

/**
 * Delivery status check result
 */
export interface DeliveryStatusResult {
    status: 'delivered' | 'failed' | 'pending' | 'unknown' | 'error';
    found: boolean;
    service?: string;
    errorCode?: number;
    reason?: string;
    details?: DeliveryStatusRow;
}

/**
 * Service statistics
 */
export interface DeliveryStatusStats {
    service: string;
    dbPath: string;
    connectionType: string;
    description: string;
    timestamp: string;
}

/**
 * DeliveryStatusChecker Service
 *
 * Queries the macOS Messages chat.db database to check delivery status of sent messages.
 * Used for SMS fallback logic - checks if iMessage delivery failed so we can retry via SMS.
 *
 * Key Database Fields:
 * - is_delivered: 0 = not delivered, 1 = delivered
 * - error: 0 = no error, non-zero = error code
 * - is_sent: whether message was sent
 * - guid: unique message identifier
 *
 * Date Format: Nanoseconds since 2001-01-01 (macOS epoch)
 */
class DeliveryStatusChecker {
    private dbPath: string;

    constructor() {
        this.dbPath = path.join(process.env.HOME || '', 'Library/Messages/chat.db');
        // Do NOT keep persistent connection - use transient connections to avoid conflicts with MessageSync
    }

    /**
     * Initialize database connection (no-op - using transient connections)
     * @returns Success status
     */
    init(): boolean {
        try {
            // Test that we can access the database
            const testDb = new Database(this.dbPath, { readonly: true });
            testDb.close();
            logger.info('✅ DeliveryStatusChecker: chat.db access verified (using transient connections)');
            return true;
        } catch (error) {
            logger.error('❌ DeliveryStatusChecker: Failed to access chat.db:', { error: error as Error });
            return false;
        }
    }

    /**
     * Find the GUID of the most recent outbound message sent to a recipient
     *
     * @param recipient - Phone number (e.g., "+19497955563")
     * @param messageText - Message text to match
     * @param withinSeconds - Only search messages within last N seconds (default: 10)
     * @returns Message GUID or null if not found
     */
    findRecentSentMessageGuid(recipient: string, messageText: string, withinSeconds: number = 10): string | null {
        let db: Database.Database | null = null;
        try {
            // Open transient readonly connection (prevents conflicts with MessageSync)
            db = new Database(this.dbPath, { readonly: true });

            // Calculate macOS epoch timestamp (nanoseconds since 2001-01-01)
            const now = Date.now();
            const macEpochMs = new Date('2001-01-01T00:00:00Z').getTime();
            const currentNanoTime = (now - macEpochMs) * 1000000; // Convert to nanoseconds
            const searchFromNanoTime = currentNanoTime - (withinSeconds * 1000000000);

            logger.debug(`Searching for message to ${recipient} within last ${withinSeconds}s`);

            // Query for most recent outbound message matching recipient and text
            const query = `
                SELECT
                    m.guid,
                    m.ROWID,
                    m.date,
                    m.text,
                    h.id as handle_id
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                WHERE m.is_from_me = 1
                  AND m.date >= ?
                  AND (h.id = ? OR m.cache_roomnames = ?)
                  AND (m.text = ? OR m.text IS NULL)
                ORDER BY m.date DESC
                LIMIT 1
            `;

            const result = db.prepare(query).get(
                searchFromNanoTime,
                recipient,
                recipient,
                messageText
            ) as MessageQueryRow | undefined;

            if (result) {
                logger.debug(`✅ Found message GUID: ${result.guid} (ROWID: ${result.ROWID})`);
                return result.guid;
            }

            logger.warn(`⚠️ Could not find recent sent message to ${recipient}`);
            return null;

        } catch (error) {
            logger.error('❌ Error finding sent message GUID:', { error: error as Error });
            return null;
        } finally {
            // Always close transient connection
            if (db) {
                db.close();
            }
        }
    }

    /**
     * Check the delivery status of a message by GUID
     *
     * @param messageGuid - Message GUID from chat.db
     * @returns Delivery status result
     *
     * Return format:
     * {
     *   status: 'delivered' | 'failed' | 'pending' | 'unknown' | 'error',
     *   found: boolean,
     *   service: string (optional),
     *   errorCode: number (optional),
     *   reason: string (optional),
     *   details: object (optional - raw database row)
     * }
     */
    checkDeliveryStatus(messageGuid: string): DeliveryStatusResult {
        let db: Database.Database | null = null;
        try {
            // Open transient readonly connection (prevents conflicts with MessageSync)
            db = new Database(this.dbPath, { readonly: true });

            logger.debug(`Checking delivery status for GUID: ${messageGuid}`);

            const query = `
                SELECT
                    guid,
                    ROWID,
                    is_delivered,
                    is_sent,
                    error,
                    date,
                    date_delivered,
                    service
                FROM message
                WHERE guid = ?
                  AND is_from_me = 1
            `;

            const result = db.prepare(query).get(messageGuid) as DeliveryStatusRow | undefined;

            if (!result) {
                logger.warn(`⚠️ Message not found in database: ${messageGuid}`);
                return {
                    status: 'unknown',
                    reason: 'Message not found in database',
                    found: false
                };
            }

            // Message successfully delivered
            if (result.is_delivered === 1) {
                logger.info(`✅ Message delivered successfully (GUID: ${messageGuid})`);
                return {
                    status: 'delivered',
                    service: result.service || 'iMessage',
                    found: true,
                    details: result
                };
            }

            // Message has error code (delivery failed)
            if (result.error !== 0 && result.error !== null) {
                logger.warn(`❌ Message delivery failed - error code: ${result.error} (GUID: ${messageGuid})`);
                return {
                    status: 'failed',
                    errorCode: result.error,
                    reason: `iMessage delivery failed (error code: ${result.error})`,
                    found: true,
                    details: result
                };
            }

            // Message sent but not yet delivered (still pending)
            if (result.is_sent === 1 && result.is_delivered === 0) {
                logger.debug(`⏳ Message pending delivery (GUID: ${messageGuid})`);
                return {
                    status: 'pending',
                    reason: 'Sent but not yet delivered',
                    found: true,
                    details: result
                };
            }

            // Message not yet sent (still being processed by Messages.app)
            // This is common for media messages which take time to upload/send
            if (result.is_sent === 0 && result.is_delivered === 0 && result.error === 0) {
                logger.debug(`⏳ Message still being processed by Messages.app (GUID: ${messageGuid})`);
                return {
                    status: 'pending',
                    reason: 'Message still being processed by Messages.app',
                    found: true,
                    details: result
                };
            }

            // Unknown state (shouldn't happen, but handle gracefully)
            // Don't mark as 'failed' - use 'unknown' to avoid false SMS fallback
            logger.warn(`⚠️ Message in unexpected state (GUID: ${messageGuid}, sent: ${result.is_sent}, delivered: ${result.is_delivered}, error: ${result.error})`);
            return {
                status: 'unknown',
                reason: 'Message in unexpected state - not marking as failed',
                found: true,
                details: result
            };

        } catch (error) {
            const err = error as Error;
            logger.error('❌ Error checking delivery status:', { error: error as Error });
            return {
                status: 'error',
                reason: err.message,
                found: false
            };
        } finally {
            // Always close transient connection
            if (db) {
                db.close();
            }
        }
    }

    /**
     * Close database connection (no-op - using transient connections)
     */
    close(): void {
        // No persistent connection to close - using transient connections
        logger.info('DeliveryStatusChecker: Using transient connections, no cleanup needed');
    }

    /**
     * Get service statistics
     * @returns Service stats
     */
    getStats(): DeliveryStatusStats {
        return {
            service: 'DeliveryStatusChecker',
            dbPath: this.dbPath,
            connectionType: 'transient',
            description: 'Opens/closes DB connection for each query to avoid conflicts with MessageSync',
            timestamp: new Date().toISOString()
        };
    }
}

export default DeliveryStatusChecker;
