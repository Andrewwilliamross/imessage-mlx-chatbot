/**
 * Daily Gift Agent
 *
 * Agent that orchestrates the daily gift message generation workflow:
 * 1. Research - Search web for relevant content using Serper
 * 2. Generate Text - Create personalized message using member's proactive.md prompt
 * 3. Generate Image Prompt - Create FLUX prompt via ImagePromptAgent
 * 4. Generate Image - Create image using ImageGenerator
 *
 * Uses ChatOpenAI with OpenRouter for LLM operations.
 *
 * Simplified structure - no theme templates, just proactive.md and reply.md per user
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Serper } from '@langchain/community/tools/serper';
import { createLogger } from '../../utils/logger.js';
import { ImagePromptAgent } from './ImagePromptAgent.js';
import { ImageGenerator } from '../image/ImageGenerator.js';
import { PromptLoader } from '../config/PromptLoader.js';
import type {
  DailyGiftAgentConfig,
  DailyGiftInput,
  DailyGiftOutput,
  SerperSearchResult,
} from './types.js';
import type { FamilyMember, GeneratedImage, PromptContext } from '../types.js';

const logger = createLogger('DailyGiftAgent');

/**
 * DailyGiftAgent - Orchestrates personalized message generation
 */
export class DailyGiftAgent {
  private config: DailyGiftAgentConfig;
  private llm: ChatOpenAI;
  private serperTool: Serper | null = null;
  private imagePromptAgent: ImagePromptAgent;
  private imageGenerator: ImageGenerator | null = null;
  private promptLoader: PromptLoader;

  constructor(config: DailyGiftAgentConfig) {
    this.config = config;

    // Initialize ChatOpenAI for OpenRouter
    this.llm = new ChatOpenAI({
      apiKey: config.openRouterApiKey,
      modelName: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    });

    // Initialize Serper tool if API key is provided
    if (config.serperApiKey) {
      this.serperTool = new Serper(config.serperApiKey);
    }

    // Initialize ImagePromptAgent
    this.imagePromptAgent = new ImagePromptAgent({
      openRouterApiKey: config.openRouterApiKey,
      model: config.model,
      temperature: 0.8, // Higher temperature for creative prompts
    });

    // Initialize PromptLoader
    this.promptLoader = new PromptLoader(config.promptsPath);

    logger.info('DailyGiftAgent initialized', {
      model: config.model,
      imageEnabled: config.imageEnabled,
      serperEnabled: !!config.serperApiKey,
    });
  }

  /**
   * Initialize the agent (load prompts, set up image generator)
   */
  async initialize(): Promise<void> {
    await this.promptLoader.load();

    if (this.config.imageEnabled) {
      this.imageGenerator = new ImageGenerator({
        openRouterApiKey: this.config.openRouterApiKey,
        imageModel: this.config.imageModel,
        storagePath: '~/Pictures/FamilyGifts',
        photosEnabled: true,
        photosAlbumName: 'Family Daily Gifts',
      });
      await this.imageGenerator.initialize();
    }

    logger.info('DailyGiftAgent initialization complete');
  }

  /**
   * Run the agent for a family member
   */
  async generate(input: DailyGiftInput): Promise<DailyGiftOutput> {
    const { member } = input;
    const toolsInvoked: string[] = [];
    let tokensUsed = 0;
    let fallbackUsed = false;

    logger.info('Starting daily gift generation', {
      memberId: member.id,
      memberName: member.name,
    });

    try {
      // Step 1: Research (if enabled and searchHint is set)
      let searchResults: SerperSearchResult[] = [];
      if (member.webSearchEnabled && member.searchHint && this.serperTool) {
        try {
          searchResults = await this.performSearch(member.searchHint, member.interests);
          toolsInvoked.push('web_search');
        } catch (error) {
          logger.warn('Web search failed, continuing without results', { error });
        }
      }

      // Step 2: Generate Text
      const textResult = await this.generateText(member, searchResults);
      tokensUsed += textResult.tokensUsed;
      if (textResult.fallbackUsed) fallbackUsed = true;

      // Step 3 & 4: Generate Image (if enabled)
      let imagePrompt: string | null = null;
      let generatedImage: GeneratedImage | null = null;

      if (this.config.imageEnabled && member.imageEnabled && textResult.text) {
        try {
          // Generate image prompt
          imagePrompt = await this.imagePromptAgent.generatePrompt({
            memberName: member.name,
            memberInterests: member.interests,
            messageContent: textResult.text,
            imageStyle: member.imageStyle,
          });
          toolsInvoked.push('image_prompt');

          // Generate image
          if (imagePrompt && this.imageGenerator) {
            const imageResult = await this.imageGenerator.generateWithPrompt(
              imagePrompt,
              member.id,
              { saveToPhotos: true }
            );

            if (imageResult.success && imageResult.image) {
              generatedImage = imageResult.image;
              toolsInvoked.push('image_generation');
            }
          }
        } catch (error) {
          logger.warn('Image generation failed', { error });
        }
      }

      return {
        success: !!textResult.text,
        text: textResult.text,
        imagePrompt,
        image: generatedImage,
        tokensUsed,
        toolsInvoked,
        fallbackUsed,
        error: null,
      };
    } catch (error) {
      logger.error('Agent execution failed', { error });
      return {
        success: false,
        text: this.buildFallbackMessage(member),
        imagePrompt: null,
        image: null,
        tokensUsed: 0,
        toolsInvoked: [],
        fallbackUsed: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Perform web search using Serper
   */
  private async performSearch(
    searchHint: string,
    interests: string[]
  ): Promise<SerperSearchResult[]> {
    if (!this.serperTool) {
      return [];
    }

    const query = this.buildSearchQuery(searchHint, interests);
    logger.info('Performing web search', { query });

    try {
      const result = await this.serperTool.invoke(query);
      return this.parseSerperResponse(result);
    } catch (error) {
      logger.error('Serper search failed', { error });
      return [];
    }
  }

  /**
   * Parse Serper response into structured results
   * Handles both raw JSON and LangChain's string response format
   */
  private parseSerperResponse(rawResponse: string): SerperSearchResult[] {
    try {
      // LangChain Serper tool returns a formatted string, not JSON
      // Try to parse as JSON first
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawResponse);
      } catch {
        // If it's not JSON, it's likely LangChain's formatted string response
        // Extract search results from the text format
        logger.debug('Serper returned text format, extracting results', {
          responsePreview: rawResponse.substring(0, 200),
        });

        // Parse text format: each result is typically on its own line
        const results: SerperSearchResult[] = [];
        const lines = rawResponse.split('\n').filter((l) => l.trim());

        for (let i = 0; i < Math.min(lines.length, this.config.maxSearchResults); i++) {
          const line = lines[i].trim();
          if (line && !line.startsWith('Search results') && line.length > 10) {
            results.push({
              title: line.substring(0, 100),
              link: '',
              snippet: line,
              position: i + 1,
            });
          }
        }

        return results;
      }

      // JSON format - check for organic results
      if (!data.organic) {
        // Maybe it's a different structure
        if (Array.isArray(data)) {
          return (data as Array<{ title: string; link: string; snippet: string }>)
            .slice(0, this.config.maxSearchResults)
            .map((item, index) => ({
              title: item.title || '',
              link: item.link || '',
              snippet: item.snippet || '',
              position: index + 1,
            }));
        }
        return [];
      }

      return (data.organic as Array<{ title: string; link: string; snippet: string }>)
        .slice(0, this.config.maxSearchResults)
        .map((item, index) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          position: index + 1,
        }));
    } catch (error) {
      logger.warn('Failed to parse Serper response', { error });
      return [];
    }
  }

  /**
   * Generate personalized message text using member's proactive.md prompt
   */
  private async generateText(
    member: FamilyMember,
    searchResults: SerperSearchResult[]
  ): Promise<{ text: string; tokensUsed: number; fallbackUsed: boolean }> {
    logger.info('Generating text', {
      memberId: member.id,
      hasSearchResults: searchResults.length > 0,
    });

    try {
      // Build prompt context
      const now = new Date();
      const promptContext: PromptContext = {
        name: member.name,
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        fullDate: now.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        webSearchEnabled: member.webSearchEnabled,
        imageEnabled: member.imageEnabled,
        interests: member.interests,
        searchHint: member.searchHint,
      };

      // Load the proactive prompt for this member
      const systemPrompt = await this.promptLoader.buildProactivePrompt(
        member.id,
        promptContext
      );

      // Build user message with search context if available
      let userMessage = `Generate a personalized daily message for ${member.name}.`;
      if (searchResults.length > 0) {
        userMessage += `\n\nHere's some relevant information I found:\n`;
        userMessage += searchResults
          .slice(0, 3)
          .map((r) => `- ${r.title}: ${r.snippet}`)
          .join('\n');
      }

      // Generate message
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ]);

      // Extract the final text from various response formats
      // Handles thinking models that separate reasoning from output
      const generatedText = this.extractFinalText(response);

      logger.info('Text generation complete', {
        textLength: generatedText.length,
      });

      return {
        text: generatedText,
        tokensUsed: response.usage_metadata?.total_tokens ?? 0,
        fallbackUsed: false,
      };
    } catch (error) {
      logger.error('Text generation failed', { error });
      return {
        text: this.buildFallbackMessage(member),
        tokensUsed: 0,
        fallbackUsed: true,
      };
    }
  }

  /**
   * Build a search query from hint and interests
   */
  private buildSearchQuery(hint: string, interests: string[]): string {
    const relevantInterest = interests[0] ?? '';
    return hint.includes('{interest}')
      ? hint.replace('{interest}', relevantInterest)
      : `${hint} ${relevantInterest}`.trim();
  }

  /**
   * Build a fallback message when generation fails
   */
  private buildFallbackMessage(member: FamilyMember): string {
    return `Good morning, ${member.name}! Wishing you a wonderful day filled with joy and blessings.`;
  }

  /**
   * Extract the final text from an LLM response
   * Handles thinking models that may include reasoning in their response
   */
  private extractFinalText(response: AIMessage): string {
    const content = response.content;

    // Handle string content directly
    if (typeof content === 'string') {
      return this.cleanThinkingFromText(content);
    }

    // Handle array of content blocks (common with thinking models)
    if (Array.isArray(content)) {
      // Look for text blocks, skip thinking blocks
      const textParts: string[] = [];

      for (const block of content) {
        if (typeof block === 'string') {
          textParts.push(block);
        } else if (typeof block === 'object' && block !== null) {
          const blockObj = block as Record<string, unknown>;

          // Skip thinking/reasoning blocks
          if (blockObj.type === 'thinking' || blockObj.type === 'reasoning') {
            continue;
          }

          // Extract text from text blocks
          if (blockObj.type === 'text' && typeof blockObj.text === 'string') {
            textParts.push(blockObj.text);
          } else if (typeof blockObj.text === 'string') {
            textParts.push(blockObj.text);
          }
        }
      }

      const combined = textParts.join('');
      return this.cleanThinkingFromText(combined);
    }

    // Fallback: convert to string
    return this.cleanThinkingFromText(String(content));
  }

  /**
   * Remove inline thinking markers from text
   * Some models include <thinking>...</thinking> or similar in their output
   */
  private cleanThinkingFromText(text: string): string {
    // Remove <thinking>...</thinking> blocks
    let cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

    // Remove <reason>...</reason> blocks
    cleaned = cleaned.replace(/<reason>[\s\S]*?<\/reason>/gi, '');

    // Remove [thinking]...[/thinking] blocks
    cleaned = cleaned.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');

    // Trim and clean up extra whitespace
    cleaned = cleaned.trim().replace(/\n{3,}/g, '\n\n');

    return cleaned;
  }

  /**
   * Test connections to external services
   */
  async testConnections(): Promise<{
    llm: boolean;
    serper: boolean;
    imageGenerator: boolean;
  }> {
    const results = {
      llm: false,
      serper: false,
      imageGenerator: false,
    };

    // Test LLM
    try {
      await this.llm.invoke([new HumanMessage('test')]);
      results.llm = true;
    } catch {
      results.llm = false;
    }

    // Test Serper (just check if configured)
    results.serper = !!this.serperTool;

    // Test ImageGenerator
    if (this.imageGenerator) {
      try {
        const testResult = await this.imageGenerator.testConnections();
        results.imageGenerator = testResult.openRouter;
      } catch {
        results.imageGenerator = false;
      }
    }

    return results;
  }
}

/**
 * Create a configured DailyGiftAgent
 */
export function createDailyGiftAgent(config: DailyGiftAgentConfig): DailyGiftAgent {
  return new DailyGiftAgent(config);
}

export default DailyGiftAgent;
