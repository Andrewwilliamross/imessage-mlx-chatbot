/**
 * Gift System Main Entry Point
 *
 * Proactive daily message system that sends personalized
 * messages to family members on a schedule.
 *
 * Usage:
 *   npm run gift:start         - Start the scheduler
 *   npm run gift:dry-run       - Start with dry run mode
 *   npm run gift:preview dad   - Preview message for dad
 *   npm run gift:send dad      - Send message to dad now
 */

import 'dotenv/config';
import logger from './utils/logger.js';
import {
  GiftScheduler,
  AgentProactiveGenerator,
  ProfileLoader,
  type GiftSystemConfig,
  type AgentProactiveGeneratorConfig
} from './gift-system/index.js';
import MessageService from './services/MessageService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

function loadConfig(): {
  generatorConfig: AgentProactiveGeneratorConfig;
  systemConfig: GiftSystemConfig;
  memberId: string | undefined;
  dryRun: boolean;
  manual: boolean;
  preview: boolean;
} {
  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const manual = args.includes('--manual');
  const preview = args.includes('--preview');

  // Get member ID from args (e.g., --member=dad or just "dad")
  let memberId: string | undefined;
  const memberArg = args.find(a => a.startsWith('--member='));
  if (memberArg) {
    memberId = memberArg.split('=')[1];
  } else {
    // Check for positional arg that isn't a flag
    memberId = args.find(a => !a.startsWith('--'));
  }

  // Validate required env vars
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    logger.error('OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  // Serper API key for web search (replaces multi-provider approach)
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    logger.warn('SERPER_API_KEY not set, web search will be disabled');
  }

  // Build generator config (using LangChain agent-based generator)
  const generatorConfig: AgentProactiveGeneratorConfig = {
    // OpenRouter
    openRouterApiKey,
    openRouterModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    openRouterMaxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS ?? '1024', 10),
    openRouterTemperature: parseFloat(process.env.OPENROUTER_TEMPERATURE ?? '0.7'),

    // Serper web search
    serperApiKey,
    maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS ?? '5', 10),

    // Image generation
    imageEnabled: process.env.IMAGE_ENABLED !== 'false',
    imageModel: process.env.IMAGE_MODEL ?? 'black-forest-labs/flux-1.1-pro',
    imageStoragePath: process.env.IMAGE_STORAGE_PATH ?? '~/Pictures/FamilyGifts',
    photosEnabled: process.env.PHOTOS_ENABLED !== 'false',
    photosAlbumName: process.env.PHOTOS_ALBUM_NAME ?? 'Family Daily Gifts',

    // MLX fallback
    mlxApiUrl: process.env.MLX_API_URL ?? 'http://localhost:8000',
    mlxTimeout: parseInt(process.env.MLX_TIMEOUT ?? '60000', 10),

    // Prompts
    promptsPath: process.env.PROMPTS_PATH ?? './prompts',

    // Behavior
    enableFallback: process.env.ENABLE_FALLBACK !== 'false'
  };

  // Build system config
  const systemConfig: GiftSystemConfig = {
    enabled: true,
    profilesPath: process.env.FAMILY_PROFILES_PATH ?? './config/family-profiles.json',
    promptsPath: process.env.PROMPTS_PATH ?? './prompts',
    openRouterApiKey,
    openRouterModel: generatorConfig.openRouterModel!,
    webSearchProvider: 'serp', // Using Serper for web search
    webSearchApiKey: serperApiKey ?? '',
    imageModel: generatorConfig.imageModel!,
    imageSavePath: generatorConfig.imageStoragePath!,
    photosAlbumName: generatorConfig.photosAlbumName!,
    photosEnabled: generatorConfig.photosEnabled!,
    mlxApiUrl: generatorConfig.mlxApiUrl,
    dryRun,
    testRecipient: process.env.TEST_RECIPIENT
  };

  return { generatorConfig, systemConfig, memberId, dryRun, manual, preview };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       FAMILY DAILY GIFT SYSTEM - STARTING                     ');
  logger.info('═══════════════════════════════════════════════════════════════');

  const { generatorConfig, systemConfig, memberId, dryRun, manual, preview } = loadConfig();

  logger.info('Configuration', {
    openRouterModel: generatorConfig.openRouterModel,
    serperEnabled: !!generatorConfig.serperApiKey,
    imageEnabled: generatorConfig.imageEnabled,
    photosEnabled: generatorConfig.photosEnabled,
    dryRun: systemConfig.dryRun,
    testRecipient: systemConfig.testRecipient ?? 'none'
  });

  try {
    // Initialize MessageService
    logger.info('Initializing MessageService...');
    const messageService = new MessageService();

    // Test Messages.app access
    logger.info('Testing Messages.app access...');
    const accessTest = await messageService.testAccess();
    if (!accessTest.success) {
      logger.error('Messages.app access test failed', { error: accessTest.error });
      process.exit(1);
    }
    logger.info('Messages.app access verified');

    // Initialize ProfileLoader
    logger.info('Initializing ProfileLoader...');
    const profileLoader = new ProfileLoader(systemConfig.profilesPath);
    await profileLoader.load();

    // Initialize AgentProactiveGenerator (LangChain-based with Serper)
    logger.info('Initializing AgentProactiveGenerator...');
    const generator = new AgentProactiveGenerator(generatorConfig);
    await generator.initialize();

    // Test connections
    logger.info('Testing connections...');
    const connections = await generator.testConnections();
    logger.info('Connection status', connections);

    if (!connections.openRouter) {
      logger.warn('OpenRouter connection failed, will use MLX fallback if available');
    }

    // Initialize GiftScheduler
    logger.info('Initializing GiftScheduler...');
    const scheduler = new GiftScheduler(generator, profileLoader, messageService, systemConfig);

    // ═══════════════════════════════════════════════════════════════════
    // HANDLE CLI COMMANDS
    // ═══════════════════════════════════════════════════════════════════

    // Preview mode
    if (preview) {
      if (!memberId) {
        logger.error('--preview requires a member ID (e.g., --preview --member=dad or --preview dad)');
        process.exit(1);
      }

      logger.info(`Generating preview for ${memberId}...`);
      const result = await scheduler.preview(memberId);

      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('PREVIEW RESULT');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info(`Member: ${result.memberName}`);
      logger.info(`Theme: ${result.theme}`);
      logger.info(`Success: ${result.success}`);
      if (result.error) {
        logger.error(`Error: ${result.error}`);
      }
      logger.info('---');
      logger.info('MESSAGE:');
      logger.info(result.content.text);
      logger.info('---');
      logger.info(`Model: ${result.content.model}`);
      logger.info(`Tokens: ${result.content.tokensUsed}`);
      logger.info(`Tools: ${result.content.toolsInvoked.join(', ') || 'none'}`);
      logger.info(`Has Image: ${!!result.content.image}`);
      if (result.content.image) {
        logger.info(`Image Path: ${result.content.image.localPath}`);
      }
      logger.info(`Fallback Used: ${result.content.fallbackUsed}`);
      logger.info('═══════════════════════════════════════════════════════════════');

      process.exit(result.success ? 0 : 1);
    }

    // Manual send mode
    if (manual) {
      if (!memberId) {
        logger.error('--manual requires a member ID (e.g., --manual --member=dad or --manual dad)');
        process.exit(1);
      }

      logger.info(`Sending manual gift to ${memberId}...`);
      const result = await scheduler.triggerManual(memberId, { dryRun });

      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('SEND RESULT');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info(`Member: ${result.memberName}`);
      logger.info(`Theme: ${result.theme}`);
      logger.info(`Success: ${result.success}`);
      logger.info(`Delivery Status: ${result.deliveryStatus ?? 'N/A'}`);
      if (result.error) {
        logger.error(`Error: ${result.error}`);
      }
      logger.info('═══════════════════════════════════════════════════════════════');

      process.exit(result.success ? 0 : 1);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SCHEDULER MODE (Default)
    // ═══════════════════════════════════════════════════════════════════

    // Start the scheduler
    await scheduler.start();

    // Log the schedule
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('SCHEDULE');
    logger.info('═══════════════════════════════════════════════════════════════');
    const status = scheduler.getStatus();
    for (const s of status) {
      logger.info(`  ${s.memberName}: Next run at ${s.nextRun?.toLocaleString() ?? 'not scheduled'}`);
    }
    logger.info('═══════════════════════════════════════════════════════════════');

    if (dryRun) {
      logger.info('DRY RUN MODE - Messages will be logged but not sent');
    }

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('       FAMILY DAILY GIFT SYSTEM - RUNNING                      ');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('Press Ctrl+C to stop');

    // Graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down...');
      scheduler.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('Fatal error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Run
main();
