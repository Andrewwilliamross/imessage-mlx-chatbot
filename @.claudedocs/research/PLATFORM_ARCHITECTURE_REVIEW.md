# Family Daily Gift System - Platform Architecture Review

**Document Type:** Lead Engineer Technical Assessment
**Version:** 1.0
**Date:** December 25, 2025
**Status:** Pre-Deployment Review

---

## Executive Summary

This document provides a comprehensive technical review of the iMessage MLX Family Daily Gift System, assessing its readiness for production deployment. The platform implements a **dual-model architecture** for personalized family messaging:

| Component | Model | Provider | Purpose |
|-----------|-------|----------|---------|
| **Proactive Daily Messages** | Claude/GPT-4 | OpenRouter | Web search, image generation, rich content |
| **Reply Handling** | Llama-3.2-3B | Local MLX | Fast, private, conversational responses |

### Key Findings

| Category | Status | Priority |
|----------|--------|----------|
| System Prompt Architecture | **Critical Issues** | P0 |
| Model Selection | **Needs Revision** | P1 |
| Phone-to-User Mapping | **Missing Implementation** | P0 |
| iMessage SDK Approach | **Acceptable with Risks** | P2 |
| Web Search Integration | **Well Implemented** | OK |
| Image Generation | **Well Implemented** | OK |

---

## 1. System Prompt Architecture Analysis

### 1.1 Current State

The codebase contains **32 prompt template files**:

```
prompts/
├── base/                           # 2 files (proactive.md, reply.md)
├── family/
│   ├── dad/                        # 2 core + 3 themes = 5 files
│   ├── mom/                        # 2 core + 3 themes = 5 files
│   ├── sister/                     # 2 core + 7 themes = 9 files
│   ├── brother/                    # 2 core + 5 themes = 7 files
│   └── grandma/                    # 2 core + 4 themes = 6 files
└── special/                        # 3 files (birthday, christmas, thanksgiving)
```

### 1.2 Identified Problems

#### Problem 1: Excessive Template Fragmentation

**Issue:** Each family member has separate theme partial templates that add unnecessary complexity.

**Evidence from `prompts/family/dad/proactive.md:27`:**
```handlebars
{{> themes/{{themeTemplate}} }}
```

This dynamic partial inclusion creates:
- 22 separate theme template files
- Maintenance overhead for content that could be inline
- Complex template loading/caching logic in `PromptLoader.ts`

**Recommendation:** Consolidate to **exactly 2 prompts per user**:
1. `proactive.md` - Daily scheduled message generation
2. `reply.md` - Response handling when user replies

Theme-specific content should be injected via context variables (`{{themeName}}`, `{{searchHint}}`, `{{interests}}`), not separate files.

#### Problem 2: Reply Prompts Exist But Are Never Used

**Issue:** `ChatbotHandler.ts` does not utilize family-specific reply prompts.

**Evidence from `src/chatbot/ChatbotHandler.ts:243-246`:**
```typescript
private buildContext(chatIdentifier: string): MLXMessage[] {
  const messages: MLXMessage[] = [
    { role: 'system', content: this.config.systemPrompt },  // Generic prompt!
  ];
```

The handler uses a single `config.systemPrompt` for all conversations, ignoring:
- `prompts/family/{member}/reply.md` templates
- `PromptLoader.buildReplyPrompt()` method (implemented but unused)

**Impact:** All family members receive identical, non-personalized reply handling.

#### Problem 3: No Phone-to-User Mapping in ChatbotHandler

**Issue:** There's no mechanism to identify which family member is messaging and select their personalized prompt.

**Evidence from `src/chatbot/ChatbotHandler.ts:210-219`:**
```typescript
private isAllowedContact(sender: string): boolean {
  const normalizedSender = this.normalizeContact(sender);
  return this.config.allowedContacts.some((allowed) => {
    // Only checks if contact is in whitelist, not WHO they are
```

**Missing implementation:** The `ProfileLoader.getMemberByPhone()` method exists but is never called by `ChatbotHandler`:

```typescript
// ProfileLoader.ts - Exists but unused
async getMemberByPhone(phone: string): Promise<FamilyMember | undefined> {
  const config = await this.load();
  const normalizedPhone = phone.replace(/\D/g, '');
  return config.familyMembers.find(m => {
    const memberPhone = m.phone.replace(/\D/g, '');
    return normalizedPhone.includes(memberPhone) || memberPhone.includes(normalizedPhone);
  });
}
```

### 1.3 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMPLIFIED PROMPT FLOW                        │
│                                                                  │
│  ┌─────────────────┐        ┌────────────────────────────────┐  │
│  │ Incoming Reply  │───────►│ ChatbotHandler                 │  │
│  │ from +1XXX...   │        │                                │  │
│  └─────────────────┘        │ 1. extractSenderPhone()        │  │
│                             │ 2. profileLoader.getMemberByPhone()│
│                             │ 3. promptLoader.buildReplyPrompt() │
│                             │ 4. mlxClient.generate()        │  │
│                             └────────────────────────────────┘  │
│                                                                  │
│  prompts/family/{member}/                                        │
│  ├── proactive.md   ◄── GiftScheduler (daily messages)         │
│  └── reply.md       ◄── ChatbotHandler (reply handling)        │
│                                                                  │
│  NO THEME PARTIALS - All context injected via variables         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Model Selection Review

### 2.1 Current Configuration

| Component | Current Model | Issues |
|-----------|---------------|--------|
| OpenRouter (Proactive) | `anthropic/claude-3.5-sonnet` | Outdated model ID |
| OpenRouter (Images) | `black-forest-labs/flux-1.1-pro` | Good choice |
| Local MLX (Replies) | `mlx-community/Llama-3.2-3B-Instruct-4bit` | Good choice |

### 2.2 OpenRouter Model Analysis

**Reference:** [OpenRouter Rankings](https://openrouter.ai/rankings) (December 2025)

#### Current Top Models by Token Usage:
1. Gemini 2.5 Flash (8.0%)
2. Grok Code Fast 1 (7.6%)
3. Gemini 2.0 Flash (7.4%)
4. **Claude Sonnet 4.5 (6.8%)**
5. Deepseek V3.2 (4.9%)

#### Issue: Outdated Model Identifier

**Evidence from `src/gift-system/openrouter/OpenRouterClient.ts:124`:**
```typescript
this.defaultModel = config.defaultModel ?? 'anthropic/claude-3.5-sonnet';
```

The identifier `anthropic/claude-3.5-sonnet` may not reflect the latest Claude model. Current recommended identifiers:
- `anthropic/claude-sonnet-4` - Latest Sonnet (Claude Opus 4.5 series)
- `anthropic/claude-3-5-sonnet-20241022` - Specific version

#### Recommended Model Selection for This Use Case

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| **Proactive Messages** | `anthropic/claude-sonnet-4` or `google/gemini-2.0-flash` | Best balance of quality, tool support, and cost |
| **High-Quality Days** | `anthropic/claude-opus-4` | Premium content for special occasions |
| **Budget Mode** | `google/gemini-2.5-flash` | Cost-effective with good tool support |
| **Image Generation** | `black-forest-labs/flux-1.1-pro` | Current choice is optimal |

#### Cost Considerations (Per Message)

| Model | Input Cost | Output Cost | Est. Daily Cost (5 members) |
|-------|------------|-------------|----------------------------|
| Claude Sonnet 4 | $3/M tokens | $15/M tokens | ~$0.15-0.25 |
| Gemini 2.0 Flash | Free tier available | Free tier | $0 (with limits) |
| Flux 1.1 Pro | ~$0.04/image | - | ~$0.20 |

**Monthly Estimate:** $15-25/month for 5 family members with daily messages + images.

### 2.3 MLX Local Model Assessment

**Reference:** [MLX-LM GitHub](https://github.com/ml-explore/mlx-lm) and [WWDC 2025 MLX Session](https://developer.apple.com/videos/play/wwdc2025/298/)

#### Current Model: `mlx-community/Llama-3.2-3B-Instruct-4bit`

| Metric | Value | Assessment |
|--------|-------|------------|
| Parameters | 3B (4-bit quantized) | Good for Mac |
| Memory Usage | ~2-3GB VRAM | Fits easily |
| Response Time | 1-3 seconds | Excellent |
| Quality | Good for conversation | Adequate |

#### Recommended Alternatives

| Model | Params | Quality | Speed | Use Case |
|-------|--------|---------|-------|----------|
| `mlx-community/Llama-3.2-3B-Instruct-4bit` | 3B | Good | Fast | **Current - Keep** |
| `mlx-community/Qwen2.5-7B-Instruct-4bit` | 7B | Better | Slower | Higher quality replies |
| `mlx-community/Llama-3.3-8B-Instruct-4bit` | 8B | Best | Slowest | Premium local inference |

**Recommendation:** Keep current model for replies. The 3B model provides adequate quality for short conversational responses with excellent latency.

---

## 3. iMessage Integration Assessment

### 3.1 Current Implementation

The system uses **AppleScript via osascript** for iMessage operations.

**Evidence from `src/handlers/AppleScriptHandler.ts`:**
- Spawns `osascript` process per operation
- 30-second timeout per operation
- JSON output parsing
- Circuit breaker protection

### 3.2 Alternative: Photon iMessage SDK

**Reference:** [photon-hq/imessage-kit](https://github.com/photon-hq/imessage-kit)

| Feature | Current (AppleScript) | Photon SDK |
|---------|----------------------|------------|
| Type Safety | None (string output) | Full TypeScript |
| Dependencies | None (system osascript) | better-sqlite3 for Node |
| Reliability | Medium (AppleScript quirks) | High (direct DB access) |
| Performance | Slow (process per op) | Fast (native bindings) |
| Maintenance | Active Apple support | Community maintained |

#### Photon SDK Features:
- Zero dependencies (Bun) or minimal (Node.js + better-sqlite3)
- Native iMessage/SMS/RCS message reading
- Send text, images, and files
- Requires Full Disk Access permission (same as current approach)

### 3.3 Other iMessage Projects Reviewed

| Project | URL | Assessment |
|---------|-----|------------|
| **beeper/imessage** | [GitHub](https://github.com/beeper/imessage) | Matrix bridge, complex setup |
| **mautrix/imessage** | [GitHub](https://github.com/mautrix/imessage) | Requires SIP disabled for full features |
| **airmessage-server** | [GitHub](https://github.com/airmessage/airmessage-server) | External client focus |
| **power-message** | [GitHub](https://github.com/drbh/power-message) | REST API wrapper |

### 3.4 Recommendation

**Keep AppleScript for now, plan migration to Photon SDK.**

Rationale:
1. Current implementation works reliably with circuit breaker
2. Photon SDK is newer (may have undiscovered issues)
3. Migration can be done incrementally (send, then read)
4. Both require Full Disk Access anyway

---

## 4. Web Search Integration Assessment

### 4.1 Current Implementation

**Evidence from `src/gift-system/openrouter/WebSearchTool.ts`:**

```typescript
export class WebSearchTool {
  private provider: 'exa' | 'tavily' | 'serp';
  // Three provider implementations
}
```

### 4.2 Provider Comparison

**Reference:** [SERP API Comparison 2025](https://dev.to/ritza/best-serp-api-comparison-2025-serpapi-vs-exa-vs-tavily-vs-scrapingdog-vs-scrapingbee-2jci)

| Provider | Best For | Speed | AI-Native | Cost |
|----------|----------|-------|-----------|------|
| **Exa** | Deep research, RAG | 1.18s | Yes (semantic) | $5/1K queries |
| **Tavily** | Factual verification | 2.33s | Yes (ranked) | $0.005/query |
| **SerpAPI** | Google replication | 0.07s | No (scraper) | Variable |

### 4.3 Recommendation for This Use Case

| Family Member Theme | Recommended Provider |
|--------------------|----------------------|
| Devotional content (Dad) | **Exa** - semantic search for scripture |
| Nashville events (Mom) | **Tavily** - real-time local events |
| Recipes (Dad, Sister) | **Tavily** - structured content |
| History facts | **Exa** - deep research |
| Fashion/Art | **Exa** - creative content |

**Implementation:** Consider making provider configurable per theme in `family-profiles.json`:

```json
{
  "themes": {
    "0": {
      "name": "Sunday Reflection",
      "template": "devotional",
      "searchHint": "Sunday morning devotional",
      "searchProvider": "exa"  // NEW: Per-theme provider
    }
  }
}
```

---

## 5. Architecture Inconsistencies

### 5.1 Dual Entry Point Problem

**Issue:** Two separate entry points with duplicated initialization logic.

**Evidence:**
- `src/chatbot-main.ts` - Chatbot entry
- `src/gift-main.ts` - Gift system entry

The roadmap specified a unified `src/main.ts` but this was not implemented.

### 5.2 Disconnected Subsystems

```
┌────────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                         │
│                                                                 │
│  ┌─────────────────────┐        ┌─────────────────────┐        │
│  │   chatbot-main.ts   │        │   gift-main.ts      │        │
│  │                     │        │                     │        │
│  │  • ChatbotHandler   │   NO   │  • GiftScheduler    │        │
│  │  • MLXClient        │ ←────→ │  • ProactiveGen     │        │
│  │  • MessageSync      │ LINK   │  • ProfileLoader    │        │
│  │  • Generic prompt   │        │  • PromptLoader     │        │
│  └─────────────────────┘        └─────────────────────┘        │
│                                                                 │
│  Problems:                                                      │
│  1. No shared ProfileLoader instance                           │
│  2. ChatbotHandler doesn't use family profiles                 │
│  3. Reply prompts are never loaded                             │
│  4. Two PM2 processes instead of one                           │
└────────────────────────────────────────────────────────────────┘
```

### 5.3 Template Format Migration Incomplete

**Issue:** Migration from `.hbs` to `.md` is partially complete.

**Git Status Shows:**
```
D prompts/base/proactive.hbs       # Deleted
?? prompts/base/proactive.md       # Untracked (new)
```

This creates confusion about the canonical format.

### 5.4 Missing Integration Points

| Component | Expected | Actual |
|-----------|----------|--------|
| ChatbotHandler + ProfileLoader | Integrated | **Separate** |
| ChatbotHandler + PromptLoader | Uses reply.md | **Generic prompt** |
| GiftScheduler notifications | Logs to file | **No external alert** |
| Health monitoring | Prometheus metrics | **None** |

---

## 6. AI Agent Pattern Assessment

### 6.1 Current Tool Pattern

**Reference:** [Agentic AI Design Patterns 2025](https://research.aimultiple.com/agentic-ai-design-patterns/)

The system implements the **Tool Use Pattern** correctly:

```
User Request → LLM → Tool Call → Tool Result → LLM → Final Response
```

**Evidence from `src/gift-system/ProactiveGenerator.ts:307-354`:**
```typescript
while (result.toolCalls.length > 0 && iterations < this.maxToolIterations) {
  // Process tool calls
  for (const toolCall of result.toolCalls) {
    const toolResult = await this.handleToolCall(...);
    toolResults.push({ toolCallId: toolCall.id, result: toolResult });
  }
  // Continue with results
  result = await this.openRouterClient.continueWithToolResults(...);
}
```

### 6.2 Identified Improvements

#### Issue 1: No Circuit Breaking on Tool Failures

**Current:** Tool failures are caught but may loop if tools repeatedly fail.

**Recommendation:** Add circuit breaker pattern for tool calls:

```typescript
// Proposed enhancement
const toolCircuitBreaker = new CircuitBreaker({
  threshold: 3,
  resetTimeout: 60000,
  onOpen: () => logger.warn('Tool circuit breaker opened')
});
```

#### Issue 2: Sequential Tool Execution

**Current:** Tools execute sequentially even when independent.

**Recommendation:** Parallel tool execution when safe:

```typescript
// Current (sequential)
for (const toolCall of result.toolCalls) {
  const toolResult = await this.handleToolCall(toolCall);
}

// Proposed (parallel)
const toolResults = await Promise.all(
  result.toolCalls.map(tc => this.handleToolCall(tc))
);
```

#### Issue 3: No Token Budget Management

**Current:** No limits on total tokens per generation session.

**Recommendation:** Add token budget tracking to prevent runaway costs.

---

## 7. Security Considerations

### 7.1 Identified Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| API keys in `.env` | Medium | Use macOS Keychain or Secrets Manager |
| MLX API no auth | Low | Localhost only, add optional API key |
| AppleScript injection | Low | Current escaping is adequate |
| Full Disk Access | Required | Minimize scope in System Settings |

### 7.2 Recommendations

1. **Rotate API keys** quarterly
2. **Add rate limiting** to MLX API
3. **Implement audit logging** for sent messages
4. **Add message content validation** before sending

---

## 8. Prioritized Action Items

### P0 - Critical (Before Launch)

| # | Issue | Files Affected | Effort |
|---|-------|----------------|--------|
| 1 | Wire ProfileLoader to ChatbotHandler | `ChatbotHandler.ts`, `chatbot-main.ts` | 2 hours |
| 2 | Implement phone-to-user mapping | `ChatbotHandler.ts` | 1 hour |
| 3 | Use family-specific reply prompts | `ChatbotHandler.ts`, `PromptLoader.ts` | 2 hours |
| 4 | Commit template migration (.md files) | git operations | 15 min |

### P1 - High Priority (Week 1)

| # | Issue | Files Affected | Effort |
|---|-------|----------------|--------|
| 5 | Update OpenRouter model to latest | `OpenRouterClient.ts`, `.env` | 30 min |
| 6 | Consolidate to single entry point | Create `main.ts`, update PM2 | 3 hours |
| 7 | Remove theme partial templates | Refactor prompts | 2 hours |
| 8 | Add tool circuit breaking | `ProactiveGenerator.ts` | 2 hours |

### P2 - Medium Priority (Week 2-3)

| # | Issue | Files Affected | Effort |
|---|-------|----------------|--------|
| 9 | Add Prometheus metrics | New `metrics.ts` | 4 hours |
| 10 | Implement parallel tool execution | `ProactiveGenerator.ts` | 2 hours |
| 11 | Add token budget management | `ProactiveGenerator.ts` | 2 hours |
| 12 | Evaluate Photon SDK migration | Research + POC | 8 hours |

### P3 - Nice to Have (Future)

| # | Issue | Effort |
|---|-------|--------|
| 13 | Per-theme search provider config | 2 hours |
| 14 | A/B testing for prompts | 8 hours |
| 15 | Message scheduling UI | 20+ hours |

---

## 9. Deployment Readiness Checklist

### Pre-Launch Requirements

- [ ] P0 items completed
- [ ] All `.md` prompt templates committed
- [ ] `.env` populated with production API keys
- [ ] Family phone numbers verified in `family-profiles.json`
- [ ] Test message sent to each family member
- [ ] PM2 startup script configured
- [ ] Log rotation configured
- [ ] Backup strategy for chat.db access

### Launch Day Verification

- [ ] MLX API responds on `localhost:8000/health`
- [ ] OpenRouter API key validated
- [ ] Web search API key validated
- [ ] First scheduled message sent successfully
- [ ] Reply handling working for each family member

---

## 10. References

### Primary Sources

1. [Photon iMessage Kit](https://github.com/photon-hq/imessage-kit) - Type-safe iMessage SDK
2. [MLX-LM GitHub](https://github.com/ml-explore/mlx-lm) - Apple's ML framework for local LLMs
3. [OpenRouter Models](https://openrouter.ai/models) - Model selection and pricing
4. [OpenRouter Rankings](https://openrouter.ai/rankings) - Current model usage statistics

### AI Agent Patterns

5. [Agentic AI Design Patterns](https://research.aimultiple.com/agentic-ai-design-patterns/)
6. [9 Agentic Workflow Patterns 2025](https://www.marktechpost.com/2025/08/09/9-agentic-ai-workflow-patterns-transforming-ai-agents-in-2025/)
7. [Building AI Agents Guide](https://medium.com/@divyanshbhatiajm19/the-ultimate-guide-to-building-ai-agents-in-2025-from-concept-to-deployment-121da166562e)

### Web Search APIs

8. [SERP API Comparison 2025](https://dev.to/ritza/best-serp-api-comparison-2025-serpapi-vs-exa-vs-tavily-vs-scrapingdog-vs-scrapingbee-2jci)
9. [Exa vs Tavily vs SerpApi](https://tpc.exa.ai/differences-exa-tavily-serpapi-autonomous-agents)
10. [Web Search APIs for AI](https://www.firecrawl.dev/blog/top_web_search_api_2025)

### MLX and Apple Silicon

11. [WWDC 2025 - MLX on Apple Silicon](https://developer.apple.com/videos/play/wwdc2025/298/)
12. [MLX Neural Accelerators M5](https://machinelearning.apple.com/research/exploring-llms-mlx-m5)
13. [Running Local LLMs with MLX](https://simonwillison.net/2025/Feb/15/llm-mlx/)

---

*Document prepared by: Lead Engineer Review*
*Last Updated: December 25, 2025*
