/**
 * MessagePoller - Simplified chat.db polling for standalone chatbot
 *
 * Polls the iMessage database for new messages and emits events
 * without requiring Redis or other external dependencies.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Message row from chat.db
 */
export interface MessageRow {
  id: number;
  guid: string;
  text: string | null;
  handle_id: number | null;
  is_from_me: number;
  date: number;
  service: string | null;
  chat_identifier: string | null;
  handle: string | null;
}

/**
 * Processed message for chatbot consumption
 */
export interface ProcessedMessage {
  guid: string;
  text: string | null;
  handle: string | null;
  chat: string;
  is_from_me: boolean;
  date: number;
  timestamp: string;
}

const MESSAGE_QUERY = `
    SELECT
        m.ROWID as id,
        m.guid,
        m.text,
        m.handle_id,
        m.is_from_me,
        m.date,
        m.service,
        c.chat_identifier,
        h.id as handle
    FROM message m
    LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN chat c ON cmj.chat_id = c.ROWID
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.ROWID > ?
    ORDER BY m.date ASC
`;

const APPLE_EPOCH_OFFSET = 978307200; // Seconds between Unix epoch and Apple epoch

export class MessagePoller extends EventEmitter {
  private dbPath: string;
  private db: Database.Database | null = null;
  private watcher: FSWatcher | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastMessageId: number = 0;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private processedGuids: Set<string> = new Set();
  private isRunning: boolean = false;

  constructor(dbPath?: string) {
    super();
    this.dbPath = dbPath || path.join(process.env.HOME || '', 'Library/Messages/chat.db');
  }

  /**
   * Initialize database connection and get last message ID
   */
  async init(): Promise<boolean> {
    try {
      this.db = new Database(this.dbPath, { readonly: true });

      // Get the latest message ID to start from
      const result = this.db.prepare('SELECT MAX(ROWID) as maxId FROM message').get() as { maxId: number };
      this.lastMessageId = result?.maxId || 0;

      logger.info('MessagePoller initialized', {
        dbPath: this.dbPath,
        lastMessageId: this.lastMessageId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize MessagePoller', { error });
      return false;
    }
  }

  /**
   * Start polling for new messages
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('MessagePoller already running');
      return;
    }

    this.isRunning = true;

    // Watch for file changes (fast detection)
    this.watcher = watch(this.dbPath, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        // Debounce rapid changes
        if (this.debounceTimeout) {
          clearTimeout(this.debounceTimeout);
        }
        this.debounceTimeout = setTimeout(() => this.pollMessages(), 300);
      }
    });

    // Also poll periodically as fallback
    this.pollInterval = setInterval(() => this.pollMessages(), 3000);

    logger.info('MessagePoller started watching for new messages');
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isRunning = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    logger.info('MessagePoller stopped');
  }

  /**
   * Poll for new messages
   */
  private pollMessages(): void {
    if (!this.db || !this.isRunning) return;

    try {
      const messages = this.db.prepare(MESSAGE_QUERY).all(this.lastMessageId) as MessageRow[];

      for (const row of messages) {
        // Skip if already processed (dedup)
        if (this.processedGuids.has(row.guid)) {
          continue;
        }

        // Update last message ID
        if (row.id > this.lastMessageId) {
          this.lastMessageId = row.id;
        }

        // Mark as processed
        this.processedGuids.add(row.guid);

        // Keep set size manageable
        if (this.processedGuids.size > 5000) {
          const toRemove = Array.from(this.processedGuids).slice(0, 1000);
          toRemove.forEach(guid => this.processedGuids.delete(guid));
        }

        // Emit processed message
        const processed = this.processMessage(row);
        this.emit('new_message', processed);
      }
    } catch (error) {
      logger.error('Error polling messages', { error });
    }
  }

  /**
   * Convert raw message row to processed format
   */
  private processMessage(row: MessageRow): ProcessedMessage {
    // Convert Apple timestamp to Unix timestamp
    const unixTimestamp = row.date / 1000000000 + APPLE_EPOCH_OFFSET;
    const date = new Date(unixTimestamp * 1000);

    return {
      guid: row.guid,
      text: row.text,
      handle: row.handle,
      chat: row.chat_identifier || row.handle || 'unknown',
      is_from_me: row.is_from_me === 1,
      date: unixTimestamp,
      timestamp: date.toISOString(),
    };
  }
}

export default MessagePoller;
