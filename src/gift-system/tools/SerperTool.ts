/**
 * Serper Web Search Tool
 *
 * Wrapper around the LangChain Serper tool with customization
 * for the Family Daily Gift System. Uses Serper.dev for Google
 * search results.
 */

import { Serper } from '@langchain/community/tools/serper';
import { createLogger } from '../../utils/logger.js';
import type { SerperSearchResult } from '../agents/types.js';

const logger = createLogger('SerperTool');

/**
 * Configuration for creating a Serper tool
 */
export interface SerperToolConfig {
  apiKey: string;
  maxResults?: number;
  country?: string;
  locale?: string;
}

/**
 * Create a configured Serper search tool
 */
export function createSerperTool(apiKey: string): Serper {
  const serper = new Serper(apiKey);

  logger.debug('Serper tool created');

  return serper;
}

/**
 * Parse raw Serper API response into structured results
 */
export function parseSerperResponse(
  rawResponse: string,
  maxResults: number = 5
): SerperSearchResult[] {
  try {
    const data = JSON.parse(rawResponse);
    if (!data.organic) {
      return [];
    }

    return data.organic
      .slice(0, maxResults)
      .map(
        (item: { title: string; link: string; snippet: string }, index: number) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          position: index + 1,
        })
      );
  } catch {
    logger.warn('Failed to parse Serper response');
    return [];
  }
}

export default createSerperTool;
