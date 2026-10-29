import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch):
    """Default settings should load with standard defaults independent of .env file."""
    # Clear any inherited environment variables that could alter defaults
    for var in [
        "PROJECT_NAME",
        "API_V1_PREFIX",
        "ENVIRONMENT",
        "PORT",
        "DEBUG",
        "ALLOWED_ORIGINS",
        "HOST",
        "FASTAPI_INTERNAL_TOKEN",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STORAGE_BUCKET_VIDEOS",
        "STORAGE_BUCKET_ARTIFACTS",
        "TEMP_STORAGE_DIR",
        "MAX_VIDEO_SIZE_BYTES",
        "WHISPER_MODEL_SIZE",
        "WHISPER_DEVICE",
        "WHISPER_COMPUTE_TYPE",
        "WHISPER_LANGUAGE",
        "WHISPER_DOWNLOAD_ROOT",
    ]:
        monkeypatch.delenv(var, raising=False)

    settings = Settings(_env_file=None)
    assert settings.PROJECT_NAME == "VideoAssist Backend"
    assert settings.API_V1_PREFIX == "/api/v1"
    assert settings.ENVIRONMENT == "development"
    assert settings.PORT == 8000
    assert settings.DEBUG is False
    assert "http://localhost:3000" in settings.ALLOWED_ORIGINS


@pytest.mark.parametrize("valid_env", ["development", "staging", "production", "test", "PRODUCTION", "Test"])
def test_settings_valid_environment(valid_env: str):
    """Supported environment names (case-insensitive) should pass validation."""
    settings = Settings(ENVIRONMENT=valid_env)
    assert settings.ENVIRONMENT == valid_env.lower()


def test_settings_invalid_environment():
    """Unsupported environment names should raise validation error."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="invalid_env_name")
    assert "ENVIRONMENT must be one of" in str(exc_info.value)


@pytest.mark.parametrize("invalid_port", [0, -1, 65536, 100000])
def test_settings_invalid_port(invalid_port: int):
    """Port numbers outside 1-65535 should raise validation error."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(PORT=invalid_port)
    assert "PORT must be an integer between 1 and 65535" in str(exc_info.value)


def test_settings_allowed_origins_parsing():
    """Comma-separated string in ALLOWED_ORIGINS should parse into a list of strings."""
    settings = Settings(ALLOWED_ORIGINS="http://localhost:3000, https://myapp.example.com")
    assert settings.ALLOWED_ORIGINS == ["http://localhost:3000", "https://myapp.example.com"]


def test_settings_whisper_configuration(monkeypatch: pytest.MonkeyPatch):
    """Whisper configuration settings should load with defaults and support custom overrides."""
    for var in [
        "WHISPER_MODEL_SIZE",
        "WHISPER_DEVICE",
        "WHISPER_COMPUTE_TYPE",
        "WHISPER_LANGUAGE",
        "WHISPER_DOWNLOAD_ROOT",
    ]:
        monkeypatch.delenv(var, raising=False)

    default_settings = Settings(_env_file=None)
    assert default_settings.WHISPER_MODEL_SIZE == "base"
    assert default_settings.WHISPER_DEVICE == "auto"
    assert default_settings.WHISPER_COMPUTE_TYPE == "default"
    assert default_settings.WHISPER_LANGUAGE is None
    assert default_settings.WHISPER_DOWNLOAD_ROOT is None

    custom_settings = Settings(
        _env_file=None,
        WHISPER_MODEL_SIZE="tiny",
        WHISPER_DEVICE="cpu",
        WHISPER_COMPUTE_TYPE="int8",
        WHISPER_LANGUAGE="en",
        WHISPER_DOWNLOAD_ROOT="/tmp/custom_models",
    )
    assert custom_settings.WHISPER_MODEL_SIZE == "tiny"
    assert custom_settings.WHISPER_DEVICE == "cpu"
    assert custom_settings.WHISPER_COMPUTE_TYPE == "int8"
    assert custom_settings.WHISPER_LANGUAGE == "en"
    assert custom_settings.WHISPER_DOWNLOAD_ROOT == "/tmp/custom_models"
