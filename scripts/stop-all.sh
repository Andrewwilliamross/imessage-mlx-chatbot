#!/bin/bash
# Stop all iMessage MLX Chatbot services

echo "Stopping all services..."
pm2 stop all
pm2 status
echo "Done."
