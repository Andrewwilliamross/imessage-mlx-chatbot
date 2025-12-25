# Developer Roadmap: iMessage MLX Chatbot

## Executive Summary

This roadmap outlines the complete implementation path for the iMessage MLX Chatbot—a locally-running AI assistant that responds to iMessages using Apple Silicon's MLX framework. The system integrates with the existing Rua relay infrastructure and runs entirely self-contained on a Mac Mini.

**Target Platform:** macOS (Mac Mini with Apple Silicon M1/M2/M3/M4)
**Timeline:** 7 Phases from foundation to live deployment
**Key Dependencies:** Existing Rua relay (`/Users/andrewross/Desktop/Rua-v3.1-AWR/relay`), MLX-LM framework

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Mac Mini (Self-Contained)                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   iMessage Layer (macOS Native)                  │   │
│  │  ┌─────────────────┐              ┌─────────────────────────┐   │   │
│  │  │  Messages.app   │◄────────────►│  ~/Library/Messages/    │   │   │
│  │  │  (AppleScript)  │              │      chat.db (SQLite)   │   │   │
│  │  └────────▲────────┘              └───────────┬─────────────┘   │   │
│  │           │                                   │                  │   │
│  └───────────┼───────────────────────────────────┼──────────────────┘   │
│              │ send                         poll │ (2s + fs.watch)      │
│              │                                   ▼                      │
│  ┌───────────┴───────────────────────────────────────────────────────┐  │
│  │                    TypeScript Relay Layer                         │  │
│  │  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────┐   │  │
│  │  │MessageService│  │ConversationService│  │   MessageSync    │   │  │
│  │  │(AppleScript  │  │ (context lookup)  │  │ (new_message     │   │  │
│  │  │ send + SMS   │  │                   │  │     events)      │   │  │
│  │  │  fallback)   │  │                   │  │                  │   │  │
│  │  └──────▲───────┘  └─────────┬─────────┘  └────────┬─────────┘   │  │
│  │         │                    │                     │              │  │
│  │         │          ┌─────────┴─────────────────────┘              │  │
│  │         │          │                                              │  │
│  │  ┌──────┴──────────▼──────────────────────────────────────────┐  │  │
│  │  │                 ChatbotHandler (NEW)                        │  │  │
│  │  │  • Listens for new_message events                          │  │  │
│  │  │  • Filters: is_from_me=false, sender in whitelist          │  │  │
│  │  │  • Fetches conversation context                            │  │  │
│  │  │  • Calls MLX API for inference                             │  │  │
│  │  │  • Sends response via MessageService                       │  │  │
│  │  └──────────────────────────┬─────────────────────────────────┘  │  │
│  └─────────────────────────────┼────────────────────────────────────┘  │
│                                │ HTTP POST /generate                    │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Python MLX API Layer (NEW)                      │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  FastAPI Server (http://localhost:8000)                     │  │  │
│  │  │                                                             │  │  │
│  │  │  POST /generate     ─────►  mlx_lm.generate()              │  │  │
│  │  │  GET  /health       ─────►  status + model info            │  │  │
│  │  │  POST /generate-stream ──►  mlx_lm.stream_generate()       │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                │                                  │  │
│  │  ┌────────────────────────────▼────────────────────────────────┐ │  │
│  │  │          Llama-3.2-3B-Instruct-4bit (Recommended)           │ │  │
│  │  │          • ~4GB Unified Memory                              │ │  │
│  │  │          • 20-40 tokens/sec on Apple Silicon                │ │  │
│  │  │          • Cached in ~/.cache/huggingface/                  │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Process Management (PM2/launchd)                │  │
│  │  • mlx-api: Python FastAPI server                                │  │
│  │  • imessage-chatbot: Node.js relay with ChatbotHandler           │  │
│  │  • Auto-restart on failure, startup on boot                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Environment Setup

**Objective:** Establish the development environment with all dependencies and verify Apple Silicon compatibility.

### 1.1 Prerequisites Verification

```bash
# Verify Apple Silicon
uname -m  # Should return: arm64

# Verify macOS version (14.0+ recommended for MLX)
sw_vers

# Verify Python 3.10+ (required for MLX)
python3 --version

# Verify Node.js 18+ (for relay)
node --version
npm --version
```

### 1.2 Project Structure Setup

```bash
# Create project directory (already exists)
cd /Users/andrewross/Desktop/Imessage_mlx

# Create directory structure
mkdir -p src/chatbot
mkdir -p mlx_api
mkdir -p scripts
mkdir -p config
mkdir -p logs
```

**Target Structure:**
```
Imessage_mlx/
├── PRD.md                      # Product requirements
├── DEVELOPER_ROADMAP.md        # This document
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript config
├── .env                        # Environment variables
├── .env.example                # Template for env vars
├── ecosystem.config.cjs        # PM2 configuration
├── src/
│   ├── relay.ts               # Main entry point (modified)
│   ├── chatbot/
│   │   ├── ChatbotHandler.ts  # Core chatbot logic
│   │   ├── MLXClient.ts       # HTTP client for MLX API
│   │   ├── types.ts           # TypeScript interfaces
│   │   └── index.ts           # Module exports
│   ├── services/              # Copied/linked from Rua relay
│   │   ├── MessageSync.ts
│   │   ├── MessageService.ts
│   │   └── ConversationService.ts
│   ├── handlers/
│   │   └── AppleScriptHandler.ts
│   ├── applescript/
│   │   └── imessage.applescript
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── mlx_api/
│   ├── server.py              # FastAPI server
│   ├── models.py              # Pydantic schemas
│   ├── config.py              # Python configuration
│   ├── requirements.txt       # Python dependencies
│   └── run.sh                 # Startup script
├── scripts/
│   ├── setup.sh               # One-time setup
│   ├── start-all.sh           # Start both services
│   └── test-connection.sh     # Connectivity tests
├── config/
│   └── constants.ts           # Application constants
└── logs/
    ├── mlx-api.log
    └── chatbot.log
```

### 1.3 Python Environment Setup

```bash
# Create Python virtual environment
cd /Users/andrewross/Desktop/Imessage_mlx
python3 -m venv venv
source venv/bin/activate

# Install MLX-LM and dependencies
pip install --upgrade pip
pip install mlx-lm>=0.19.0
pip install fastapi>=0.109.0
pip install uvicorn>=0.27.0
pip install pydantic>=2.0.0

# Verify MLX installation
python -c "import mlx; print(f'MLX version: {mlx.__version__}')"
python -c "from mlx_lm import load; print('MLX-LM imported successfully')"

# Save requirements
pip freeze > mlx_api/requirements.txt
```

### 1.4 Node.js Environment Setup

```bash
# Initialize Node.js project (or copy from Rua relay)
cd /Users/andrewross/Desktop/Imessage_mlx

# Copy base configuration from Rua relay
cp /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/package.json .
cp /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/tsconfig.json .

# Modify package.json name and remove unused dependencies
# Install dependencies
npm install
```

### 1.5 Copy Required Relay Components

```bash
# Copy essential services from Rua relay
cp -r /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/src/services ./src/
cp -r /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/src/handlers ./src/
cp -r /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/src/applescript ./src/
cp -r /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/src/types ./src/
cp -r /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/src/utils ./src/
cp /Users/andrewross/Desktop/Rua-v3.1-AWR/relay/config/constants.js ./config/
```

### 1.6 Verify macOS Permissions

```bash
# Grant Full Disk Access to Terminal/iTerm
# System Preferences → Privacy & Security → Full Disk Access → Add Terminal

# Test chat.db access
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message LIMIT 1;"

# Grant Accessibility permissions for AppleScript
# System Preferences → Privacy & Security → Accessibility → Add Terminal

# Test AppleScript access
osascript -e 'tell application "Messages" to get name'
```

### Phase 1 Deliverables

| Item | Verification |
|------|--------------|
| Python venv with MLX-LM | `python -c "from mlx_lm import load"` succeeds |
| Node.js with dependencies | `npm run build` succeeds |
| Relay services copied | All .ts files in src/services/ |
| chat.db accessible | SQLite query returns count |
| AppleScript accessible | Messages.app responds |

---

## Phase 2: MLX-LM Python API Development

**Objective:** Build a production-ready FastAPI server that wraps MLX-LM for text generation.

### 2.1 Create Configuration Module

**File: `mlx_api/config.py`**
```python
import os
from dataclasses import dataclass

@dataclass
class Config:
    """MLX API Configuration"""

    # Model settings
    model_id: str = os.getenv(
        "MLX_MODEL",
        "mlx-community/Llama-3.2-3B-Instruct-4bit"
    )

    # Server settings
    host: str = os.getenv("MLX_HOST", "0.0.0.0")
    port: int = int(os.getenv("MLX_PORT", "8000"))

    # Generation defaults
    default_max_tokens: int = int(os.getenv("MLX_MAX_TOKENS", "512"))
    default_temperature: float = float(os.getenv("MLX_TEMPERATURE", "0.7"))
    default_top_p: float = float(os.getenv("MLX_TOP_P", "0.9"))

    # Safety limits
    max_input_tokens: int = int(os.getenv("MLX_MAX_INPUT_TOKENS", "2048"))
    max_output_tokens: int = int(os.getenv("MLX_MAX_OUTPUT_TOKENS", "1024"))
    request_timeout: int = int(os.getenv("MLX_REQUEST_TIMEOUT", "60"))

config = Config()
```

### 2.2 Create Pydantic Models

**File: `mlx_api/models.py`**
```python
from pydantic import BaseModel, Field
from typing import Optional

class Message(BaseModel):
    """Single message in conversation"""
    role: str = Field(..., description="Role: 'system', 'user', or 'assistant'")
    content: str = Field(..., description="Message content")

class GenerateRequest(BaseModel):
    """Request body for /generate endpoint"""
    messages: list[Message] = Field(..., description="Conversation messages")
    max_tokens: int = Field(default=512, ge=1, le=2048)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Hello, how are you?"}
                ],
                "max_tokens": 256,
                "temperature": 0.7
            }]
        }
    }

class GenerateResponse(BaseModel):
    """Response body for /generate endpoint"""
    response: str = Field(..., description="Generated text")
    tokens_generated: int = Field(..., description="Number of tokens generated")
    generation_time_ms: int = Field(..., description="Generation time in milliseconds")
    model: str = Field(..., description="Model used for generation")

class HealthResponse(BaseModel):
    """Response body for /health endpoint"""
    status: str
    model: str
    model_loaded: bool
    uptime_seconds: float

class ErrorResponse(BaseModel):
    """Error response body"""
    error: str
    detail: Optional[str] = None
```

### 2.3 Create FastAPI Server

**File: `mlx_api/server.py`**
```python
"""
MLX-LM FastAPI Server for iMessage Chatbot
Provides local LLM inference on Apple Silicon via MLX
"""

import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from mlx_lm import load, generate

from models import (
    GenerateRequest,
    GenerateResponse,
    HealthResponse,
    ErrorResponse
)
from config import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("mlx-api")

# Global state
class ModelState:
    model = None
    tokenizer = None
    model_id: str = ""
    load_time: float = 0
    start_time: float = 0
    request_count: int = 0
    total_tokens_generated: int = 0

state = ModelState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown"""
    logger.info(f"Loading model: {config.model_id}")
    load_start = time.time()

    try:
        state.model, state.tokenizer = load(config.model_id)
        state.model_id = config.model_id
        state.load_time = time.time() - load_start
        state.start_time = time.time()
        logger.info(f"Model loaded in {state.load_time:.2f}s")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Model loading failed: {e}")

    yield

    # Cleanup
    logger.info("Shutting down MLX API")
    state.model = None
    state.tokenizer = None

# Create FastAPI app
app = FastAPI(
    title="iMessage MLX API",
    description="Local LLM inference for iMessage chatbot using MLX",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all uncaught exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for monitoring"""
    return HealthResponse(
        status="healthy" if state.model is not None else "unhealthy",
        model=state.model_id,
        model_loaded=state.model is not None,
        uptime_seconds=time.time() - state.start_time if state.start_time else 0
    )

@app.get("/stats")
async def get_stats():
    """Get server statistics"""
    return {
        "model": state.model_id,
        "model_load_time_seconds": state.load_time,
        "uptime_seconds": time.time() - state.start_time,
        "total_requests": state.request_count,
        "total_tokens_generated": state.total_tokens_generated
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate_response(request: GenerateRequest):
    """
    Generate a response from the LLM.

    Accepts a list of messages in OpenAI chat format and returns
    the model's response with generation metadata.
    """
    if state.model is None or state.tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Server is starting up."
        )

    start_time = time.time()
    state.request_count += 1

    try:
        # Convert messages to dict format for tokenizer
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        # Apply chat template
        prompt = state.tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False
        )

        # Check input length
        input_tokens = len(state.tokenizer.encode(prompt))
        if input_tokens > config.max_input_tokens:
            raise HTTPException(
                status_code=400,
                detail=f"Input too long: {input_tokens} tokens (max: {config.max_input_tokens})"
            )

        logger.info(f"Generating response (input: {input_tokens} tokens, max_output: {request.max_tokens})")

        # Generate response
        response_text = generate(
            state.model,
            state.tokenizer,
            prompt=prompt,
            max_tokens=min(request.max_tokens, config.max_output_tokens),
            temp=request.temperature,
            top_p=request.top_p
        )

        # Calculate metrics
        elapsed_ms = int((time.time() - start_time) * 1000)
        tokens_generated = len(state.tokenizer.encode(response_text))
        state.total_tokens_generated += tokens_generated

        logger.info(f"Generated {tokens_generated} tokens in {elapsed_ms}ms")

        return GenerateResponse(
            response=response_text,
            tokens_generated=tokens_generated,
            generation_time_ms=elapsed_ms,
            model=state.model_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=config.host,
        port=config.port,
        log_level="info"
    )
```

### 2.4 Create Startup Script

**File: `mlx_api/run.sh`**
```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment
source ../venv/bin/activate

# Set environment variables (can be overridden)
export MLX_MODEL="${MLX_MODEL:-mlx-community/Llama-3.2-3B-Instruct-4bit}"
export MLX_HOST="${MLX_HOST:-0.0.0.0}"
export MLX_PORT="${MLX_PORT:-8000}"

echo "Starting MLX API Server..."
echo "Model: $MLX_MODEL"
echo "Endpoint: http://$MLX_HOST:$MLX_PORT"

# Start server
python -m uvicorn server:app \
    --host "$MLX_HOST" \
    --port "$MLX_PORT" \
    --log-level info
```

```bash
chmod +x mlx_api/run.sh
```

### 2.5 Create Requirements File

**File: `mlx_api/requirements.txt`**
```
mlx-lm>=0.19.0
fastapi>=0.109.0
uvicorn>=0.27.0
pydantic>=2.0.0
```

### 2.6 Test MLX API

```bash
# Terminal 1: Start the API
cd /Users/andrewross/Desktop/Imessage_mlx
source venv/bin/activate
cd mlx_api
python server.py

# Terminal 2: Test endpoints
# Health check
curl http://localhost:8000/health

# Generate response
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Say hello in exactly 5 words."}
    ],
    "max_tokens": 50,
    "temperature": 0.7
  }'
```

### Phase 2 Deliverables

| Item | Verification |
|------|--------------|
| FastAPI server runs | `curl localhost:8000/health` returns healthy |
| Model loads successfully | Server log shows model load time |
| /generate endpoint works | Test curl returns response |
| Input validation works | Large input returns 400 error |
| Error handling works | Invalid request returns proper error |

---

## Phase 3: ChatbotHandler Development (TypeScript)

**Objective:** Create the TypeScript module that bridges MessageSync events to the MLX API.

### 3.1 Create Type Definitions

**File: `src/chatbot/types.ts`**
```typescript
/**
 * Chatbot type definitions
 */

export interface ChatbotConfig {
  /** URL of the MLX API server */
  mlxApiUrl: string;

  /** List of allowed phone numbers/emails that can trigger responses */
  allowedContacts: string[];

  /** System prompt for the AI */
  systemPrompt: string;

  /** Maximum number of previous messages to include as context */
  maxContextMessages: number;

  /** Maximum tokens for generation */
  maxTokens: number;

  /** Temperature for generation (0.0-2.0) */
  temperature: number;

  /** Whether to enable the chatbot */
  enabled: boolean;

  /** Timeout for MLX API requests in ms */
  requestTimeout: number;

  /** Cooldown between responses to same contact in ms */
  responseCooldown: number;
}

export interface MLXMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MLXGenerateRequest {
  messages: MLXMessage[];
  max_tokens: number;
  temperature: number;
}

export interface MLXGenerateResponse {
  response: string;
  tokens_generated: number;
  generation_time_ms: number;
  model: string;
}

export interface MLXHealthResponse {
  status: string;
  model: string;
  model_loaded: boolean;
  uptime_seconds: number;
}

export interface ChatbotStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesIgnored: number;
  responsesSent: number;
  errors: number;
  averageResponseTimeMs: number;
  lastActivityTimestamp: string | null;
}
```

### 3.2 Create MLX API Client

**File: `src/chatbot/MLXClient.ts`**
```typescript
/**
 * HTTP client for MLX-LM API
 */

import logger from '../utils/logger.js';
import {
  MLXGenerateRequest,
  MLXGenerateResponse,
  MLXHealthResponse,
} from './types.js';

export class MLXClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 60000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Check if the MLX API is healthy
   */
  async healthCheck(): Promise<MLXHealthResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json() as MLXHealthResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Health check timed out');
      }
      throw error;
    }
  }

  /**
   * Generate a response from the LLM
   */
  async generate(request: MLXGenerateRequest): Promise<MLXGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.debug('Sending generate request to MLX API', {
        messageCount: request.messages.length,
        maxTokens: request.max_tokens,
      });

      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`MLX API error ${response.status}: ${errorBody}`);
      }

      const result = await response.json() as MLXGenerateResponse;

      logger.debug('Received response from MLX API', {
        tokensGenerated: result.tokens_generated,
        generationTimeMs: result.generation_time_ms,
      });

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MLX API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Test connection to MLX API
   */
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy' && health.model_loaded;
    } catch (error) {
      logger.error('MLX API connection test failed', { error });
      return false;
    }
  }
}

export default MLXClient;
```

### 3.3 Create ChatbotHandler

**File: `src/chatbot/ChatbotHandler.ts`**
```typescript
/**
 * ChatbotHandler - Core chatbot logic
 *
 * Listens for new iMessage events, filters based on whitelist,
 * builds context, calls MLX API, and sends responses.
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import MLXClient from './MLXClient.js';
import { ChatbotConfig, MLXMessage, ChatbotStats } from './types.js';

// Import types from relay services
interface ProcessedMessage {
  guid: string;
  text: string | null;
  handle: string | null;
  chat: string;
  is_from_me: boolean;
  date: number;
  timestamp: string;
  attachments?: unknown[];
}

interface FormattedMessage {
  text: string | null;
  isFromMe: boolean;
  timestamp: Date;
}

interface MessageSyncInterface extends EventEmitter {
  on(event: 'new_message', listener: (message: ProcessedMessage) => void): this;
}

interface ConversationServiceInterface {
  getMessages(chatIdentifier: string, limit: number): FormattedMessage[];
}

interface MessageServiceInterface {
  sendMessage(recipient: string, text: string): Promise<{ success: boolean; error?: string }>;
}

export class ChatbotHandler {
  private mlxClient: MLXClient;
  private messageSync: MessageSyncInterface;
  private messageService: MessageServiceInterface;
  private conversationService: ConversationServiceInterface;
  private config: ChatbotConfig;
  private stats: ChatbotStats;
  private lastResponseTime: Map<string, number> = new Map();
  private processingQueue: Set<string> = new Set();

  constructor(
    messageSync: MessageSyncInterface,
    messageService: MessageServiceInterface,
    conversationService: ConversationServiceInterface,
    config: ChatbotConfig
  ) {
    this.messageSync = messageSync;
    this.messageService = messageService;
    this.conversationService = conversationService;
    this.config = config;

    this.mlxClient = new MLXClient(config.mlxApiUrl, config.requestTimeout);

    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesIgnored: 0,
      responsesSent: 0,
      errors: 0,
      averageResponseTimeMs: 0,
      lastActivityTimestamp: null,
    };

    if (config.enabled) {
      this.setupListeners();
      logger.info('ChatbotHandler initialized', {
        mlxApiUrl: config.mlxApiUrl,
        allowedContacts: config.allowedContacts.length,
        maxContextMessages: config.maxContextMessages,
      });
    } else {
      logger.info('ChatbotHandler disabled by configuration');
    }
  }

  /**
   * Set up event listeners for new messages
   */
  private setupListeners(): void {
    this.messageSync.on('new_message', (message: ProcessedMessage) => {
      this.handleMessage(message).catch((error) => {
        logger.error('Error in message handler', { error, messageGuid: message.guid });
        this.stats.errors++;
      });
    });

    logger.info('ChatbotHandler listening for new_message events');
  }

  /**
   * Main message handler
   */
  private async handleMessage(message: ProcessedMessage): Promise<void> {
    this.stats.messagesReceived++;
    this.stats.lastActivityTimestamp = new Date().toISOString();

    // Ignore our own messages (prevent loops)
    if (message.is_from_me) {
      logger.debug('Ignoring own message', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Get sender identifier
    const sender = message.handle || message.chat;
    if (!sender) {
      logger.warn('Message has no sender identifier', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Check whitelist
    if (!this.isAllowedContact(sender)) {
      logger.debug('Ignoring message from non-whitelisted contact', { sender });
      this.stats.messagesIgnored++;
      return;
    }

    // Check cooldown
    if (this.isInCooldown(sender)) {
      logger.debug('Ignoring message during cooldown period', { sender });
      this.stats.messagesIgnored++;
      return;
    }

    // Prevent duplicate processing
    if (this.processingQueue.has(message.guid)) {
      logger.debug('Message already being processed', { guid: message.guid });
      return;
    }

    // Skip empty messages
    if (!message.text?.trim()) {
      logger.debug('Ignoring empty message', { guid: message.guid });
      this.stats.messagesIgnored++;
      return;
    }

    // Process the message
    this.processingQueue.add(message.guid);
    const startTime = Date.now();

    try {
      logger.info('Processing message from whitelisted contact', {
        sender,
        textPreview: message.text.substring(0, 50),
        guid: message.guid,
      });

      // Build context from conversation history
      const context = this.buildContext(message.chat);

      // Add the new message
      const messages: MLXMessage[] = [
        ...context,
        { role: 'user', content: message.text },
      ];

      // Call MLX API
      const response = await this.mlxClient.generate({
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      // Send response
      const result = await this.messageService.sendMessage(sender, response.response);

      if (result.success) {
        const elapsed = Date.now() - startTime;
        this.stats.responsesSent++;
        this.stats.messagesProcessed++;
        this.updateAverageResponseTime(elapsed);
        this.lastResponseTime.set(sender, Date.now());

        logger.info('Successfully sent chatbot response', {
          sender,
          responseLength: response.response.length,
          tokensGenerated: response.tokens_generated,
          generationTimeMs: response.generation_time_ms,
          totalTimeMs: elapsed,
        });
      } else {
        logger.error('Failed to send response', { sender, error: result.error });
        this.stats.errors++;
      }
    } catch (error) {
      logger.error('Failed to process message', { error, sender, guid: message.guid });
      this.stats.errors++;
    } finally {
      this.processingQueue.delete(message.guid);
    }
  }

  /**
   * Check if sender is in the allowed contacts list
   */
  private isAllowedContact(sender: string): boolean {
    const normalizedSender = this.normalizeContact(sender);

    return this.config.allowedContacts.some((allowed) => {
      const normalizedAllowed = this.normalizeContact(allowed);
      return (
        normalizedSender.includes(normalizedAllowed) ||
        normalizedAllowed.includes(normalizedSender)
      );
    });
  }

  /**
   * Normalize contact identifier for comparison
   */
  private normalizeContact(contact: string): string {
    // Remove all non-alphanumeric characters and lowercase
    return contact.replace(/[^a-zA-Z0-9@.]/g, '').toLowerCase();
  }

  /**
   * Check if sender is in cooldown period
   */
  private isInCooldown(sender: string): boolean {
    const lastResponse = this.lastResponseTime.get(sender);
    if (!lastResponse) return false;

    return Date.now() - lastResponse < this.config.responseCooldown;
  }

  /**
   * Build conversation context from history
   */
  private buildContext(chatIdentifier: string): MLXMessage[] {
    const messages: MLXMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
    ];

    try {
      const history = this.conversationService.getMessages(
        chatIdentifier,
        this.config.maxContextMessages
      );

      // Convert history to MLX message format (oldest first)
      const contextMessages = history
        .slice()
        .reverse()
        .slice(0, this.config.maxContextMessages - 1) // Leave room for new message
        .map((msg): MLXMessage => ({
          role: msg.isFromMe ? 'assistant' : 'user',
          content: msg.text || '',
        }))
        .filter((msg) => msg.content.trim().length > 0);

      messages.push(...contextMessages);
    } catch (error) {
      logger.warn('Failed to fetch conversation context', { error, chatIdentifier });
    }

    return messages;
  }

  /**
   * Update running average response time
   */
  private updateAverageResponseTime(newTime: number): void {
    const totalResponses = this.stats.responsesSent;
    const currentAvg = this.stats.averageResponseTimeMs;

    this.stats.averageResponseTimeMs = Math.round(
      (currentAvg * (totalResponses - 1) + newTime) / totalResponses
    );
  }

  /**
   * Get current stats
   */
  getStats(): ChatbotStats {
    return { ...this.stats };
  }

  /**
   * Check if MLX API is healthy
   */
  async checkHealth(): Promise<boolean> {
    return this.mlxClient.testConnection();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<ChatbotConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.mlxApiUrl) {
      this.mlxClient = new MLXClient(
        newConfig.mlxApiUrl,
        newConfig.requestTimeout || this.config.requestTimeout
      );
    }

    logger.info('ChatbotHandler configuration updated', newConfig);
  }
}

export default ChatbotHandler;
```

### 3.4 Create Module Index

**File: `src/chatbot/index.ts`**
```typescript
/**
 * Chatbot module exports
 */

export { ChatbotHandler } from './ChatbotHandler.js';
export { MLXClient } from './MLXClient.js';
export * from './types.js';
```

### Phase 3 Deliverables

| Item | Verification |
|------|--------------|
| ChatbotHandler.ts compiles | `npm run build` succeeds |
| MLXClient connects to API | Health check returns true |
| Types properly defined | No TypeScript errors |
| Event listener works | Logs show "listening for new_message" |

---

## Phase 4: Integration & Testing

**Objective:** Connect all components and verify end-to-end message flow.

### 4.1 Create Entry Point

**File: `src/chatbot-main.ts`**
```typescript
/**
 * Chatbot Main Entry Point
 *
 * Standalone chatbot mode that uses existing relay services
 * without connecting to a remote backend server.
 */

import 'dotenv/config';
import logger from './utils/logger.js';
import { ChatbotHandler, ChatbotConfig } from './chatbot/index.js';

// Import existing relay services
import MessageSync from './services/MessageSync.js';
import MessageService from './services/MessageService.js';
import ConversationService from './services/ConversationService.js';

// Configuration from environment
const config: ChatbotConfig = {
  enabled: process.env.CHATBOT_ENABLED === 'true',
  mlxApiUrl: process.env.MLX_API_URL || 'http://localhost:8000',
  allowedContacts: (process.env.ALLOWED_CONTACTS || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0),
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    'You are a helpful AI assistant responding via iMessage. Keep responses concise and conversational.',
  maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10', 10),
  maxTokens: parseInt(process.env.MAX_TOKENS || '512', 10),
  temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
  requestTimeout: parseInt(process.env.MLX_REQUEST_TIMEOUT || '60000', 10),
  responseCooldown: parseInt(process.env.RESPONSE_COOLDOWN || '2000', 10),
};

async function main(): Promise<void> {
  logger.info('Starting iMessage MLX Chatbot');
  logger.info('Configuration', {
    enabled: config.enabled,
    mlxApiUrl: config.mlxApiUrl,
    allowedContacts: config.allowedContacts,
    maxContextMessages: config.maxContextMessages,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  if (!config.enabled) {
    logger.error('Chatbot is disabled. Set CHATBOT_ENABLED=true to enable.');
    process.exit(1);
  }

  if (config.allowedContacts.length === 0) {
    logger.error('No allowed contacts configured. Set ALLOWED_CONTACTS env var.');
    process.exit(1);
  }

  try {
    // Initialize ConversationService (connects to chat.db)
    logger.info('Initializing ConversationService...');
    const conversationService = new ConversationService();

    // Initialize MessageService (AppleScript handler)
    logger.info('Initializing MessageService...');
    const messageService = new MessageService();

    // Test AppleScript access
    logger.info('Testing Messages.app access...');
    const accessTest = await messageService.testAccess();
    if (!accessTest.success) {
      logger.error('Messages.app access test failed', { error: accessTest.error });
      process.exit(1);
    }
    logger.info('Messages.app access verified');

    // Initialize MessageSync (polls chat.db for new messages)
    logger.info('Initializing MessageSync...');
    const messageSync = new MessageSync(conversationService);

    // Test MLX API connection
    logger.info('Testing MLX API connection...');
    const testResponse = await fetch(`${config.mlxApiUrl}/health`);
    if (!testResponse.ok) {
      logger.error('MLX API health check failed', { status: testResponse.status });
      process.exit(1);
    }
    const healthData = await testResponse.json();
    logger.info('MLX API connected', healthData);

    // Initialize ChatbotHandler
    logger.info('Initializing ChatbotHandler...');
    const chatbot = new ChatbotHandler(
      messageSync,
      messageService,
      conversationService,
      config
    );

    // Start MessageSync polling
    logger.info('Starting message polling...');
    messageSync.start();

    // Log stats periodically
    setInterval(() => {
      const stats = chatbot.getStats();
      if (stats.messagesReceived > 0) {
        logger.info('Chatbot stats', stats);
      }
    }, 60000);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down chatbot...');
      messageSync.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('iMessage MLX Chatbot is running');
    logger.info(`Monitoring ${config.allowedContacts.length} allowed contacts`);

  } catch (error) {
    logger.error('Failed to start chatbot', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});
```

### 4.2 Create Environment Template

**File: `.env.example`**
```bash
# =============================================================================
# iMessage MLX Chatbot Configuration
# =============================================================================

# Chatbot Settings
CHATBOT_ENABLED=true

# MLX API Settings
MLX_API_URL=http://localhost:8000
MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit

# Access Control (comma-separated phone numbers and/or email addresses)
# Examples: +15551234567, friend@email.com, +1 (555) 987-6543
ALLOWED_CONTACTS=+15551234567,friend@email.com

# AI Behavior
SYSTEM_PROMPT="You are a helpful AI assistant responding via iMessage. Be concise, friendly, and helpful. Limit responses to 2-3 sentences unless more detail is needed."
MAX_CONTEXT_MESSAGES=10
MAX_TOKENS=512
TEMPERATURE=0.7

# Timeouts and Limits
MLX_REQUEST_TIMEOUT=60000
RESPONSE_COOLDOWN=2000

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### 4.3 Update package.json Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/chatbot-main.js",
    "dev": "ts-node src/chatbot-main.ts",
    "watch": "tsc --watch",
    "test:mlx": "curl -s http://localhost:8000/health | jq",
    "test:send": "node scripts/test-send.js"
  }
}
```

### 4.4 End-to-End Testing Script

**File: `scripts/test-e2e.sh`**
```bash
#!/bin/bash
# End-to-end test script for iMessage MLX Chatbot

set -e

echo "=========================================="
echo "  iMessage MLX Chatbot E2E Test Suite"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: MLX API Health
echo "Test 1: MLX API Health Check"
HEALTH=$(curl -s http://localhost:8000/health)
if echo "$HEALTH" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✓ MLX API is healthy${NC}"
    echo "  Model: $(echo $HEALTH | jq -r '.model')"
else
    echo -e "${RED}✗ MLX API health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: MLX API Generate
echo "Test 2: MLX API Generate"
RESPONSE=$(curl -s -X POST http://localhost:8000/generate \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Say hello in 5 words."}
        ],
        "max_tokens": 50,
        "temperature": 0.7
    }')
if echo "$RESPONSE" | grep -q '"response"'; then
    echo -e "${GREEN}✓ MLX API generation works${NC}"
    echo "  Response: $(echo $RESPONSE | jq -r '.response' | head -c 50)..."
    echo "  Tokens: $(echo $RESPONSE | jq -r '.tokens_generated')"
    echo "  Time: $(echo $RESPONSE | jq -r '.generation_time_ms')ms"
else
    echo -e "${RED}✗ MLX API generation failed${NC}"
    echo "$RESPONSE"
    exit 1
fi
echo ""

# Test 3: Chat.db Access
echo "Test 3: Chat.db Access"
COUNT=$(sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message LIMIT 1;" 2>/dev/null)
if [ -n "$COUNT" ]; then
    echo -e "${GREEN}✓ Chat.db accessible${NC}"
    echo "  Total messages in database: $COUNT"
else
    echo -e "${RED}✗ Chat.db not accessible${NC}"
    echo "  Grant Full Disk Access to Terminal"
    exit 1
fi
echo ""

# Test 4: AppleScript Access
echo "Test 4: AppleScript Access"
MESSAGES_NAME=$(osascript -e 'tell application "Messages" to get name' 2>/dev/null)
if [ "$MESSAGES_NAME" = "Messages" ]; then
    echo -e "${GREEN}✓ AppleScript can access Messages.app${NC}"
else
    echo -e "${RED}✗ AppleScript cannot access Messages.app${NC}"
    echo "  Grant Accessibility permissions to Terminal"
    exit 1
fi
echo ""

# Test 5: Environment Variables
echo "Test 5: Environment Variables"
if [ -f .env ]; then
    source .env
    if [ "$CHATBOT_ENABLED" = "true" ] && [ -n "$ALLOWED_CONTACTS" ]; then
        echo -e "${GREEN}✓ Environment configured${NC}"
        echo "  Allowed contacts: $ALLOWED_CONTACTS"
    else
        echo -e "${RED}✗ Environment not properly configured${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    exit 1
fi
echo ""

echo "=========================================="
echo -e "${GREEN}  All tests passed!${NC}"
echo "=========================================="
echo ""
echo "Ready to start the chatbot with: npm start"
```

```bash
chmod +x scripts/test-e2e.sh
```

### Phase 4 Deliverables

| Item | Verification |
|------|--------------|
| chatbot-main.ts runs | `npm start` shows "Chatbot is running" |
| MLX API connected | Logs show "MLX API connected" |
| chat.db polling active | Logs show "Starting message polling" |
| E2E tests pass | `./scripts/test-e2e.sh` returns success |

---

## Phase 5: Configuration & Security

**Objective:** Implement production-ready configuration, security measures, and monitoring.

### 5.1 Enhanced Logging Configuration

**File: `src/utils/logger.ts`** (update or create)
```typescript
import winston from 'winston';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Sanitize sensitive data from logs
const sanitize = winston.format((info) => {
  const sanitized = { ...info };

  // Redact phone numbers (keep last 4 digits)
  if (typeof sanitized.message === 'string') {
    sanitized.message = sanitized.message.replace(
      /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      '***-***-$4'
    );
  }

  // Redact API keys/tokens
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === 'string') {
      if (key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret')) {
        sanitized[key] = '***REDACTED***';
      }
    }
  }

  return sanitized;
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    sanitize(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'imessage-chatbot' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // File output (errors only)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // File output (all logs)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }),
  ],
});

export default logger;
```

### 5.2 Input Validation

**File: `src/utils/InputValidator.ts`**
```typescript
/**
 * Input validation utilities for security
 */

export class InputValidator {
  // Maximum message length to process
  static readonly MAX_MESSAGE_LENGTH = 4096;

  // Maximum tokens to request
  static readonly MAX_TOKENS = 2048;

  // Phone number regex
  static readonly PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

  // Email regex
  static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Validate and sanitize user message
   */
  static sanitizeMessage(text: string | null): string {
    if (!text) return '';

    // Truncate if too long
    let sanitized = text.slice(0, this.MAX_MESSAGE_LENGTH);

    // Remove control characters except newlines/tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized.trim();
  }

  /**
   * Validate contact identifier
   */
  static isValidContact(contact: string): boolean {
    const cleaned = contact.replace(/[\s\-().]/g, '');
    return this.PHONE_REGEX.test(cleaned) || this.EMAIL_REGEX.test(contact);
  }

  /**
   * Validate generation parameters
   */
  static validateGenerationParams(params: {
    maxTokens?: number;
    temperature?: number;
  }): { maxTokens: number; temperature: number } {
    return {
      maxTokens: Math.min(
        Math.max(params.maxTokens || 512, 1),
        this.MAX_TOKENS
      ),
      temperature: Math.min(Math.max(params.temperature || 0.7, 0), 2),
    };
  }
}

export default InputValidator;
```

### 5.3 Rate Limiting

**File: `src/utils/RateLimiter.ts`**
```typescript
/**
 * Simple in-memory rate limiter for chatbot responses
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  /**
   * Check if request should be rate limited
   * Returns true if allowed, false if rate limited
   */
  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now >= entry.resetTime) {
      // Create new window
      this.limits.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for identifier
   */
  getRemaining(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry || Date.now() >= entry.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }
}

export default RateLimiter;
```

### 5.4 Health Monitoring

**File: `src/utils/HealthMonitor.ts`**
```typescript
/**
 * Health monitoring for chatbot services
 */

import logger from './logger.js';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  details?: Record<string, unknown>;
}

export class HealthMonitor {
  private services: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timer | null = null;
  private checks: Map<string, () => Promise<boolean>> = new Map();

  /**
   * Register a health check function for a service
   */
  registerCheck(serviceName: string, checkFn: () => Promise<boolean>): void {
    this.checks.set(serviceName, checkFn);
    this.services.set(serviceName, {
      name: serviceName,
      status: 'healthy',
      lastCheck: new Date(),
    });
  }

  /**
   * Start periodic health checks
   */
  start(intervalMs: number = 30000): void {
    this.checkInterval = setInterval(() => this.runChecks(), intervalMs);
    this.runChecks(); // Run immediately
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<void> {
    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const healthy = await checkFn();
        this.services.set(name, {
          name,
          status: healthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
        });
      } catch (error) {
        logger.error(`Health check failed for ${name}`, { error });
        this.services.set(name, {
          name,
          status: 'unhealthy',
          lastCheck: new Date(),
          details: { error: String(error) },
        });
      }
    }
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): {
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: ServiceHealth[];
  } {
    const services = Array.from(this.services.values());
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;

    let status: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyCount === 0) {
      status = 'healthy';
    } else if (unhealthyCount === services.length) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return { status, services };
  }
}

export default HealthMonitor;
```

### Phase 5 Deliverables

| Item | Verification |
|------|--------------|
| Logs sanitize phone numbers | Logs show `***-***-XXXX` |
| Rate limiting works | Rapid messages get blocked |
| Health monitoring active | Periodic health logs appear |
| Input validation | Long messages get truncated |

---

## Phase 6: Process Management & Automation

**Objective:** Configure PM2 for process management with auto-restart and startup on boot.

### 6.1 PM2 Configuration

**File: `ecosystem.config.cjs`**
```javascript
/**
 * PM2 Ecosystem Configuration
 *
 * Manages both the Python MLX API and Node.js Chatbot processes.
 */

const path = require('path');

module.exports = {
  apps: [
    // MLX-LM Python API
    {
      name: 'mlx-api',
      script: 'venv/bin/python',
      args: '-m uvicorn server:app --host 0.0.0.0 --port 8000',
      cwd: path.join(__dirname, 'mlx_api'),
      interpreter: 'none', // Use script directly
      env: {
        MLX_MODEL: 'mlx-community/Llama-3.2-3B-Instruct-4bit',
        MLX_HOST: '0.0.0.0',
        MLX_PORT: '8000',
      },
      // Restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 5000,
      // Logging
      error_file: path.join(__dirname, 'logs', 'mlx-api-error.log'),
      out_file: path.join(__dirname, 'logs', 'mlx-api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Memory management
      max_memory_restart: '8G',
      // Health check
      watch: false,
    },

    // iMessage Chatbot (Node.js)
    {
      name: 'imessage-chatbot',
      script: 'dist/chatbot-main.js',
      cwd: __dirname,
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node',
      // Environment
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        CHATBOT_ENABLED: 'true',
      },
      // Wait for MLX API to start
      wait_ready: true,
      listen_timeout: 30000,
      // Restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // Logging
      error_file: path.join(__dirname, 'logs', 'chatbot-error.log'),
      out_file: path.join(__dirname, 'logs', 'chatbot-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Memory management
      max_memory_restart: '500M',
      // Dependencies
      depends_on: ['mlx-api'],
    },
  ],
};
```

### 6.2 Startup Scripts

**File: `scripts/start-all.sh`**
```bash
#!/bin/bash
# Start all iMessage MLX Chatbot services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================"
echo "  iMessage MLX Chatbot - Starting"
echo "========================================"

# Check prerequisites
echo "Checking prerequisites..."

# Check Python venv
if [ ! -f "venv/bin/python" ]; then
    echo "ERROR: Python venv not found. Run setup.sh first."
    exit 1
fi

# Check Node.js build
if [ ! -f "dist/chatbot-main.js" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Check .env
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found. Copy .env.example and configure."
    exit 1
fi

# Check logs directory
mkdir -p logs

# Start with PM2
echo "Starting services with PM2..."
pm2 start ecosystem.config.cjs

echo ""
echo "========================================"
echo "  Services Started Successfully"
echo "========================================"
echo ""
echo "Commands:"
echo "  pm2 status          - View process status"
echo "  pm2 logs            - View logs"
echo "  pm2 logs mlx-api    - View MLX API logs"
echo "  pm2 logs imessage-chatbot - View chatbot logs"
echo "  pm2 restart all     - Restart all services"
echo "  pm2 stop all        - Stop all services"
echo ""
pm2 status
```

**File: `scripts/stop-all.sh`**
```bash
#!/bin/bash
# Stop all iMessage MLX Chatbot services

echo "Stopping all services..."
pm2 stop all
pm2 status
echo "Done."
```

**File: `scripts/setup-startup.sh`**
```bash
#!/bin/bash
# Configure PM2 to start on system boot

set -e

echo "Configuring PM2 startup..."

# Generate startup script
pm2 startup

echo ""
echo "Follow the instructions above to run the generated command."
echo ""
echo "After running the startup command, save current processes:"
echo "  pm2 save"
echo ""
echo "The chatbot will now start automatically on system boot."
```

```bash
chmod +x scripts/*.sh
```

### 6.3 Install PM2 Globally

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

### 6.4 Startup on Boot (launchd Alternative)

For those preferring launchd over PM2:

**File: `~/Library/LaunchAgents/com.imessage.mlx-chatbot.plist`**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.imessage.mlx-chatbot</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/andrewross/Desktop/Imessage_mlx/scripts/start-all.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/andrewross/Desktop/Imessage_mlx</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/andrewross/Desktop/Imessage_mlx/logs/launchd-out.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/andrewross/Desktop/Imessage_mlx/logs/launchd-error.log</string>
</dict>
</plist>
```

```bash
# Load the launchd agent
launchctl load ~/Library/LaunchAgents/com.imessage.mlx-chatbot.plist

# Check status
launchctl list | grep imessage
```

### Phase 6 Deliverables

| Item | Verification |
|------|--------------|
| PM2 installed globally | `pm2 --version` returns version |
| ecosystem.config.cjs works | `pm2 start ecosystem.config.cjs` succeeds |
| Services auto-restart | Kill process, verify it restarts |
| Startup on boot configured | Reboot Mac, verify services start |
| Logs rotating | Log files stay under max size |

---

## Phase 7: Live Deployment & Monitoring

**Objective:** Final deployment, production hardening, and ongoing monitoring setup.

### 7.1 Pre-Deployment Checklist

```bash
#!/bin/bash
# Pre-deployment verification checklist

echo "=========================================="
echo "  Pre-Deployment Checklist"
echo "=========================================="

PASS=0
FAIL=0

check() {
    if eval "$2" > /dev/null 2>&1; then
        echo "✓ $1"
        ((PASS++))
    else
        echo "✗ $1"
        ((FAIL++))
    fi
}

# System checks
check "macOS version 14.0+" "[ $(sw_vers -productVersion | cut -d. -f1) -ge 14 ]"
check "Apple Silicon" "[ $(uname -m) = 'arm64' ]"
check "Full Disk Access" "sqlite3 ~/Library/Messages/chat.db 'SELECT 1' 2>/dev/null"
check "AppleScript access" "osascript -e 'tell app \"Messages\" to get name' 2>/dev/null"

# Environment checks
check "Python venv exists" "[ -f venv/bin/python ]"
check "MLX-LM installed" "venv/bin/python -c 'from mlx_lm import load' 2>/dev/null"
check "Node.js dist built" "[ -f dist/chatbot-main.js ]"
check ".env configured" "[ -f .env ]"
check "ALLOWED_CONTACTS set" "grep -q 'ALLOWED_CONTACTS=.' .env 2>/dev/null"

# Service checks
check "MLX API responds" "curl -s localhost:8000/health | grep -q healthy"
check "PM2 installed" "which pm2"

# Log directory
check "Logs directory exists" "[ -d logs ]"

echo ""
echo "=========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
    echo "Fix the above issues before deploying."
    exit 1
else
    echo "Ready for deployment!"
fi
```

### 7.2 Production Environment Variables

**File: `.env` (production)**
```bash
# =============================================================================
# PRODUCTION CONFIGURATION - iMessage MLX Chatbot
# =============================================================================

# Core Settings
NODE_ENV=production
CHATBOT_ENABLED=true

# MLX API
MLX_API_URL=http://localhost:8000
MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit

# Access Control
# Add all phone numbers and emails that should receive AI responses
ALLOWED_CONTACTS=+15551234567,+15559876543,friend@email.com

# AI Configuration
SYSTEM_PROMPT="You are Andrew's AI assistant responding via iMessage. Be helpful, concise, and friendly. Keep responses under 3 sentences unless more detail is needed. If asked about Andrew, say you're his AI assistant."
MAX_CONTEXT_MESSAGES=10
MAX_TOKENS=512
TEMPERATURE=0.7

# Rate Limiting
RESPONSE_COOLDOWN=2000
MAX_REQUESTS_PER_MINUTE=10

# Timeouts
MLX_REQUEST_TIMEOUT=60000

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

### 7.3 Monitoring Dashboard Script

**File: `scripts/monitor.sh`**
```bash
#!/bin/bash
# Real-time monitoring dashboard for iMessage MLX Chatbot

clear
echo "=========================================="
echo "  iMessage MLX Chatbot Monitor"
echo "  Press Ctrl+C to exit"
echo "=========================================="
echo ""

while true; do
    # Clear screen and move cursor to top
    tput cup 5 0

    # Timestamp
    echo "Last updated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # PM2 Status
    echo "=== Process Status ==="
    pm2 jlist 2>/dev/null | jq -r '.[] | "\(.name): \(.pm2_env.status) (restarts: \(.pm2_env.restart_time), uptime: \(.pm2_env.pm_uptime // 0 | . / 1000 | floor)s)"' 2>/dev/null || echo "PM2 not running"
    echo ""

    # MLX API Stats
    echo "=== MLX API ==="
    STATS=$(curl -s http://localhost:8000/stats 2>/dev/null)
    if [ -n "$STATS" ]; then
        echo "  Requests: $(echo $STATS | jq -r '.total_requests')"
        echo "  Tokens: $(echo $STATS | jq -r '.total_tokens_generated')"
        echo "  Uptime: $(echo $STATS | jq -r '.uptime_seconds | floor')s"
    else
        echo "  API not responding"
    fi
    echo ""

    # Recent logs
    echo "=== Recent Activity (last 5 entries) ==="
    tail -n 5 logs/chatbot-out.log 2>/dev/null | while read line; do
        echo "  $line" | cut -c1-70
    done
    echo ""

    # Memory usage
    echo "=== Memory Usage ==="
    ps aux | grep -E "(python.*uvicorn|node.*chatbot)" | grep -v grep | awk '{printf "  %s: %.1f MB\n", $11, $6/1024}'

    sleep 5
done
```

```bash
chmod +x scripts/monitor.sh
```

### 7.4 Log Rotation Configuration

**File: `scripts/setup-logrotate.sh`**
```bash
#!/bin/bash
# Setup log rotation for chatbot logs

cat > /tmp/imessage-chatbot-logrotate << 'EOF'
/Users/andrewross/Desktop/Imessage_mlx/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 andrewross staff
    postrotate
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
EOF

echo "Log rotation config created at /tmp/imessage-chatbot-logrotate"
echo ""
echo "To install, run:"
echo "  sudo cp /tmp/imessage-chatbot-logrotate /etc/logrotate.d/imessage-chatbot"
```

### 7.5 Final Deployment Commands

```bash
# 1. Final build
cd /Users/andrewross/Desktop/Imessage_mlx
npm run build

# 2. Run pre-deployment checklist
./scripts/pre-deploy-check.sh

# 3. Start all services
./scripts/start-all.sh

# 4. Verify everything is running
pm2 status
curl http://localhost:8000/health

# 5. Configure startup on boot
pm2 startup
# Run the command it outputs, then:
pm2 save

# 6. Monitor for a few minutes
./scripts/monitor.sh

# 7. Test with a whitelisted contact
# Send a message from a whitelisted phone number
# Verify response is received within 5 seconds
```

### 7.6 Troubleshooting Guide

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| MLX API won't start | Check `pm2 logs mlx-api` | Verify Python venv, model path |
| No response to messages | Check `pm2 logs imessage-chatbot` | Verify whitelist, chat.db access |
| Slow responses (>10s) | Check MLX API generation time | Use smaller model (1B vs 3B) |
| AppleScript errors | Check Accessibility permissions | Re-grant in System Preferences |
| High memory usage | Check `pm2 monit` | Restart services, reduce context |
| Messages.app not responding | Check Messages.app status | Restart Messages.app |

### Phase 7 Deliverables

| Item | Verification |
|------|--------------|
| All services running | `pm2 status` shows online |
| Health checks passing | `curl localhost:8000/health` healthy |
| Messages processed | Send test message, receive response |
| Logs being written | Files exist in logs/ directory |
| Auto-restart works | `pm2 kill` → services restart on reboot |
| Response time <5s | Test message round-trip |

---

## Success Criteria Summary

| Criterion | How to Verify |
|-----------|---------------|
| MLX API responds to `/health` | `curl localhost:8000/health` returns healthy |
| Whitelisted contact gets response | Send message, receive AI reply <5s |
| Non-whitelisted contacts ignored | Send from unlisted number, no response |
| Self-messages don't trigger | System messages don't cause loops |
| Context included in prompts | Multi-turn conversations maintain topic |
| Runs continuously without intervention | Uptime >24 hours with no manual restarts |
| Survives system reboot | Reboot Mac Mini, services auto-start |

---

## Appendix A: Model Recommendations

| Use Case | Model | Memory | Notes |
|----------|-------|--------|-------|
| **Fastest/Lightest** | `Llama-3.2-1B-Instruct-4bit` | ~2GB | Good for simple Q&A |
| **Recommended** | `Llama-3.2-3B-Instruct-4bit` | ~4GB | Best balance of speed/quality |
| **Higher Quality** | `Mistral-7B-Instruct-v0.3-4bit` | ~6GB | Better reasoning |
| **Best Quality** | `Llama-3.1-8B-Instruct-4bit` | ~8GB | Most capable, slower |

---

## Appendix B: File Reference

| File | Purpose |
|------|---------|
| `PRD.md` | Product requirements document |
| `DEVELOPER_ROADMAP.md` | This implementation guide |
| `.env` | Environment configuration |
| `ecosystem.config.cjs` | PM2 process management |
| `mlx_api/server.py` | FastAPI LLM server |
| `src/chatbot/ChatbotHandler.ts` | Core chatbot logic |
| `src/chatbot-main.ts` | Entry point |
| `scripts/start-all.sh` | Service launcher |
| `scripts/test-e2e.sh` | End-to-end tests |
| `scripts/monitor.sh` | Real-time dashboard |

---

## Appendix C: Quick Reference Commands

```bash
# Start all services
./scripts/start-all.sh

# Stop all services
pm2 stop all

# View logs
pm2 logs                      # All logs
pm2 logs mlx-api              # MLX API only
pm2 logs imessage-chatbot     # Chatbot only

# Check status
pm2 status
pm2 monit                     # Real-time monitor

# Restart services
pm2 restart all
pm2 restart mlx-api
pm2 restart imessage-chatbot

# Test MLX API
curl http://localhost:8000/health
curl http://localhost:8000/stats

# Run end-to-end tests
./scripts/test-e2e.sh

# Real-time monitoring
./scripts/monitor.sh
```

---

*Document Version: 1.0 | December 24, 2025*
*Generated for: iMessage MLX Chatbot on Mac Mini (Apple Silicon)*
