# iMessage MLX Chatbot - Plans

This directory contains planning documents for the iMessage MLX Chatbot project.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [FAMILY_DAILY_GIFT_SYSTEM.md](./FAMILY_DAILY_GIFT_SYSTEM.md) | Feature specification with dual-model architecture | Planning |
| [FAMILY_GIFT_FEATURE_ROADMAP.md](./FAMILY_GIFT_FEATURE_ROADMAP.md) | 8-Phase implementation roadmap | Planning |

---

## Dual-Model Architecture

The Family Daily Gift System uses a **dual-model approach**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DAILY PROACTIVE MESSAGES                         │
│                                                                     │
│  Scheduler (6:30 AM)  ──▶  OpenRouter API  ──▶  iMessage            │
│                            │                                        │
│                            ├─ Claude 3.5 Sonnet (text)              │
│                            ├─ Web Search (Exa/Tavily)               │
│                            └─ Flux/DALL-E (images)                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       REPLY HANDLING                                │
│                                                                     │
│  Family Reply  ──▶  Local MLX-LM  ──▶  iMessage                     │
│                     (Llama-3.2-3B)                                  │
│                     Fast, Private, Free                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

| Aspect | Proactive (OpenRouter) | Replies (Local MLX) |
|--------|------------------------|---------------------|
| **Use Case** | Rich daily content | Quick conversations |
| **Features** | Web search, images, tools | Basic chat |
| **Cost** | ~$0.02-0.10/message | Free |
| **Speed** | 3-10 seconds | 1-3 seconds |
| **Privacy** | API-based | 100% local |
| **Volume** | 5 messages/day | Unlimited |

---

## Key Capabilities

### Proactive Daily Messages (OpenRouter)
- **LLM with Tools**: Claude 3.5 Sonnet via OpenRouter
- **Web Search**: Real-time information (events, recipes, news, Bible verses)
- **Image Generation**: AI images via Flux/DALL-E
- **Scheduling**: node-schedule with per-member timezones
- **Personalization**: Theme rotation based on day of week

### Reply Handling (Local MLX)
- **Local LLM**: Llama-3.2-3B-Instruct-4bit on Apple Silicon
- **Context Management**: Per-family-member conversation state
- **Fast Response**: ~1-3 seconds inference time
- **Privacy**: All data stays on Mac Mini

### Supporting Features
- Photos library integration (AppleScript)
- PM2 process management
- Auto-start on boot
- Logging and monitoring

---

## Family Members

| Member | Send Time | Interests | Key Themes |
|--------|-----------|-----------|------------|
| **Dad (David)** | 6:30 AM CT | Faith, Nashville, Recipes | Devotionals, History, Cooking |
| **Mom** | 7:00 AM CT | Design, Music, Venues | Design tips, Live music |
| **Sister (USC)** | 8:00 AM PT | Travel, Fitness, Art | Motivation, Wellness, Painting |
| **Brother** | 7:30 AM CT | Architecture, Fashion, Cigars | Buildings, Style, Culture |
| **Grandma** | 7:00 AM CT | Baking, Gardening, Antiques | Recipes, Garden, Collectibles |

---

## Related Documents

| Document | Location | Description |
|----------|----------|-------------|
| PRD | `/PRD.md` | Core iMessage chatbot requirements |
| Developer Roadmap | `/DEVELOPER_ROADMAP.md` | Core system 7-phase guide |

---

## Implementation Order

### Phase 1: Core System
*See: `/DEVELOPER_ROADMAP.md`*
- MLX-LM Python API (FastAPI)
- ChatbotHandler (TypeScript)
- MessageSync integration
- PM2 process management

### Phase 2: Family Daily Gift System
*See: `FAMILY_GIFT_FEATURE_ROADMAP.md`*
1. Foundation & Configuration
2. OpenRouter Integration with Tools
3. Image Generation Pipeline
4. Scheduler & Content Generation
5. Reply Handler with Local MLX
6. Integration & Testing
7. PM2 & Deployment
8. Live Deployment & Rollout

---

## Quick Start (After Implementation)

```bash
# Start all services
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View logs
pm2 logs family-gift

# Manual trigger for testing
# (via CLI tool - see implementation)
```

---

## Cost Estimation

| Service | Monthly Usage | Cost |
|---------|---------------|------|
| OpenRouter LLM | ~150 messages | ~$3-5 |
| OpenRouter Images | ~150 images | ~$6 |
| Web Search (Exa) | ~100 searches | ~$0-5 |
| Local MLX Replies | Unlimited | Free |
| **Total** | | **~$10-15/month** |

---

*Last Updated: December 24, 2025*
