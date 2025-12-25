#!/bin/bash
# Initial setup script for iMessage MLX Chatbot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================"
echo "  iMessage MLX Chatbot - Setup"
echo "========================================"
echo ""

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "ERROR: This project only runs on macOS."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
echo "Node.js: $NODE_VERSION"
if [[ "$NODE_VERSION" == "not installed" ]]; then
    echo "ERROR: Node.js is not installed. Please install Node.js 18+."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>/dev/null || echo "not installed")
echo "Python: $PYTHON_VERSION"
if [[ "$PYTHON_VERSION" == "not installed" ]]; then
    echo "ERROR: Python 3 is not installed."
    exit 1
fi

echo ""
echo "Step 1: Creating Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  Created venv/"
else
    echo "  venv/ already exists"
fi

echo ""
echo "Step 2: Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r mlx_api/requirements.txt
deactivate
echo "  Python dependencies installed"

echo ""
echo "Step 3: Installing Node.js dependencies..."
npm install
echo "  Node.js dependencies installed"

echo ""
echo "Step 4: Building TypeScript..."
npm run build
echo "  TypeScript built"

echo ""
echo "Step 5: Creating logs directory..."
mkdir -p logs
echo "  logs/ created"

echo ""
echo "Step 6: Creating .env from template..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  Created .env - PLEASE EDIT THIS FILE!"
else
    echo "  .env already exists"
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env and set your ALLOWED_CONTACTS"
echo "  2. Grant Full Disk Access to Terminal (System Settings)"
echo "  3. Grant Accessibility permissions to Terminal"
echo "  4. Run: ./scripts/start-all.sh"
echo ""
