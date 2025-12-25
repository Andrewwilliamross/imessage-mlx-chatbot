# Family Daily Gift System - Feature Roadmap

## Executive Summary

This roadmap extends the core iMessage MLX Chatbot with a **dual-model architecture** for personalized family messaging:

| Message Type | Model | Provider | Capabilities |
|--------------|-------|----------|--------------|
| **Daily Proactive Messages** | Claude/GPT-4 | OpenRouter | Web search, image generation, tools |
| **Reply Handling** | Llama-3.2-3B | Local MLX | Fast, private, conversational |

This separation enables rich, context-aware daily content (real Nashville events, current recipes, live information) while maintaining fast, private response handling for any replies.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                     FAMILY DAILY GIFT SYSTEM - DUAL MODEL ARCHITECTURE             │
│                                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                        PROACTIVE DAILY MESSAGES                              │  │
│  │                         (Scheduled, Tool-Enabled)                            │  │
│  │                                                                              │  │
│  │   ┌─────────────┐      ┌───────────────────────────────────────────────┐   │  │
│  │   │  Scheduler  │──────│              OpenRouter API                   │   │  │
│  │   │  (node-     │      │  ┌─────────────┐  ┌──────────────────────┐   │   │  │
│  │   │  schedule)  │      │  │ Web Search  │  │  Image Generation    │   │   │  │
│  │   │             │      │  │ (Exa/Tavily)│  │  (Flux/DALL-E)       │   │   │  │
│  │   │  6:30 AM    │      │  └─────────────┘  └──────────────────────┘   │   │  │
│  │   │  7:00 AM    │      │  ┌─────────────────────────────────────────┐ │   │  │
│  │   │  7:30 AM    │      │  │  LLM w/ Tools (Claude/GPT-4)            │ │   │  │
│  │   │  8:00 AM    │      │  │  - Crafts personalized messages         │ │   │  │
│  │   └──────┬──────┘      │  │  - Invokes web search for real data     │ │   │  │
│  │          │             │  │  - Generates image prompts              │ │   │  │
│  │          │             │  └─────────────────────────────────────────┘ │   │  │
│  │          │             └────────────────────┬──────────────────────────┘   │  │
│  │          │                                  │                              │  │
│  │          │                                  ▼                              │  │
│  │          │             ┌───────────────────────────────────────────────┐   │  │
│  │          │             │          Generated Content                    │   │  │
│  │          │             │  • Personalized text message                  │   │  │
│  │          │             │  • AI-generated image (optional)              │   │  │
│  │          │             │  • Real-time data (events, recipes, verses)   │   │  │
│  │          │             └────────────────────┬──────────────────────────┘   │  │
│  │          │                                  │                              │  │
│  │          └──────────────────────────────────┼──────────────────────────────┘  │
│  │                                             │                                  │
│  │                                             ▼                                  │
│  │                      ┌───────────────────────────────────────────┐            │
│  │                      │        MessageService (AppleScript)       │            │
│  │                      │   • sendMessage(phone, text)              │            │
│  │                      │   • sendMediaMessage(phone, text, image)  │            │
│  │                      └───────────────────────────────────────────┘            │
│  │                                                                                │
│  └────────────────────────────────────────────────────────────────────────────────┘
│                                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                          REPLY HANDLING                                      │  │
│  │                     (Reactive, Fast, Private)                                │  │
│  │                                                                              │  │
│  │   ┌─────────────┐      ┌───────────────────────────────────────────────┐   │  │
│  │   │ MessageSync │──────│           Local MLX-LM API                    │   │  │
│  │   │ (chat.db    │      │  ┌─────────────────────────────────────────┐ │   │  │
│  │   │  polling)   │      │  │   Llama-3.2-3B-Instruct-4bit            │ │   │  │
│  │   │             │      │  │   • Fast inference (~1-3s)              │ │   │  │
│  │   │  Family     │      │  │   • Maintains conversation context      │ │   │  │
│  │   │  member     │      │  │   • Personality-aware system prompts    │ │   │  │
│  │   │  replies    │      │  │   • 100% local, no API costs            │ │   │  │
│  │   └──────┬──────┘      │  └─────────────────────────────────────────┘ │   │  │
│  │          │             └────────────────────┬──────────────────────────┘   │  │
│  │          │                                  │                              │  │
│  │          │                                  ▼                              │  │
│  │          │             ┌───────────────────────────────────────────────┐   │  │
│  │          │             │        MessageService (AppleScript)           │   │  │
│  │          │             │        Reply sent to family member            │   │  │
│  │          │             └───────────────────────────────────────────────┘   │  │
│  │          │                                                                 │  │
│  └──────────┴─────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Configuration (Days 1-2)

### Objectives
- Set up project structure for Family Gift System
- Configure OpenRouter API integration
- Define family member profiles and schedules

### 1.1 Create Directory Structure

```
src/
├── gift-system/
│   ├── config/
│   │   ├── FamilyProfiles.ts        # Family member definitions
│   │   ├── OpenRouterConfig.ts      # API configuration
│   │   └── ScheduleConfig.ts        # Timing and timezone settings
│   ├── scheduler/
│   │   ├── GiftScheduler.ts         # Main orchestrator
│   │   └── ScheduleManager.ts       # Cron job management
│   ├── content/
│   │   ├── ContentGenerator.ts      # Proactive message generation
│   │   ├── ToolOrchestrator.ts      # Web search + image coordination
│   │   └── templates/
│   │       ├── dad.ts
│   │       ├── mom.ts
│   │       ├── sister.ts
│   │       ├── brother.ts
│   │       └── grandma.ts
│   ├── openrouter/
│   │   ├── OpenRouterClient.ts      # API client
│   │   ├── WebSearchTool.ts         # Web search integration
│   │   ├── ImageGenerationTool.ts   # Image generation
│   │   └── ToolDefinitions.ts       # Tool schemas
│   ├── image/
│   │   ├── ImageGenerator.ts        # Image pipeline orchestrator
│   │   ├── PhotosLibrary.ts         # macOS Photos integration
│   │   └── ImageStorage.ts          # Local file management
│   ├── reply/
│   │   ├── ReplyHandler.ts          # Routes replies to local MLX
│   │   └── FamilyContextManager.ts  # Per-member conversation state
│   ├── types/
│   │   └── index.ts                 # All type definitions
│   └── index.ts                     # Module entry point
├── gift-main.ts                     # Standalone entry point
```

### 1.2 Environment Configuration

**File: `.env` additions**
```bash
# ═══════════════════════════════════════════════════════════════════
# FAMILY DAILY GIFT SYSTEM CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

# ─── OpenRouter API (Proactive Messages) ───
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxx
OPENROUTER_LLM_MODEL=anthropic/claude-3.5-sonnet      # For text generation
OPENROUTER_IMAGE_MODEL=black-forest-labs/flux-1.1-pro # For image generation

# ─── Web Search Tool ───
OPENROUTER_WEB_SEARCH_ENABLED=true
OPENROUTER_WEB_SEARCH_PROVIDER=exa     # Options: exa, tavily, serp

# ─── Image Generation ───
IMAGE_GENERATION_ENABLED=true
IMAGE_SAVE_PATH=~/Pictures/FamilyGifts
IMAGE_SIZE=1024x1024
PHOTOS_ALBUM_NAME=Family Gifts
PHOTOS_INTEGRATION_ENABLED=true

# ─── Local MLX (Reply Handling) ───
MLX_API_URL=http://localhost:8000
MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit

# ─── Gift System Settings ───
GIFT_SYSTEM_ENABLED=true
GIFT_DEFAULT_TIMEZONE=America/Chicago

# ─── Family Member Configuration ───
# Dad (David)
FAMILY_DAD_ENABLED=true
FAMILY_DAD_NAME=David
FAMILY_DAD_PHONE=+1XXXXXXXXXX
FAMILY_DAD_SEND_TIME=06:30
FAMILY_DAD_TIMEZONE=America/Chicago

# Mom
FAMILY_MOM_ENABLED=true
FAMILY_MOM_NAME=Mom
FAMILY_MOM_PHONE=+1XXXXXXXXXX
FAMILY_MOM_SEND_TIME=07:00
FAMILY_MOM_TIMEZONE=America/Chicago

# Sister (USC)
FAMILY_SISTER_ENABLED=true
FAMILY_SISTER_NAME=Sister
FAMILY_SISTER_PHONE=+1XXXXXXXXXX
FAMILY_SISTER_SEND_TIME=08:00
FAMILY_SISTER_TIMEZONE=America/Los_Angeles

# Brother
FAMILY_BROTHER_ENABLED=true
FAMILY_BROTHER_NAME=Brother
FAMILY_BROTHER_PHONE=+1XXXXXXXXXX
FAMILY_BROTHER_SEND_TIME=07:30
FAMILY_BROTHER_TIMEZONE=America/Chicago

# Grandma
FAMILY_GRANDMA_ENABLED=true
FAMILY_GRANDMA_NAME=Grandma
FAMILY_GRANDMA_PHONE=+1XXXXXXXXXX
FAMILY_GRANDMA_SEND_TIME=07:00
FAMILY_GRANDMA_TIMEZONE=America/Chicago
```

### 1.3 Core Types Definition

**File: `src/gift-system/types/index.ts`**
```typescript
// ═══════════════════════════════════════════════════════════════════
// FAMILY GIFT SYSTEM - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface FamilyMember {
  id: string;
  name: string;
  phone: string;
  sendTime: string;           // "06:30" format
  timezone: string;           // "America/Chicago"
  interests: string[];
  themes: WeeklyTheme[];
  systemPrompt: string;       // For proactive messages (OpenRouter)
  replySystemPrompt: string;  // For replies (local MLX)
  imageEnabled: boolean;
  webSearchEnabled: boolean;
  enabled: boolean;
}

export interface WeeklyTheme {
  dayOfWeek: number;          // 0=Sunday, 6=Saturday
  themeName: string;
  description: string;
  promptTemplate: string;
  imageStyle?: string;
  webSearchQuery?: string;    // Template for dynamic search
  includeImage: boolean;
  includeWebSearch: boolean;
}

export interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
}

export interface GeneratedContent {
  text: string;
  image?: GeneratedImage;
  webSearchResults?: WebSearchResult[];
  model: string;
  tokensUsed: number;
  toolsInvoked: string[];
}

export interface GeneratedImage {
  localPath: string;
  prompt: string;
  model: string;
  timestamp: Date;
  addedToPhotos: boolean;
}

export interface DailyGiftResult {
  familyMemberId: string;
  scheduledTime: Date;
  sentTime: Date;
  theme: string;
  content: GeneratedContent;
  success: boolean;
  error?: string;
}

export type MessageType = 'proactive' | 'reply';
```

### 1.4 Deliverables
- [ ] Directory structure created
- [ ] Environment variables defined
- [ ] Type definitions complete
- [ ] Family member profiles documented

---

## Phase 2: OpenRouter Integration with Tools (Days 3-5)

### Objectives
- Implement OpenRouter API client with tool calling support
- Create web search tool integration
- Build image generation pipeline

### 2.1 OpenRouter Client with Tools

**File: `src/gift-system/openrouter/OpenRouterClient.ts`**
```typescript
import logger from '../../utils/logger.js';
import { OpenRouterTool, WebSearchResult } from '../types/index.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'anthropic/claude-3.5-sonnet') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  /**
   * Generate content with optional tool calling
   */
  async generateWithTools(
    messages: ChatMessage[],
    tools?: OpenRouterTool[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<{
    response: string;
    toolCalls: ToolCall[];
    usage: { promptTokens: number; completionTokens: number };
  }> {
    const {
      model = this.defaultModel,
      maxTokens = 1024,
      temperature = 0.7
    } = options;

    logger.info('OpenRouter request', { model, messageCount: messages.length, toolCount: tools?.length });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/imessage-mlx-chatbot',
        'X-Title': 'Family Gift System'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as OpenRouterResponse;
    const choice = result.choices[0];

    return {
      response: choice.message.content || '',
      toolCalls: choice.message.tool_calls || [],
      usage: {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens
      }
    };
  }

  /**
   * Generate image via OpenRouter
   */
  async generateImage(
    prompt: string,
    options: { model?: string; size?: string } = {}
  ): Promise<{ url?: string; b64_json?: string }> {
    const {
      model = 'black-forest-labs/flux-1.1-pro',
      size = '1024x1024'
    } = options;

    logger.info('Generating image', { model, promptPreview: prompt.substring(0, 50) });

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/imessage-mlx-chatbot',
        'X-Title': 'Family Gift System'
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter image generation error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result.data[0];
  }
}
```

### 2.2 Web Search Tool

**File: `src/gift-system/openrouter/WebSearchTool.ts`**
```typescript
import logger from '../../utils/logger.js';
import { WebSearchResult, OpenRouterTool } from '../types/index.js';

export const WEB_SEARCH_TOOL_DEFINITION: OpenRouterTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for real-time information. Use this to find current events, live information, recent news, recipes, venue details, or any information that needs to be current and accurate.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant information'
        },
        category: {
          type: 'string',
          enum: ['news', 'events', 'recipes', 'venues', 'general', 'religious'],
          description: 'Category of search to help refine results'
        },
        location: {
          type: 'string',
          description: 'Optional location to localize results (e.g., "Nashville, TN")'
        }
      },
      required: ['query']
    }
  }
};

export class WebSearchTool {
  private provider: 'exa' | 'tavily' | 'serp';
  private apiKey: string;

  constructor(provider: 'exa' | 'tavily' | 'serp', apiKey: string) {
    this.provider = provider;
    this.apiKey = apiKey;
  }

  /**
   * Execute a web search and return formatted results
   */
  async search(
    query: string,
    options: { category?: string; location?: string; numResults?: number } = {}
  ): Promise<WebSearchResult[]> {
    const { numResults = 5, location } = options;

    // Enhance query with location if provided
    const enhancedQuery = location ? `${query} ${location}` : query;

    logger.info('Web search executing', { query: enhancedQuery, provider: this.provider });

    switch (this.provider) {
      case 'exa':
        return this.searchExa(enhancedQuery, numResults);
      case 'tavily':
        return this.searchTavily(enhancedQuery, numResults);
      case 'serp':
        return this.searchSerp(enhancedQuery, numResults);
      default:
        throw new Error(`Unknown search provider: ${this.provider}`);
    }
  }

  private async searchExa(query: string, numResults: number): Promise<WebSearchResult[]> {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        query,
        numResults,
        useAutoprompt: true,
        type: 'neural'
      })
    });

    if (!response.ok) {
      throw new Error(`Exa search error: ${response.status}`);
    }

    const data = await response.json();
    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.text?.substring(0, 300) || '',
      publishedDate: r.publishedDate
    }));
  }

  private async searchTavily(query: string, numResults: number): Promise<WebSearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        query,
        max_results: numResults,
        include_answer: true
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily search error: ${response.status}`);
    }

    const data = await response.json();
    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.substring(0, 300) || '',
      content: r.content
    }));
  }

  private async searchSerp(query: string, numResults: number): Promise<WebSearchResult[]> {
    // SerpAPI implementation
    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      num: numResults.toString()
    });

    const response = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!response.ok) {
      throw new Error(`SerpAPI error: ${response.status}`);
    }

    const data = await response.json();
    return (data.organic_results || []).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet || ''
    }));
  }

  /**
   * Format search results for LLM consumption
   */
  formatResultsForLLM(results: WebSearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
    ).join('\n\n');
  }
}
```

### 2.3 Tool Orchestrator

**File: `src/gift-system/content/ToolOrchestrator.ts`**
```typescript
import { OpenRouterClient } from '../openrouter/OpenRouterClient.js';
import { WebSearchTool, WEB_SEARCH_TOOL_DEFINITION } from '../openrouter/WebSearchTool.js';
import { ImageGenerationTool } from '../openrouter/ImageGenerationTool.js';
import { FamilyMember, WeeklyTheme, GeneratedContent, OpenRouterTool } from '../types/index.js';
import logger from '../../utils/logger.js';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class ToolOrchestrator {
  private openRouter: OpenRouterClient;
  private webSearch: WebSearchTool;
  private imageGenerator: ImageGenerationTool;

  constructor(
    openRouterApiKey: string,
    webSearchApiKey: string,
    config: {
      llmModel?: string;
      imageModel?: string;
      webSearchProvider?: 'exa' | 'tavily' | 'serp';
    } = {}
  ) {
    this.openRouter = new OpenRouterClient(
      openRouterApiKey,
      config.llmModel || 'anthropic/claude-3.5-sonnet'
    );
    this.webSearch = new WebSearchTool(
      config.webSearchProvider || 'exa',
      webSearchApiKey
    );
    this.imageGenerator = new ImageGenerationTool(
      openRouterApiKey,
      config.imageModel || 'black-forest-labs/flux-1.1-pro'
    );
  }

  /**
   * Generate a complete daily gift with tools
   */
  async generateDailyGift(
    member: FamilyMember,
    theme: WeeklyTheme,
    date: Date
  ): Promise<GeneratedContent> {
    const tools: OpenRouterTool[] = [];
    const toolsInvoked: string[] = [];
    let webSearchResults: WebSearchResult[] = [];

    // Add web search tool if enabled
    if (theme.includeWebSearch && member.webSearchEnabled) {
      tools.push(WEB_SEARCH_TOOL_DEFINITION);
    }

    // Build the system prompt with context
    const systemPrompt = this.buildSystemPrompt(member, theme, date);
    const userPrompt = this.buildUserPrompt(member, theme, date);

    // Initial generation with potential tool calls
    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let finalResponse = '';
    let totalTokens = 0;
    let iterations = 0;
    const maxIterations = 3;

    // Tool calling loop
    while (iterations < maxIterations) {
      iterations++;

      const result = await this.openRouter.generateWithTools(
        messages,
        tools.length > 0 ? tools : undefined,
        { maxTokens: 1024, temperature: 0.8 }
      );

      totalTokens += result.usage.promptTokens + result.usage.completionTokens;

      // If no tool calls, we have our final response
      if (result.toolCalls.length === 0) {
        finalResponse = result.response;
        break;
      }

      // Process tool calls
      for (const toolCall of result.toolCalls) {
        const toolResult = await this.executeToolCall(toolCall, member);
        toolsInvoked.push(toolCall.function.name);

        if (toolCall.function.name === 'web_search') {
          webSearchResults = toolResult.results;
        }

        // Add assistant message with tool call
        messages.push({
          role: 'assistant',
          content: result.response,
          tool_calls: [toolCall]
        });

        // Add tool result
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
    }

    // Generate image if enabled
    let generatedImage: GeneratedImage | undefined;
    if (theme.includeImage && member.imageEnabled) {
      generatedImage = await this.generateImage(member, theme, date, finalResponse);
      if (generatedImage) {
        toolsInvoked.push('image_generation');
      }
    }

    return {
      text: finalResponse,
      image: generatedImage,
      webSearchResults: webSearchResults.length > 0 ? webSearchResults : undefined,
      model: 'anthropic/claude-3.5-sonnet',
      tokensUsed: totalTokens,
      toolsInvoked
    };
  }

  private async executeToolCall(
    toolCall: ToolCall,
    member: FamilyMember
  ): Promise<any> {
    const args = JSON.parse(toolCall.function.arguments);

    switch (toolCall.function.name) {
      case 'web_search':
        const results = await this.webSearch.search(args.query, {
          category: args.category,
          location: args.location
        });
        return {
          results,
          formatted: this.webSearch.formatResultsForLLM(results)
        };

      default:
        throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }
  }

  private async generateImage(
    member: FamilyMember,
    theme: WeeklyTheme,
    date: Date,
    messageContent: string
  ): Promise<GeneratedImage | undefined> {
    try {
      // Generate image prompt based on theme and message
      const imagePrompt = await this.generateImagePrompt(member, theme, messageContent);
      return await this.imageGenerator.generate(imagePrompt, member.id, theme.themeName, date);
    } catch (error) {
      logger.error('Image generation failed', { error, memberId: member.id });
      return undefined;
    }
  }

  private async generateImagePrompt(
    member: FamilyMember,
    theme: WeeklyTheme,
    messageContent: string
  ): Promise<string> {
    const result = await this.openRouter.generateWithTools(
      [
        {
          role: 'system',
          content: `You are an expert at crafting prompts for AI image generators. Create a single, detailed image prompt (2-3 sentences) based on the message content and theme. Include: subject, composition, lighting, art style, and mood. Output ONLY the prompt.`
        },
        {
          role: 'user',
          content: `Theme: ${theme.themeName}\nImage style: ${theme.imageStyle || 'high quality'}\nMessage content: ${messageContent}\n\nCreate an image prompt:`
        }
      ],
      undefined,
      { maxTokens: 200, temperature: 0.9 }
    );

    return result.response.trim();
  }

  private buildSystemPrompt(member: FamilyMember, theme: WeeklyTheme, date: Date): string {
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    return `${member.systemPrompt}

Today is ${dateStr}. Theme: ${theme.themeName} - ${theme.description}

You have access to web search if you need current information (events, news, venues, recipes, etc.). Use it to make the message more relevant and personalized.

Keep the message concise and suitable for iMessage (2-4 short paragraphs max). Sign off warmly but not formally.`;
  }

  private buildUserPrompt(member: FamilyMember, theme: WeeklyTheme, date: Date): string {
    return theme.promptTemplate
      .replace('{name}', member.name)
      .replace('{date}', date.toLocaleDateString())
      .replace('{dayOfWeek}', date.toLocaleDateString('en-US', { weekday: 'long' }));
  }
}
```

### 2.4 Deliverables
- [ ] OpenRouterClient with tool calling support
- [ ] WebSearchTool with Exa/Tavily/SerpAPI support
- [ ] ToolOrchestrator for coordinating generation
- [ ] Image prompt generation pipeline
- [ ] Unit tests for OpenRouter integration

---

## Phase 3: Image Generation Pipeline (Days 6-7)

### Objectives
- Complete image generation with Photos library integration
- Local storage and organization
- AppleScript Photos.app automation

### 3.1 Image Generation Tool

**File: `src/gift-system/openrouter/ImageGenerationTool.ts`**
```typescript
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GeneratedImage } from '../types/index.js';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export class ImageGenerationTool {
  private apiKey: string;
  private model: string;
  private savePath: string;
  private photosAlbumName: string;
  private photosEnabled: boolean;

  constructor(
    apiKey: string,
    model: string = 'black-forest-labs/flux-1.1-pro',
    config: {
      savePath?: string;
      photosAlbumName?: string;
      photosEnabled?: boolean;
    } = {}
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.savePath = config.savePath || '~/Pictures/FamilyGifts';
    this.photosAlbumName = config.photosAlbumName || 'Family Gifts';
    this.photosEnabled = config.photosEnabled ?? true;
  }

  /**
   * Generate an image and save it locally, optionally adding to Photos
   */
  async generate(
    prompt: string,
    memberId: string,
    themeName: string,
    date: Date
  ): Promise<GeneratedImage> {
    logger.info('Generating image', { memberId, theme: themeName });

    // Call OpenRouter image generation
    const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/imessage-mlx-chatbot',
        'X-Title': 'Family Gift System'
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: '1024x1024'
      })
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const result = await response.json();
    const imageData = result.data[0];

    // Save the image locally
    const dateStr = date.toISOString().split('T')[0];
    const safeThemeName = themeName.replace(/\s+/g, '-').toLowerCase();
    const filename = `${dateStr}-${safeThemeName}.png`;
    const memberDir = path.join(
      this.savePath.replace('~', process.env.HOME || ''),
      memberId
    );
    const localPath = path.join(memberDir, filename);

    await fs.mkdir(memberDir, { recursive: true });

    if (imageData.url) {
      await this.downloadImage(imageData.url, localPath);
    } else if (imageData.b64_json) {
      await fs.writeFile(localPath, Buffer.from(imageData.b64_json, 'base64'));
    }

    logger.info('Image saved', { path: localPath });

    // Import to Photos library
    let addedToPhotos = false;
    if (this.photosEnabled) {
      addedToPhotos = await this.importToPhotos(localPath);
    }

    return {
      localPath,
      prompt,
      model: this.model,
      timestamp: new Date(),
      addedToPhotos
    };
  }

  private async downloadImage(url: string, savePath: string): Promise<void> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(savePath, Buffer.from(buffer));
  }

  private async importToPhotos(imagePath: string): Promise<boolean> {
    const script = `
      tell application "Photos"
        activate
        delay 1

        -- Ensure album exists
        if not (exists album "${this.photosAlbumName}") then
          make new album named "${this.photosAlbumName}"
        end if

        -- Import image
        set theImage to import POSIX file "${imagePath}"

        -- Add to album
        add theImage to album "${this.photosAlbumName}"

        return "Success"
      end tell
    `;

    try {
      await execAsync(`osascript -e '${script}'`);
      logger.info('Image added to Photos', { album: this.photosAlbumName });
      return true;
    } catch (error) {
      logger.warn('Failed to import to Photos', { error });
      return false;
    }
  }
}
```

### 3.2 Deliverables
- [ ] ImageGenerationTool complete
- [ ] Photos library AppleScript integration
- [ ] Local storage with organized folder structure
- [ ] Error handling and fallback behavior

---

## Phase 4: Scheduler & Content Generation (Days 8-10)

### Objectives
- Implement node-schedule based scheduling
- Create content generation pipeline
- Build family-specific template system

### 4.1 Gift Scheduler

**File: `src/gift-system/scheduler/GiftScheduler.ts`**
```typescript
import schedule, { Job } from 'node-schedule';
import { FamilyMember, WeeklyTheme, DailyGiftResult } from '../types/index.js';
import { ToolOrchestrator } from '../content/ToolOrchestrator.js';
import { MessageService } from '../../services/MessageService.js';
import logger from '../../utils/logger.js';

export class GiftScheduler {
  private jobs: Map<string, Job> = new Map();
  private orchestrator: ToolOrchestrator;
  private messageService: MessageService;
  private familyMembers: FamilyMember[];

  constructor(
    orchestrator: ToolOrchestrator,
    messageService: MessageService,
    familyMembers: FamilyMember[]
  ) {
    this.orchestrator = orchestrator;
    this.messageService = messageService;
    this.familyMembers = familyMembers;
  }

  /**
   * Initialize all scheduled jobs for family members
   */
  async initialize(): Promise<void> {
    logger.info('Initializing gift scheduler', { memberCount: this.familyMembers.length });

    for (const member of this.familyMembers) {
      if (!member.enabled) {
        logger.debug(`Skipping disabled member: ${member.name}`);
        continue;
      }

      this.scheduleForMember(member);
    }

    logger.info('Gift scheduler initialized', { jobCount: this.jobs.size });
  }

  private scheduleForMember(member: FamilyMember): void {
    const [hour, minute] = member.sendTime.split(':').map(Number);

    // Create cron-like schedule rule
    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = member.timezone;

    const job = schedule.scheduleJob(rule, async () => {
      await this.sendDailyGift(member);
    });

    this.jobs.set(member.id, job);
    logger.info(`Scheduled daily gift for ${member.name}`, {
      time: member.sendTime,
      timezone: member.timezone
    });
  }

  /**
   * Send the daily gift to a family member
   */
  private async sendDailyGift(member: FamilyMember): Promise<DailyGiftResult> {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Find today's theme
    const theme = member.themes.find(t => t.dayOfWeek === dayOfWeek);
    if (!theme) {
      logger.warn(`No theme for ${member.name} on day ${dayOfWeek}`);
      return {
        familyMemberId: member.id,
        scheduledTime: now,
        sentTime: now,
        theme: 'none',
        content: { text: '', model: '', tokensUsed: 0, toolsInvoked: [] },
        success: false,
        error: 'No theme configured for today'
      };
    }

    try {
      logger.info(`Generating daily gift for ${member.name}`, { theme: theme.themeName });

      // Generate content with tools
      const content = await this.orchestrator.generateDailyGift(member, theme, now);

      // Send the message
      if (content.image) {
        await this.messageService.sendMediaMessage(
          member.phone,
          content.text,
          content.image.localPath
        );
      } else {
        await this.messageService.sendMessage(member.phone, content.text);
      }

      const result: DailyGiftResult = {
        familyMemberId: member.id,
        scheduledTime: now,
        sentTime: new Date(),
        theme: theme.themeName,
        content,
        success: true
      };

      logger.info(`Daily gift sent to ${member.name}`, {
        theme: theme.themeName,
        hasImage: !!content.image,
        toolsUsed: content.toolsInvoked
      });

      return result;

    } catch (error) {
      logger.error(`Failed to send daily gift to ${member.name}`, { error });

      return {
        familyMemberId: member.id,
        scheduledTime: now,
        sentTime: new Date(),
        theme: theme.themeName,
        content: { text: '', model: '', tokensUsed: 0, toolsInvoked: [] },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Manually trigger a gift for testing
   */
  async triggerManual(memberId: string): Promise<DailyGiftResult> {
    const member = this.familyMembers.find(m => m.id === memberId);
    if (!member) {
      throw new Error(`Family member not found: ${memberId}`);
    }
    return this.sendDailyGift(member);
  }

  /**
   * Get next scheduled time for a member
   */
  getNextScheduledTime(memberId: string): Date | null {
    const job = this.jobs.get(memberId);
    return job?.nextInvocation() || null;
  }

  /**
   * Shutdown all scheduled jobs
   */
  shutdown(): void {
    for (const [id, job] of this.jobs) {
      job.cancel();
      logger.debug(`Cancelled job for ${id}`);
    }
    this.jobs.clear();
    logger.info('Gift scheduler shutdown complete');
  }
}
```

### 4.2 Family Profiles Configuration

**File: `src/gift-system/config/FamilyProfiles.ts`**
```typescript
import { FamilyMember } from '../types/index.js';

export function loadFamilyProfiles(): FamilyMember[] {
  return [
    // ═══════════════════════════════════════════════════════════════════
    // DAD (David) - Christianity, Nashville History, Recipes
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'dad',
      name: process.env.FAMILY_DAD_NAME || 'David',
      phone: process.env.FAMILY_DAD_PHONE || '',
      sendTime: process.env.FAMILY_DAD_SEND_TIME || '06:30',
      timezone: process.env.FAMILY_DAD_TIMEZONE || 'America/Chicago',
      interests: ['Christianity', 'Nashville history', 'Southern cooking', 'faith'],
      imageEnabled: true,
      webSearchEnabled: true,
      enabled: process.env.FAMILY_DAD_ENABLED === 'true',

      systemPrompt: `You are sending a warm, personalized morning message to David, a Christian man who loves his faith, Nashville history, and good food. Keep messages concise (2-4 sentences for devotionals, slightly longer for recipes/history). Be genuine, not preachy. When sharing scripture, include the reference. For recipes, give brief instructions that fit in a text message. Sign off warmly but not formally.

You have access to web search - use it to find:
- Current Bible verse of the day or relevant passages
- Nashville historical events that happened on this date
- Trending Southern recipes or seasonal ingredients`,

      replySystemPrompt: `You are a warm, supportive AI assistant chatting with David. He loves discussing faith, Nashville history, and cooking. Keep responses conversational and genuine. If he asks about scripture, provide thoughtful interpretations. If he asks about recipes, give practical cooking advice.`,

      themes: [
        {
          dayOfWeek: 1, // Monday
          themeName: 'Morning Devotional',
          description: 'Scripture verse + brief reflection',
          promptTemplate: 'Create a Monday morning devotional for {name}. Search for an inspiring Bible verse appropriate for starting a new week, then write a brief, heartfelt reflection.',
          imageStyle: 'serene sunrise landscape, spiritual, peaceful morning light',
          includeImage: true,
          includeWebSearch: true,
          webSearchQuery: 'Bible verse for Monday morning encouragement'
        },
        {
          dayOfWeek: 2, // Tuesday
          themeName: 'Nashville History',
          description: 'Historical fact or "on this day" moment',
          promptTemplate: 'Share a fascinating Nashville history fact with {name}. Search for what happened on this date in Nashville history, or an interesting landmark story.',
          imageStyle: 'historic Nashville photograph style, sepia tones, architectural',
          includeImage: true,
          includeWebSearch: true,
          webSearchQuery: 'Nashville Tennessee history today in history OR famous landmark'
        },
        {
          dayOfWeek: 3, // Wednesday
          themeName: 'Recipe of the Day',
          description: 'Easy weeknight Southern recipe',
          promptTemplate: 'Share a delicious weeknight recipe with {name}. Search for a trending Southern comfort food recipe or seasonal dish.',
          imageStyle: 'rustic Southern food photography, warm lighting, comfort food aesthetic',
          includeImage: true,
          includeWebSearch: true,
          webSearchQuery: 'easy Southern recipe weeknight dinner'
        },
        {
          dayOfWeek: 4, // Thursday
          themeName: 'Encouragement + Psalm',
          description: 'Uplifting verse for end of week push',
          promptTemplate: 'Send {name} an encouraging message with a Psalm for Thursday. Search for an uplifting Psalm that speaks to perseverance.',
          imageStyle: 'peaceful pastoral scene, warm golden light, hope',
          includeImage: true,
          includeWebSearch: true
        },
        {
          dayOfWeek: 5, // Friday
          themeName: 'Weekend Recipe',
          description: 'Something special for Saturday/Sunday cooking',
          promptTemplate: 'Suggest a weekend cooking project for {name}. Search for a special recipe perfect for weekend preparation.',
          imageStyle: 'cozy kitchen scene, weekend cooking, family gathering',
          includeImage: true,
          includeWebSearch: true,
          webSearchQuery: 'weekend recipe slow cooker OR special dinner'
        },
        {
          dayOfWeek: 6, // Saturday
          themeName: 'Nashville Landmark',
          description: 'Deep dive on an iconic Nashville location',
          promptTemplate: 'Tell {name} about a Nashville landmark. Search for interesting facts about the Ryman, Parthenon, Grand Ole Opry, or other iconic locations.',
          imageStyle: 'Nashville architectural photography, dramatic lighting, iconic landmark',
          includeImage: true,
          includeWebSearch: true
        },
        {
          dayOfWeek: 0, // Sunday
          themeName: 'Sunday Reflection',
          description: 'Thoughtful spiritual message for the Sabbath',
          promptTemplate: 'Create a peaceful Sunday reflection for {name}. This is a day of rest and worship - share a meaningful passage and gentle reflection.',
          imageStyle: 'stained glass light, church interior ambiance, sacred peaceful',
          includeImage: true,
          includeWebSearch: true
        }
      ]
    },

    // Additional family members follow same pattern...
    // (Mom, Sister, Brother, Grandma - abbreviated for space)
  ];
}
```

### 4.3 Deliverables
- [ ] GiftScheduler with cron-based timing
- [ ] Family profiles configuration system
- [ ] Theme-based content templates
- [ ] Manual trigger capability for testing

---

## Phase 5: Reply Handler with Local MLX (Days 11-12)

### Objectives
- Integrate local MLX-LM for reply handling
- Create family context manager
- Route incoming messages to local model

### 5.1 Reply Handler

**File: `src/gift-system/reply/ReplyHandler.ts`**
```typescript
import { FamilyMember } from '../types/index.js';
import { FamilyContextManager } from './FamilyContextManager.js';
import { MessageSync } from '../../services/MessageSync.js';
import { MessageService } from '../../services/MessageService.js';
import logger from '../../utils/logger.js';

interface MLXGenerateRequest {
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

export class ReplyHandler {
  private mlxApiUrl: string;
  private familyMembers: Map<string, FamilyMember>;
  private contextManager: FamilyContextManager;
  private messageService: MessageService;

  constructor(
    mlxApiUrl: string,
    familyMembers: FamilyMember[],
    messageService: MessageService
  ) {
    this.mlxApiUrl = mlxApiUrl;
    this.familyMembers = new Map(familyMembers.map(m => [m.phone, m]));
    this.contextManager = new FamilyContextManager();
    this.messageService = messageService;
  }

  /**
   * Set up listener for incoming messages from family
   */
  setupListener(messageSync: MessageSync): void {
    messageSync.on('new_message', async (message) => {
      await this.handleIncomingMessage(message);
    });
    logger.info('Reply handler listening for family messages');
  }

  /**
   * Handle an incoming message from a family member
   */
  private async handleIncomingMessage(message: ProcessedMessage): Promise<void> {
    // Ignore our own messages
    if (message.is_from_me) return;

    const sender = message.handle || message.chat_identifier;

    // Check if sender is a family member
    const member = this.findFamilyMember(sender);
    if (!member) {
      logger.debug(`Ignoring message from non-family: ${sender}`);
      return;
    }

    logger.info(`Processing reply from ${member.name}`, {
      preview: message.text?.substring(0, 30)
    });

    try {
      // Build context with recent conversation history
      const context = this.contextManager.getContext(member.id);
      context.push({ role: 'user', content: message.text || '' });

      // Generate response via local MLX
      const response = await this.generateLocalResponse(member, context);

      // Update context with response
      this.contextManager.addMessage(member.id, 'assistant', response);

      // Send reply
      await this.messageService.sendMessage(sender, response);
      logger.info(`Sent reply to ${member.name}`);

    } catch (error) {
      logger.error(`Failed to process reply from ${member.name}`, { error });
    }
  }

  private findFamilyMember(phone: string): FamilyMember | undefined {
    // Check exact match or normalized versions
    for (const [memberPhone, member] of this.familyMembers) {
      if (phone.includes(memberPhone) || memberPhone.includes(phone)) {
        return member;
      }
    }
    return undefined;
  }

  /**
   * Generate response using local MLX-LM model
   */
  private async generateLocalResponse(
    member: FamilyMember,
    context: Array<{ role: string; content: string }>
  ): Promise<string> {
    const messages = [
      { role: 'system', content: member.replySystemPrompt },
      ...context
    ];

    const request: MLXGenerateRequest = {
      messages,
      max_tokens: 512,
      temperature: 0.7
    };

    const response = await fetch(`${this.mlxApiUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`MLX API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response;
  }
}
```

### 5.2 Family Context Manager

**File: `src/gift-system/reply/FamilyContextManager.ts`**
```typescript
interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export class FamilyContextManager {
  private contexts: Map<string, ContextMessage[]> = new Map();
  private maxMessages: number;
  private maxAgeHours: number;

  constructor(maxMessages: number = 10, maxAgeHours: number = 24) {
    this.maxMessages = maxMessages;
    this.maxAgeHours = maxAgeHours;
  }

  /**
   * Get conversation context for a family member
   */
  getContext(memberId: string): Array<{ role: string; content: string }> {
    const context = this.contexts.get(memberId) || [];

    // Filter out old messages
    const cutoff = new Date(Date.now() - this.maxAgeHours * 60 * 60 * 1000);
    const recentContext = context.filter(m => m.timestamp > cutoff);

    // Take last N messages
    const trimmed = recentContext.slice(-this.maxMessages);

    return trimmed.map(m => ({ role: m.role, content: m.content }));
  }

  /**
   * Add a message to the context
   */
  addMessage(memberId: string, role: 'user' | 'assistant', content: string): void {
    if (!this.contexts.has(memberId)) {
      this.contexts.set(memberId, []);
    }

    const context = this.contexts.get(memberId)!;
    context.push({
      role,
      content,
      timestamp: new Date()
    });

    // Trim to max size
    if (context.length > this.maxMessages * 2) {
      this.contexts.set(memberId, context.slice(-this.maxMessages));
    }
  }

  /**
   * Clear context for a member (e.g., on /reset command)
   */
  clearContext(memberId: string): void {
    this.contexts.delete(memberId);
  }

  /**
   * Clear all contexts
   */
  clearAll(): void {
    this.contexts.clear();
  }
}
```

### 5.3 Deliverables
- [ ] ReplyHandler integrated with MessageSync
- [ ] FamilyContextManager for conversation state
- [ ] Local MLX-LM generation for replies
- [ ] Family phone number matching

---

## Phase 6: Integration & Testing (Days 13-15)

### Objectives
- Integrate all components
- Create main entry point
- Comprehensive testing

### 6.1 Main Entry Point

**File: `src/gift-main.ts`**
```typescript
import { GiftScheduler } from './gift-system/scheduler/GiftScheduler.js';
import { ToolOrchestrator } from './gift-system/content/ToolOrchestrator.js';
import { ReplyHandler } from './gift-system/reply/ReplyHandler.js';
import { loadFamilyProfiles } from './gift-system/config/FamilyProfiles.js';
import { MessageService } from './services/MessageService.js';
import { MessageSync } from './services/MessageSync.js';
import logger from './utils/logger.js';

async function main() {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       FAMILY DAILY GIFT SYSTEM - STARTING                     ');
  logger.info('═══════════════════════════════════════════════════════════════');

  // Load configuration
  const familyMembers = loadFamilyProfiles();
  const enabledMembers = familyMembers.filter(m => m.enabled);

  logger.info(`Loaded ${enabledMembers.length} family members`);
  enabledMembers.forEach(m => {
    logger.info(`  • ${m.name}: ${m.sendTime} ${m.timezone}`);
  });

  // Initialize services
  const messageService = new MessageService();
  const messageSync = new MessageSync();

  // Initialize OpenRouter orchestrator (for proactive messages)
  const orchestrator = new ToolOrchestrator(
    process.env.OPENROUTER_API_KEY || '',
    process.env.WEB_SEARCH_API_KEY || '',
    {
      llmModel: process.env.OPENROUTER_LLM_MODEL || 'anthropic/claude-3.5-sonnet',
      imageModel: process.env.OPENROUTER_IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro',
      webSearchProvider: (process.env.WEB_SEARCH_PROVIDER as any) || 'exa'
    }
  );

  // Initialize scheduler (proactive daily messages)
  const scheduler = new GiftScheduler(orchestrator, messageService, enabledMembers);
  await scheduler.initialize();

  // Initialize reply handler (local MLX for responses)
  const replyHandler = new ReplyHandler(
    process.env.MLX_API_URL || 'http://localhost:8000',
    enabledMembers,
    messageService
  );
  replyHandler.setupListener(messageSync);

  // Start message sync
  await messageSync.start();

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       FAMILY DAILY GIFT SYSTEM - RUNNING                      ');
  logger.info('═══════════════════════════════════════════════════════════════');

  // Log next scheduled times
  enabledMembers.forEach(m => {
    const next = scheduler.getNextScheduledTime(m.id);
    logger.info(`  ${m.name}: Next message at ${next?.toLocaleString()}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    scheduler.shutdown();
    messageSync.stop();
    process.exit(0);
  });
}

main().catch(error => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
```

### 6.2 Testing Strategy

| Test Type | Description | Tools |
|-----------|-------------|-------|
| Unit Tests | Individual component testing | Jest/Vitest |
| Integration Tests | OpenRouter API, MLX API | Mock servers |
| E2E Tests | Full message flow | Manual testing |
| Load Testing | Concurrent generation | Artillery |

### 6.3 Test Scenarios

```typescript
// test/gift-system.test.ts
describe('Family Daily Gift System', () => {
  describe('ToolOrchestrator', () => {
    it('generates content with web search', async () => { /* ... */ });
    it('generates content with image', async () => { /* ... */ });
    it('handles web search failures gracefully', async () => { /* ... */ });
  });

  describe('GiftScheduler', () => {
    it('schedules jobs for enabled members', async () => { /* ... */ });
    it('uses correct timezone for each member', async () => { /* ... */ });
    it('selects correct theme for day of week', async () => { /* ... */ });
  });

  describe('ReplyHandler', () => {
    it('routes family replies to local MLX', async () => { /* ... */ });
    it('ignores non-family messages', async () => { /* ... */ });
    it('maintains conversation context', async () => { /* ... */ });
  });
});
```

### 6.4 Deliverables
- [ ] Main entry point with full integration
- [ ] Unit test suite
- [ ] Integration test suite
- [ ] Manual test checklist

---

## Phase 7: PM2 & Deployment (Days 16-17)

### Objectives
- Configure PM2 for process management
- Set up auto-start on boot
- Monitoring and logging

### 7.1 PM2 Configuration

**File: `ecosystem.config.cjs`**
```javascript
const path = require('path');

module.exports = {
  apps: [
    // ═══════════════════════════════════════════════════════════════════
    // MLX-LM API (Python FastAPI)
    // ═══════════════════════════════════════════════════════════════════
    {
      name: 'mlx-api',
      script: 'uvicorn',
      args: 'server:app --host 0.0.0.0 --port 8000',
      cwd: path.join(__dirname, 'mlx_api'),
      interpreter: 'python3',

      // Startup
      wait_ready: true,
      listen_timeout: 30000,

      // Restart settings
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // Resources
      max_memory_restart: '4G',

      // Logging
      error_file: path.join(__dirname, 'logs', 'mlx-api-error.log'),
      out_file: path.join(__dirname, 'logs', 'mlx-api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment
      env: {
        MLX_MODEL: 'mlx-community/Llama-3.2-3B-Instruct-4bit'
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // FAMILY DAILY GIFT SYSTEM (TypeScript/Node.js)
    // ═══════════════════════════════════════════════════════════════════
    {
      name: 'family-gift',
      script: 'dist/gift-main.js',
      cwd: __dirname,

      // Dependencies
      depends_on: ['mlx-api'],

      // Startup
      wait_ready: true,

      // Restart settings
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      cron_restart: '0 4 * * *',  // Daily restart at 4 AM

      // Logging
      error_file: path.join(__dirname, 'logs', 'family-gift-error.log'),
      out_file: path.join(__dirname, 'logs', 'family-gift-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment
      env: {
        NODE_ENV: 'production',
        GIFT_SYSTEM_ENABLED: 'true'
      }
    }
  ]
};
```

### 7.2 Auto-Start Setup

```bash
# Install PM2 globally
npm install -g pm2

# Start the ecosystem
pm2 start ecosystem.config.cjs

# Save process list
pm2 save

# Setup startup script (run at boot)
pm2 startup

# Verify status
pm2 status
pm2 logs family-gift --lines 50
```

### 7.3 Monitoring Dashboard

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs family-gift --lines 100
pm2 logs mlx-api --lines 100

# Check status
pm2 status

# Restart if needed
pm2 restart family-gift
```

### 7.4 Deliverables
- [ ] PM2 ecosystem configuration
- [ ] Auto-start on boot setup
- [ ] Logging configuration
- [ ] Monitoring commands documented

---

## Phase 8: Live Deployment (Day 18+)

### Objectives
- Deploy to Mac Mini
- Gradual family member rollout
- Monitor and iterate

### 8.1 Pre-Deployment Checklist

- [ ] Mac Mini has Full Disk Access for Terminal/app
- [ ] Messages.app signed into Apple ID
- [ ] OpenRouter API key configured and funded
- [ ] Web search API key (Exa/Tavily) configured
- [ ] Family phone numbers verified
- [ ] Photos.app album created
- [ ] All environment variables set
- [ ] MLX model downloaded and tested
- [ ] PM2 startup configured

### 8.2 Rollout Strategy

| Phase | Action | Duration |
|-------|--------|----------|
| 1 | Self-test (your number) | 3 days |
| 2 | Add Dad | 3 days |
| 3 | Add remaining family | Ongoing |
| 4 | Gather feedback, iterate | Continuous |

### 8.3 Success Metrics

| Metric | Target |
|--------|--------|
| Daily message delivery rate | >99% |
| Image generation success | >95% |
| Reply response time | <5 seconds |
| Web search enhancement rate | >80% |
| System uptime | >99.9% |

### 8.4 Daily Operations

```bash
# Morning check
pm2 status
pm2 logs family-gift --lines 20

# View today's gifts sent
grep "Daily gift sent" logs/family-gift-out.log | tail -5

# Manual trigger for testing
# (requires adding CLI command to gift-main.ts)
```

---

## Cost Estimation

### Monthly Costs (5 Family Members)

| Service | Usage | Cost |
|---------|-------|------|
| OpenRouter LLM (Claude) | ~150 messages | ~$3-5 |
| OpenRouter Images (Flux) | ~150 images | ~$6 |
| Web Search (Exa/Tavily) | ~100 searches | ~$0-5 |
| **Total** | | **~$10-15/month** |

### Cost Optimization Tips

1. Use `flux-schnell` (free) for testing, `flux-1.1-pro` for production
2. Cache web search results for repeated queries
3. Skip images on some days if budget is tight
4. Use local MLX for all replies (free)

---

## Appendix: Quick Reference

### Key File Locations

| File | Purpose |
|------|---------|
| `src/gift-main.ts` | Main entry point |
| `src/gift-system/scheduler/GiftScheduler.ts` | Scheduling orchestration |
| `src/gift-system/content/ToolOrchestrator.ts` | OpenRouter + tools |
| `src/gift-system/reply/ReplyHandler.ts` | Local MLX replies |
| `ecosystem.config.cjs` | PM2 configuration |
| `.env` | All configuration |

### Quick Commands

```bash
# Start everything
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View logs
pm2 logs family-gift

# Restart
pm2 restart all

# Stop
pm2 stop all
```

---

*Document Version: 1.0 | December 24, 2025*
*Family Daily Gift System - Feature Roadmap*
