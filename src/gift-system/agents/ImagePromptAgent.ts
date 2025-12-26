/**
 * Image Prompt Agent
 *
 * Subagent specialized in generating high-quality image prompts
 * for FLUX image generation. Creates contextual, evocative prompts
 * based on the message content and recipient's interests.
 *
 * Simplified structure - no theme templates
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createLogger } from '../../utils/logger.js';
import type { ImagePromptAgentConfig, ImagePromptContext } from './types.js';

const logger = createLogger('ImagePromptAgent');

/**
 * System prompt for the image prompt generation agent
 */
const IMAGE_PROMPT_SYSTEM = `You are an expert at creating image generation prompts for FLUX, a state-of-the-art image generation model.

Your task is to create a detailed, evocative image prompt that captures the essence of a personalized message.

Guidelines:
- Create vivid, specific descriptions that paint a clear picture
- Include artistic style elements (lighting, composition, mood)
- Consider the recipient's interests and incorporate relevant themes
- Make the image feel personal and meaningful, not generic
- Keep prompts concise but descriptive (50-100 words)
- Avoid text in images (FLUX handles text poorly)
- Focus on beautiful, uplifting imagery

Output ONLY the image prompt, nothing else. No explanations, no formatting, just the prompt.`;

/**
 * ImagePromptAgent - Generates contextual prompts for FLUX image generation
 */
export class ImagePromptAgent {
  private llm: ChatOpenAI;
  private config: ImagePromptAgentConfig;

  constructor(config: ImagePromptAgentConfig) {
    this.config = config;

    // Configure ChatOpenAI for OpenRouter
    this.llm = new ChatOpenAI({
      apiKey: config.openRouterApiKey,
      modelName: config.model,
      temperature: config.temperature,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    });

    logger.debug('ImagePromptAgent initialized', {
      model: config.model,
      temperature: config.temperature,
    });
  }

  /**
   * Generate an image prompt based on context
   */
  async generatePrompt(context: ImagePromptContext): Promise<string> {
    const userPrompt = this.buildUserPrompt(context);

    logger.info('Generating image prompt', {
      memberName: context.memberName,
      interestsCount: context.memberInterests.length,
    });

    try {
      const response = await this.llm.invoke([
        new SystemMessage(IMAGE_PROMPT_SYSTEM),
        new HumanMessage(userPrompt),
      ]);

      const imagePrompt = typeof response.content === 'string'
        ? response.content.trim()
        : String(response.content).trim();

      logger.info('Image prompt generated', {
        promptLength: imagePrompt.length,
        preview: imagePrompt.substring(0, 50) + '...',
      });

      return imagePrompt;
    } catch (error) {
      logger.error('Failed to generate image prompt', { error });
      // Return a fallback prompt
      return this.buildFallbackPrompt(context);
    }
  }

  /**
   * Build the user prompt for the LLM
   */
  private buildUserPrompt(context: ImagePromptContext): string {
    const parts = [
      `Create an image prompt for a personalized daily message.`,
      ``,
      `Recipient: ${context.memberName}`,
      `Their Interests: ${context.memberInterests.join(', ')}`,
    ];

    if (context.imageStyle) {
      parts.push(`Preferred Style: ${context.imageStyle}`);
    }

    parts.push(``, `Message Content:`, context.messageContent);

    return parts.join('\n');
  }

  /**
   * Build a fallback prompt when LLM fails
   */
  private buildFallbackPrompt(context: ImagePromptContext): string {
    const style = context.imageStyle ?? 'warm, inviting lighting';
    const interest = context.memberInterests[0] ?? 'nature';

    return `A beautiful, ${style} scene inspired by ${interest}, painted with soft watercolor strokes, peaceful and uplifting atmosphere`;
  }
}

/**
 * Create a configured ImagePromptAgent
 */
export function createImagePromptAgent(config: ImagePromptAgentConfig): ImagePromptAgent {
  return new ImagePromptAgent(config);
}

export default ImagePromptAgent;
