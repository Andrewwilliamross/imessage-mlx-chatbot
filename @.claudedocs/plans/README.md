# iMessage MLX Chatbot - Plans

This directory contains planning documents for the iMessage MLX Chatbot project.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [FAMILY_DAILY_GIFT_SYSTEM.md](./FAMILY_DAILY_GIFT_SYSTEM.md) | Personalized daily messages for family members with AI image generation | Planning |

## Key Features

### Text Generation (Local)
- **MLX-LM** running on Apple Silicon for local LLM inference
- Personalized daily messages based on each family member's interests
- Weekly theme rotation (Bible verses, recipes, travel tips, etc.)

### AI Image Generation (OpenRouter)
- Local MLX model crafts contextual image prompts
- OpenRouter API generates images (flux-1.1-pro, SDXL, DALL-E 3)
- Automatic Photos library integration via AppleScript
- Images sent alongside personalized text via iMessage

## Related Documents

| Document | Location | Description |
|----------|----------|-------------|
| PRD | `/PRD.md` | Product Requirements Document |
| Developer Roadmap | `/DEVELOPER_ROADMAP.md` | 7-Phase implementation guide |

## Implementation Order

1. **Core System** (DEVELOPER_ROADMAP.md, Phases 1-7)
   - MLX-LM Python API
   - ChatbotHandler
   - Process management
   - Live deployment

2. **Family Daily Gift System** (this plan)
   - Depends on core system being stable
   - Adds scheduled proactive messaging
   - Personalized content for each family member
   - AI image generation pipeline (OpenRouter integration)
   - Photos library integration for image storage

---

*Last Updated: December 24, 2025*
