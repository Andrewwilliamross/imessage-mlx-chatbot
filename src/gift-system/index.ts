/**
 * Family Daily Gift System - Module Exports
 *
 * This module provides personalized daily messages to family members
 * using a dual-model architecture:
 * - OpenRouter (Claude/GPT-4) for proactive daily messages with tools
 * - Local MLX for fast, private reply handling
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  // Family Member Configuration
  DayTheme,
  FamilyMemberConfig,
  FamilyMember,
  FamilyProfileDefaults,
  FamilyProfilesConfig,

  // Prompt Context
  PromptContext,
  CompiledTemplate,

  // Web Search
  WebSearchProvider,
  WebSearchResult,
  WebSearchArgs,

  // Image Generation
  GeneratedImage,
  ImageGeneratorConfig,

  // OpenRouter API
  OpenRouterTool,
  ToolCall,
  ChatMessage,
  OpenRouterUsage,
  OpenRouterResult,

  // Content Generation
  GeneratedContent,
  DailyGiftResult,

  // Gift System Configuration
  GiftSystemConfig,

  // Scheduler
  ScheduledJobStatus,
  SchedulerStats,

  // Reply Handling
  ConversationContext,
  ReplyHandlerConfig,

  // Special Occasions
  SpecialOccasion,

  // Utility Types
  OperationResult,
  LoaderStatus,
  ConfigLoader
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADERS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ProfileLoader,
  createProfileLoader
} from './config/ProfileLoader.js';

export {
  PromptLoader,
  createPromptLoader
} from './config/PromptLoader.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORTS (for convenience)
// ═══════════════════════════════════════════════════════════════════════════════

// Note: Additional exports will be added as Phase 2-5 components are implemented:
// - OpenRouterClient
// - WebSearchTool
// - ImageGenerator
// - GiftScheduler
// - ProactiveGenerator
