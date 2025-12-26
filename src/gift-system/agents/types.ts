/**
 * Daily Gift Agent Type Definitions
 *
 * Types for the LangGraph-based agent system that generates
 * personalized daily messages with web search and image generation.
 *
 * Simplified structure - no theme templates, just proactive.md and reply.md per user
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { FamilyMember, GeneratedImage } from '../types.js';

/**
 * Search result from Serper API
 */
export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

/**
 * State for the DailyGiftAgent workflow
 */
export interface DailyGiftAgentState {
  /** Target family member */
  member: FamilyMember;
  /** LangChain message history for the agent */
  messages: BaseMessage[];
  /** Search results from Serper */
  searchResults: SerperSearchResult[];
  /** Generated image prompt for FLUX */
  imagePrompt: string | null;
  /** Generated message text */
  generatedText: string | null;
  /** Generated image (if enabled) */
  generatedImage: GeneratedImage | null;
  /** Tokens used during generation */
  tokensUsed: number;
  /** Tools that were invoked */
  toolsInvoked: string[];
  /** Whether fallback was used */
  fallbackUsed: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Input for starting a daily gift generation
 */
export interface DailyGiftInput {
  member: FamilyMember;
}

/**
 * Output from a completed daily gift generation
 */
export interface DailyGiftOutput {
  success: boolean;
  text: string;
  imagePrompt: string | null;
  image: GeneratedImage | null;
  tokensUsed: number;
  toolsInvoked: string[];
  fallbackUsed: boolean;
  error: string | null;
}

/**
 * Configuration for the DailyGiftAgent
 */
export interface DailyGiftAgentConfig {
  /** OpenRouter API key */
  openRouterApiKey: string;
  /** Model to use (e.g., 'anthropic/claude-3.5-sonnet') */
  model: string;
  /** Temperature for generation */
  temperature: number;
  /** Max tokens for generation */
  maxTokens: number;
  /** Serper API key for web search (optional - if not provided, search is disabled) */
  serperApiKey?: string;
  /** Path to prompts directory */
  promptsPath: string;
  /** Whether image generation is enabled */
  imageEnabled: boolean;
  /** Image model to use */
  imageModel: string;
  /** Max search results to return */
  maxSearchResults: number;
}

/**
 * Configuration for the ImagePromptAgent
 */
export interface ImagePromptAgentConfig {
  /** OpenRouter API key */
  openRouterApiKey: string;
  /** Model to use for prompt generation */
  model: string;
  /** Temperature for creativity */
  temperature: number;
}

/**
 * Context for image prompt generation
 */
export interface ImagePromptContext {
  memberName: string;
  memberInterests: string[];
  messageContent: string;
  imageStyle?: string;
}
