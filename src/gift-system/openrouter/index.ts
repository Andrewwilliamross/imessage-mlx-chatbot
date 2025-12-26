/**
 * OpenRouter Module - API integration with tool calling support
 *
 * This module provides:
 * - OpenRouterClient: Main API client with chat completions and image generation
 * - WebSearchTool: Multi-provider web search (Exa, Tavily, SerpAPI)
 * - ToolDefinitions: Schema definitions for AI function calling
 */

// Client
export {
  OpenRouterClient,
  createOpenRouterClient,
  type OpenRouterConfig,
  type GenerateOptions,
  type ImageGenerateOptions
} from './OpenRouterClient.js';

// Web Search Tool
export {
  WebSearchTool,
  createWebSearchTool,
  type WebSearchConfig
} from './WebSearchTool.js';

// Tool Definitions
export {
  WEB_SEARCH_TOOL,
  getProactiveTools,
  getEnabledTools,
  TOOL_NAMES,
  type ToolName
} from './ToolDefinitions.js';
