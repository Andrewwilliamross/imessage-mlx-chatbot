/**
 * ChatbotHandler - Core chatbot logic
 *
 * Listens for new iMessage events, filters based on whitelist,
 * builds context, calls MLX API, and sends responses.
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import MLXClient from './MLXClient.js';
import { ChatbotConfig, MLXMessage, ChatbotStats } from './types.js';
import { ProfileLoader } from '../gift-system/config/ProfileLoader.js';
import { PromptLoader } from '../gift-system/config/PromptLoader.js';
import type { FamilyMember } from '../gift-system/types.js';

// Import types from relay services
interface ProcessedMessage {
  guid: string;
  text: string | null;
  handle: string | null;
  chat: string;
  is_from_me: boolean;
  date: number;
  timestamp: string;
  attachments?: unknown[];
}

interface FormattedMessage {
  text: string | null;
  isFromMe: boolean;
  timestamp: Date;
}

interface MessageSyncInterface extends EventEmitter {
  on(event: 'new_message', listener: (message: ProcessedMessage) => void): this;
}

interface ConversationServiceInterface {
  getMessages(chatIdentifier: string, limit: number): FormattedMessage[];
}

interface MessageServiceInterface {
  sendMessage(recipient: string, text: string): Promise<{ success: boolean; error?: string }>;
}

export class ChatbotHandler {
  private mlxClient: MLXClient;
  private messageSync: MessageSyncInterface;
  private messageService: MessageServiceInterface;
  private conversationService: ConversationServiceInterface;
  private config: ChatbotConfig;
  private stats: ChatbotStats;
  private lastResponseTime: Map<string, number> = new Map();
  private processingQueue: Set<string> = new Set();
  private profileLoader: ProfileLoader | null = null;
  private promptLoader: PromptLoader | null = null;

  constructor(
    messageSync: MessageSyncInterface,
    messageService: MessageServiceInterface,
    conversationService: ConversationServiceInterface,
    config: ChatbotConfig
  ) {
    this.messageSync = messageSync;
    this.messageService = messageService;
    this.conversationService = conversationService;
    this.config = config;

    this.mlxClient = new MLXClient(config.mlxApiUrl, config.requestTimeout);

    // Store profile and prompt loaders if provided
    this.profileLoader = config.profileLoader ?? null;
    this.promptLoader = config.promptLoader ?? null;

    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesIgnored: 0,
      responsesSent: 0,
      errors: 0,
      averageResponseTimeMs: 0,
      lastActivityTimestamp: null,
    };

    if (config.enabled) {
      this.setupListeners();
      logger.info('ChatbotHandler initialized', {
        mlxApiUrl: config.mlxApiUrl,
        allowedContacts: config.allowedContacts.length,
        maxContextMessages: config.maxContextMessages,
        hasProfileLoader: !!this.profileLoader,
        hasPromptLoader: !!this.promptLoader,
      });
    } else {
      logger.info('ChatbotHandler disabled by configuration');
    }
  }

  /**
   * Set up event listeners for new messages
   */
  private setupListeners(): void {
    this.messageSync.on('new_message', (message: ProcessedMessage) => {
      this.handleMessage(message).catch((error) => {
        logger.error('Error in message handler', { error, messageGuid: message.guid });
        this.stats.errors++;
      });
    });

    logger.info('ChatbotHandler listening for new_message events');
  }

  /**
   * Main message handler
   */
  private async handleMessage(message: ProcessedMessage): Promise<void> {
    this.stats.messagesReceived++;
    this.stats.lastActivityTimestamp = new Date().toISOString();

    // Ignore our own messages (prevent loops)
    if (message.is_from_me) {
      logger.debug('Ignoring own message', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Get sender identifier
    const sender = message.handle || message.chat;
    if (!sender) {
      logger.warn('Message has no sender identifier', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Check whitelist
    if (!this.isAllowedContact(sender)) {
      logger.debug('Ignoring message from non-whitelisted contact', { sender });
      this.stats.messagesIgnored++;
      return;
    }

    // Check cooldown
    if (this.isInCooldown(sender)) {
      logger.debug('Ignoring message during cooldown period', { sender });
      this.stats.messagesIgnored++;
      return;
    }

    // Prevent duplicate processing
    if (this.processingQueue.has(message.guid)) {
      logger.debug('Message already being processed', { guid: message.guid });
      return;
    }

    // Skip empty messages
    if (!message.text?.trim()) {
      logger.debug('Ignoring empty message', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Process the message
    this.processingQueue.add(message.guid);
    const startTime = Date.now();

    try {
      // Resolve sender to family member for personalized responses
      const member = await this.resolveMember(sender);

      logger.info('Processing message from whitelisted contact', {
        sender,
        memberId: member?.id ?? 'unknown',
        memberName: member?.name ?? 'unknown',
        textPreview: message.text.substring(0, 50),
        guid: message.guid,
      });

      // Build context - use personalized prompt for family members
      let context: MLXMessage[];
      if (member) {
        context = await this.buildPersonalizedContext(message.chat, member);
      } else {
        context = this.buildContext(message.chat);
      }

      // Add the new message
      const messages: MLXMessage[] = [
        ...context,
        { role: 'user', content: message.text },
      ];

      // Call MLX API
      const response = await this.mlxClient.generate({
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      // Send response
      const result = await this.messageService.sendMessage(sender, response.response);

      if (result.success) {
        const elapsed = Date.now() - startTime;
        this.stats.responsesSent++;
        this.stats.messagesProcessed++;
        this.updateAverageResponseTime(elapsed);
        this.lastResponseTime.set(sender, Date.now());

        logger.info('Successfully sent chatbot response', {
          sender,
          responseLength: response.response.length,
          tokensGenerated: response.tokens_generated,
          generationTimeMs: response.generation_time_ms,
          totalTimeMs: elapsed,
        });
      } else {
        logger.error('Failed to send response', { sender, error: result.error });
        this.stats.errors++;
      }
    } catch (error) {
      logger.error('Failed to process message', { error, sender, guid: message.guid });
      this.stats.errors++;
    } finally {
      this.processingQueue.delete(message.guid);
    }
  }

  /**
   * Check if sender is in the allowed contacts list
   */
  private isAllowedContact(sender: string): boolean {
    const normalizedSender = this.normalizeContact(sender);

    return this.config.allowedContacts.some((allowed) => {
      const normalizedAllowed = this.normalizeContact(allowed);
      return (
        normalizedSender.includes(normalizedAllowed) ||
        normalizedAllowed.includes(normalizedSender)
      );
    });
  }

  /**
   * Normalize contact identifier for comparison
   */
  private normalizeContact(contact: string): string {
    // Remove all non-alphanumeric characters and lowercase
    return contact.replace(/[^a-zA-Z0-9@.]/g, '').toLowerCase();
  }

  /**
   * Resolve a phone number to a family member using ProfileLoader
   */
  private async resolveMember(sender: string): Promise<FamilyMember | undefined> {
    if (!this.profileLoader) {
      return undefined;
    }

    try {
      const member = await this.profileLoader.getMemberByPhone(sender);
      if (member) {
        logger.debug('Resolved sender to family member', {
          sender,
          memberId: member.id,
          memberName: member.name,
        });
      }
      return member;
    } catch (error) {
      logger.warn('Failed to resolve family member', { sender, error });
      return undefined;
    }
  }

  /**
   * Build personalized context for a family member using their reply prompt
   */
  private async buildPersonalizedContext(
    chatIdentifier: string,
    member: FamilyMember
  ): Promise<MLXMessage[]> {
    // Build prompt context from member profile
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const fullDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Build full PromptContext as required by the type
    const promptContext = {
      name: member.name,
      dayOfWeek,
      fullDate,
      webSearchEnabled: member.webSearchEnabled,
      imageEnabled: member.imageEnabled,
      interests: member.interests,
      searchHint: member.searchHint,
    };

    let systemPrompt: string;

    if (this.promptLoader) {
      try {
        systemPrompt = await this.promptLoader.buildReplyPrompt(member.id, promptContext);
        logger.debug('Built personalized reply prompt', {
          memberId: member.id,
          promptLength: systemPrompt.length,
        });
      } catch (error) {
        logger.warn('Failed to build personalized prompt, using fallback', {
          memberId: member.id,
          error,
        });
        systemPrompt = this.config.systemPrompt;
      }
    } else {
      systemPrompt = this.config.systemPrompt;
    }

    const messages: MLXMessage[] = [{ role: 'system', content: systemPrompt }];

    try {
      const history = this.conversationService.getMessages(
        chatIdentifier,
        this.config.maxContextMessages
      );

      const contextMessages = history
        .slice()
        .reverse()
        .slice(0, this.config.maxContextMessages - 1)
        .map((msg): MLXMessage => ({
          role: msg.isFromMe ? 'assistant' : 'user',
          content: msg.text || '',
        }))
        .filter((msg) => msg.content.trim().length > 0);

      messages.push(...contextMessages);
    } catch (error) {
      logger.warn('Failed to fetch conversation context', { error, chatIdentifier });
    }

    return messages;
  }

  /**
   * Check if sender is in cooldown period
   */
  private isInCooldown(sender: string): boolean {
    const lastResponse = this.lastResponseTime.get(sender);
    if (!lastResponse) return false;

    return Date.now() - lastResponse < this.config.responseCooldown;
  }

  /**
   * Build conversation context from history
   */
  private buildContext(chatIdentifier: string): MLXMessage[] {
    const messages: MLXMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
    ];

    try {
      const history = this.conversationService.getMessages(
        chatIdentifier,
        this.config.maxContextMessages
      );

      // Convert history to MLX message format (oldest first)
      const contextMessages = history
        .slice()
        .reverse()
        .slice(0, this.config.maxContextMessages - 1) // Leave room for new message
        .map((msg): MLXMessage => ({
          role: msg.isFromMe ? 'assistant' : 'user',
          content: msg.text || '',
        }))
        .filter((msg) => msg.content.trim().length > 0);

      messages.push(...contextMessages);
    } catch (error) {
      logger.warn('Failed to fetch conversation context', { error, chatIdentifier });
    }

    return messages;
  }

  /**
   * Update running average response time
   */
  private updateAverageResponseTime(newTime: number): void {
    const totalResponses = this.stats.responsesSent;
    const currentAvg = this.stats.averageResponseTimeMs;

    this.stats.averageResponseTimeMs = Math.round(
      (currentAvg * (totalResponses - 1) + newTime) / totalResponses
    );
  }

  /**
   * Get current stats
   */
  getStats(): ChatbotStats {
    return { ...this.stats };
  }

  /**
   * Check if MLX API is healthy
   */
  async checkHealth(): Promise<boolean> {
    return this.mlxClient.testConnection();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<ChatbotConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.mlxApiUrl) {
      this.mlxClient = new MLXClient(
        newConfig.mlxApiUrl,
        newConfig.requestTimeout || this.config.requestTimeout
      );
    }

    logger.info('ChatbotHandler configuration updated', newConfig);
  }
}

export default ChatbotHandler;
