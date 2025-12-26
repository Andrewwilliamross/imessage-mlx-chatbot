/**
 * AgentProactiveGenerator - LangChain-based Proactive Generator
 *
 * Drop-in replacement for ProactiveGenerator that uses the LangChain
 * DailyGiftAgent internally. Provides the same interface for seamless
 * integration with GiftScheduler.
 *
 * Key differences from ProactiveGenerator:
 * - Uses LangChain ChatOpenAI instead of custom OpenRouterClient
 * - Uses Serper for web search instead of multi-provider WebSearchTool
 * - Uses ImagePromptAgent subagent for FLUX prompts
 * - Simplified architecture with no theme templates
 */

import {
  FamilyMember,
  GeneratedContent,
  ContentGenerationOptions
} from './types.js';
import { DailyGiftAgent } from './agents/DailyGiftAgent.js';
import type { DailyGiftAgentConfig } from './agents/types.js';
import { PromptLoader } from './config/PromptLoader.js';
import { MLXClient } from '../chatbot/MLXClient.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AgentProactiveGenerator');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AgentProactiveGenerator configuration
 */
export interface AgentProactiveGeneratorConfig {
  // OpenRouter settings
  openRouterApiKey: string;
  openRouterModel?: string;
  openRouterMaxTokens?: number;
  openRouterTemperature?: number;

  // Serper web search
  serperApiKey?: string;
  maxSearchResults?: number;

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
  enableFallback?: boolean;
}

/**
 * Generation options for a single message
 */
export interface GenerationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  skipWebSearch?: boolean;
  skipImageGeneration?: boolean;
  forceFallback?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT PROACTIVE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AgentProactiveGenerator - LangChain-based content generator
 */
export class AgentProactiveGenerator {
  private agent: DailyGiftAgent;
  private mlxClient: MLXClient;
  private promptLoader: PromptLoader;
  private enableFallback: boolean;
  private initialized: boolean = false;
  private config: AgentProactiveGeneratorConfig;

  constructor(config: AgentProactiveGeneratorConfig) {
    this.config = config;

    // Build DailyGiftAgent config
    const agentConfig: DailyGiftAgentConfig = {
      openRouterApiKey: config.openRouterApiKey,
      model: config.openRouterModel ?? 'anthropic/claude-3.5-sonnet',
      temperature: config.openRouterTemperature ?? 0.7,
      maxTokens: config.openRouterMaxTokens ?? 1024,
      serperApiKey: config.serperApiKey,
      maxSearchResults: config.maxSearchResults ?? 5,
      imageEnabled: config.imageEnabled ?? true,
      imageModel: config.imageModel ?? 'black-forest-labs/flux-1.1-pro',
      promptsPath: config.promptsPath
    };

    this.agent = new DailyGiftAgent(agentConfig);

    // Initialize MLX fallback client
    this.mlxClient = new MLXClient(config.mlxApiUrl, config.mlxTimeout ?? 60000);

    // Initialize prompt loader
    this.promptLoader = new PromptLoader(config.promptsPath);

    // Configuration
    this.enableFallback = config.enableFallback ?? true;

    logger.debug('AgentProactiveGenerator constructed', {
      model: agentConfig.model,
      serperEnabled: !!config.serperApiKey,
      imageEnabled: agentConfig.imageEnabled,
      enableFallback: this.enableFallback
    });
  }

  /**
   * Initialize the generator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing AgentProactiveGenerator');

    try {
      // Load prompt templates
      await this.promptLoader.load();

      // Initialize the DailyGiftAgent
      await this.agent.initialize();

      this.initialized = true;
      logger.info('AgentProactiveGenerator initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AgentProactiveGenerator', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate proactive content for a family member
   * Compatible with ContentGenerator interface (no theme required)
   */
  async generateContent(
    member: FamilyMember,
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    const correlationId = logger.generateCorrelationId();

    logger.info('Starting agent-based content generation', {
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

    try {
      // Generate using DailyGiftAgent
      const result = await this.agent.generate({ member });

      if (!result.success) {
        throw new Error(result.error ?? 'Agent generation failed');
      }

      logger.info('Agent content generated successfully', {
        memberId: member.id,
        tokensUsed: result.tokensUsed,
        toolsInvoked: result.toolsInvoked,
        fallbackUsed: result.fallbackUsed,
        correlationId
      });

      // Convert DailyGiftOutput to GeneratedContent
      return {
        text: result.text ?? '',
        image: result.image ?? undefined,
        model: this.config.openRouterModel ?? 'anthropic/claude-3.5-sonnet',
        tokensUsed: result.tokensUsed,
        toolsInvoked: result.toolsInvoked,
        fallbackUsed: result.fallbackUsed
      };

    } catch (error) {
      logger.error('Agent generation failed', {
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
    const now = new Date();
    const systemPrompt = await this.promptLoader.buildProactivePrompt(
      member.id,
      {
        name: member.name,
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        fullDate: now.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }),
        webSearchEnabled: false,
        imageEnabled: false,
        interests: member.interests
      }
    );

    const userPrompt = `Generate a warm, personalized daily message for ${member.name}.

Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.

Their interests include: ${member.interests.slice(0, 3).join(', ')}.

Keep it brief (2-3 sentences) and genuine. Sign off naturally.`;

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
    return !!this.config.openRouterApiKey;
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
    const agentResults = await this.agent.testConnections();
    const mlx = await this.mlxClient.testConnection().catch(() => false);

    return {
      openRouter: agentResults.llm,
      mlx,
      webSearch: agentResults.serper,
      imageGenerator: agentResults.imageGenerator
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an AgentProactiveGenerator instance
 */
export function createAgentProactiveGenerator(
  config: AgentProactiveGeneratorConfig
): AgentProactiveGenerator {
  return new AgentProactiveGenerator(config);
}

export default AgentProactiveGenerator;
