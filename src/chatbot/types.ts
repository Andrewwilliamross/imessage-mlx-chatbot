/**
 * Chatbot type definitions
 */

export interface ChatbotConfig {
  /** URL of the MLX API server */
  mlxApiUrl: string;

  /** List of allowed phone numbers/emails that can trigger responses */
  allowedContacts: string[];

  /** System prompt for the AI */
  systemPrompt: string;

  /** Maximum number of previous messages to include as context */
  maxContextMessages: number;

  /** Maximum tokens for generation */
  maxTokens: number;

  /** Temperature for generation (0.0-2.0) */
  temperature: number;

  /** Whether to enable the chatbot */
  enabled: boolean;

  /** Timeout for MLX API requests in ms */
  requestTimeout: number;

  /** Cooldown between responses to same contact in ms */
  responseCooldown: number;
}

export interface MLXMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MLXGenerateRequest {
  messages: MLXMessage[];
  max_tokens: number;
  temperature: number;
}

export interface MLXGenerateResponse {
  response: string;
  tokens_generated: number;
  generation_time_ms: number;
  model: string;
}

export interface MLXHealthResponse {
  status: string;
  model: string;
  model_loaded: boolean;
  uptime_seconds: number;
}

export interface ChatbotStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesIgnored: number;
  responsesSent: number;
  errors: number;
  averageResponseTimeMs: number;
  lastActivityTimestamp: string | null;
}
