/**
 * ProactiveGenerator - Orchestrates proactive daily message generation
 *
 * This is the main content generation engine that:
 * - Uses OpenRouter (Claude/GPT-4) for primary generation with tools
 * - Handles web search tool calls for real-time information
 * - Falls back to local MLX if OpenRouter fails
 * - Manages the complete generation workflow
 */

import {
  FamilyMember,
  GeneratedContent,
  ChatMessage,
  ToolCall,
  PromptContext,
  WebSearchResult
} from './types.js';
import { OpenRouterClient, OpenRouterConfig } from './openrouter/OpenRouterClient.js';
import { WebSearchTool, WebSearchConfig } from './openrouter/WebSearchTool.js';
import { getEnabledTools, TOOL_NAMES } from './openrouter/ToolDefinitions.js';
import { ImageGenerator, ImageGeneratorConfig } from './image/ImageGenerator.js';
import { PromptLoader } from './config/PromptLoader.js';
import { MLXClient } from '../chatbot/MLXClient.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ProactiveGenerator');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ProactiveGenerator configuration
 */
export interface ProactiveGeneratorConfig {
  // OpenRouter settings
  openRouterApiKey: string;
  openRouterModel?: string;
  openRouterMaxTokens?: number;
  openRouterTemperature?: number;

  // Web search settings
  webSearchProvider: 'exa' | 'tavily' | 'serp';
  webSearchApiKey: string;

  // Image generation settings
  imageEnabled?: boolean;
  imageModel?: string;
  imageStoragePath?: string;
  photosEnabled?: boolean;
  photosAlbumName?: string;

  // MLX fallback settings
  mlxApiUrl: string;
  mlxTimeout?: number;

  // Prompt loader
  promptsPath: string;

  // Behavior settings
  maxToolIterations?: number;
  enableFallback?: boolean;
}

/**
 * Generation options for a single message
 */
export interface GenerationOptions {
  /** Override the model for this generation */
  model?: string;
  /** Override max tokens */
  maxTokens?: number;
  /** Override temperature */
  temperature?: number;
  /** Skip web search even if enabled */
  skipWebSearch?: boolean;
  /** Skip image generation even if enabled */
  skipImageGeneration?: boolean;
  /** Force fallback to MLX */
  forceFallback?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ProactiveGenerator - Main content generation orchestrator
 */
export class ProactiveGenerator {
  private openRouterClient: OpenRouterClient;
  private webSearchTool: WebSearchTool;
  private imageGenerator: ImageGenerator | null;
  private mlxClient: MLXClient;
  private promptLoader: PromptLoader;
  private maxToolIterations: number;
  private enableFallback: boolean;
  private imageEnabled: boolean;
  private initialized: boolean = false;

  constructor(config: ProactiveGeneratorConfig) {
    // Initialize OpenRouter client
    const openRouterConfig: OpenRouterConfig = {
      apiKey: config.openRouterApiKey,
      defaultModel: config.openRouterModel ?? 'anthropic/claude-3.5-sonnet',
      defaultMaxTokens: config.openRouterMaxTokens ?? 1024,
      defaultTemperature: config.openRouterTemperature ?? 0.7
    };
    this.openRouterClient = new OpenRouterClient(openRouterConfig);

    // Initialize web search tool
    const webSearchConfig: WebSearchConfig = {
      provider: config.webSearchProvider,
      apiKey: config.webSearchApiKey
    };
    this.webSearchTool = new WebSearchTool(webSearchConfig);

    // Initialize image generator if enabled
    this.imageEnabled = config.imageEnabled ?? true;
    if (this.imageEnabled && config.imageStoragePath) {
      const imageConfig: ImageGeneratorConfig = {
        openRouterApiKey: config.openRouterApiKey,
        imageModel: config.imageModel ?? 'black-forest-labs/flux-1.1-pro',
        storagePath: config.imageStoragePath,
        photosEnabled: config.photosEnabled ?? true,
        photosAlbumName: config.photosAlbumName ?? 'Family Daily Gifts'
      };
      this.imageGenerator = new ImageGenerator(imageConfig);
    } else {
      this.imageGenerator = null;
    }

    // Initialize MLX fallback client
    this.mlxClient = new MLXClient(config.mlxApiUrl, config.mlxTimeout ?? 60000);

    // Initialize prompt loader
    this.promptLoader = new PromptLoader(config.promptsPath);

    // Configuration
    this.maxToolIterations = config.maxToolIterations ?? 3;
    this.enableFallback = config.enableFallback ?? true;

    logger.debug('ProactiveGenerator constructed', {
      model: openRouterConfig.defaultModel,
      webSearchProvider: config.webSearchProvider,
      imageEnabled: this.imageEnabled,
      enableFallback: this.enableFallback
    });
  }

  /**
   * Initialize the generator (load prompts, image generator)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing ProactiveGenerator');

    try {
      // Load prompt templates
      await this.promptLoader.load();

      // Initialize image generator if enabled
      if (this.imageGenerator) {
        await this.imageGenerator.initialize();
      }

      this.initialized = true;
      logger.info('ProactiveGenerator initialized successfully', {
        imageGeneratorReady: !!this.imageGenerator
      });
    } catch (error) {
      logger.error('Failed to initialize ProactiveGenerator', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate proactive content for a family member
   *
   * @param member - Family member configuration
   * @param options - Optional generation overrides
   * @returns Generated content with metadata
   */
  async generateContent(
    member: FamilyMember,
    options: GenerationOptions = {}
  ): Promise<GeneratedContent> {
    const correlationId = logger.generateCorrelationId();

    logger.info('Starting proactive content generation', {
      memberId: member.id,
      memberName: member.name,
      correlationId
    });

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Force fallback if requested
    if (options.forceFallback) {
      return this.generateWithFallback(member, correlationId);
    }

    // Try OpenRouter first
    try {
      const result = await this.generateWithOpenRouter(
        member,
        options,
        correlationId
      );

      logger.info('Proactive content generated successfully', {
        memberId: member.id,
        model: result.model,
        tokensUsed: result.tokensUsed,
        toolsInvoked: result.toolsInvoked,
        fallbackUsed: false,
        correlationId
      });

      return result;

    } catch (error) {
      logger.error('OpenRouter generation failed', {
        error: error instanceof Error ? error.message : String(error),
        memberId: member.id,
        correlationId
      });

      // Try fallback if enabled
      if (this.enableFallback) {
        logger.info('Falling back to MLX', { memberId: member.id, correlationId });
        return this.generateWithFallback(member, correlationId);
      }

      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate content using OpenRouter with tool calling
   */
  private async generateWithOpenRouter(
    member: FamilyMember,
    options: GenerationOptions,
    correlationId: string
  ): Promise<GeneratedContent> {
    // Build prompt context
    const context = this.buildPromptContext(member);

    // Get system prompt from template
    const systemPrompt = await this.promptLoader.buildProactivePrompt(
      member.id,
      context
    );

    // Initialize messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: this.buildUserPrompt(member, context)
      }
    ];

    // Get enabled tools
    const webSearchEnabled = member.webSearchEnabled && !options.skipWebSearch;
    const tools = getEnabledTools({ webSearchEnabled });

    // Track generation metadata
    let totalTokens = 0;
    const toolsInvoked: string[] = [];
    const webSearchResults: WebSearchResult[] = [];

    // Generate with tool calling loop
    let result = await this.openRouterClient.generateWithTools(
      messages,
      tools.length > 0 ? tools : undefined,
      {
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature
      }
    );

    totalTokens += result.usage.promptTokens + result.usage.completionTokens;

    // Handle tool calls iteratively
    let iterations = 0;
    while (result.toolCalls.length > 0 && iterations < this.maxToolIterations) {
      iterations++;

      logger.debug('Processing tool calls', {
        iteration: iterations,
        toolCallCount: result.toolCalls.length,
        correlationId
      });

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: result.response || '',
        tool_calls: result.toolCalls
      });

      // Process each tool call
      const toolResults: Array<{ toolCallId: string; result: string }> = [];

      for (const toolCall of result.toolCalls) {
        const toolResult = await this.handleToolCall(
          toolCall,
          toolsInvoked,
          webSearchResults,
          correlationId
        );

        toolResults.push({
          toolCallId: toolCall.id,
          result: toolResult
        });
      }

      // Continue generation with tool results
      result = await this.openRouterClient.continueWithToolResults(
        messages,
        toolResults,
        tools.length > 0 ? tools : undefined,
        {
          model: options.model,
          maxTokens: options.maxTokens,
          temperature: options.temperature
        }
      );

      totalTokens += result.usage.promptTokens + result.usage.completionTokens;
    }

    // Generate image if enabled for this member and not skipped
    let generatedImage = undefined;
    if (
      this.imageGenerator &&
      member.imageEnabled &&
      !options.skipImageGeneration
    ) {
      logger.debug('Generating image for member', {
        memberId: member.id,
        correlationId
      });

      const imageResult = await this.imageGenerator.generateForMember(member);
      if (imageResult.success && imageResult.image) {
        generatedImage = imageResult.image;
        toolsInvoked.push('image_generation');
        logger.info('Image generated successfully', {
          path: generatedImage.localPath,
          addedToPhotos: generatedImage.addedToPhotos,
          correlationId
        });
      } else {
        logger.warn('Image generation failed', {
          error: imageResult.error,
          memberId: member.id,
          correlationId
        });
        // Continue without image - don't fail the whole generation
      }
    }

    return {
      text: result.response,
      image: generatedImage,
      webSearchResults: webSearchResults.length > 0 ? webSearchResults : undefined,
      model: options.model ?? this.openRouterClient.getDefaultModel(),
      tokensUsed: totalTokens,
      toolsInvoked,
      fallbackUsed: false
    };
  }

  /**
   * Handle a single tool call
   */
  private async handleToolCall(
    toolCall: ToolCall,
    toolsInvoked: string[],
    webSearchResults: WebSearchResult[],
    correlationId: string
  ): Promise<string> {
    const { name, arguments: argsString } = toolCall.function;

    logger.debug('Handling tool call', {
      tool: name,
      correlationId
    });

    toolsInvoked.push(name);

    try {
      const args = JSON.parse(argsString);

      switch (name) {
        case TOOL_NAMES.WEB_SEARCH: {
          const results = await this.webSearchTool.search({
            query: args.query,
            category: args.category,
            location: args.location
          });

          webSearchResults.push(...results);

          return this.webSearchTool.formatForLLM(results);
        }

        default:
          logger.warn('Unknown tool called', { tool: name, correlationId });
          return `Error: Unknown tool "${name}"`;
      }
    } catch (error) {
      logger.error('Tool call failed', {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
        correlationId
      });

      return `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MLX FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate content using local MLX as fallback
   */
  private async generateWithFallback(
    member: FamilyMember,
    correlationId: string
  ): Promise<GeneratedContent> {
    logger.info('Generating with MLX fallback', {
      memberId: member.id,
      correlationId
    });

    // Build prompt context
    const context = this.buildPromptContext(member);

    // Get system prompt (simpler version for MLX)
    const systemPrompt = await this.promptLoader.buildProactivePrompt(
      member.id,
      { ...context, webSearchEnabled: false }
    );

    // Build a simpler prompt for MLX (no tools)
    const userPrompt = this.buildFallbackUserPrompt(member, context);

    try {
      const response = await this.mlxClient.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 512,
        temperature: 0.7
      });

      logger.info('MLX fallback generation successful', {
        memberId: member.id,
        tokensGenerated: response.tokens_generated,
        correlationId
      });

      return {
        text: response.response,
        model: 'mlx-local',
        tokensUsed: response.tokens_generated,
        toolsInvoked: [],
        fallbackUsed: true
      };

    } catch (error) {
      logger.error('MLX fallback failed', {
        error: error instanceof Error ? error.message : String(error),
        memberId: member.id,
        correlationId
      });

      // Return a minimal fallback message
      return {
        text: this.getEmergencyFallbackMessage(member),
        model: 'emergency-fallback',
        tokensUsed: 0,
        toolsInvoked: [],
        fallbackUsed: true
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROMPT BUILDING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Build prompt context from member
   */
  private buildPromptContext(member: FamilyMember): PromptContext {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const fullDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Determine season
    const month = now.getMonth();
    let season: string;
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';

    return {
      name: member.name,
      dayOfWeek,
      fullDate,
      webSearchEnabled: member.webSearchEnabled,
      imageEnabled: member.imageEnabled,
      interests: member.interests,
      searchHint: member.searchHint,
      season
    };
  }

  /**
   * Build user prompt for OpenRouter generation
   */
  private buildUserPrompt(
    member: FamilyMember,
    context: PromptContext
  ): string {
    const parts: string[] = [
      `Generate a personalized morning message for ${member.name}.`,
      `Today is ${context.dayOfWeek}, ${context.fullDate}.`
    ];

    if (member.searchHint && member.webSearchEnabled) {
      parts.push(`Consider searching for: ${member.searchHint}`);
    }

    parts.push(
      `Keep the message warm, genuine, and concise (2-4 sentences).`,
      `Sign off naturally as their AI companion.`
    );

    return parts.join('\n\n');
  }

  /**
   * Build simplified user prompt for MLX fallback
   */
  private buildFallbackUserPrompt(
    member: FamilyMember,
    context: PromptContext
  ): string {
    return `Generate a warm, personalized morning message for ${member.name}.

Today is ${context.dayOfWeek}, ${context.fullDate}.

Their interests include: ${member.interests.slice(0, 3).join(', ')}.

Keep it brief (2-3 sentences) and genuine. Sign off naturally.`;
  }

  /**
   * Get emergency fallback message when all generation fails
   */
  private getEmergencyFallbackMessage(member: FamilyMember): string {
    const greetings = [
      `Good morning, ${member.name}! Wishing you a wonderful day filled with joy.`,
      `Hey ${member.name}! Hope your day is off to a great start.`,
      `Morning, ${member.name}! Sending warm thoughts your way today.`
    ];

    const index = new Date().getDate() % greetings.length;
    return greetings[index];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATUS METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Check if generator is properly configured
   */
  isConfigured(): boolean {
    return (
      this.openRouterClient.isConfigured() &&
      (this.webSearchTool.isConfigured() || !this.enableFallback)
    );
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Test all connections
   */
  async testConnections(): Promise<{
    openRouter: boolean;
    mlx: boolean;
    webSearch: boolean;
    imageGenerator: boolean;
  }> {
    const [openRouter, mlx] = await Promise.all([
      this.openRouterClient.testConnection().catch(() => false),
      this.mlxClient.testConnection().catch(() => false)
    ]);

    // Test image generator if configured
    let imageGenerator = false;
    if (this.imageGenerator) {
      try {
        const imageConnections = await this.imageGenerator.testConnections();
        imageGenerator = imageConnections.openRouter && imageConnections.storage;
      } catch {
        imageGenerator = false;
      }
    }

    return {
      openRouter,
      mlx,
      webSearch: this.webSearchTool.isConfigured(),
      imageGenerator
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a ProactiveGenerator instance
 * Factory function for dependency injection
 */
export function createProactiveGenerator(
  config: ProactiveGeneratorConfig
): ProactiveGenerator {
  return new ProactiveGenerator(config);
}

export default ProactiveGenerator;
