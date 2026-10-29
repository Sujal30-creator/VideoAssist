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
        FASTAPI_INTERNAL_TOKEN="test-token",
        SUPABASE_URL="https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="test-service-key",
    )


@pytest.fixture
def sample_video(tmp_path: Path) -> Path:
    """Generate a tiny 2-second valid MP4 test video using FFmpeg."""
    import subprocess
    vid_path = tmp_path / "test_clip.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "testsrc=size=320x240:rate=25",
        "-t", "2.0",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(vid_path),
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return vid_path


@pytest.fixture
def mock_supabase(test_settings: Settings, sample_video: Path):
    from tests.test_jobs_api import MockSupabaseService
    return MockSupabaseService(settings=test_settings, sample_video_path=sample_video)


@pytest.fixture
def client(test_settings: Settings) -> Generator[TestClient, None, None]:
    """Provide FastAPI TestClient with overridden test settings."""
    app = create_app(test_settings)
    app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
