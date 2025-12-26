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
  ContentGenerationOptions,
  ContentGenerator,
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
// OPENROUTER INTEGRATION (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Client
  OpenRouterClient,
  createOpenRouterClient,
  type OpenRouterConfig,
  type GenerateOptions,
  type ImageGenerateOptions,

  // Web Search
  WebSearchTool,
  createWebSearchTool,
  type WebSearchConfig,

  // Tool Definitions
  WEB_SEARCH_TOOL,
  getProactiveTools,
  getEnabledTools,
  TOOL_NAMES,
  type ToolName
} from './openrouter/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE GENERATOR (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ProactiveGenerator,
  createProactiveGenerator,
  type ProactiveGeneratorConfig,
  type GenerationOptions
} from './ProactiveGenerator.js';

export {
  AgentProactiveGenerator,
  createAgentProactiveGenerator,
  type AgentProactiveGeneratorConfig,
  type GenerationOptions as AgentGenerationOptions
} from './AgentProactiveGenerator.js';

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Main Generator
  ImageGenerator,
  createImageGenerator,
  type ImageGeneratorConfig as ImageGeneratorFullConfig,
  type ImageGenerationOptions,
  type ImageGenerationResult,

  // Storage
  ImageStorage,
  createImageStorage,
  type ImageStorageConfig,
  type SavedImage,
  type StorageStats,

  // Photos.app Integration
  PhotosLibrary,
  createPhotosLibrary,
  type PhotosLibraryConfig,
  type ImportResult
} from './image/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  GiftScheduler,
  createGiftScheduler,
  type ManualTriggerOptions
} from './GiftScheduler.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LANGCHAIN AGENTS (Phase 3 - LangChain/LangGraph Integration)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type SerperSearchResult,
  type DailyGiftAgentState,
  type DailyGiftInput,
  type DailyGiftOutput,
  type DailyGiftAgentConfig,
  type ImagePromptAgentConfig,
  type ImagePromptContext,

  // Agents
  DailyGiftAgent,
  createDailyGiftAgent,
  ImagePromptAgent,
  createImagePromptAgent
} from './agents/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SERPER TOOL (Phase 4 - Serper Integration)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  createSerperTool,
  parseSerperResponse,
  type SerperToolConfig
} from './tools/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FUTURE EXPORTS (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════════

// Note: Additional exports will be added as Phase 5 components are implemented:
// - ReplyHandler (Phase 5)
