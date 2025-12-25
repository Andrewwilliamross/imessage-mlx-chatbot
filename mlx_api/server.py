"""
MLX-LM FastAPI Server for iMessage Chatbot
Provides local LLM inference on Apple Silicon via MLX
"""

import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from mlx_lm import load, generate

from models import (
    GenerateRequest,
    GenerateResponse,
    HealthResponse,
    ErrorResponse
)
from config import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("mlx-api")


# Global state
class ModelState:
    model = None
    tokenizer = None
    model_id: str = ""
    load_time: float = 0
    start_time: float = 0
    request_count: int = 0
    total_tokens_generated: int = 0


state = ModelState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown"""
    logger.info(f"Loading model: {config.model_id}")
    load_start = time.time()

    try:
        state.model, state.tokenizer = load(config.model_id)
        state.model_id = config.model_id
        state.load_time = time.time() - load_start
        state.start_time = time.time()
        logger.info(f"Model loaded in {state.load_time:.2f}s")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Model loading failed: {e}")

    yield

    # Cleanup
    logger.info("Shutting down MLX API")
    state.model = None
    state.tokenizer = None


# Create FastAPI app
app = FastAPI(
    title="iMessage MLX API",
    description="Local LLM inference for iMessage chatbot using MLX",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all uncaught exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for monitoring"""
    return HealthResponse(
        status="healthy" if state.model is not None else "unhealthy",
        model=state.model_id,
        model_loaded=state.model is not None,
        uptime_seconds=time.time() - state.start_time if state.start_time else 0
    )


@app.get("/stats")
async def get_stats():
    """Get server statistics"""
    return {
        "model": state.model_id,
        "model_load_time_seconds": state.load_time,
        "uptime_seconds": time.time() - state.start_time,
        "total_requests": state.request_count,
        "total_tokens_generated": state.total_tokens_generated
    }


@app.post("/generate", response_model=GenerateResponse)
async def generate_response(request: GenerateRequest):
    """
    Generate a response from the LLM.

    Accepts a list of messages in OpenAI chat format and returns
    the model's response with generation metadata.
    """
    if state.model is None or state.tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Server is starting up."
        )

    start_time = time.time()
    state.request_count += 1

    try:
        # Convert messages to dict format for tokenizer
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        # Apply chat template
        prompt = state.tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False
        )

        # Check input length
        input_tokens = len(state.tokenizer.encode(prompt))
        if input_tokens > config.max_input_tokens:
            raise HTTPException(
                status_code=400,
                detail=f"Input too long: {input_tokens} tokens (max: {config.max_input_tokens})"
            )

        logger.info(f"Generating response (input: {input_tokens} tokens, max_output: {request.max_tokens})")

        # Generate response
        response_text = generate(
            state.model,
            state.tokenizer,
            prompt=prompt,
            max_tokens=min(request.max_tokens, config.max_output_tokens),
            temp=request.temperature,
            top_p=request.top_p
        )

        # Calculate metrics
        elapsed_ms = int((time.time() - start_time) * 1000)
        tokens_generated = len(state.tokenizer.encode(response_text))
        state.total_tokens_generated += tokens_generated

        logger.info(f"Generated {tokens_generated} tokens in {elapsed_ms}ms")

        return GenerateResponse(
            response=response_text,
            tokens_generated=tokens_generated,
            generation_time_ms=elapsed_ms,
            model=state.model_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=config.host,
        port=config.port,
        log_level="info"
    )
