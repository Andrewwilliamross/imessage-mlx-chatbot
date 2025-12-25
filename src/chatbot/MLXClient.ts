/**
 * HTTP client for MLX-LM API
 */

import logger from '../utils/logger.js';
import {
  MLXGenerateRequest,
  MLXGenerateResponse,
  MLXHealthResponse,
} from './types.js';

export class MLXClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 60000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Check if the MLX API is healthy
   */
  async healthCheck(): Promise<MLXHealthResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json() as MLXHealthResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Health check timed out');
      }
      throw error;
    }
  }

  /**
   * Generate a response from the LLM
   */
  async generate(request: MLXGenerateRequest): Promise<MLXGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.debug('Sending generate request to MLX API', {
        messageCount: request.messages.length,
        maxTokens: request.max_tokens,
      });

      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`MLX API error ${response.status}: ${errorBody}`);
      }

      const result = await response.json() as MLXGenerateResponse;

      logger.debug('Received response from MLX API', {
        tokensGenerated: result.tokens_generated,
        generationTimeMs: result.generation_time_ms,
      });

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MLX API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Test connection to MLX API
   */
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy' && health.model_loaded;
    } catch (error) {
      logger.error('MLX API connection test failed', { error });
      return false;
    }
  }
}

export default MLXClient;
