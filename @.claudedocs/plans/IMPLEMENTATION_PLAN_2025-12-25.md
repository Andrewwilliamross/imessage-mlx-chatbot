# Family Daily Gift System - Implementation Plan

**Date:** December 25, 2025
**Status:** Active Implementation
**Based On:** `@.claudedocs/research/PLATFORM_ARCHITECTURE_REVIEW.md`

---

## Executive Summary

This implementation plan addresses the critical issues identified in the Platform Architecture Review, introducing:

1. **LangChain/LangGraph Integration** - Modern AI agent framework for daily message generation
2. **Serper Web Search** - Unified search provider replacing multi-provider approach
3. **Image Prompt Subagent** - Dedicated agent for generating contextual FLUX image prompts
4. **Phone-to-User Mapping** - Wire ProfileLoader to ChatbotHandler for personalized replies
5. **Unified Entry Point** - Single `main.ts` replacing dual entry points

---

## Architecture Overview

### Current State

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                          │
│                                                                  │
│  chatbot-main.ts              gift-main.ts                      │
│  ├── ChatbotHandler           ├── GiftScheduler                 │
│  ├── MLXClient                ├── ProactiveGenerator            │
│  └── Generic System Prompt    │   ├── OpenRouterClient (direct) │
│      (NO profile awareness)   │   ├── WebSearchTool (multi-prov)│
│                               │   └── ImageGenerator            │
│                               └── ProfileLoader                 │
│                                                                  │
│  PROBLEMS:                                                       │
│  • ChatbotHandler has no ProfileLoader                          │
│  • Reply prompts exist but are never used                       │
│  • Multiple web search providers cause complexity               │
│  • No agent framework for extensibility                         │
│  • Image prompts are not contextually generated                 │
└─────────────────────────────────────────────────────────────────┘
```

### Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET ARCHITECTURE                           │
│                                                                  │
│  main.ts (Unified Entry Point)                                  │
│  ├── ChatbotSystem (Reply Handling)                             │
│  │   ├── ChatbotHandler                                         │
│  │   │   ├── ProfileLoader.getMemberByPhone()  <── NEW          │
│  │   │   ├── PromptLoader.buildReplyPrompt()   <── NEW          │
│  │   │   └── MLXClient                                          │
│  │   └── MessagePoller                                          │
│  │                                                               │
│  └── GiftSystem (Proactive Messages)                            │
│      ├── GiftScheduler                                          │
│      ├── DailyGiftAgent (LangGraph)            <── NEW          │
│      │   ├── StateGraph with checkpointer                       │
│      │   ├── SerperTool                        <── NEW          │
│      │   └── ImagePromptSubAgent               <── NEW          │
│      │       └── Generates FLUX prompts                         │
│      ├── ProfileLoader (shared)                                 │
│      └── PromptLoader (shared)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Wire ProfileLoader to ChatbotHandler

### Objective
Enable ChatbotHandler to identify which family member is messaging and use personalized reply prompts.

### Files to Modify
- `src/chatbot/ChatbotHandler.ts`
- `src/chatbot-main.ts`
- `src/chatbot/types.ts`

### Implementation Steps

1. **Add ProfileLoader dependency to ChatbotHandler**
   ```typescript
   // ChatbotHandler.ts
   import { ProfileLoader } from '../gift-system/config/ProfileLoader.js';
   import { PromptLoader } from '../gift-system/config/PromptLoader.js';
   ```

2. **Extend ChatbotConfig interface**
   ```typescript
   interface ChatbotConfig {
     // existing...
     profileLoader?: ProfileLoader;
     promptLoader?: PromptLoader;
   }
   ```

3. **Implement phone-to-user resolution**
   ```typescript
   private async resolveMember(sender: string): Promise<FamilyMember | undefined> {
     if (!this.profileLoader) return undefined;
     return this.profileLoader.getMemberByPhone(sender);
   }
   ```

4. **Build personalized context**
   ```typescript
   private async buildPersonalizedContext(
     chatIdentifier: string,
     member?: FamilyMember
   ): Promise<MLXMessage[]> {
     if (member && this.promptLoader) {
       const replyPrompt = await this.promptLoader.buildReplyPrompt(member.id, {
         name: member.name,
         interests: member.interests,
         // ... context
       });
       return [{ role: 'system', content: replyPrompt }, ...history];
     }
     return this.buildContext(chatIdentifier); // fallback
   }
   ```

### Verification
- [ ] ChatbotHandler resolves family member from phone number
- [ ] Personalized reply prompts are loaded for each family member
- [ ] Non-family contacts still work with generic prompt
- [ ] Unit tests pass

---

## Phase 2: Implement Family-Specific Reply Prompts

### Objective
Wire up the existing `prompts/family/{member}/reply.md` templates that are currently unused.

### Files to Modify
- `src/chatbot/ChatbotHandler.ts`
- `src/gift-system/config/PromptLoader.ts`

### Implementation Steps

1. **Use PromptLoader.buildReplyPrompt() in handleMessage**
2. **Create PromptContext from conversation state**
3. **Handle fallback when templates are missing**

---

## Phase 3: Integrate LangChain/LangGraph Agent Framework

### Objective
Replace the manual tool-calling loop in ProactiveGenerator with LangGraph StateGraph.

### Dependencies to Add
```json
{
  "@langchain/langgraph": "^0.2.x",
  "@langchain/openai": "^0.3.x",
  "@langchain/core": "^0.3.x",
  "@langchain/community": "^0.3.x"
}
```

### New Files to Create
- `src/gift-system/agents/DailyGiftAgent.ts` - Main LangGraph agent
- `src/gift-system/agents/ImagePromptAgent.ts` - Subagent for image prompts
- `src/gift-system/agents/types.ts` - Agent state and types
- `src/gift-system/tools/SerperTool.ts` - Serper integration

### Architecture

```typescript
// DailyGiftAgent.ts
import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";

// State definition
const GiftAgentState = Annotation.Root({
  member: Annotation<FamilyMember>,
  theme: Annotation<DayTheme>,
  messages: Annotation<BaseMessage[]>,
  searchResults: Annotation<SearchResult[]>,
  imagePrompt: Annotation<string>,
  generatedText: Annotation<string>,
  generatedImage: Annotation<GeneratedImage | null>,
});

// Create the graph
const workflow = new StateGraph(GiftAgentState)
  .addNode("research", researchNode)
  .addNode("generateText", generateTextNode)
  .addNode("generateImagePrompt", imagePromptNode)
  .addNode("generateImage", imageGenerationNode)
  .addEdge("research", "generateText")
  .addEdge("generateText", "generateImagePrompt")
  .addEdge("generateImagePrompt", "generateImage");
```

---

## Phase 4: Serper Web Search Integration

### Objective
Replace the multi-provider WebSearchTool with Serper using @langchain/community.

### Files to Modify
- `src/gift-system/tools/SerperTool.ts` (new)
- Remove: `src/gift-system/openrouter/WebSearchTool.ts`

### Implementation

```typescript
// SerperTool.ts
import { Serper } from "@langchain/community/tools/serper";

export function createSerperTool(apiKey: string): Serper {
  return new Serper({
    apiKey,
    gl: "us",
    hl: "en",
  });
}
```

### Environment Variables
```bash
SERPER_API_KEY=your_serper_api_key
```

---

## Phase 5: Image Prompt Subagent

### Objective
Create a dedicated subagent that generates contextual, high-quality image prompts for FLUX.

### Files to Create
- `src/gift-system/agents/ImagePromptAgent.ts`

### Implementation

```typescript
// ImagePromptAgent.ts
export class ImagePromptAgent {
  private llm: ChatOpenAI;

  async generatePrompt(
    member: FamilyMember,
    theme: DayTheme,
    textContent: string
  ): Promise<string> {
    // Uses a focused prompt to generate FLUX-optimized image prompts
    const systemPrompt = `You are an expert at creating image generation prompts for FLUX.
    Create a detailed, evocative prompt that captures the essence of the message.
    Consider the recipient's interests and the theme of the day.
    Output ONLY the image prompt, nothing else.`;

    const result = await this.llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate an image prompt for:
        Recipient: ${member.name}
        Theme: ${theme.name}
        Interests: ${member.interests.join(', ')}
        Message: ${textContent}` }
    ]);

    return result.content as string;
  }
}
```

---

## Phase 6: Unified Entry Point

### Objective
Consolidate `chatbot-main.ts` and `gift-main.ts` into a single `main.ts`.

### Files to Modify
- Create: `src/main.ts`
- Update: `ecosystem.config.cjs`
- Update: `package.json` scripts

### Implementation

```typescript
// main.ts
async function main() {
  const mode = process.env.MODE ?? 'all'; // 'chatbot', 'gift', 'all'

  if (mode === 'chatbot' || mode === 'all') {
    await startChatbotSystem();
  }

  if (mode === 'gift' || mode === 'all') {
    await startGiftSystem();
  }
}
```

---

## Phase 7: Template Migration & Cleanup

### Objective
Commit the `.md` template files and remove old `.hbs` references.

### Tasks
- [ ] Verify all `.md` templates are complete
- [ ] Remove any `.hbs` file references
- [ ] Update PromptLoader if needed
- [ ] Commit all changes

---

## Testing Strategy

### Unit Tests
- ProfileLoader.getMemberByPhone() with various phone formats
- PromptLoader.buildReplyPrompt() template rendering
- SerperTool search functionality
- ImagePromptAgent prompt generation

### Integration Tests
- Full message flow: receive -> identify -> personalize -> respond
- Full gift flow: schedule -> research -> generate -> image -> send

### Manual Testing Checklist
- [ ] Send test message to chatbot, verify personalized response
- [ ] Run gift:preview for each family member
- [ ] Run gift:send in dry-run mode
- [ ] Verify images saved to Photos.app

---

## Dependencies Summary

### New NPM Packages
```bash
npm install @langchain/langgraph @langchain/openai @langchain/core @langchain/community
```

### Environment Variables to Add
```bash
SERPER_API_KEY=your_key_here
```

### Environment Variables to Remove
```bash
WEB_SEARCH_PROVIDER=  # No longer needed, Serper is now the only provider
```

---

## Rollback Plan

Each phase is designed to be independently revertable:

1. **Phase 1-2**: Simply remove ProfileLoader/PromptLoader from ChatbotHandler
2. **Phase 3-5**: Keep ProactiveGenerator as fallback, controlled by feature flag
3. **Phase 6**: Keep both entry points available
4. **Phase 7**: Git revert if needed

---

## Git Commit Strategy

After each phase completion:
1. Run all tests
2. Verify functionality manually
3. Create descriptive commit with phase number
4. Update this document with commit hash

### Commit History (To Be Filled)
| Phase | Commit Hash | Description |
|-------|-------------|-------------|
| 1 | pending | Wire ProfileLoader to ChatbotHandler |
| 2 | pending | Implement family-specific reply prompts |
| 3 | pending | Add LangChain/LangGraph agent framework |
| 4 | pending | Integrate Serper web search |
| 5 | pending | Create ImagePromptAgent subagent |
| 6 | pending | Consolidate to unified main.ts |
| 7 | pending | Template migration and cleanup |

---

*Last Updated: December 25, 2025*
