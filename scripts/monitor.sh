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
