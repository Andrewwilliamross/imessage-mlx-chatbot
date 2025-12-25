"""
Pydantic models for MLX API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional


class Message(BaseModel):
    """Single message in conversation"""
    role: str = Field(..., description="Role: 'system', 'user', or 'assistant'")
    content: str = Field(..., description="Message content")


class GenerateRequest(BaseModel):
    """Request body for /generate endpoint"""
    messages: list[Message] = Field(..., description="Conversation messages")
    max_tokens: int = Field(default=512, ge=1, le=2048)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Hello, how are you?"}
                ],
                "max_tokens": 256,
                "temperature": 0.7
            }]
        }
    }


class GenerateResponse(BaseModel):
    """Response body for /generate endpoint"""
    response: str = Field(..., description="Generated text")
    tokens_generated: int = Field(..., description="Number of tokens generated")
    generation_time_ms: int = Field(..., description="Generation time in milliseconds")
    model: str = Field(..., description="Model used for generation")


class HealthResponse(BaseModel):
    """Response body for /health endpoint"""
    status: str
    model: str
    model_loaded: bool
    uptime_seconds: float


class ErrorResponse(BaseModel):
    """Error response body"""
    error: str
    detail: Optional[str] = None
