/**
 * WebSearchTool - Multi-provider web search integration
 *
 * Supports three search providers:
 * - Exa: Best semantic search, good for contextual queries
 * - Tavily: Fast, includes AI summaries
 * - SerpAPI: Google results, reliable fallback
 */

import { WebSearchProvider, WebSearchResult, WebSearchArgs } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('WebSearchTool');

// API Response Types
interface ExaSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    text?: string;
    publishedDate?: string;
  }>;
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }>;
}

interface SerpSearchResponse {
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
}

/**
 * Configuration for the web search tool
 */
export interface WebSearchConfig {
  provider: WebSearchProvider;
  apiKey: string;
  defaultNumResults?: number;
  timeoutMs?: number;
}

/**
 * WebSearchTool - Unified interface for web search across providers
 */
export class WebSearchTool {
  private provider: WebSearchProvider;
  private apiKey: string;
  private defaultNumResults: number;
  private timeoutMs: number;

  constructor(config: WebSearchConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.defaultNumResults = config.defaultNumResults ?? 5;
    this.timeoutMs = config.timeoutMs ?? 10000;

    if (!this.apiKey) {
      logger.warn('WebSearchTool initialized without API key - searches will fail');
    }

    logger.debug('WebSearchTool initialized', {
      provider: this.provider,
      defaultNumResults: this.defaultNumResults
    });
  }

  /**
   * Execute a web search
   */
  async search(args: WebSearchArgs): Promise<WebSearchResult[]> {
    const { query, category, location } = args;

    // Enhance query with location if provided
    const enhancedQuery = location ? `${query} ${location}` : query;

    logger.info('Executing web search', {
      provider: this.provider,
      query: enhancedQuery.substring(0, 50) + (enhancedQuery.length > 50 ? '...' : ''),
      category
    });

    const startTime = Date.now();

    try {
      let results: WebSearchResult[];

      switch (this.provider) {
        case 'exa':
          results = await this.searchExa(enhancedQuery, category);
          break;
        case 'tavily':
          results = await this.searchTavily(enhancedQuery, category);
          break;
        case 'serp':
          results = await this.searchSerp(enhancedQuery);
          break;
        default:
          throw new Error(`Unknown search provider: ${this.provider}`);
      }

      const duration = Date.now() - startTime;
      logger.info('Web search completed', {
        provider: this.provider,
        resultCount: results.length,
        durationMs: duration
      });

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Web search failed', {
        provider: this.provider,
        query: enhancedQuery.substring(0, 50),
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty results on failure rather than throwing
      return [];
    }
  }

  /**
   * Search using Exa API (best semantic search)
   */
  private async searchExa(query: string, category?: string): Promise<WebSearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          query,
          numResults: this.defaultNumResults,
          useAutoprompt: true,
          type: 'neural',
          category: this.mapCategoryToExa(category)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Exa API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as ExaSearchResponse;

      return (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: (r.text || '').substring(0, 300),
        content: r.text || '',
        publishedDate: r.publishedDate
      }));

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Exa search timed out');
      }
      throw error;
    }
  }

  /**
   * Search using Tavily API (fast with AI summaries)
   */
  private async searchTavily(query: string, category?: string): Promise<WebSearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: this.defaultNumResults,
          include_answer: true,
          include_raw_content: false,
          search_depth: 'basic',
          topic: this.mapCategoryToTavily(category)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as TavilySearchResponse;

      return (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: (r.content || '').substring(0, 300),
        content: r.content || '',
        publishedDate: r.published_date
      }));

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Tavily search timed out');
      }
      throw error;
    }
  }

  /**
   * Search using SerpAPI (Google results)
   */
  private async searchSerp(query: string): Promise<WebSearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      num: this.defaultNumResults.toString(),
      engine: 'google'
    });

    try {
      const response = await fetch(`https://serpapi.com/search.json?${params}`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SerpAPI error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as SerpSearchResponse;

      return (data.organic_results || []).map((r) => ({
        title: r.title || '',
        url: r.link || '',
        snippet: r.snippet || '',
        content: r.snippet || ''
      }));

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SerpAPI search timed out');
      }
      throw error;
    }
  }

  /**
   * Map our category to Exa's category format
   */
  private mapCategoryToExa(category?: string): string | undefined {
    if (!category) return undefined;

    const mapping: Record<string, string> = {
      news: 'news',
      recipes: 'blog',
      religious: 'blog',
      events: 'news',
      venues: 'company',
      travel: 'blog',
      design: 'blog',
      fashion: 'blog',
      fitness: 'blog',
      art: 'blog',
      history: 'research paper'
    };

    return mapping[category];
  }

  /**
   * Map our category to Tavily's topic format
   */
  private mapCategoryToTavily(category?: string): string {
    if (!category) return 'general';

    const mapping: Record<string, string> = {
      news: 'news',
      events: 'news',
      recipes: 'general',
      venues: 'general',
      religious: 'general',
      travel: 'general',
      design: 'general',
      fashion: 'general',
      fitness: 'general',
      art: 'general',
      history: 'general'
    };

    return mapping[category] || 'general';
  }

  /**
   * Format search results for inclusion in LLM context
   */
  formatForLLM(results: WebSearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((r, i) => {
      const dateStr = r.publishedDate
        ? ` (${new Date(r.publishedDate).toLocaleDateString()})`
        : '';

      return `[${i + 1}] ${r.title}${dateStr}
${r.snippet}
Source: ${r.url}`;
    }).join('\n\n');
  }

  /**
   * Get the current provider
   */
  getProvider(): WebSearchProvider {
    return this.provider;
  }

  /**
   * Check if the tool is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}

/**
 * Create a WebSearchTool instance
 * Factory function for dependency injection
 */
export function createWebSearchTool(config: WebSearchConfig): WebSearchTool {
  return new WebSearchTool(config);
}

export default WebSearchTool;
