from functools import lru_cache
from typing import Any, List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = Field(
        default="VideoAssist Backend",
        description="Name of the backend service",
    )
    API_V1_PREFIX: str = Field(
        default="/api/v1",
        description="Base routing prefix for v1 API endpoints",
    )
    ENVIRONMENT: str = Field(
        default="development",
        description="Current deployment environment (development, staging, production, test)",
    )
    DEBUG: bool = Field(
        default=False,
        description="Enable debug mode and verbose logging",
    )

    # Server network settings
    HOST: str = Field(
        default="0.0.0.0",
        description="Host interface for server binding",
    )
    PORT: int = Field(
        default=8000,
        description="Port for server binding",
    )
    ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
        description="CORS allowed origins for frontend communication",
    )

    # Security & internal service authentication
    FASTAPI_INTERNAL_TOKEN: Optional[str] = Field(
        default=None,
        description="Shared secret token for Next.js internal server action dispatch",
    )

    # Supabase credentials (for storage and database operations in Phase 1)
    SUPABASE_URL: Optional[str] = Field(
        default=None,
        description="Supabase project URL",
    )
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = Field(
        default=None,
        description="Supabase service role key (bypasses RLS for worker ingestion)",
    )
    STORAGE_BUCKET_VIDEOS: str = Field(
        default="field-service-videos",
        description="Supabase Storage bucket for raw video uploads",
    )
    STORAGE_BUCKET_ARTIFACTS: str = Field(
        default="video-artifacts",
        description="Supabase Storage bucket for extracted frames and media artifacts",
    )

    # Temporary directory for video processing
    TEMP_STORAGE_DIR: str = Field(
        default="/tmp/videoassist",
        description="Local directory for temporary video and keyframe staging",
    )
    MAX_VIDEO_SIZE_BYTES: int = Field(
        default=120 * 1024 * 1024,
        description="Maximum permitted video file size in bytes (120 MB default)",
    )

    # Speech transcription settings (faster-whisper)
    WHISPER_MODEL_SIZE: str = Field(
        default="base",
        description="Whisper model size (e.g. tiny, base, small, medium, large-v3)",
    )
    WHISPER_DEVICE: str = Field(
        default="auto",
        description="Device for Whisper inference ('auto', 'cpu', 'cuda')",
    )
    WHISPER_COMPUTE_TYPE: str = Field(
        default="default",
        description="Quantization compute type ('default', 'int8', 'float16', 'float32')",
    )
    WHISPER_LANGUAGE: Optional[str] = Field(
        default=None,
        description="Optional forced language code (e.g. 'en'); None enables auto-detection",
    )
    WHISPER_DOWNLOAD_ROOT: Optional[str] = Field(
        default=None,
        description="Optional directory for caching Whisper model weights",
    )

    # Optical character recognition settings (EasyOCR)
    OCR_ENABLED: bool = Field(
        default=True,
        description="Enable optical character recognition in background video processing",
    )
    OCR_LANGUAGES: List[str] = Field(
        default_factory=lambda: ["en"],
        description="Languages to detect with EasyOCR (e.g. ['en'])",
    )
    OCR_GPU: bool = Field(
        default=False,
        description="Whether to use GPU acceleration for OCR (defaults to CPU/False for portability)",
    )
    OCR_CONFIDENCE_THRESHOLD: float = Field(
        default=0.3,
        description="Minimum confidence score (0.0 to 1.0) to retain detected text regions",
    )
    OCR_MODEL_STORAGE_DIRECTORY: Optional[str] = Field(
        default=None,
        description="Optional local directory for caching EasyOCR model weights",
    )

    @property
    def is_auth_configured(self) -> bool:
        """Check whether the internal API token is configured with non-empty string."""
        return bool(self.FASTAPI_INTERNAL_TOKEN and self.FASTAPI_INTERNAL_TOKEN.strip())

    @property
    def is_supabase_configured(self) -> bool:
        """Check whether Supabase URL and service role key are both configured."""
        return bool(
            self.SUPABASE_URL
            and self.SUPABASE_URL.strip()
            and self.SUPABASE_SERVICE_ROLE_KEY
            and self.SUPABASE_SERVICE_ROLE_KEY.strip()
        )

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        valid_envs = {"development", "staging", "production", "test"}
        normalized = v.strip().lower()
        if normalized not in valid_envs:
            raise ValueError(
                f"ENVIRONMENT must be one of {sorted(valid_envs)}, got '{v}'"
            )
        return normalized

    @field_validator("PORT")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError(f"PORT must be an integer between 1 and 65535, got {v}")
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            # Parse comma-separated string from env file, e.g. "http://localhost:3000,http://127.0.0.1:3000"
            if not v.strip().startswith("["):
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("OCR_LANGUAGES", mode="before")
    @classmethod
    def parse_ocr_languages(cls, v: Any) -> Any:
        if isinstance(v, str):
            if not v.strip().startswith("["):
                return [lang.strip() for lang in v.split(",") if lang.strip()]
        return v


@lru_cache()
def get_settings() -> Settings:
    """Dependency provider returning cached Settings instance."""
    return Settings()
