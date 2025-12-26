/**
 * Tool Definitions for OpenRouter API
 *
 * Defines the tools available for the AI to use during proactive message generation.
 * Follows the OpenAI function calling format supported by OpenRouter.
 */

import { OpenRouterTool } from '../types.js';

/**
 * Web Search Tool Definition
 *
 * Enables real-time information retrieval for:
 * - Current events and news
 * - Bible verses and devotionals
 * - Recipes and cooking tips
 * - Local events and venues
 * - Historical facts
 */
export const WEB_SEARCH_TOOL: OpenRouterTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for real-time information. Use for:
- Current events, news, and what's happening today
- Bible verses, devotional content, and spiritual readings
- Recipes, cooking tips, and food-related content
- Local events, venues, and music shows (especially Nashville)
- Historical facts and "on this day" information
- Travel destinations and recommendations
- Design trends and interior decorating ideas
- Fashion trends and style guides
- Fitness routines and wellness tips
- Art movements and artist information`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query - be specific and include relevant context like dates, locations, or topics'
        },
        category: {
          type: 'string',
          description: 'Category to help refine and prioritize results',
          enum: ['news', 'events', 'recipes', 'venues', 'general', 'religious', 'travel', 'design', 'fashion', 'fitness', 'art', 'history']
        },
        location: {
          type: 'string',
          description: 'Location to localize results (e.g., "Nashville, TN", "Los Angeles, CA")'
        }
      },
      required: ['query']
    }
  }
};

/**
 * Get all available tools for proactive message generation
 *
 * Currently includes:
 * - web_search: Real-time information retrieval
 *
 * Future additions planned:
 * - generate_image: AI image generation (Phase 3)
 * - get_weather: Weather information
 * - get_calendar_events: Calendar integration
 */
export function getProactiveTools(): OpenRouterTool[] {
  return [WEB_SEARCH_TOOL];
}

/**
 * Get tools based on feature flags
 *
 * @param webSearchEnabled - Whether web search is enabled for this member
 * @param imageEnabled - Whether image generation is enabled (future)
 */
export function getEnabledTools(options: {
  webSearchEnabled?: boolean;
  imageEnabled?: boolean;
}): OpenRouterTool[] {
  const tools: OpenRouterTool[] = [];

  if (options.webSearchEnabled !== false) {
    tools.push(WEB_SEARCH_TOOL);
  }

  // Future: Add image generation tool when Phase 3 is implemented
  // if (options.imageEnabled !== false) {
  //   tools.push(IMAGE_GENERATION_TOOL);
  // }

  return tools;
}

/**
 * Tool name constants for type safety
 */
export const TOOL_NAMES = {
  WEB_SEARCH: 'web_search',
  // Future tools:
  // GENERATE_IMAGE: 'generate_image',
  // GET_WEATHER: 'get_weather',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

export default {
  WEB_SEARCH_TOOL,
  getProactiveTools,
  getEnabledTools,
  TOOL_NAMES
};
