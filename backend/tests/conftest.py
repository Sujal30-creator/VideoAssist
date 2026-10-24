import sys
from pathlib import Path
from typing import Generator
import pytest
from fastapi.testclient import TestClient

# Ensure backend root directory is on Python path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import Settings, get_settings
from app.main import create_app


@pytest.fixture
def test_settings() -> Settings:
    """Provide isolated settings configured for the test environment."""
    return Settings(
        ENVIRONMENT="test",
        DEBUG=True,
        PROJECT_NAME="VideoAssist Backend Test",
        API_V1_PREFIX="/api/v1",
        ALLOWED_ORIGINS=["http://testserver"],
    )


@pytest.fixture
def client(test_settings: Settings) -> Generator[TestClient, None, None]:
    """Provide FastAPI TestClient with overridden test settings."""
    app = create_app(test_settings)
    app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
