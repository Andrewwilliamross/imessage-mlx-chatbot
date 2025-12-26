/**
 * OpenRouterClient - API client for OpenRouter with tool calling support
 *
 * Features:
 * - Chat completions with tool calling (OpenAI function calling format)
 * - Image generation via supported models
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling and logging
 * - Token usage tracking
 */

import {
  OpenRouterTool,
  ToolCall,
  ChatMessage,
  OpenRouterResult,
  OpenRouterUsage
} from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('OpenRouterClient');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

/**
 * Configuration for OpenRouter client
 */
export interface OpenRouterConfig {
  apiKey: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  siteUrl?: string;
  siteName?: string;
}

/**
 * Options for a single generation request
 */
export interface GenerateOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

/**
 * Image generation options
 */
export interface ImageGenerateOptions {
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
}

/**
 * Raw API response structure from OpenRouter
 */
interface OpenRouterAPIResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Image generation API response
 */
interface ImageAPIResponse {
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPENROUTER CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenRouterClient - Full-featured API client for OpenRouter
 */
export class OpenRouterClient {
  private apiKey: string;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private timeoutMs: number;
  private maxRetries: number;
  private siteUrl: string;
  private siteName: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? 'anthropic/claude-3.5-sonnet';
    this.defaultMaxTokens = config.defaultMaxTokens ?? 1024;
    this.defaultTemperature = config.defaultTemperature ?? 0.7;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 2;
    this.siteUrl = config.siteUrl ?? 'https://imessage-mlx.local';
    this.siteName = config.siteName ?? 'iMessage MLX Chatbot';

    if (!this.apiKey) {
      logger.warn('OpenRouterClient initialized without API key');
    }

    logger.debug('OpenRouterClient initialized', {
      model: this.defaultModel,
      maxTokens: this.defaultMaxTokens,
      timeoutMs: this.timeoutMs
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHAT COMPLETIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate a chat completion with optional tool calling
   *
   * @param messages - Array of chat messages
   * @param tools - Optional array of tool definitions
   * @param options - Optional generation parameters
   * @returns Generated response with any tool calls and usage stats
   */
  async generateWithTools(
    messages: ChatMessage[],
    tools?: OpenRouterTool[],
    options: GenerateOptions = {}
  ): Promise<OpenRouterResult> {
    const correlationId = logger.generateCorrelationId();

    const model = options.model ?? this.defaultModel;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;
    const temperature = options.temperature ?? this.defaultTemperature;

    logger.info('Starting chat completion', {
      model,
      messageCount: messages.length,
      hasTools: !!tools?.length,
      toolCount: tools?.length ?? 0,
      correlationId
    });

    const requestBody: Record<string, unknown> = {
      model,
      messages: messages.map(m => this.formatMessage(m)),
      max_tokens: maxTokens,
      temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    // Clean undefined values
    Object.keys(requestBody).forEach(key => {
      if (requestBody[key] === undefined) {
        delete requestBody[key];
      }
    });

    try {
      const response = await this.makeRequest<OpenRouterAPIResponse>(
        '/chat/completions',
        requestBody,
        correlationId
      );

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No completion choice returned');
      }

      const result: OpenRouterResult = {
        response: choice.message.content ?? '',
        toolCalls: this.extractToolCalls(choice.message.tool_calls),
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens
        }
      };

      logger.info('Chat completion successful', {
        model: response.model,
        finishReason: choice.finish_reason,
        hasToolCalls: result.toolCalls.length > 0,
        toolCallCount: result.toolCalls.length,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        correlationId
      });

      return result;

    } catch (error) {
      logger.error('Chat completion failed', {
        error: error instanceof Error ? error.message : String(error),
        model,
        correlationId
      });
      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Generate a simple completion without tools
   */
  async generate(
    messages: ChatMessage[],
    options: GenerateOptions = {}
  ): Promise<OpenRouterResult> {
    return this.generateWithTools(messages, undefined, options);
  }

  /**
   * Continue a conversation after handling tool calls
   * Appends tool results and generates the next response
   */
  async continueWithToolResults(
    messages: ChatMessage[],
    toolResults: Array<{ toolCallId: string; result: string }>,
    tools?: OpenRouterTool[],
    options: GenerateOptions = {}
  ): Promise<OpenRouterResult> {
    // Append tool result messages
    const updatedMessages: ChatMessage[] = [
      ...messages,
      ...toolResults.map(tr => ({
        role: 'tool' as const,
        content: tr.result,
        tool_call_id: tr.toolCallId
      }))
    ];

    return this.generateWithTools(updatedMessages, tools, options);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // IMAGE GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate an image using OpenRouter
   *
   * @param prompt - Image generation prompt
   * @param options - Image generation options
   * @returns URL or base64 of generated image
   */
  async generateImage(
    prompt: string,
    options: ImageGenerateOptions = {}
  ): Promise<{ url?: string; b64_json?: string }> {
    const correlationId = logger.generateCorrelationId();

    const model = options.model ?? 'black-forest-labs/flux-1.1-pro';

    logger.info('Starting image generation', {
      model,
      promptLength: prompt.length,
      correlationId
    });

    const requestBody = {
      model,
      prompt,
      size: options.size ?? '1024x1024',
      quality: options.quality ?? 'standard',
      n: options.n ?? 1
    };

    try {
      const response = await this.makeRequest<ImageAPIResponse>(
        '/images/generations',
        requestBody,
        correlationId
      );

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned');
      }

      const imageData = response.data[0];

      logger.info('Image generation successful', {
        model,
        hasUrl: !!imageData.url,
        hasBase64: !!imageData.b64_json,
        correlationId
      });

      return imageData;

    } catch (error) {
      logger.error('Image generation failed', {
        error: error instanceof Error ? error.message : String(error),
        model,
        correlationId
      });
      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Test connection to OpenRouter API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use a minimal request to test the API
      const result = await this.generate(
        [{ role: 'user', content: 'Hi' }],
        { maxTokens: 5 }
      );
      return !!result.response;
    } catch (error) {
      logger.error('OpenRouter connection test failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if the client is configured with an API key
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Make an API request with retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>,
    correlationId: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.debug('Retrying request', {
          attempt,
          backoffMs,
          correlationId
        });
        await this.sleep(backoffMs);
      }

      try {
        return await this.executeRequest<T>(endpoint, body, correlationId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on auth errors or invalid requests
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        logger.warn('Request failed, will retry', {
          attempt,
          maxRetries: this.maxRetries,
          error: lastError.message,
          correlationId
        });
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Execute a single API request
   */
  private async executeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>,
    correlationId: string
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const url = `${OPENROUTER_API_URL}${endpoint}`;

    try {
      logger.debug('Making API request', {
        endpoint,
        correlationId
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenRouter API error ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message ?? errorJson.message ?? errorMessage;
        } catch {
          errorMessage = `${errorMessage}: ${errorText.substring(0, 200)}`;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json() as T;
      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }

      throw error;
    }
  }

  /**
   * Format a ChatMessage for the API
   */
  private formatMessage(message: ChatMessage): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      role: message.role,
      content: message.content
    };

    if (message.tool_call_id) {
      formatted.tool_call_id = message.tool_call_id;
    }

    if (message.tool_calls) {
      formatted.tool_calls = message.tool_calls;
    }

    return formatted;
  }

  /**
   * Extract tool calls from API response
   */
  private extractToolCalls(
    toolCalls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>
  ): ToolCall[] {
    if (!toolCalls) return [];

    return toolCalls.map(tc => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    );
  }

  /**
   * Sleep helper for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an OpenRouterClient instance
 * Factory function for dependency injection
 */
export function createOpenRouterClient(config: OpenRouterConfig): OpenRouterClient {
  return new OpenRouterClient(config);
}

export default OpenRouterClient;
