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
