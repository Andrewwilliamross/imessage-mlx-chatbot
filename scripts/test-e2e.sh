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
