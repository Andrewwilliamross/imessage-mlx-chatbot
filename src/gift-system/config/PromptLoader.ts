/**
 * PromptLoader - Loads and manages Handlebars templates for system prompts
 *
 * Follows the established service patterns:
 * - Async initialization with load/reload
 * - Template caching for performance
 * - Handlebars helpers for date formatting
 * - Graceful fallbacks for missing templates
 */

import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import {
  PromptContext,
  CompiledTemplate,
  LoaderStatus,
  ConfigLoader
} from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PromptLoader');

/**
 * Handlebars template delegate type
 */
type HandlebarsTemplateDelegate = ReturnType<typeof Handlebars.compile>;

/**
 * PromptLoader - Manages Handlebars templates for system prompts
 *
 * Features:
 * - Template caching with invalidation
 * - Custom Handlebars helpers
 * - Partial template support for themes
 * - Fallback templates for missing files
 */
export class PromptLoader implements ConfigLoader<Map<string, CompiledTemplate>> {
  private promptsPath: string;
  private resolvedPath: string = '';
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private partialCache: Set<string> = new Set();
  private initialized: boolean = false;
  private loadedAt: Date | null = null;
  private loadError: string | null = null;

  constructor(promptsPath: string = './prompts') {
    this.promptsPath = promptsPath;
    this.registerHelpers();
    logger.debug('PromptLoader initialized', { promptsPath });
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    // String helpers
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str?.toUpperCase() ?? '';
    });

    Handlebars.registerHelper('lowercase', (str: string) => {
      return str?.toLowerCase() ?? '';
    });

    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Date helpers
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      if (!date) return '';
      const d = new Date(date);
      switch (format) {
        case 'weekday':
          return d.toLocaleDateString('en-US', { weekday: 'long' });
        case 'short':
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'full':
          return d.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
        default:
          return d.toLocaleDateString('en-US');
      }
    });

    // List helpers
    Handlebars.registerHelper('join', (arr: string[], separator: string) => {
      if (!Array.isArray(arr)) return '';
      const sep = typeof separator === 'string' ? separator : ', ';
      return arr.join(sep);
    });

    Handlebars.registerHelper('first', (arr: unknown[]) => {
      return Array.isArray(arr) ? arr[0] : undefined;
    });

    Handlebars.registerHelper('last', (arr: unknown[]) => {
      return Array.isArray(arr) ? arr[arr.length - 1] : undefined;
    });

    // Conditional helpers
    Handlebars.registerHelper('ifEquals', function(
      this: unknown,
      arg1: unknown,
      arg2: unknown,
      options: Handlebars.HelperOptions
    ) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('unless', function(
      this: unknown,
      conditional: unknown,
      options: Handlebars.HelperOptions
    ) {
      return !conditional ? options.fn(this) : options.inverse(this);
    });

    // Season helper
    Handlebars.registerHelper('season', (date: Date) => {
      const d = new Date(date || Date.now());
      const month = d.getMonth();
      if (month >= 2 && month <= 4) return 'spring';
      if (month >= 5 && month <= 7) return 'summer';
      if (month >= 8 && month <= 10) return 'fall';
      return 'winter';
    });

    logger.debug('Handlebars helpers registered');
  }

  /**
   * Initialize and verify prompts directory
   */
  async load(): Promise<Map<string, CompiledTemplate>> {
    const correlationId = logger.generateCorrelationId();

    try {
      this.resolvedPath = path.resolve(this.promptsPath);

      logger.info('Loading prompts directory', {
        path: this.resolvedPath,
        correlationId
      });

      // Check directory exists
      try {
        await fs.access(this.resolvedPath);
      } catch {
        throw new Error(`Prompts directory not found: ${this.resolvedPath}`);
      }

      // Verify directory structure
      const requiredDirs = ['base', 'family', 'special'];
      for (const dir of requiredDirs) {
        const dirPath = path.join(this.resolvedPath, dir);
        try {
          await fs.access(dirPath);
        } catch {
          logger.warn(`Optional prompts subdirectory missing: ${dir}`, { correlationId });
        }
      }

      this.initialized = true;
      this.loadedAt = new Date();
      this.loadError = null;

      logger.info('Prompts directory loaded successfully', {
        path: this.resolvedPath,
        correlationId
      });

      return this.templateCache;

    } catch (error) {
      const err = error as Error;
      this.loadError = err.message;

      logger.error('Failed to load prompts directory', {
        error: err,
        path: this.promptsPath,
        correlationId
      });

      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Force reload - clears cache and reinitializes
   */
  async reload(): Promise<Map<string, CompiledTemplate>> {
    logger.info('Reloading prompts');
    this.clearCache();
    this.initialized = false;
    return this.load();
  }

  /**
   * Get loader status
   */
  getStatus(): LoaderStatus {
    return {
      loaded: this.initialized,
      loadedAt: this.loadedAt || undefined,
      itemCount: this.templateCache.size,
      error: this.loadError || undefined
    };
  }

  /**
   * Load and compile a template file
   * Returns cached version if available
   */
  async loadTemplate(templatePath: string): Promise<HandlebarsTemplateDelegate> {
    // Check cache first
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath)!;
    }

    try {
      const fullPath = path.resolve(this.resolvedPath || this.promptsPath, templatePath);

      logger.debug('Loading template', { templatePath, fullPath });

      const content = await fs.readFile(fullPath, 'utf-8');
      const template = Handlebars.compile(content, {
        noEscape: true  // Don't escape HTML entities in output
      });

      this.templateCache.set(templatePath, template);

      logger.debug('Template compiled and cached', { templatePath });

      return template;

    } catch (error) {
      logger.warn('Template not found, using fallback', {
        templatePath,
        error: (error as Error).message
      });

      // Return a simple fallback template
      const fallback = Handlebars.compile(
        'Generate a warm, personalized message for {{name}}. Today is {{dayOfWeek}}, {{fullDate}}. Theme: {{themeName}}.'
      );

      return fallback;
    }
  }

  /**
   * Build the complete proactive system prompt for a family member
   */
  async buildProactivePrompt(
    memberId: string,
    context: PromptContext
  ): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.load();
    }

    const correlationId = logger.generateCorrelationId();

    try {
      // Register theme partial if it exists
      await this.registerThemePartial(memberId, context.themeTemplate);

      // Load the main proactive template
      const templatePath = `family/${memberId}/proactive.hbs`;
      const template = await this.loadTemplate(templatePath);

      // Render with context
      const prompt = template(context);

      logger.debug('Built proactive prompt', {
        memberId,
        theme: context.themeName,
        promptLength: prompt.length,
        correlationId
      });

      return prompt;

    } catch (error) {
      logger.error('Failed to build proactive prompt', {
        error: error as Error,
        memberId,
        correlationId
      });

      // Return a minimal fallback prompt
      return this.buildFallbackPrompt(context);

    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Build the reply handling system prompt for a family member
   */
  async buildReplyPrompt(
    memberId: string,
    context: PromptContext
  ): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.load();
    }

    try {
      const templatePath = `family/${memberId}/reply.hbs`;
      const template = await this.loadTemplate(templatePath);

      return template(context);

    } catch (error) {
      logger.warn('Failed to load reply template, using fallback', {
        error: (error as Error).message,
        memberId
      });

      return this.buildFallbackReplyPrompt(context);
    }
  }

  /**
   * Build a special occasion prompt (birthday, holiday, etc.)
   */
  async buildSpecialPrompt(
    occasionId: string,
    context: PromptContext
  ): Promise<string> {
    if (!this.initialized) {
      await this.load();
    }

    try {
      const templatePath = `special/${occasionId}.hbs`;
      const template = await this.loadTemplate(templatePath);

      return template(context);

    } catch (error) {
      logger.warn('Special occasion template not found', {
        occasionId,
        error: (error as Error).message
      });

      // Fall back to regular proactive prompt
      return this.buildFallbackPrompt(context);
    }
  }

  /**
   * Register a theme-specific partial template
   */
  private async registerThemePartial(
    memberId: string,
    themeTemplate: string
  ): Promise<void> {
    const partialKey = `themes/${themeTemplate}`;

    // Skip if already registered
    if (this.partialCache.has(partialKey)) {
      return;
    }

    const themePath = path.resolve(
      this.resolvedPath || this.promptsPath,
      `family/${memberId}/themes/${themeTemplate}.hbs`
    );

    try {
      const themeContent = await fs.readFile(themePath, 'utf-8');
      Handlebars.registerPartial(partialKey, themeContent);
      this.partialCache.add(partialKey);

      logger.debug('Registered theme partial', { memberId, themeTemplate });

    } catch {
      // Theme partial is optional - many prompts work without them
      logger.debug('Theme partial not found (optional)', {
        memberId,
        themeTemplate
      });
    }
  }

  /**
   * Build a minimal fallback prompt when templates are missing
   */
  private buildFallbackPrompt(context: PromptContext): string {
    return `You are sending a warm, personalized morning message to ${context.name}.

Today is ${context.dayOfWeek}, ${context.fullDate}.
Theme: ${context.themeName}

${context.webSearchEnabled ? `You have access to web search. Consider searching for relevant, current information.` : ''}

Their interests include: ${context.interests.join(', ')}

Guidelines:
- Keep the message concise (2-4 sentences)
- Be genuine and warm
- Sign off naturally`;
  }

  /**
   * Build a minimal fallback reply prompt
   */
  private buildFallbackReplyPrompt(context: PromptContext): string {
    return `You are a warm, supportive AI assistant chatting with ${context.name}.

Their interests: ${context.interests.join(', ')}

Guidelines:
- Keep responses conversational and genuine
- Match their energy - if brief, be brief; if detailed, engage fully
- Remember context from the conversation`;
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.partialCache.clear();
    logger.debug('Template cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { templates: number; partials: number } {
    return {
      templates: this.templateCache.size,
      partials: this.partialCache.size
    };
  }

  /**
   * Check if a template exists
   */
  async templateExists(templatePath: string): Promise<boolean> {
    const fullPath = path.resolve(
      this.resolvedPath || this.promptsPath,
      templatePath
    );

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available templates for a family member
   */
  async listMemberTemplates(memberId: string): Promise<string[]> {
    const memberDir = path.resolve(
      this.resolvedPath || this.promptsPath,
      `family/${memberId}`
    );

    try {
      const entries = await fs.readdir(memberDir, { withFileTypes: true });
      const templates: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.hbs')) {
          templates.push(entry.name.replace('.hbs', ''));
        } else if (entry.isDirectory() && entry.name === 'themes') {
          // List theme templates
          const themesDir = path.join(memberDir, 'themes');
          const themeFiles = await fs.readdir(themesDir);
          for (const themeFile of themeFiles) {
            if (themeFile.endsWith('.hbs')) {
              templates.push(`themes/${themeFile.replace('.hbs', '')}`);
            }
          }
        }
      }

      return templates;

    } catch {
      return [];
    }
  }
}

/**
 * Create a PromptLoader instance
 * Factory function for dependency injection
 */
export function createPromptLoader(promptsPath?: string): PromptLoader {
  return new PromptLoader(promptsPath);
}

export default PromptLoader;
