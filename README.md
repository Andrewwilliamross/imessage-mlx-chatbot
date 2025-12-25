# iMessage MLX Chatbot

An AI-powered iMessage chatbot that runs locally on Apple Silicon using MLX-LM for fast, private inference.

## Features

- **Local LLM Inference**: Uses Apple's MLX framework for efficient on-device AI
- **iMessage Integration**: Monitors and responds to iMessages automatically
- **Privacy First**: All processing happens locally - no data leaves your Mac
- **Configurable**: Whitelist contacts, customize system prompts, adjust generation parameters
- **Production Ready**: PM2 process management, health monitoring, logging

## Requirements

- macOS 14.0+ (Sonoma or later)
- Apple Silicon (M1/M2/M3)
- Node.js 18+
- Python 3.10+
- 8GB+ RAM recommended

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/Andrewwilliamross/imessage-mlx-chatbot.git
cd imessage-mlx-chatbot
./scripts/setup.sh
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set your `ALLOWED_CONTACTS` (comma-separated phone numbers):
```env
ALLOWED_CONTACTS=+15551234567,+15559876543
```

### 3. Grant Permissions

1. **Full Disk Access**: System Settings → Privacy & Security → Full Disk Access → Add Terminal
2. **Accessibility**: System Settings → Privacy & Security → Accessibility → Add Terminal

### 4. Start Services

```bash
./scripts/start-all.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      iMessage MLX Chatbot                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────────────────┐   │
│  │   MLX API       │     │   Chatbot Handler           │   │
│  │   (Python)      │◄────│   (TypeScript/Node.js)      │   │
│  │                 │     │                             │   │
│  │  - FastAPI      │     │  - Message Poller           │   │
│  │  - MLX-LM       │     │  - Conversation Context     │   │
│  │  - Llama 3.2    │     │  - Rate Limiting            │   │
│  └────────┬────────┘     └──────────┬──────────────────┘   │
│           │                         │                       │
│           │                         ▼                       │
│           │              ┌─────────────────────┐           │
│           │              │   chat.db (SQLite)  │           │
│           │              │   ~/Library/Messages │           │
│           │              └─────────────────────┘           │
│           │                         │                       │
│           │                         ▼                       │
│           │              ┌─────────────────────┐           │
│           └──────────────│   Messages.app      │           │
│                          │   (AppleScript)     │           │
│                          └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
imessage-mlx-chatbot/
├── mlx_api/              # Python MLX-LM API server
│   ├── server.py         # FastAPI application
│   ├── config.py         # Configuration
│   ├── models.py         # Pydantic models
│   └── requirements.txt  # Python dependencies
├── src/                  # TypeScript source
│   ├── chatbot/          # Chatbot logic
│   │   ├── ChatbotHandler.ts
│   │   ├── MLXClient.ts
│   │   └── MessagePoller.ts
│   ├── services/         # iMessage services
│   └── utils/            # Utilities
├── scripts/              # Operational scripts
│   ├── setup.sh          # Initial setup
│   ├── start-all.sh      # Start services
│   ├── stop-all.sh       # Stop services
│   └── monitor.sh        # Real-time dashboard
├── ecosystem.config.cjs  # PM2 configuration
└── .env.example          # Environment template
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_CONTACTS` | Comma-separated phone numbers to respond to | (required) |
| `MLX_API_URL` | MLX API server URL | `http://localhost:8000` |
| `MLX_MODEL_ID` | Hugging Face model ID | `mlx-community/Llama-3.2-3B-Instruct-4bit` |
| `MAX_TOKENS` | Maximum response tokens | `512` |
| `TEMPERATURE` | Generation temperature | `0.7` |
| `SYSTEM_PROMPT` | System prompt for the AI | Default assistant prompt |

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/setup.sh` | Initial project setup |
| `./scripts/start-all.sh` | Start all services with PM2 |
| `./scripts/stop-all.sh` | Stop all services |
| `./scripts/monitor.sh` | Real-time monitoring dashboard |
| `./scripts/pre-deploy-check.sh` | Pre-deployment verification |

## API Endpoints

The MLX API server exposes:

- `GET /health` - Health check
- `GET /model-info` - Model information
- `GET /stats` - Usage statistics
- `POST /generate` - Generate response

## Development

```bash
# Build TypeScript
npm run build

# Watch mode
npm run build -- --watch

# Run MLX API manually
source venv/bin/activate
cd mlx_api
python -m uvicorn server:app --reload

# Run chatbot manually
node dist/chatbot-main.js
```

## Troubleshooting

### "SQLITE_CANTOPEN" Error
Restart Terminal after granting Full Disk Access.

### Model Download Slow
First run downloads ~2GB model. Wait for completion.

### "Connection refused" to port 8000
MLX API not running. Check: `pm2 logs mlx-api`

### No Messages Detected
Verify `ALLOWED_CONTACTS` matches sender's number exactly (including country code).

## License

MIT

## Acknowledgments

- [MLX](https://github.com/ml-explore/mlx) - Apple's ML framework
- [MLX-LM](https://github.com/ml-explore/mlx-examples) - LLM inference
- [Llama](https://llama.meta.com/) - Meta's language models
