"""
MLX API Configuration
"""
import os
from dataclasses import dataclass


@dataclass
class Config:
    """MLX API Configuration"""

    # Model settings
    model_id: str = os.getenv(
        "MLX_MODEL",
        "mlx-community/Llama-3.2-3B-Instruct-4bit"
    )

    # Server settings
    host: str = os.getenv("MLX_HOST", "0.0.0.0")
    port: int = int(os.getenv("MLX_PORT", "8000"))

    # Generation defaults
    default_max_tokens: int = int(os.getenv("MLX_MAX_TOKENS", "512"))
    default_temperature: float = float(os.getenv("MLX_TEMPERATURE", "0.7"))
    default_top_p: float = float(os.getenv("MLX_TOP_P", "0.9"))

    # Safety limits
    max_input_tokens: int = int(os.getenv("MLX_MAX_INPUT_TOKENS", "2048"))
    max_output_tokens: int = int(os.getenv("MLX_MAX_OUTPUT_TOKENS", "1024"))
    request_timeout: int = int(os.getenv("MLX_REQUEST_TIMEOUT", "60"))


config = Config()
