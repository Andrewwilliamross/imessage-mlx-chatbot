/**
 * Chatbot Main Entry Point
 *
 * Standalone chatbot mode that polls iMessage for new messages
 * and responds using MLX-LM local inference.
 */

import 'dotenv/config';
import logger from './utils/logger.js';
import { ChatbotHandler, ChatbotConfig, MessagePoller } from './chatbot/index.js';
import MessageService from './services/MessageService.js';
import ConversationService from './services/ConversationService.js';
import { ProfileLoader } from './gift-system/config/ProfileLoader.js';
import { PromptLoader } from './gift-system/config/PromptLoader.js';

// Paths for profile and prompt loaders
const profilesPath = process.env.FAMILY_PROFILES_PATH || './config/family-profiles.json';
const promptsPath = process.env.PROMPTS_PATH || './prompts';

// Configuration from environment (profileLoader and promptLoader will be added after initialization)
const config: ChatbotConfig = {
  enabled: process.env.CHATBOT_ENABLED === 'true',
  mlxApiUrl: process.env.MLX_API_URL || 'http://localhost:8000',
  allowedContacts: (process.env.ALLOWED_CONTACTS || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0),
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    'You are a helpful AI assistant responding via iMessage. Keep responses concise and conversational.',
  maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10', 10),
  maxTokens: parseInt(process.env.MAX_TOKENS || '512', 10),
  temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
  requestTimeout: parseInt(process.env.MLX_REQUEST_TIMEOUT || '60000', 10),
  responseCooldown: parseInt(process.env.RESPONSE_COOLDOWN || '2000', 10),
  profilesPath,
  promptsPath,
};

async function main(): Promise<void> {
  logger.info('Starting iMessage MLX Chatbot');
  logger.info('Configuration', {
    enabled: config.enabled,
    mlxApiUrl: config.mlxApiUrl,
    allowedContacts: config.allowedContacts,
    maxContextMessages: config.maxContextMessages,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  if (!config.enabled) {
    logger.error('Chatbot is disabled. Set CHATBOT_ENABLED=true to enable.');
    process.exit(1);
  }

  if (config.allowedContacts.length === 0) {
    logger.error('No allowed contacts configured. Set ALLOWED_CONTACTS env var.');
    process.exit(1);
  }

  try {
    // Initialize ConversationService (connects to chat.db for history)
    logger.info('Initializing ConversationService...');
    const conversationService = new ConversationService();

    // Initialize MessageService (AppleScript handler for sending)
    logger.info('Initializing MessageService...');
    const messageService = new MessageService();

    // Test AppleScript access
    logger.info('Testing Messages.app access...');
    const accessTest = await messageService.testAccess();
    if (!accessTest.success) {
      logger.error('Messages.app access test failed', { error: accessTest.error });
      process.exit(1);
    }
    logger.info('Messages.app access verified');

    // Initialize MessagePoller (polls chat.db for new messages)
    logger.info('Initializing MessagePoller...');
    const messagePoller = new MessagePoller();
    const pollerInitialized = await messagePoller.init();
    if (!pollerInitialized) {
      logger.error('MessagePoller initialization failed');
      process.exit(1);
    }

    // Test MLX API connection
    logger.info('Testing MLX API connection...');
    try {
      const testResponse = await fetch(`${config.mlxApiUrl}/health`);
      if (!testResponse.ok) {
        logger.error('MLX API health check failed', { status: testResponse.status });
        process.exit(1);
      }
      const healthData = await testResponse.json() as Record<string, unknown>;
      logger.info('MLX API connected', healthData);
    } catch (error) {
      logger.error('Failed to connect to MLX API', { error, url: config.mlxApiUrl });
      logger.error('Make sure the MLX API server is running: cd mlx_api && ./run.sh');
      process.exit(1);
    }

    // Initialize ProfileLoader for family member resolution
    logger.info('Initializing ProfileLoader...');
    let profileLoader: ProfileLoader | undefined;
    try {
      profileLoader = new ProfileLoader(profilesPath);
      await profileLoader.load();
      const members = await profileLoader.getAllMembers();
      logger.info('ProfileLoader initialized', { membersLoaded: members.length });
    } catch (error) {
      logger.warn('Failed to load family profiles, personalization will be disabled', { error });
    }

    // Initialize PromptLoader for personalized reply prompts
    logger.info('Initializing PromptLoader...');
    let promptLoader: PromptLoader | undefined;
    try {
      promptLoader = new PromptLoader(promptsPath);
      await promptLoader.load();
      logger.info('PromptLoader initialized', { promptsPath });
    } catch (error) {
      logger.warn('Failed to initialize PromptLoader, personalization will be disabled', { error });
    }

    // Add loaders to config
    const fullConfig: ChatbotConfig = {
      ...config,
      profileLoader,
      promptLoader,
    };

    // Initialize ChatbotHandler
    logger.info('Initializing ChatbotHandler...');
    const chatbot = new ChatbotHandler(
      messagePoller,
      messageService,
      conversationService,
      fullConfig
    );

    // Start message polling
    logger.info('Starting message polling...');
    messagePoller.start();

    // Log stats periodically
    setInterval(() => {
      const stats = chatbot.getStats();
      if (stats.messagesReceived > 0) {
        logger.info('Chatbot stats', stats as unknown as Record<string, unknown>);
      }
    }, 60000);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down chatbot...');
      messagePoller.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('iMessage MLX Chatbot is running');
    logger.info(`Monitoring ${config.allowedContacts.length} allowed contacts`);

  } catch (error) {
    logger.error('Failed to start chatbot', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});
