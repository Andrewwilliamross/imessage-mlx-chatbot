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
