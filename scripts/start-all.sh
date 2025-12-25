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
