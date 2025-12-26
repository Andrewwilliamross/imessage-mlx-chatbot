/**
 * Family Daily Gift System - Unified Entry Point
 *
 * Combined entry point for the iMessage chatbot system with:
 * - Reply Chatbot: Responds to incoming iMessages using MLX local inference
 * - Gift Scheduler: Sends proactive daily messages using OpenRouter/Serper
 *
 * Usage:
 *   npm start                     - Run both chatbot and gift scheduler
 *   npm start -- --mode=chatbot   - Run only the reply chatbot
 *   npm start -- --mode=gift      - Run only the gift scheduler
 *   npm start -- --dry-run        - Gift scheduler in dry run mode
 *   npm start -- --preview dad    - Preview gift message for dad
 *   npm start -- --manual dad     - Manually send gift to dad
 */

import 'dotenv/config';
import logger from './utils/logger.js';

// Chatbot imports
import { ChatbotHandler, ChatbotConfig, MessagePoller } from './chatbot/index.js';
import ConversationService from './services/ConversationService.js';

// Gift system imports
import {
  GiftScheduler,
  AgentProactiveGenerator,
  ProfileLoader,
  PromptLoader,
  type GiftSystemConfig,
  type AgentProactiveGeneratorConfig
} from './gift-system/index.js';

// Shared imports
import MessageService from './services/MessageService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

type RunMode = 'all' | 'chatbot' | 'gift';

interface ParsedArgs {
  mode: RunMode;
  dryRun: boolean;
  manual: boolean;
  preview: boolean;
  memberId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // Determine mode
  let mode: RunMode = 'all';
  const modeArg = args.find(a => a.startsWith('--mode='));
  if (modeArg) {
    const modeValue = modeArg.split('=')[1] as RunMode;
    if (['all', 'chatbot', 'gift'].includes(modeValue)) {
      mode = modeValue;
    }
  }

  // Gift system flags
  const dryRun = args.includes('--dry-run');
  const manual = args.includes('--manual');
  const preview = args.includes('--preview');

  // Member ID for preview/manual
  let memberId: string | undefined;
  const memberArg = args.find(a => a.startsWith('--member='));
  if (memberArg) {
    memberId = memberArg.split('=')[1];
  } else {
    memberId = args.find(a => !a.startsWith('--'));
  }

  return { mode, dryRun, manual, preview, memberId };
}

function loadChatbotConfig(): ChatbotConfig {
  return {
    enabled: process.env.CHATBOT_ENABLED === 'true',
    mlxApiUrl: process.env.MLX_API_URL || 'http://localhost:8000',
    allowedContacts: (process.env.ALLOWED_CONTACTS || '')
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0),
    systemPrompt:
      process.env.SYSTEM_PROMPT ||
      'You are a helpful AI assistant responding via iMessage. Keep responses concise and conversational.',
    maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10', 10),
    maxTokens: parseInt(process.env.MAX_TOKENS || '512', 10),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    requestTimeout: parseInt(process.env.MLX_REQUEST_TIMEOUT || '60000', 10),
    responseCooldown: parseInt(process.env.RESPONSE_COOLDOWN || '2000', 10),
    profilesPath: process.env.FAMILY_PROFILES_PATH || './config/family-profiles.json',
    promptsPath: process.env.PROMPTS_PATH || './prompts',
  };
}

function loadGiftConfig(dryRun: boolean): {
  generatorConfig: AgentProactiveGeneratorConfig;
  systemConfig: GiftSystemConfig;
} {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required for gift system');
  }

  const serperApiKey = process.env.SERPER_API_KEY;

  const generatorConfig: AgentProactiveGeneratorConfig = {
    openRouterApiKey,
    openRouterModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    openRouterMaxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS ?? '1024', 10),
    openRouterTemperature: parseFloat(process.env.OPENROUTER_TEMPERATURE ?? '0.7'),
    serperApiKey,
    maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS ?? '5', 10),
    imageEnabled: process.env.IMAGE_ENABLED !== 'false',
    imageModel: process.env.IMAGE_MODEL ?? 'black-forest-labs/flux-1.1-pro',
    imageStoragePath: process.env.IMAGE_STORAGE_PATH ?? '~/Pictures/FamilyGifts',
    photosEnabled: process.env.PHOTOS_ENABLED !== 'false',
    photosAlbumName: process.env.PHOTOS_ALBUM_NAME ?? 'Family Daily Gifts',
    mlxApiUrl: process.env.MLX_API_URL ?? 'http://localhost:8000',
    mlxTimeout: parseInt(process.env.MLX_TIMEOUT ?? '60000', 10),
    promptsPath: process.env.PROMPTS_PATH ?? './prompts',
    enableFallback: process.env.ENABLE_FALLBACK !== 'false'
  };

  const systemConfig: GiftSystemConfig = {
    enabled: true,
    profilesPath: process.env.FAMILY_PROFILES_PATH ?? './config/family-profiles.json',
    promptsPath: process.env.PROMPTS_PATH ?? './prompts',
    openRouterApiKey,
    openRouterModel: generatorConfig.openRouterModel!,
    webSearchProvider: 'serp',
    webSearchApiKey: serperApiKey ?? '',
    imageModel: generatorConfig.imageModel!,
    imageSavePath: generatorConfig.imageStoragePath!,
    photosAlbumName: generatorConfig.photosAlbumName!,
    photosEnabled: generatorConfig.photosEnabled!,
    mlxApiUrl: generatorConfig.mlxApiUrl,
    dryRun,
    testRecipient: process.env.TEST_RECIPIENT
  };

  return { generatorConfig, systemConfig };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHATBOT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

async function startChatbot(
  messageService: MessageService,
  profileLoader: ProfileLoader,
  promptLoader: PromptLoader
): Promise<{ poller: MessagePoller; handler: ChatbotHandler }> {
  const config = loadChatbotConfig();

  if (!config.enabled) {
    throw new Error('Chatbot disabled. Set CHATBOT_ENABLED=true');
  }

  if (config.allowedContacts.length === 0) {
    throw new Error('No ALLOWED_CONTACTS configured');
  }

  // Initialize ConversationService
  logger.info('Initializing ConversationService...');
  const conversationService = new ConversationService();

  // Initialize MessagePoller
  logger.info('Initializing MessagePoller...');
  const messagePoller = new MessagePoller();
  const pollerInitialized = await messagePoller.init();
  if (!pollerInitialized) {
    throw new Error('MessagePoller initialization failed');
  }

  // Test MLX API connection
  logger.info('Testing MLX API connection...');
  try {
    const testResponse = await fetch(`${config.mlxApiUrl}/health`);
    if (!testResponse.ok) {
      throw new Error(`MLX API health check failed: ${testResponse.status}`);
    }
    logger.info('MLX API connected');
  } catch (error) {
    logger.error('Failed to connect to MLX API', { error, url: config.mlxApiUrl });
    throw new Error('MLX API connection failed');
  }

  // Build full config with loaders
  const fullConfig: ChatbotConfig = {
    ...config,
    profileLoader,
    promptLoader
  };

  // Initialize ChatbotHandler
  logger.info('Initializing ChatbotHandler...');
  const chatbot = new ChatbotHandler(
    messagePoller,
    messageService,
    conversationService,
    fullConfig
  );

  // Start polling
  messagePoller.start();
  logger.info('Chatbot started', {
    allowedContacts: config.allowedContacts.length
  });

  return { poller: messagePoller, handler: chatbot };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GIFT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

async function startGiftScheduler(
  messageService: MessageService,
  profileLoader: ProfileLoader,
  args: ParsedArgs
): Promise<GiftScheduler | null> {
  const { generatorConfig, systemConfig } = loadGiftConfig(args.dryRun);

  logger.info('Gift system configuration', {
    openRouterModel: generatorConfig.openRouterModel,
    serperEnabled: !!generatorConfig.serperApiKey,
    imageEnabled: generatorConfig.imageEnabled,
    dryRun: systemConfig.dryRun
  });

  // Initialize AgentProactiveGenerator
  logger.info('Initializing AgentProactiveGenerator...');
  const generator = new AgentProactiveGenerator(generatorConfig);
  await generator.initialize();

  // Test connections
  logger.info('Testing connections...');
  const connections = await generator.testConnections();
  logger.info('Connection status', connections);

  // Initialize GiftScheduler
  const scheduler = new GiftScheduler(generator, profileLoader, messageService, systemConfig);

  // Handle preview mode
  if (args.preview) {
    if (!args.memberId) {
      throw new Error('--preview requires a member ID');
    }
    const result = await scheduler.preview(args.memberId);
    logGiftResult('PREVIEW', result);
    return null; // Exit after preview
  }

  // Handle manual mode
  if (args.manual) {
    if (!args.memberId) {
      throw new Error('--manual requires a member ID');
    }
    const result = await scheduler.triggerManual(args.memberId, { dryRun: args.dryRun });
    logGiftResult('SEND', result);
    return null; // Exit after manual send
  }

  // Start the scheduler
  await scheduler.start();

  // Log schedule
  const status = scheduler.getStatus();
  logger.info('Gift scheduler started', {
    jobs: status.length,
    dryRun: systemConfig.dryRun
  });

  for (const s of status) {
    logger.info(`  ${s.memberName}: Next run at ${s.nextRun?.toLocaleString() ?? 'not scheduled'}`);
  }

  return scheduler;
}

function logGiftResult(type: string, result: import('./gift-system/types.js').DailyGiftResult): void {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`${type} RESULT`);
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info(`Member: ${result.memberName}`);
  logger.info(`Theme: ${result.theme}`);
  logger.info(`Success: ${result.success}`);
  if (result.error) {
    logger.error(`Error: ${result.error}`);
  }
  if (result.content.text) {
    logger.info('---');
    logger.info('MESSAGE:');
    logger.info(result.content.text);
    logger.info('---');
    logger.info(`Model: ${result.content.model}`);
    logger.info(`Tokens: ${result.content.tokensUsed}`);
    logger.info(`Tools: ${result.content.toolsInvoked.join(', ') || 'none'}`);
    logger.info(`Has Image: ${!!result.content.image}`);
    logger.info(`Fallback Used: ${result.content.fallbackUsed}`);
  }
  logger.info('═══════════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       FAMILY IMESSAGE SYSTEM - STARTING                        ');
  logger.info('═══════════════════════════════════════════════════════════════');

  const args = parseArgs();
  logger.info('Mode:', { mode: args.mode, dryRun: args.dryRun });

  try {
    // Shared services
    logger.info('Initializing MessageService...');
    const messageService = new MessageService();

    logger.info('Testing Messages.app access...');
    const accessTest = await messageService.testAccess();
    if (!accessTest.success) {
      throw new Error(`Messages.app access failed: ${accessTest.error}`);
    }
    logger.info('Messages.app access verified');

    // Shared loaders
    const profilesPath = process.env.FAMILY_PROFILES_PATH ?? './config/family-profiles.json';
    const promptsPath = process.env.PROMPTS_PATH ?? './prompts';

    logger.info('Initializing ProfileLoader...');
    const profileLoader = new ProfileLoader(profilesPath);
    await profileLoader.load();
    const members = await profileLoader.getAllMembers();
    logger.info('ProfileLoader initialized', { membersLoaded: members.length });

    logger.info('Initializing PromptLoader...');
    const promptLoader = new PromptLoader(promptsPath);
    await promptLoader.load();
    logger.info('PromptLoader initialized');

    // Track running systems for shutdown
    let chatbotPoller: MessagePoller | undefined;
    let giftScheduler: GiftScheduler | undefined;

    // Start systems based on mode
    if (args.mode === 'all' || args.mode === 'chatbot') {
      try {
        const chatbot = await startChatbot(messageService, profileLoader, promptLoader);
        chatbotPoller = chatbot.poller;

        // Log stats periodically
        setInterval(() => {
          const stats = chatbot.handler.getStats();
          if (stats.messagesReceived > 0) {
            logger.info('Chatbot stats', stats as unknown as Record<string, unknown>);
          }
        }, 60000);
      } catch (error) {
        if (args.mode === 'chatbot') {
          throw error;
        }
        logger.warn('Chatbot failed to start, continuing with gift system only', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (args.mode === 'all' || args.mode === 'gift') {
      try {
        const scheduler = await startGiftScheduler(messageService, profileLoader, args);

        // If preview/manual, exit after result
        if (!scheduler) {
          process.exit(0);
        }

        giftScheduler = scheduler;
      } catch (error) {
        if (args.mode === 'gift') {
          throw error;
        }
        logger.warn('Gift system failed to start, continuing with chatbot only', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Check if anything is running
    if (!chatbotPoller && !giftScheduler) {
      throw new Error('No systems could be started');
    }

    // Graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down...');
      if (chatbotPoller) {
        chatbotPoller.stop();
      }
      if (giftScheduler) {
        giftScheduler.shutdown();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('       FAMILY IMESSAGE SYSTEM - RUNNING                         ');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('Press Ctrl+C to stop');

    if (args.dryRun) {
      logger.info('DRY RUN MODE - Messages will be logged but not sent');
    }

  } catch (error) {
    logger.error('Fatal error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Run
main().catch(error => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});
