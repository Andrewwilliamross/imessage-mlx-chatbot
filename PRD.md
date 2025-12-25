# Product Requirements Document: iMessage MLX Chatbot

## Project Overview

**Project Name:** iMessage MLX Chatbot
**Platform:** macOS (Mac Mini with Apple Silicon)
**Date:** December 24, 2025

### Summary

Integrate a locally-running LLM (via MLX-LM) with the existing iMessage relay to create an AI-powered iMessage chatbot. The relay already handles chat.db polling and AppleScript-based message sending—we simply add an LLM inference layer.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Mac Mini                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ~/Library/Messages/chat.db               │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │ poll (2s) + file watch          │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Existing iMessage Relay (TypeScript)        │   │
│  │  ┌────────────┐  ┌─────────────────┐  ┌───────────┐  │   │
│  │  │MessageSync │──│ConversationSvc  │  │MessageSvc │  │   │
│  │  │(new_message│  │(context lookup) │  │(send via  │  │   │
│  │  │  events)   │  │                 │  │AppleScript│  │   │
│  │  └─────┬──────┘  └────────┬────────┘  └─────▲─────┘  │   │
│  │        │                  │                 │        │   │
│  │        └──────────────────┼─────────────────┘        │   │
│  │                           │                          │   │
│  └───────────────────────────┼──────────────────────────┘   │
│                              │                               │
│                     HTTP POST /generate                      │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             MLX-LM Python API (FastAPI)               │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  POST /generate                                  │ │   │
│  │  │  - Receives: { messages, max_tokens, temp }      │ │   │
│  │  │  - Returns: { response, tokens, time_ms }        │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  │                         │                            │   │
│  │                         ▼                            │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │     Llama-3.2-3B-Instruct-4bit (or similar)     │ │   │
│  │  │     Loaded in memory via MLX                    │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Existing Relay (No Changes Needed)

| Component | File | Function |
|-----------|------|----------|
| MessageSync | `src/services/MessageSync.ts` | Polls chat.db, emits `new_message` events |
| ConversationService | `src/services/ConversationService.ts` | Queries chat.db for conversation context |
| MessageService | `src/services/MessageService.ts` | Sends via AppleScript with delivery verification |
| AppleScript | `src/applescript/imessage.applescript` | Direct Messages.app control |

### 2. New: Chatbot Handler (TypeScript)

Lightweight module that:
1. Listens for `new_message` events from MessageSync
2. Filters to allowed contacts (whitelist)
3. Ignores `is_from_me` messages (prevents loops)
4. Fetches conversation history for context
5. Calls MLX-LM API
6. Sends response via MessageService

### 3. New: MLX-LM API (Python)

Simple FastAPI wrapper around `mlx_lm.generate`:
- Endpoint: `POST /generate`
- Loads model once at startup
- Stateless inference (context passed per request)

---

## Implementation Plan

### Phase 1: MLX-LM Python API

Create `src/mlx_api/server.py`:

```python
from fastapi import FastAPI
from pydantic import BaseModel
from mlx_lm import load, generate

app = FastAPI()

# Load model once at startup
MODEL_ID = "mlx-community/Llama-3.2-3B-Instruct-4bit"
model, tokenizer = load(MODEL_ID)

class GenerateRequest(BaseModel):
    messages: list[dict]  # [{"role": "user", "content": "..."}]
    max_tokens: int = 512
    temperature: float = 0.7

class GenerateResponse(BaseModel):
    response: str
    tokens_generated: int
    generation_time_ms: int

@app.post("/generate")
def generate_response(req: GenerateRequest) -> GenerateResponse:
    import time
    start = time.time()

    # Apply chat template
    prompt = tokenizer.apply_chat_template(
        req.messages,
        add_generation_prompt=True,
        tokenize=False
    )

    # Generate
    response = generate(
        model, tokenizer,
        prompt=prompt,
        max_tokens=req.max_tokens,
        temp=req.temperature
    )

    elapsed_ms = int((time.time() - start) * 1000)

    return GenerateResponse(
        response=response,
        tokens_generated=len(tokenizer.encode(response)),
        generation_time_ms=elapsed_ms
    )

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}
```

### Phase 2: Chatbot Handler (TypeScript)

Create `src/chatbot/ChatbotHandler.ts`:

```typescript
import MessageSync from '../services/MessageSync.js';
import MessageService from '../services/MessageService.js';
import ConversationService from '../services/ConversationService.js';
import logger from '../utils/logger.js';

interface ChatbotConfig {
    mlxApiUrl: string;
    allowedContacts: string[];
    systemPrompt: string;
    maxContextMessages: number;
    maxTokens: number;
    temperature: number;
}

class ChatbotHandler {
    private messageSync: MessageSync;
    private messageService: MessageService;
    private conversationService: ConversationService;
    private config: ChatbotConfig;

    constructor(
        messageSync: MessageSync,
        messageService: MessageService,
        conversationService: ConversationService,
        config: ChatbotConfig
    ) {
        this.messageSync = messageSync;
        this.messageService = messageService;
        this.conversationService = conversationService;
        this.config = config;

        this.setupListeners();
    }

    private setupListeners(): void {
        this.messageSync.on('new_message', (msg) => this.handleMessage(msg));
    }

    private async handleMessage(message: ProcessedMessage): Promise<void> {
        // Ignore our own messages
        if (message.is_from_me) return;

        // Check whitelist
        const sender = message.handle || message.chat_identifier;
        if (!this.isAllowed(sender)) {
            logger.debug(`Ignoring message from non-whitelisted: ${sender}`);
            return;
        }

        logger.info(`Processing message from ${sender}: ${message.text?.substring(0, 50)}`);

        try {
            // Get conversation context
            const context = await this.buildContext(message.chat_identifier);

            // Call MLX-LM
            const response = await this.generateResponse(context, message.text);

            // Send reply
            await this.messageService.sendMessage(sender, response);

            logger.info(`Sent response to ${sender}`);
        } catch (error) {
            logger.error('Failed to process message:', error);
        }
    }

    private isAllowed(sender: string): boolean {
        return this.config.allowedContacts.some(
            allowed => sender.includes(allowed) || allowed.includes(sender)
        );
    }

    private async buildContext(chatId: string): Promise<object[]> {
        const messages = this.conversationService.getMessages(
            chatId,
            this.config.maxContextMessages
        );

        return [
            { role: 'system', content: this.config.systemPrompt },
            ...messages.map(m => ({
                role: m.isFromMe ? 'assistant' : 'user',
                content: m.text || ''
            }))
        ];
    }

    private async generateResponse(context: object[], userMessage: string): Promise<string> {
        const messages = [
            ...context,
            { role: 'user', content: userMessage }
        ];

        const response = await fetch(`${this.config.mlxApiUrl}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        const data = await response.json();
        return data.response;
    }
}

export default ChatbotHandler;
```

### Phase 3: Integration

Modify relay entry point to optionally enable chatbot mode:

```typescript
// In relay.ts or new chatbot.ts entry point
if (process.env.CHATBOT_ENABLED === 'true') {
    const chatbot = new ChatbotHandler(
        messageSync,
        messageService,
        conversationService,
        {
            mlxApiUrl: process.env.MLX_API_URL || 'http://localhost:8000',
            allowedContacts: (process.env.ALLOWED_CONTACTS || '').split(','),
            systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful assistant.',
            maxContextMessages: parseInt(process.env.MAX_CONTEXT || '10'),
            maxTokens: parseInt(process.env.MAX_TOKENS || '512'),
            temperature: parseFloat(process.env.TEMPERATURE || '0.7')
        }
    );
}
```

---

## Configuration

### Environment Variables

```bash
# Chatbot mode
CHATBOT_ENABLED=true

# MLX API
MLX_API_URL=http://localhost:8000
MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit

# Access control (comma-separated phone numbers/emails)
ALLOWED_CONTACTS=+15551234567,friend@email.com

# Model parameters
SYSTEM_PROMPT="You are a helpful AI assistant responding via iMessage. Keep responses concise."
MAX_CONTEXT=10
MAX_TOKENS=512
TEMPERATURE=0.7

# Existing relay config (can disable remote server)
SERVER_URL=  # Leave empty to disable socket.io connection
```

---

## File Structure

```
relay/
├── src/
│   ├── chatbot/
│   │   ├── ChatbotHandler.ts    # New: Message handler
│   │   └── index.ts             # New: Chatbot entry point
│   ├── services/
│   │   ├── MessageSync.ts       # Existing: Polls chat.db
│   │   ├── MessageService.ts    # Existing: Sends messages
│   │   └── ConversationService.ts # Existing: Context lookup
│   └── ...
├── mlx_api/
│   ├── server.py                # New: FastAPI wrapper
│   ├── requirements.txt         # New: Python deps
│   └── run.sh                   # New: Startup script
└── ...
```

---

## Dependencies

### Python (mlx_api/requirements.txt)

```
mlx-lm>=0.19.0
fastapi>=0.109.0
uvicorn>=0.27.0
```

### Node.js (existing package.json - no changes needed)

The relay already has all required dependencies.

---

## Startup

### Option A: Two Processes

```bash
# Terminal 1: Start MLX API
cd relay/mlx_api
python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Terminal 2: Start Relay in Chatbot Mode
cd relay
CHATBOT_ENABLED=true npm run start
```

### Option B: PM2 Process Manager

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'mlx-api',
      script: 'uvicorn',
      args: 'server:app --host 0.0.0.0 --port 8000',
      cwd: './mlx_api',
      interpreter: 'python'
    },
    {
      name: 'imessage-chatbot',
      script: 'dist/chatbot/index.js',
      cwd: './relay',
      env: {
        CHATBOT_ENABLED: 'true',
        MLX_API_URL: 'http://localhost:8000'
      }
    }
  ]
};
```

---

## Recommended Model

| Model | VRAM | Speed | Notes |
|-------|------|-------|-------|
| `Llama-3.2-1B-Instruct-4bit` | ~2GB | Very Fast | Good for simple Q&A |
| **`Llama-3.2-3B-Instruct-4bit`** | ~4GB | Fast | **Recommended** |
| `Mistral-7B-Instruct-v0.3-4bit` | ~6GB | Moderate | Better quality |
| `Llama-3.1-8B-Instruct-4bit` | ~8GB | Slower | Best quality |

---

## Message Flow

```
1. User sends iMessage to Mac Mini's phone number/Apple ID
                    ↓
2. Messages.app receives → writes to chat.db
                    ↓
3. MessageSync detects change (2s poll / file watch)
                    ↓
4. Emits 'new_message' event
                    ↓
5. ChatbotHandler receives event
   - Check: is_from_me? → ignore (prevents loops)
   - Check: sender in whitelist? → ignore if not
                    ↓
6. Fetch last N messages from ConversationService
                    ↓
7. Build prompt: system + context + new message
                    ↓
8. POST to MLX API → generate response (~1-3 seconds)
                    ↓
9. MessageService.sendMessage(sender, response)
                    ↓
10. AppleScript sends via Messages.app
                    ↓
11. User receives AI response via iMessage
```

---

## Safety Features

1. **Whitelist-only**: Only responds to approved contacts
2. **Self-message ignore**: Prevents infinite loops
3. **Rate limiting**: MessageService already has circuit breaker
4. **Delivery verification**: Existing relay checks chat.db for delivery status
5. **Local-only inference**: No data leaves the Mac Mini

---

## Success Criteria

- [ ] MLX API responds to `/health` endpoint
- [ ] Whitelisted contact sends message → AI response within 5 seconds
- [ ] Non-whitelisted contacts are ignored (no response)
- [ ] Self-messages don't trigger responses
- [ ] Conversation context is included in prompts
- [ ] System runs continuously without manual intervention

---

## Future Enhancements

- Streaming responses (show typing indicator during generation)
- Multiple personality modes via system prompt switching
- Command recognition (`/reset` to clear context)
- Message reaction support
- Group chat handling

---

*Document Version: 1.0 | December 24, 2025*
