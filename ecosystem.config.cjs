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

    // Family Daily Gift System (Node.js)
    {
      name: 'gift-system',
      script: 'dist/gift-main.js',
      cwd: __dirname,
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node',
      // Environment
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        GIFT_SYSTEM_ENABLED: 'true',
      },
      // Wait for MLX API to start (fallback)
      wait_ready: true,
      listen_timeout: 30000,
      // Restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // Daily restart at 4 AM to ensure fresh state
      cron_restart: '0 4 * * *',
      // Logging
      error_file: path.join(__dirname, 'logs', 'gift-system-error.log'),
      out_file: path.join(__dirname, 'logs', 'gift-system-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Memory management
      max_memory_restart: '500M',
      // Dependencies
      depends_on: ['mlx-api'],
    },
  ],
};
