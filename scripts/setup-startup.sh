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
