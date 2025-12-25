/**
 * Family Daily Gift System - Type Definitions
 *
 * This module defines all types and interfaces for the gift system,
 * following the established patterns in the codebase:
 * - Database row types → Processed types → Enhanced types
 * - JSDoc documentation for all interfaces
 * - Union types for status/enum-like fields
 * - Optional fields with ? notation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FAMILY MEMBER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Theme configuration for a specific day of the week
 * Each family member has 7 themes (one per day)
 */
export interface DayTheme {
  /** Display name of the theme (e.g., "Morning Devotional") */
  name: string;
  /** Template name to use for this theme (e.g., "devotional") */
  template: string;
  /** Web search query hint, null if no search needed */
  searchHint: string | null;
}

/**
 * Family member profile as stored in family-profiles.json
 * This is the raw configuration before processing
 */
export interface FamilyMemberConfig {
  /** Unique identifier (e.g., "dad", "mom") */
  id: string;
  /** Display name used in messages */
  name: string;
  /** Phone number in E.164 format (e.g., "+1XXXXXXXXXX") */
  phone: string;
  /** Send time in 24-hour format (e.g., "06:30") */
  sendTime: string;
  /** IANA timezone (e.g., "America/Chicago") */
  timezone: string;
  /** List of interests for personalization */
  interests: string[];
  /** Directory name for prompt templates */
  promptTemplate: string;
  /** Day-indexed themes (key: "0"-"6" for Sun-Sat) */
  themes: Record<string, DayTheme>;
  /** Image style prompts by template name */
  imageStyles: Record<string, string>;
  /** Override: enable proactive messages (inherits from defaults if not set) */
  proactiveEnabled?: boolean;
  /** Override: enable image generation (inherits from defaults if not set) */
  imageEnabled?: boolean;
  /** Override: enable web search (inherits from defaults if not set) */
  webSearchEnabled?: boolean;
}

/**
 * Family member with resolved defaults
 * All optional flags are resolved to boolean values
 */
export interface FamilyMember extends Omit<FamilyMemberConfig, 'proactiveEnabled' | 'imageEnabled' | 'webSearchEnabled'> {
  proactiveEnabled: boolean;
  imageEnabled: boolean;
  webSearchEnabled: boolean;
}

/**
 * Default configuration values applied to all family members
 */
export interface FamilyProfileDefaults {
  timezone: string;
  imageEnabled: boolean;
  webSearchEnabled: boolean;
  proactiveEnabled: boolean;
}

/**
 * Root configuration structure for family-profiles.json
 */
export interface FamilyProfilesConfig {
  /** JSON schema reference for validation */
  $schema?: string;
  /** Configuration version */
  version: string;
  /** Default values for all members */
  defaults: FamilyProfileDefaults;
  /** Array of family member configurations */
  familyMembers: FamilyMemberConfig[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context passed to Handlebars templates for prompt generation
 */
export interface PromptContext {
  /** Family member's name */
  name: string;
  /** Day of week as string (e.g., "Monday") */
  dayOfWeek: string;
  /** Full formatted date (e.g., "Monday, December 25, 2025") */
  fullDate: string;
  /** Theme name for today */
  themeName: string;
  /** Template identifier */
  themeTemplate: string;
  /** Whether web search is available/enabled */
  webSearchEnabled: boolean;
  /** Whether image generation is enabled */
  imageEnabled: boolean;
  /** Family member's interests array */
  interests: string[];
  /** Optional search hint for web search tool */
  searchHint?: string;
  /** Current season (spring, summer, fall, winter) */
  season?: string;
  /** Whether today is a special occasion */
  isSpecialOccasion?: boolean;
  /** Name of special occasion if applicable */
  specialOccasionName?: string;
}

/**
 * Compiled template function type from Handlebars
 */
export type CompiledTemplate = (context: PromptContext) => string;

// ═══════════════════════════════════════════════════════════════════════════════
// WEB SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported web search providers
 */
export type WebSearchProvider = 'exa' | 'tavily' | 'serp';

/**
 * Web search result from any provider
 */
export interface WebSearchResult {
  /** Result title */
  title: string;
  /** Source URL */
  url: string;
  /** Text snippet/preview */
  snippet: string;
  /** Full content if available */
  content?: string;
  /** Publication date if available */
  publishedDate?: string;
}

/**
 * Web search tool call arguments
 */
export interface WebSearchArgs {
  /** The search query */
  query: string;
  /** Optional category to refine results */
  category?: 'news' | 'events' | 'recipes' | 'venues' | 'general' | 'religious';
  /** Optional location for local results */
  location?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generated image metadata
 */
export interface GeneratedImage {
  /** Absolute path to saved image file */
  localPath: string;
  /** Prompt used to generate the image */
  prompt: string;
  /** Model used (e.g., "black-forest-labs/flux-1.1-pro") */
  model: string;
  /** Generation timestamp */
  timestamp: Date;
  /** Whether image was added to Photos.app */
  addedToPhotos: boolean;
}

/**
 * Image generation configuration
 */
export interface ImageGeneratorConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Image model to use */
  model: string;
  /** Local save path (supports ~ for home) */
  savePath: string;
  /** Photos.app album name */
  photosAlbumName: string;
  /** Whether to import to Photos.app */
  photosEnabled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPENROUTER API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenRouter tool definition (follows OpenAI format)
 */
export interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

/**
 * Tool call from OpenRouter response
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Chat message for OpenRouter API
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * OpenRouter API response usage statistics
 */
export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

/**
 * OpenRouter generation result
 */
export interface OpenRouterResult {
  response: string;
  toolCalls: ToolCall[];
  usage: OpenRouterUsage;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete generated content for a daily gift
 */
export interface GeneratedContent {
  /** The message text to send */
  text: string;
  /** Generated image if any */
  image?: GeneratedImage;
  /** Web search results used in generation */
  webSearchResults?: WebSearchResult[];
  /** Model used for text generation */
  model: string;
  /** Total tokens consumed */
  tokensUsed: number;
  /** List of tools that were invoked */
  toolsInvoked: string[];
  /** Whether fallback to local MLX was used */
  fallbackUsed: boolean;
}

/**
 * Result of sending a daily gift
 */
export interface DailyGiftResult {
  /** Family member ID */
  familyMemberId: string;
  /** Family member display name */
  memberName: string;
  /** When the gift was scheduled */
  scheduledTime: Date;
  /** When the gift was actually sent */
  sentTime: Date;
  /** Theme name used */
  theme: string;
  /** Generated content */
  content: GeneratedContent;
  /** Whether sending succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Delivery status from MessageService */
  deliveryStatus?: 'delivered' | 'sent' | 'pending' | 'failed' | 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GIFT SYSTEM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete gift system configuration
 */
export interface GiftSystemConfig {
  /** Whether the gift system is enabled */
  enabled: boolean;

  // Paths
  /** Path to family-profiles.json */
  profilesPath: string;
  /** Path to prompts directory */
  promptsPath: string;

  // OpenRouter
  /** OpenRouter API key */
  openRouterApiKey: string;
  /** LLM model for text generation */
  openRouterModel: string;

  // Web Search
  /** Web search provider */
  webSearchProvider: WebSearchProvider;
  /** Web search API key */
  webSearchApiKey: string;

  // Image Generation
  /** Image generation model */
  imageModel: string;
  /** Path to save generated images */
  imageSavePath: string;
  /** Photos.app album name */
  photosAlbumName: string;
  /** Whether to import to Photos.app */
  photosEnabled: boolean;

  // Local MLX (fallback)
  /** Local MLX API URL */
  mlxApiUrl: string;

  // Testing/Development
  /** Dry run mode - log instead of send */
  dryRun: boolean;
  /** Override recipient for testing */
  testRecipient?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scheduled job status
 */
export interface ScheduledJobStatus {
  /** Family member ID */
  memberId: string;
  /** Member display name */
  memberName: string;
  /** Scheduled send time */
  sendTime: string;
  /** Timezone */
  timezone: string;
  /** Next scheduled run */
  nextRun: Date | null;
  /** Last run result if any */
  lastRun?: {
    time: Date;
    success: boolean;
    theme: string;
    error?: string;
  };
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  /** Total scheduled jobs */
  totalJobs: number;
  /** Jobs currently active */
  activeJobs: number;
  /** Total messages sent today */
  messagesSentToday: number;
  /** Total errors today */
  errorsToday: number;
  /** Uptime in milliseconds */
  uptimeMs: number;
  /** Scheduler start time */
  startedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPLY HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Conversation context for reply handling
 */
export interface ConversationContext {
  /** Family member ID */
  memberId: string;
  /** Message history */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  /** Last activity timestamp */
  lastActivity: Date;
}

/**
 * Reply handler configuration
 */
export interface ReplyHandlerConfig {
  /** Maximum messages to keep in context */
  maxContextMessages: number;
  /** Maximum age of context in hours */
  maxContextAgeHours: number;
  /** Maximum tokens for reply generation */
  maxTokens: number;
  /** Temperature for reply generation */
  temperature: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIAL OCCASIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Special occasion configuration
 */
export interface SpecialOccasion {
  /** Occasion identifier */
  id: string;
  /** Display name */
  name: string;
  /** Date in MM-DD format (recurring) or YYYY-MM-DD (specific) */
  date: string;
  /** Whether this is a recurring annual event */
  recurring: boolean;
  /** Family member ID if birthday/personal, null if universal */
  familyMemberId?: string;
  /** Special prompt template to use */
  promptTemplate: string;
  /** Whether to skip regular theme */
  overrideRegularTheme: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result type for operations that can fail
 */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Loader status for async initialization
 */
export interface LoaderStatus {
  loaded: boolean;
  loadedAt?: Date;
  itemCount?: number;
  error?: string;
}

/**
 * Configuration loader interface
 */
export interface ConfigLoader<T> {
  load(): Promise<T>;
  reload(): Promise<T>;
  getStatus(): LoaderStatus;
}
