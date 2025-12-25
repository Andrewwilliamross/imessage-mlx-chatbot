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

### Unified Entry Point Design

The Gift System integrates with the existing chatbot infrastructure rather than creating parallel services. This reduces complexity, prevents race conditions on `chat.db`, and maximizes code reuse.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED iMESSAGE AI SYSTEM                                       │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                           src/main.ts                                         │  │
│  │                      (Unified Entry Point)                                    │  │
│  │                                                                               │  │
│  │   if (CHATBOT_ENABLED)  ───────►  ChatbotHandler (existing)                  │  │
│  │   if (GIFT_SYSTEM_ENABLED) ────►  GiftScheduler (new)                        │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌─────────────────────────────────┐    ┌────────────────────────────────────────┐ │
│  │     PROACTIVE DAILY MESSAGES    │    │         REPLY HANDLING                 │ │
│  │     (Scheduled, Tool-Enabled)   │    │     (Reactive, Fast, Private)          │ │
│  │                                 │    │                                        │ │
│  │  ┌───────────────────────────┐  │    │  ┌──────────────────────────────────┐  │ │
│  │  │     GiftScheduler         │  │    │  │   ChatbotHandler (extended)      │  │ │
│  │  │   (node-schedule)         │  │    │  │                                  │  │ │
│  │  │                           │  │    │  │   • detectFamilyMember()         │  │ │
│  │  │   6:30 AM → Dad           │  │    │  │   • getFamilySystemPrompt()      │  │ │
│  │  │   7:00 AM → Mom           │  │    │  │   • Route to MLX with context    │  │ │
│  │  │   7:30 AM → Brother       │  │    │  │                                  │  │ │
│  │  │   8:00 AM → Sister (PT)   │  │    │  └────────────────┬─────────────────┘  │ │
│  │  └───────────┬───────────────┘  │    │                   │                    │ │
│  │              │                  │    │                   ▼                    │ │
│  │              ▼                  │    │  ┌──────────────────────────────────┐  │ │
│  │  ┌───────────────────────────┐  │    │  │      Local MLX-LM API            │  │ │
│  │  │   ProactiveGenerator      │  │    │  │   Llama-3.2-3B-Instruct-4bit     │  │ │
│  │  │                           │  │    │  │   • Fast (~1-3s)                 │  │ │
│  │  │  ┌─────────────────────┐  │  │    │  │   • Free                         │  │ │
│  │  │  │  OpenRouter API     │  │  │    │  │   • Private                      │  │ │
│  │  │  │  (Claude/GPT-4)     │  │  │    │  └──────────────────────────────────┘  │ │
│  │  │  │                     │  │  │    │                                        │ │
│  │  │  │  Tools:             │  │  │    └────────────────────────────────────────┘ │
│  │  │  │  • web_search       │  │  │                                               │
│  │  │  │  • generate_image   │  │  │                                               │
│  │  │  └─────────────────────┘  │  │                                               │
│  │  │            │              │  │                                               │
│  │  │            ▼              │  │                                               │
│  │  │  ┌─────────────────────┐  │  │                                               │
│  │  │  │ Fallback to MLX     │  │  │    ┌────────────────────────────────────────┐ │
│  │  │  │ (if OpenRouter fails)│  │  │    │         SHARED SERVICES               │ │
│  │  │  └─────────────────────┘  │  │    │                                        │ │
│  │  └───────────┬───────────────┘  │    │  • MessageService (existing)           │ │
│  │              │                  │    │  • ConversationService (existing)      │ │
│  │              ▼                  │    │  • MessagePoller (existing)            │ │
│  │  ┌───────────────────────────┐  │    │  • ProfileLoader (new)                 │ │
│  │  │   ImageGenerator          │  │    │  • PromptLoader (new)                  │ │
│  │  │   • OpenRouter Flux/DALL-E│  │    │                                        │ │
│  │  │   • Save to ~/Pictures    │  │    └────────────────────────────────────────┘ │
│  │  │   • Import to Photos.app  │  │                                               │
│  │  └───────────────────────────┘  │                                               │
│  │                                 │                                               │
│  └─────────────────────────────────┘                                               │
│                                                                                     │
│                              ┌────────────────────────────────────────┐             │
│                              │       MessageService (existing)        │             │
│                              │   • sendMessage(phone, text)           │             │
│                              │   • sendMediaMessage(phone, text, img) │             │
│                              │   • SMS/MMS fallback                   │             │
│                              └────────────────────────────────────────┘             │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entry Point | Unified `main.ts` | Single process, shared services, no race conditions |
| Configuration | JSON file + env secrets | Readable, version-controllable, complex structures |
| System Prompts | External templates | Easy iteration, non-dev editable, A/B testable |
| Reply Handling | Extend ChatbotHandler | Reuse existing infrastructure |
| Fallback | MLX when OpenRouter fails | Graceful degradation, always delivers |

---

## Configuration Architecture

### Secrets in `.env` (Minimal)

```bash
# ═══════════════════════════════════════════════════════════════════
# FAMILY GIFT SYSTEM - SECRETS ONLY
# ═══════════════════════════════════════════════════════════════════

# OpenRouter API (for proactive messages)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxx

# Web Search API (choose one)
WEB_SEARCH_PROVIDER=exa                    # Options: exa, tavily, serp
WEB_SEARCH_API_KEY=your-api-key-here

# Feature Flags
GIFT_SYSTEM_ENABLED=true
CHATBOT_ENABLED=true

# Paths (optional overrides)
FAMILY_PROFILES_PATH=./config/family-profiles.json
PROMPTS_PATH=./prompts
```

### Family Profiles in JSON

**File: `config/family-profiles.json`**

```json
{
  "$schema": "./family-profiles.schema.json",
  "version": "1.0.0",
  "defaults": {
    "timezone": "America/Chicago",
    "imageEnabled": true,
    "webSearchEnabled": true,
    "proactiveEnabled": true
  },
  "familyMembers": [
    {
      "id": "dad",
      "name": "David",
      "phone": "+1XXXXXXXXXX",
      "sendTime": "06:30",
      "timezone": "America/Chicago",
      "interests": ["Christianity", "Nashville history", "Southern cooking", "faith"],
      "promptTemplate": "dad",
      "themes": {
        "0": { "name": "Sunday Reflection", "template": "devotional", "searchHint": "Sunday morning devotional passage" },
        "1": { "name": "Morning Devotional", "template": "devotional", "searchHint": "Bible verse Monday encouragement" },
        "2": { "name": "Nashville History", "template": "history", "searchHint": "Nashville Tennessee history this day" },
        "3": { "name": "Recipe of the Day", "template": "recipe", "searchHint": "Southern comfort food recipe easy" },
        "4": { "name": "Encouragement + Psalm", "template": "devotional", "searchHint": "uplifting Psalm perseverance" },
        "5": { "name": "Weekend Recipe", "template": "recipe", "searchHint": "weekend slow cooker recipe special" },
        "6": { "name": "Nashville Landmark", "template": "history", "searchHint": "Ryman Grand Ole Opry Parthenon Nashville" }
      },
      "imageStyles": {
        "devotional": "serene sunrise landscape, spiritual, peaceful morning light, Tennessee hills",
        "history": "historic Nashville photograph, sepia tones, architectural landmark",
        "recipe": "rustic Southern food photography, warm lighting, comfort food aesthetic"
      }
    },
    {
      "id": "mom",
      "name": "Mom",
      "phone": "+1XXXXXXXXXX",
      "sendTime": "07:00",
      "timezone": "America/Chicago",
      "interests": ["Interior design", "Nashville music scene", "Live music venues", "Cozy home aesthetics"],
      "promptTemplate": "mom",
      "themes": {
        "0": { "name": "Cozy Home Moment", "template": "home", "searchHint": "hygge home Sunday relaxation" },
        "1": { "name": "Design Tip", "template": "design", "searchHint": "interior design tip 2025" },
        "2": { "name": "Nashville Music Pick", "template": "music", "searchHint": "Nashville live music tonight" },
        "3": { "name": "Room Styling Idea", "template": "design", "searchHint": "room styling seasonal refresh" },
        "4": { "name": "Hidden Gem Venue", "template": "music", "searchHint": "Nashville hidden gem bar listening room" },
        "5": { "name": "Weekend Design Inspo", "template": "design", "searchHint": "weekend DIY design project" },
        "6": { "name": "Nashville Event", "template": "music", "searchHint": "Nashville events this weekend" }
      },
      "imageStyles": {
        "design": "beautiful interior design vignette, editorial style, warm lighting",
        "music": "atmospheric Nashville music venue, neon lights, intimate concert",
        "home": "hygge home moment, morning light through windows, cozy corner"
      }
    },
    {
      "id": "sister",
      "name": "Sister",
      "phone": "+1XXXXXXXXXX",
      "sendTime": "08:00",
      "timezone": "America/Los_Angeles",
      "interests": ["Travel", "Health foods", "Fitness", "Painting", "Media/Advertising"],
      "promptTemplate": "sister",
      "themes": {
        "0": { "name": "Self-Care Wellness", "template": "wellness", "searchHint": "Sunday self-care wellness routine" },
        "1": { "name": "Monday Motivation", "template": "motivation", "searchHint": null },
        "2": { "name": "Quick Healthy Recipe", "template": "health", "searchHint": "healthy quick breakfast recipe" },
        "3": { "name": "Travel Bucket List", "template": "travel", "searchHint": "bucket list destination 2025 affordable" },
        "4": { "name": "Ad/Media Insight", "template": "career", "searchHint": "advertising industry insight trend" },
        "5": { "name": "Weekend Workout", "template": "fitness", "searchHint": "quick weekend workout routine" },
        "6": { "name": "Creative Painting Prompt", "template": "art", "searchHint": null }
      },
      "imageStyles": {
        "motivation": "empowering bold aesthetic, city skyline sunrise, energetic",
        "health": "beautiful healthy food flat lay, bright colors, fresh ingredients",
        "travel": "dream destination landscape, wanderlust, golden hour",
        "career": "creative advertising art direction, modern bold design",
        "fitness": "dynamic fitness movement, energy, determination",
        "art": "abstract expressionist painting, bold brushstrokes, vibrant colors",
        "wellness": "peaceful wellness scene, spa aesthetic, calm"
      }
    },
    {
      "id": "brother",
      "name": "Brother",
      "phone": "+1XXXXXXXXXX",
      "sendTime": "07:30",
      "timezone": "America/Chicago",
      "interests": ["Architecture", "History", "Street fashion", "Cigars", "Art"],
      "promptTemplate": "brother",
      "themes": {
        "0": { "name": "Design Philosophy", "template": "architecture", "searchHint": "famous architect quote philosophy" },
        "1": { "name": "Architecture Spotlight", "template": "architecture", "searchHint": "famous modern architecture building" },
        "2": { "name": "Street Fashion Intel", "template": "fashion", "searchHint": "street fashion trend winter 2025" },
        "3": { "name": "Historical Moment", "template": "history", "searchHint": "interesting history this day" },
        "4": { "name": "Cigar & Culture", "template": "culture", "searchHint": null },
        "5": { "name": "Art Movement/Artist", "template": "art", "searchHint": "famous artist art movement" },
        "6": { "name": "Weekend Look", "template": "fashion", "searchHint": "workwear fashion styling men" }
      },
      "imageStyles": {
        "architecture": "dramatic architectural photography, black and white, sharp contrast",
        "fashion": "street style fashion editorial, urban, sophisticated",
        "history": "historic moment reimagined, artistic, dramatic",
        "culture": "moody cigar lounge aesthetic, warm amber lighting",
        "art": "fine art museum quality, contemplative, gallery"
      }
    },
    {
      "id": "grandma",
      "name": "Grandma",
      "phone": "+1XXXXXXXXXX",
      "sendTime": "07:00",
      "timezone": "America/Chicago",
      "interests": ["Baking", "Gardening", "Antiques"],
      "promptTemplate": "grandma",
      "themes": {
        "0": { "name": "Sweet Note", "template": "love", "searchHint": null },
        "1": { "name": "Baking Tip", "template": "baking", "searchHint": "baking tip trick" },
        "2": { "name": "Garden Seasonal", "template": "garden", "searchHint": "garden tasks this month" },
        "3": { "name": "Antique Spotlight", "template": "antiques", "searchHint": "antique collectible history value" },
        "4": { "name": "Classic Recipe", "template": "baking", "searchHint": "classic traditional recipe nostalgic" },
        "5": { "name": "Weekend Garden Plan", "template": "garden", "searchHint": "weekend garden planning" },
        "6": { "name": "Antique Hunting Tip", "template": "antiques", "searchHint": "antique hunting estate sale tips" }
      },
      "imageStyles": {
        "baking": "warm farmhouse kitchen, fresh baked goods, afternoon sunlight",
        "garden": "beautiful cottage garden, soft light, peaceful",
        "antiques": "vintage antique still life, nostalgic, warm tones",
        "love": "cozy grandmother's kitchen, warm, loving atmosphere"
      }
    }
  ]
}
```

### System Prompts as External Templates

**Directory Structure:**
```
prompts/
├── base/
│   ├── proactive.hbs              # Shared foundation for proactive messages
│   └── reply.hbs                  # Shared foundation for replies
├── family/
│   ├── dad/
│   │   ├── proactive.hbs          # Dad's proactive persona
│   │   ├── reply.hbs              # Dad's reply persona
│   │   └── themes/
│   │       ├── devotional.hbs
│   │       ├── history.hbs
│   │       └── recipe.hbs
│   ├── mom/
│   │   ├── proactive.hbs
│   │   ├── reply.hbs
│   │   └── themes/
│   │       ├── design.hbs
│   │       ├── music.hbs
│   │       └── home.hbs
│   ├── sister/
│   │   └── ...
│   ├── brother/
│   │   └── ...
│   └── grandma/
│       └── ...
└── special/
    ├── christmas.hbs
    ├── birthday.hbs
    └── thanksgiving.hbs
```

**Example: `prompts/family/dad/proactive.hbs`**
```handlebars
You are sending a warm, personalized morning message to {{name}}, a Christian man who loves his faith, Nashville history, and good food.

Today is {{dayOfWeek}}, {{fullDate}}.
Theme: {{themeName}}

{{#if webSearchEnabled}}
You have access to web search. Use it to find current, relevant information such as:
- Bible verses appropriate for today
- Nashville historical events from this date
- Trending Southern recipes
{{/if}}

Guidelines:
- Keep messages concise (2-4 sentences for devotionals, slightly longer for recipes/history)
- Be genuine, not preachy
- When sharing scripture, include the reference
- For recipes, give brief instructions that fit in a text message
- Sign off warmly but not formally

{{> themes/{{themeTemplate}} }}
```

**Example: `prompts/family/dad/themes/devotional.hbs`**
```handlebars
For today's devotional:
- Search for an inspiring Bible verse appropriate for {{dayOfWeek}}
- Write a brief, heartfelt reflection (2-3 sentences)
- Connect the verse to everyday life
- End with encouragement for the day ahead
```

**Example: `prompts/family/dad/reply.hbs`**
```handlebars
You are a warm, supportive AI assistant chatting with {{name}}. He loves discussing faith, Nashville history, and cooking.

Guidelines:
- Keep responses conversational and genuine
- If he asks about scripture, provide thoughtful interpretations
- If he asks about recipes, give practical cooking advice
- Match his energy - if brief, be brief; if detailed, engage fully
- Remember context from the conversation
```

---

## File Structure

```
src/
├── main.ts                           # UNIFIED entry point
├── chatbot/
│   ├── ChatbotHandler.ts             # EXTEND: Add family member detection
│   ├── MLXClient.ts                  # Existing
│   ├── MessagePoller.ts              # Existing (reuse)
│   └── types.ts                      # Existing
├── services/
│   ├── MessageService.ts             # Existing (reuse)
│   ├── ConversationService.ts        # Existing (reuse)
│   └── ...                           # Other existing services
├── gift-system/                      # NEW MODULE
│   ├── index.ts                      # Module exports
│   ├── types.ts                      # Gift system type definitions
│   ├── GiftScheduler.ts              # Scheduling orchestration
│   ├── ProactiveGenerator.ts         # Content generation with tools
│   ├── config/
│   │   ├── ProfileLoader.ts          # Load JSON family profiles
│   │   └── PromptLoader.ts           # Load Handlebars templates
│   ├── openrouter/
│   │   ├── OpenRouterClient.ts       # API client with tool support
│   │   ├── WebSearchTool.ts          # Exa/Tavily integration
│   │   └── ToolDefinitions.ts        # Tool schemas
│   ├── image/
│   │   ├── ImageGenerator.ts         # Image generation pipeline
│   │   ├── PhotosLibrary.ts          # macOS Photos AppleScript
│   │   └── ImageStorage.ts           # Local file management
│   └── cli/
│       └── commands.ts               # CLI for testing/manual triggers
├── utils/
│   └── ...                           # Existing utilities
└── types/
    └── ...                           # Existing types

config/
├── family-profiles.json              # Family member configuration
└── family-profiles.schema.json       # JSON schema for validation

prompts/
├── base/
│   ├── proactive.hbs
│   └── reply.hbs
├── family/
│   ├── dad/
│   ├── mom/
│   ├── sister/
│   ├── brother/
│   └── grandma/
└── special/
    └── ...
```

---

## Phase 1: Foundation (Day 1)

### Objectives
- Set up configuration architecture
- Create type definitions
- Initialize prompt template system

### 1.1 Install Dependencies

```bash
npm install node-schedule handlebars
npm install -D @types/node-schedule
```

### 1.2 Create Type Definitions

**File: `src/gift-system/types.ts`**
```typescript
// ═══════════════════════════════════════════════════════════════════
// FAMILY GIFT SYSTEM - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface FamilyMember {
  id: string;
  name: string;
  phone: string;
  sendTime: string;              // "06:30" format
  timezone: string;              // "America/Chicago"
  interests: string[];
  promptTemplate: string;        // Template directory name
  themes: Record<string, DayTheme>;  // Key: day of week (0-6)
  imageStyles: Record<string, string>;

  // Feature flags (inherit from defaults if not specified)
  proactiveEnabled?: boolean;
  imageEnabled?: boolean;
  webSearchEnabled?: boolean;
}

export interface DayTheme {
  name: string;
  template: string;              // Theme template name
  searchHint: string | null;     // Web search query hint (null = no search)
}

export interface FamilyProfilesConfig {
  version: string;
  defaults: {
    timezone: string;
    imageEnabled: boolean;
    webSearchEnabled: boolean;
    proactiveEnabled: boolean;
  };
  familyMembers: FamilyMember[];
}

export interface GeneratedContent {
  text: string;
  image?: GeneratedImage;
  webSearchResults?: WebSearchResult[];
  model: string;
  tokensUsed: number;
  toolsInvoked: string[];
  fallbackUsed: boolean;
}

export interface GeneratedImage {
  localPath: string;
  prompt: string;
  model: string;
  timestamp: Date;
  addedToPhotos: boolean;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
}

export interface DailyGiftResult {
  familyMemberId: string;
  memberName: string;
  scheduledTime: Date;
  sentTime: Date;
  theme: string;
  content: GeneratedContent;
  success: boolean;
  error?: string;
}

export interface GiftSystemConfig {
  enabled: boolean;
  profilesPath: string;
  promptsPath: string;
  openRouterApiKey: string;
  openRouterModel: string;
  webSearchProvider: 'exa' | 'tavily' | 'serp';
  webSearchApiKey: string;
  imageModel: string;
  imageSavePath: string;
  photosAlbumName: string;
  photosEnabled: boolean;

  // CLI/Testing options
  dryRun: boolean;
  testRecipient?: string;
}

export interface PromptContext {
  name: string;
  dayOfWeek: string;
  fullDate: string;
  themeName: string;
  themeTemplate: string;
  webSearchEnabled: boolean;
  imageEnabled: boolean;
  interests: string[];
  searchHint?: string;
}
```

### 1.3 Create Profile Loader

**File: `src/gift-system/config/ProfileLoader.ts`**
```typescript
import fs from 'fs/promises';
import path from 'path';
import { FamilyProfilesConfig, FamilyMember } from '../types.js';
import logger from '../../utils/logger.js';

export class ProfileLoader {
  private config: FamilyProfilesConfig | null = null;
  private profilesPath: string;

  constructor(profilesPath: string = './config/family-profiles.json') {
    this.profilesPath = profilesPath;
  }

  async load(): Promise<FamilyProfilesConfig> {
    if (this.config) return this.config;

    try {
      const fullPath = path.resolve(this.profilesPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      this.config = JSON.parse(content) as FamilyProfilesConfig;

      logger.info('Family profiles loaded', {
        version: this.config.version,
        memberCount: this.config.familyMembers.length
      });

      return this.config;
    } catch (error) {
      logger.error('Failed to load family profiles', { error, path: this.profilesPath });
      throw new Error(`Failed to load family profiles: ${error}`);
    }
  }

  async getEnabledMembers(): Promise<FamilyMember[]> {
    const config = await this.load();
    return config.familyMembers.filter(member => {
      const enabled = member.proactiveEnabled ?? config.defaults.proactiveEnabled;
      return enabled;
    });
  }

  async getMember(id: string): Promise<FamilyMember | undefined> {
    const config = await this.load();
    return config.familyMembers.find(m => m.id === id);
  }

  async getMemberByPhone(phone: string): Promise<FamilyMember | undefined> {
    const config = await this.load();
    // Normalize phone comparison
    const normalizedPhone = phone.replace(/\D/g, '');
    return config.familyMembers.find(m => {
      const memberPhone = m.phone.replace(/\D/g, '');
      return normalizedPhone.includes(memberPhone) || memberPhone.includes(normalizedPhone);
    });
  }

  getDefaults(): FamilyProfilesConfig['defaults'] | null {
    return this.config?.defaults ?? null;
  }
}
```

### 1.4 Create Prompt Loader

**File: `src/gift-system/config/PromptLoader.ts`**
```typescript
import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import { PromptContext } from '../types.js';
import logger from '../../utils/logger.js';

export class PromptLoader {
  private promptsPath: string;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(promptsPath: string = './prompts') {
    this.promptsPath = promptsPath;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    // Register Handlebars helpers
    Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
    Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());
    Handlebars.registerHelper('dateFormat', (date: Date, format: string) => {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    });
  }

  async loadTemplate(templatePath: string): Promise<HandlebarsTemplateDelegate> {
    // Check cache first
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath)!;
    }

    try {
      const fullPath = path.resolve(this.promptsPath, templatePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const template = Handlebars.compile(content);

      this.templateCache.set(templatePath, template);
      return template;
    } catch (error) {
      logger.warn('Template not found, using fallback', { templatePath, error });
      // Return a simple passthrough template
      return Handlebars.compile('{{name}} - {{themeName}}');
    }
  }

  async buildProactivePrompt(
    memberId: string,
    context: PromptContext
  ): Promise<string> {
    // Load base template
    const basePath = `family/${memberId}/proactive.hbs`;
    const template = await this.loadTemplate(basePath);

    // Load theme-specific partial if exists
    const themePath = `family/${memberId}/themes/${context.themeTemplate}.hbs`;
    try {
      const themeContent = await fs.readFile(
        path.resolve(this.promptsPath, themePath),
        'utf-8'
      );
      Handlebars.registerPartial(`themes/${context.themeTemplate}`, themeContent);
    } catch {
      // Theme partial is optional
    }

    return template(context);
  }

  async buildReplyPrompt(memberId: string, context: PromptContext): Promise<string> {
    const templatePath = `family/${memberId}/reply.hbs`;
    const template = await this.loadTemplate(templatePath);
    return template(context);
  }

  clearCache(): void {
    this.templateCache.clear();
  }
}
```

### 1.5 Deliverables
- [ ] `npm install node-schedule handlebars`
- [ ] `src/gift-system/types.ts` created
- [ ] `src/gift-system/config/ProfileLoader.ts` created
- [ ] `src/gift-system/config/PromptLoader.ts` created
- [ ] `config/family-profiles.json` created with schema
- [ ] `prompts/` directory structure created

---

## Phase 2: OpenRouter Integration (Days 2-3)

### Objectives
- Implement OpenRouter API client with tool calling
- Create web search tool integration
- Add graceful fallback to local MLX

### 2.1 OpenRouter Client

**File: `src/gift-system/openrouter/OpenRouterClient.ts`**
```typescript
import logger from '../../utils/logger.js';

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

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
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

    logger.info('OpenRouter request', {
      model,
      messageCount: messages.length,
      toolCount: tools?.length
    });

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

    const result = await response.json();
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
      body: JSON.stringify({ model, prompt, n: 1, size })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter image error: ${response.status} - ${error}`);
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
import { WebSearchResult } from '../types.js';

export const WEB_SEARCH_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Search the web for real-time information. Use for current events, news, recipes, venues, Bible verses, or any information that needs to be fresh and accurate.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        category: {
          type: 'string',
          enum: ['news', 'events', 'recipes', 'venues', 'general', 'religious'],
          description: 'Category to refine results'
        },
        location: {
          type: 'string',
          description: 'Location for local results (e.g., "Nashville, TN")'
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

  async search(
    query: string,
    options: { category?: string; location?: string; numResults?: number } = {}
  ): Promise<WebSearchResult[]> {
    const { numResults = 5, location } = options;
    const enhancedQuery = location ? `${query} ${location}` : query;

    logger.info('Web search', { query: enhancedQuery, provider: this.provider });

    switch (this.provider) {
      case 'exa':
        return this.searchExa(enhancedQuery, numResults);
      case 'tavily':
        return this.searchTavily(enhancedQuery, numResults);
      case 'serp':
        return this.searchSerp(enhancedQuery, numResults);
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

    if (!response.ok) throw new Error(`Exa error: ${response.status}`);

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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: numResults,
        include_answer: true
      })
    });

    if (!response.ok) throw new Error(`Tavily error: ${response.status}`);

    const data = await response.json();
    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.substring(0, 300) || '',
      content: r.content
    }));
  }

  private async searchSerp(query: string, numResults: number): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      num: numResults.toString()
    });

    const response = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!response.ok) throw new Error(`SerpAPI error: ${response.status}`);

    const data = await response.json();
    return (data.organic_results || []).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet || ''
    }));
  }

  formatForLLM(results: WebSearchResult[]): string {
    if (results.length === 0) return 'No search results found.';
    return results.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
    ).join('\n\n');
  }
}
```

### 2.3 Proactive Generator with Fallback

**File: `src/gift-system/ProactiveGenerator.ts`**
```typescript
import { OpenRouterClient } from './openrouter/OpenRouterClient.js';
import { WebSearchTool, WEB_SEARCH_TOOL_DEFINITION } from './openrouter/WebSearchTool.js';
import { ImageGenerator } from './image/ImageGenerator.js';
import { PromptLoader } from './config/PromptLoader.js';
import { MLXClient } from '../chatbot/MLXClient.js';
import { FamilyMember, DayTheme, GeneratedContent, PromptContext } from './types.js';
import logger from '../utils/logger.js';

export class ProactiveGenerator {
  private openRouter: OpenRouterClient;
  private webSearch: WebSearchTool;
  private imageGenerator: ImageGenerator;
  private promptLoader: PromptLoader;
  private mlxClient: MLXClient;  // Fallback

  constructor(config: {
    openRouterApiKey: string;
    openRouterModel: string;
    webSearchProvider: 'exa' | 'tavily' | 'serp';
    webSearchApiKey: string;
    imageModel: string;
    imageSavePath: string;
    photosAlbumName: string;
    photosEnabled: boolean;
    promptsPath: string;
    mlxApiUrl: string;
  }) {
    this.openRouter = new OpenRouterClient(config.openRouterApiKey, config.openRouterModel);
    this.webSearch = new WebSearchTool(config.webSearchProvider, config.webSearchApiKey);
    this.imageGenerator = new ImageGenerator(config.openRouterApiKey, {
      model: config.imageModel,
      savePath: config.imageSavePath,
      photosAlbumName: config.photosAlbumName,
      photosEnabled: config.photosEnabled
    });
    this.promptLoader = new PromptLoader(config.promptsPath);
    this.mlxClient = new MLXClient(config.mlxApiUrl);
  }

  async generate(
    member: FamilyMember,
    theme: DayTheme,
    date: Date = new Date()
  ): Promise<GeneratedContent> {
    const context = this.buildContext(member, theme, date);

    try {
      // Try OpenRouter with tools first
      return await this.generateWithOpenRouter(member, theme, context);
    } catch (error) {
      logger.warn('OpenRouter failed, falling back to local MLX', {
        error: error instanceof Error ? error.message : error,
        member: member.id
      });

      // Fallback to local MLX (no tools, no images)
      return await this.generateWithMLXFallback(member, theme, context);
    }
  }

  private async generateWithOpenRouter(
    member: FamilyMember,
    theme: DayTheme,
    context: PromptContext
  ): Promise<GeneratedContent> {
    const systemPrompt = await this.promptLoader.buildProactivePrompt(member.id, context);
    const tools = context.webSearchEnabled ? [WEB_SEARCH_TOOL_DEFINITION] : [];
    const toolsInvoked: string[] = [];
    let webSearchResults: WebSearchResult[] = [];

    // Initial generation
    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate today's ${context.themeName} message.` }
    ];

    let finalResponse = '';
    let totalTokens = 0;
    let iterations = 0;

    // Tool calling loop
    while (iterations < 3) {
      iterations++;
      const result = await this.openRouter.generateWithTools(messages, tools);
      totalTokens += result.usage.promptTokens + result.usage.completionTokens;

      if (result.toolCalls.length === 0) {
        finalResponse = result.response;
        break;
      }

      // Process tool calls
      for (const toolCall of result.toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'web_search') {
          toolsInvoked.push('web_search');
          const searchResults = await this.webSearch.search(args.query, {
            category: args.category,
            location: args.location
          });
          webSearchResults = searchResults;

          messages.push({
            role: 'assistant',
            content: result.response,
            tool_calls: [toolCall]
          });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: this.webSearch.formatForLLM(searchResults)
          });
        }
      }
    }

    // Generate image if enabled
    let image: GeneratedImage | undefined;
    if (context.imageEnabled && member.imageStyles[theme.template]) {
      try {
        image = await this.imageGenerator.generate(
          member.imageStyles[theme.template],
          member.id,
          theme.name,
          new Date()
        );
        toolsInvoked.push('image_generation');
      } catch (error) {
        logger.warn('Image generation failed', { error, member: member.id });
      }
    }

    return {
      text: finalResponse,
      image,
      webSearchResults: webSearchResults.length > 0 ? webSearchResults : undefined,
      model: 'openrouter',
      tokensUsed: totalTokens,
      toolsInvoked,
      fallbackUsed: false
    };
  }

  private async generateWithMLXFallback(
    member: FamilyMember,
    theme: DayTheme,
    context: PromptContext
  ): Promise<GeneratedContent> {
    // Simplified prompt without tool expectations
    const fallbackPrompt = `You are sending a warm morning message to ${member.name}.
Today is ${context.dayOfWeek}, ${context.fullDate}.
Theme: ${context.themeName}

Their interests: ${member.interests.join(', ')}

Generate a thoughtful, personalized message. Keep it concise (2-4 sentences).
Sign off warmly.`;

    const response = await this.mlxClient.generate({
      messages: [
        { role: 'system', content: fallbackPrompt },
        { role: 'user', content: `Generate today's ${context.themeName} message.` }
      ],
      max_tokens: 512,
      temperature: 0.8
    });

    return {
      text: response.response,
      image: undefined,
      webSearchResults: undefined,
      model: 'mlx-fallback',
      tokensUsed: response.tokens_generated,
      toolsInvoked: [],
      fallbackUsed: true
    };
  }

  private buildContext(member: FamilyMember, theme: DayTheme, date: Date): PromptContext {
    return {
      name: member.name,
      dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
      fullDate: date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
      themeName: theme.name,
      themeTemplate: theme.template,
      webSearchEnabled: (member.webSearchEnabled ?? true) && theme.searchHint !== null,
      imageEnabled: member.imageEnabled ?? true,
      interests: member.interests,
      searchHint: theme.searchHint ?? undefined
    };
  }
}
```

### 2.4 Deliverables
- [ ] `src/gift-system/openrouter/OpenRouterClient.ts`
- [ ] `src/gift-system/openrouter/WebSearchTool.ts`
- [ ] `src/gift-system/openrouter/ToolDefinitions.ts`
- [ ] `src/gift-system/ProactiveGenerator.ts` with MLX fallback
- [ ] Unit tests for OpenRouter integration

---

## Phase 3: Image Generation (Day 4)

### Objectives
- Implement image generation pipeline
- Add macOS Photos.app integration
- Create local storage management

### 3.1 Image Generator

**File: `src/gift-system/image/ImageGenerator.ts`**
```typescript
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GeneratedImage } from '../types.js';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export class ImageGenerator {
  private apiKey: string;
  private model: string;
  private savePath: string;
  private photosAlbumName: string;
  private photosEnabled: boolean;

  constructor(apiKey: string, config: {
    model?: string;
    savePath?: string;
    photosAlbumName?: string;
    photosEnabled?: boolean;
  } = {}) {
    this.apiKey = apiKey;
    this.model = config.model || 'black-forest-labs/flux-1.1-pro';
    this.savePath = config.savePath || '~/Pictures/FamilyGifts';
    this.photosAlbumName = config.photosAlbumName || 'Family Gifts';
    this.photosEnabled = config.photosEnabled ?? true;
  }

  async generate(
    stylePrompt: string,
    memberId: string,
    themeName: string,
    date: Date
  ): Promise<GeneratedImage> {
    logger.info('Generating image', { memberId, theme: themeName });

    // Generate via OpenRouter
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
        prompt: stylePrompt,
        n: 1,
        size: '1024x1024'
      })
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const result = await response.json();
    const imageData = result.data[0];

    // Save locally
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

    // Import to Photos
    let addedToPhotos = false;
    if (this.photosEnabled) {
      addedToPhotos = await this.importToPhotos(localPath);
    }

    return {
      localPath,
      prompt: stylePrompt,
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
        if not (exists album "${this.photosAlbumName}") then
          make new album named "${this.photosAlbumName}"
        end if
        set theImage to import POSIX file "${imagePath}"
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
- [ ] `src/gift-system/image/ImageGenerator.ts`
- [ ] `src/gift-system/image/PhotosLibrary.ts` (extracted AppleScript logic)
- [ ] `src/gift-system/image/ImageStorage.ts` (cleanup, rotation)
- [ ] Test image generation end-to-end

---

## Phase 4: Scheduler & Integration (Days 5-6)

### Objectives
- Implement scheduling with node-schedule
- Extend ChatbotHandler for family replies
- Create unified entry point

### 4.1 Gift Scheduler

**File: `src/gift-system/GiftScheduler.ts`**
```typescript
import schedule, { Job } from 'node-schedule';
import { FamilyMember, DayTheme, DailyGiftResult, GiftSystemConfig } from './types.js';
import { ProactiveGenerator } from './ProactiveGenerator.js';
import { ProfileLoader } from './config/ProfileLoader.js';
import { MessageService } from '../services/MessageService.js';
import logger from '../utils/logger.js';

export class GiftScheduler {
  private jobs: Map<string, Job> = new Map();
  private generator: ProactiveGenerator;
  private profileLoader: ProfileLoader;
  private messageService: MessageService;
  private config: GiftSystemConfig;

  constructor(
    generator: ProactiveGenerator,
    profileLoader: ProfileLoader,
    messageService: MessageService,
    config: GiftSystemConfig
  ) {
    this.generator = generator;
    this.profileLoader = profileLoader;
    this.messageService = messageService;
    this.config = config;
  }

  async start(): Promise<void> {
    const members = await this.profileLoader.getEnabledMembers();
    logger.info('Starting gift scheduler', { memberCount: members.length });

    for (const member of members) {
      this.scheduleForMember(member);
    }

    logger.info('Gift scheduler started', {
      jobCount: this.jobs.size,
      dryRun: this.config.dryRun
    });
  }

  private scheduleForMember(member: FamilyMember): void {
    const [hour, minute] = member.sendTime.split(':').map(Number);

    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = member.timezone;

    const job = schedule.scheduleJob(rule, async () => {
      await this.sendDailyGift(member);
    });

    this.jobs.set(member.id, job);

    const nextRun = job.nextInvocation();
    logger.info(`Scheduled ${member.name}`, {
      time: member.sendTime,
      timezone: member.timezone,
      nextRun: nextRun?.toLocaleString()
    });
  }

  private async sendDailyGift(member: FamilyMember): Promise<DailyGiftResult> {
    const now = new Date();
    const dayOfWeek = now.getDay().toString();
    const theme = member.themes[dayOfWeek];

    if (!theme) {
      logger.warn(`No theme for ${member.name} on day ${dayOfWeek}`);
      return this.createFailedResult(member, now, 'No theme configured');
    }

    try {
      logger.info(`Generating gift for ${member.name}`, { theme: theme.name });

      const content = await this.generator.generate(member, theme, now);

      // Dry run mode - log instead of send
      if (this.config.dryRun) {
        logger.info('DRY RUN - Would send message', {
          to: member.name,
          phone: member.phone,
          text: content.text.substring(0, 100) + '...',
          hasImage: !!content.image,
          fallbackUsed: content.fallbackUsed
        });
        return this.createSuccessResult(member, now, theme.name, content);
      }

      // Test recipient override
      const recipient = this.config.testRecipient || member.phone;

      // Send the message
      if (content.image) {
        await this.messageService.sendMediaMessage(
          recipient,
          content.text,
          content.image.localPath
        );
      } else {
        await this.messageService.sendMessage(recipient, content.text);
      }

      logger.info(`Gift sent to ${member.name}`, {
        theme: theme.name,
        hasImage: !!content.image,
        fallbackUsed: content.fallbackUsed,
        toolsUsed: content.toolsInvoked
      });

      return this.createSuccessResult(member, now, theme.name, content);

    } catch (error) {
      logger.error(`Failed to send gift to ${member.name}`, { error });
      return this.createFailedResult(member, now, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerManual(memberId: string, options?: {
    forceTheme?: string;
    dryRun?: boolean;
  }): Promise<DailyGiftResult> {
    const member = await this.profileLoader.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    const now = new Date();
    const dayOfWeek = now.getDay().toString();
    let theme = member.themes[dayOfWeek];

    // Force theme override
    if (options?.forceTheme) {
      const forcedTheme = Object.values(member.themes).find(
        t => t.name.toLowerCase().includes(options.forceTheme!.toLowerCase())
      );
      if (forcedTheme) theme = forcedTheme;
    }

    if (!theme) {
      throw new Error(`No theme found for ${memberId}`);
    }

    // Temporarily override dry run
    const originalDryRun = this.config.dryRun;
    if (options?.dryRun !== undefined) {
      this.config.dryRun = options.dryRun;
    }

    try {
      return await this.sendDailyGift(member);
    } finally {
      this.config.dryRun = originalDryRun;
    }
  }

  /**
   * Preview what would be sent (always dry run)
   */
  async preview(memberId: string): Promise<DailyGiftResult> {
    return this.triggerManual(memberId, { dryRun: true });
  }

  getNextScheduledTime(memberId: string): Date | null {
    const job = this.jobs.get(memberId);
    return job?.nextInvocation() || null;
  }

  getStatus(): { member: string; nextRun: string | null }[] {
    const status: { member: string; nextRun: string | null }[] = [];
    for (const [memberId, job] of this.jobs) {
      status.push({
        member: memberId,
        nextRun: job.nextInvocation()?.toLocaleString() || null
      });
    }
    return status;
  }

  shutdown(): void {
    for (const [id, job] of this.jobs) {
      job.cancel();
    }
    this.jobs.clear();
    logger.info('Gift scheduler shutdown');
  }

  private createSuccessResult(
    member: FamilyMember,
    time: Date,
    theme: string,
    content: any
  ): DailyGiftResult {
    return {
      familyMemberId: member.id,
      memberName: member.name,
      scheduledTime: time,
      sentTime: new Date(),
      theme,
      content,
      success: true
    };
  }

  private createFailedResult(
    member: FamilyMember,
    time: Date,
    error: string
  ): DailyGiftResult {
    return {
      familyMemberId: member.id,
      memberName: member.name,
      scheduledTime: time,
      sentTime: new Date(),
      theme: 'none',
      content: { text: '', model: '', tokensUsed: 0, toolsInvoked: [], fallbackUsed: false },
      success: false,
      error
    };
  }
}
```

### 4.2 Unified Entry Point

**File: `src/main.ts`**
```typescript
import dotenv from 'dotenv';
dotenv.config();

import { ChatbotHandler } from './chatbot/ChatbotHandler.js';
import { MessagePoller } from './chatbot/MessagePoller.js';
import { MLXClient } from './chatbot/MLXClient.js';
import { MessageService } from './services/MessageService.js';
import { ConversationService } from './services/ConversationService.js';
import { GiftScheduler } from './gift-system/GiftScheduler.js';
import { ProactiveGenerator } from './gift-system/ProactiveGenerator.js';
import { ProfileLoader } from './gift-system/config/ProfileLoader.js';
import logger from './utils/logger.js';

async function main() {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       iMESSAGE AI SYSTEM - STARTING                           ');
  logger.info('═══════════════════════════════════════════════════════════════');

  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const manual = args.includes('--manual');
  const preview = args.includes('--preview');
  const memberArg = args.find(a => a.startsWith('--member='));
  const memberId = memberArg?.split('=')[1];

  // Shared services
  const messageService = new MessageService();
  const conversationService = new ConversationService();

  // Test Messages.app access
  logger.info('Testing Messages.app access...');
  const accessOk = await messageService.testAccess();
  if (!accessOk) {
    logger.error('Messages.app access failed. Check permissions.');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHATBOT MODE (Reactive)
  // ═══════════════════════════════════════════════════════════════════
  if (process.env.CHATBOT_ENABLED === 'true') {
    logger.info('Initializing chatbot...');

    const mlxClient = new MLXClient(process.env.MLX_API_URL || 'http://localhost:8000');

    // Health check MLX
    const mlxHealthy = await mlxClient.healthCheck();
    if (!mlxHealthy) {
      logger.error('MLX API not responding. Start it first: pm2 start mlx-api');
      process.exit(1);
    }

    const poller = new MessagePoller();
    const chatbot = new ChatbotHandler(poller, messageService, conversationService, mlxClient, {
      enabled: true,
      allowedContacts: (process.env.ALLOWED_CONTACTS || '').split(',').filter(Boolean),
      systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful AI assistant.',
      maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10'),
      maxTokens: parseInt(process.env.MAX_TOKENS || '512'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      responseCooldown: parseInt(process.env.RESPONSE_COOLDOWN || '2000')
    });

    await chatbot.start();
    logger.info('Chatbot started');
  }

  // ═══════════════════════════════════════════════════════════════════
  // GIFT SYSTEM MODE (Proactive)
  // ═══════════════════════════════════════════════════════════════════
  if (process.env.GIFT_SYSTEM_ENABLED === 'true') {
    logger.info('Initializing gift system...');

    const profileLoader = new ProfileLoader(
      process.env.FAMILY_PROFILES_PATH || './config/family-profiles.json'
    );

    const generator = new ProactiveGenerator({
      openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
      openRouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      webSearchProvider: (process.env.WEB_SEARCH_PROVIDER as any) || 'exa',
      webSearchApiKey: process.env.WEB_SEARCH_API_KEY || '',
      imageModel: process.env.IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro',
      imageSavePath: process.env.IMAGE_SAVE_PATH || '~/Pictures/FamilyGifts',
      photosAlbumName: process.env.PHOTOS_ALBUM_NAME || 'Family Gifts',
      photosEnabled: process.env.PHOTOS_ENABLED !== 'false',
      promptsPath: process.env.PROMPTS_PATH || './prompts',
      mlxApiUrl: process.env.MLX_API_URL || 'http://localhost:8000'
    });

    const scheduler = new GiftScheduler(generator, profileLoader, messageService, {
      enabled: true,
      profilesPath: process.env.FAMILY_PROFILES_PATH || './config/family-profiles.json',
      promptsPath: process.env.PROMPTS_PATH || './prompts',
      openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
      openRouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      webSearchProvider: (process.env.WEB_SEARCH_PROVIDER as any) || 'exa',
      webSearchApiKey: process.env.WEB_SEARCH_API_KEY || '',
      imageModel: process.env.IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro',
      imageSavePath: process.env.IMAGE_SAVE_PATH || '~/Pictures/FamilyGifts',
      photosAlbumName: process.env.PHOTOS_ALBUM_NAME || 'Family Gifts',
      photosEnabled: process.env.PHOTOS_ENABLED !== 'false',
      dryRun,
      testRecipient: process.env.TEST_RECIPIENT
    });

    // Handle CLI commands
    if (manual && memberId) {
      logger.info(`Manual trigger for ${memberId}`);
      const result = await scheduler.triggerManual(memberId);
      logger.info('Result:', result);
      process.exit(result.success ? 0 : 1);
    }

    if (preview && memberId) {
      logger.info(`Preview for ${memberId}`);
      const result = await scheduler.preview(memberId);
      logger.info('Preview result:', result);
      process.exit(0);
    }

    // Start scheduler for production
    await scheduler.start();

    // Log schedule
    const status = scheduler.getStatus();
    logger.info('Gift schedule:');
    status.forEach(s => logger.info(`  ${s.member}: ${s.nextRun}`));

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      scheduler.shutdown();
      process.exit(0);
    });
  }

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('       iMESSAGE AI SYSTEM - RUNNING                            ');
  logger.info('═══════════════════════════════════════════════════════════════');
}

main().catch(error => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
```

### 4.3 Update package.json Scripts

```json
{
  "scripts": {
    "build": "tsc && mkdir -p dist/applescript && cp src/applescript/*.applescript dist/applescript/",
    "start": "NODE_ENV=production node dist/main.js",
    "dev": "NODE_ENV=development LOG_LEVEL=debug node dist/main.js",

    "gift:start": "node dist/main.js",
    "gift:dry-run": "node dist/main.js --dry-run",
    "gift:preview": "node dist/main.js --preview --member=",
    "gift:send": "node dist/main.js --manual --member=",
    "gift:status": "node dist/main.js --status"
  }
}
```

### 4.4 Deliverables
- [ ] `src/gift-system/GiftScheduler.ts`
- [ ] `src/main.ts` (unified entry point)
- [ ] Update `package.json` with new scripts
- [ ] Extend `ChatbotHandler` for family member detection
- [ ] CLI commands working

---

## Phase 5: Testing & Deployment (Days 7-8)

### Objectives
- End-to-end testing
- PM2 configuration
- Production deployment

### 5.1 Updated PM2 Configuration

**File: `ecosystem.config.cjs`**
```javascript
const path = require('path');

module.exports = {
  apps: [
    // MLX-LM Python API (unchanged)
    {
      name: 'mlx-api',
      script: 'venv/bin/python',
      args: '-m uvicorn server:app --host 0.0.0.0 --port 8000',
      cwd: path.join(__dirname, 'mlx_api'),
      interpreter: 'none',
      env: {
        MLX_MODEL: 'mlx-community/Llama-3.2-3B-Instruct-4bit',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 5000,
      max_memory_restart: '8G',
      error_file: path.join(__dirname, 'logs', 'mlx-api-error.log'),
      out_file: path.join(__dirname, 'logs', 'mlx-api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Unified iMessage AI (Chatbot + Gift System)
    {
      name: 'imessage-ai',
      script: 'dist/main.js',
      cwd: __dirname,
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        CHATBOT_ENABLED: 'true',
        GIFT_SYSTEM_ENABLED: 'true',
      },
      wait_ready: true,
      listen_timeout: 30000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      cron_restart: '0 4 * * *',  // Daily restart at 4 AM
      max_memory_restart: '500M',
      depends_on: ['mlx-api'],
      error_file: path.join(__dirname, 'logs', 'imessage-ai-error.log'),
      out_file: path.join(__dirname, 'logs', 'imessage-ai-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

### 5.2 Testing Checklist

**Self-Test (Day 1-2):**
- [ ] Configure yourself as only family member
- [ ] Run `npm run gift:preview -- --member=self`
- [ ] Run `npm run gift:dry-run`
- [ ] Run `npm run gift:send -- --member=self`
- [ ] Verify message received
- [ ] Verify image attached (if enabled)
- [ ] Test reply handling

**Family Rollout (Day 3+):**
- [ ] Add Dad, test for 1-2 days
- [ ] Add remaining family members
- [ ] Monitor logs: `pm2 logs imessage-ai`
- [ ] Check daily summary in logs

### 5.3 Deployment Commands

```bash
# Build
npm run build

# Start everything
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View logs
pm2 logs imessage-ai --lines 50

# Manual test
npm run gift:preview -- --member=dad
npm run gift:send -- --member=dad

# Save PM2 config for reboot
pm2 save
pm2 startup
```

### 5.4 Deliverables
- [ ] `ecosystem.config.cjs` updated
- [ ] All tests passing
- [ ] Self-test complete
- [ ] Family rollout begun

---

## Cost Estimation

### Monthly Costs (5 Family Members)

| Service | Usage | Cost |
|---------|-------|------|
| OpenRouter LLM (Claude) | ~150 messages | ~$3-5 |
| OpenRouter Images (Flux) | ~150 images | ~$6 |
| Web Search (Exa) | ~100 searches | ~$0.10 |
| **Total** | | **~$10-15/month** |

### Cost Optimization

1. Use `flux-schnell` (free tier) for testing
2. Skip images on some days/members
3. Cache web search results
4. Local MLX fallback is free

---

## Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Unified entry point |
| `src/gift-system/GiftScheduler.ts` | Scheduling orchestration |
| `src/gift-system/ProactiveGenerator.ts` | Content generation |
| `config/family-profiles.json` | Family configuration |
| `prompts/` | System prompt templates |
| `ecosystem.config.cjs` | PM2 configuration |

### CLI Commands

```bash
# Development
npm run gift:preview -- --member=dad     # Preview without sending
npm run gift:dry-run                      # Run scheduler in dry-run mode
npm run gift:send -- --member=dad         # Send manually

# Production
pm2 start ecosystem.config.cjs
pm2 logs imessage-ai
pm2 restart imessage-ai
pm2 stop all
```

---

*Document Version: 2.0 | December 25, 2025*
*Revised with unified architecture, JSON configuration, and external prompts*
