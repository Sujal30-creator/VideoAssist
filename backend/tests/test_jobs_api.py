import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.services.job_runner import process_video_job
from app.services.supabase_service import SupabaseService


class MockSupabaseService(SupabaseService):
    """In-memory mock for Supabase database and storage operations in tests."""

    def __init__(self, settings: Settings, sample_video_path: Optional[Path] = None) -> None:
        super().__init__(client=MagicMock(), settings=settings)
        self.sample_video_path = sample_video_path
        self.jobs_table: Dict[str, Dict[str, Any]] = {}
        self.videos_table: Dict[str, Dict[str, Any]] = {}
        self.video_frames_table: List[Dict[str, Any]] = []
        self.transcripts_table: List[Dict[str, Any]] = []
        self.storage_uploads: List[Dict[str, Any]] = []
        self.download_fail = False
        self.upload_fail = False
        self.insert_frames_fail = False
        self.insert_transcripts_fail = False
        self.last_degraded_columns: List[str] = []
        self.simulate_degraded_columns: List[str] = []
        self.update_fail = False

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs_table.get(job_id)

    def get_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        return self.videos_table.get(video_id)

    def update_job(self, job_id: str, **kwargs: Any) -> Dict[str, Any]:
        if self.update_fail:
            raise RuntimeError("Simulated database update failure")
        job = self.jobs_table.setdefault(job_id, {"id": job_id})
        job.update(kwargs)
        return job

    def update_video(self, video_id: str, **kwargs: Any) -> Dict[str, Any]:
        if self.update_fail:
            raise RuntimeError("Simulated database update failure")
        video = self.videos_table.setdefault(video_id, {"id": video_id})
        video.update(kwargs)
        return video

    def insert_video_frames(self, frame_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if self.insert_frames_fail:
            raise RuntimeError("Simulated database insert failure for video_frames")
        self.video_frames_table.extend(frame_records)
        return frame_records

    def delete_transcripts_for_video(self, video_id: str) -> None:
        self.transcripts_table = [t for t in self.transcripts_table if t.get("video_id") != video_id]

    def delete_transcripts_for_job(self, job_id: str) -> None:
        self.transcripts_table = [t for t in self.transcripts_table if t.get("job_id") != job_id]

    def insert_transcripts(
        self,
        transcript_records: List[Dict[str, Any]],
        video_id: Optional[str] = None,
        job_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        self.last_degraded_columns = list(self.simulate_degraded_columns)
        if not transcript_records:
            if video_id:
                self.delete_transcripts_for_video(video_id)
            return []

        for rec in transcript_records:
            if not rec.get("user_id"):
                raise ValueError("Refusing to persist transcripts: missing required user_id ownership.")

        if self.insert_transcripts_fail:
            raise RuntimeError("Simulated database insert failure for transcripts")

        target_video_id = video_id or (transcript_records[0].get("video_id") if transcript_records else None)
        target_job_id = job_id or (transcript_records[0].get("job_id") if transcript_records else None)

        if target_video_id:
            if target_job_id:
                self.transcripts_table = [
                    t for t in self.transcripts_table
                    if not (t.get("video_id") == target_video_id and t.get("job_id") != target_job_id)
                ]
            else:
                self.delete_transcripts_for_video(target_video_id)

        self.transcripts_table.extend(transcript_records)
        return transcript_records

    def download_file(self, bucket_name: str, storage_path: str, destination_path: Path) -> Path:
        if self.download_fail:
            raise FileNotFoundError(f"Storage object '{storage_path}' not found in bucket '{bucket_name}'")
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        if self.sample_video_path and self.sample_video_path.exists():
            destination_path.write_bytes(self.sample_video_path.read_bytes())
        else:
            destination_path.write_text("dummy-video-data")
        return destination_path

    def upload_file(self, bucket_name: str, storage_path: str, file_path: Path, content_type: str = "image/jpeg") -> str:
        if self.upload_fail:
            raise RuntimeError(f"Simulated storage upload failure for '{storage_path}'")
        self.storage_uploads.append({
            "bucket": bucket_name,
            "path": storage_path,
            "size": file_path.stat().st_size,
            "content_type": content_type,
        })
        return storage_path


@pytest.fixture
def auth_token() -> str:
    return "test-internal-secret-token"


@pytest.fixture
def test_app_settings(auth_token: str) -> Settings:
    return Settings(
        ENVIRONMENT="test",
        DEBUG=True,
        PROJECT_NAME="VideoAssist Backend Test",
        API_V1_PREFIX="/api/v1",
        FASTAPI_INTERNAL_TOKEN=auth_token,
        SUPABASE_URL="https://mock-project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="mock-service-role-key",
        ALLOWED_ORIGINS=["http://testserver"],
    )


@pytest.fixture
def test_client(test_app_settings: Settings) -> TestClient:
    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def tiny_video_path(tmp_path: Path) -> Path:
    """Generate a tiny 1-second synthetic video for end-to-end processing tests."""
    out_file = tmp_path / "tiny_test.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x120:rate=25",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(out_file),
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return out_file


# ==============================================================================
# 1. SECURITY & TOKEN VERIFICATION TESTS
# ==============================================================================

def test_missing_auth_header_returns_401(test_client: TestClient):
    """Endpoint must reject requests lacking authorization credentials with 401."""
    resp = test_client.post(
        "/api/v1/jobs",
        json={"job_id": "job-1", "video_id": "vid-1"},
    )
    assert resp.status_code == 401
    assert "Missing required internal authorization token" in resp.json()["detail"]


def test_invalid_bearer_token_returns_401(test_client: TestClient):
    """Endpoint must reject wrong Bearer token with 401."""
    resp = test_client.post(
        "/api/v1/jobs",
        headers={"Authorization": "Bearer wrong-secret-token"},
        json={"job_id": "job-1", "video_id": "vid-1"},
    )
    assert resp.status_code == 401
    assert "Invalid internal authorization token" in resp.json()["detail"]


def test_invalid_x_internal_secret_returns_401(test_client: TestClient):
    """Endpoint must reject wrong X-Internal-Secret with 401."""
    resp = test_client.post(
        "/api/v1/jobs",
        headers={"X-Internal-Secret": "wrong-secret-token"},
        json={"job_id": "job-1", "video_id": "vid-1"},
    )
    assert resp.status_code == 401
    assert "Invalid internal authorization token" in resp.json()["detail"]


def test_unconfigured_auth_token_fails_closed_500():
    """Server must fail closed (500) if internal auth token is not configured."""
    unconfigured_settings = Settings(
        ENVIRONMENT="test",
        FASTAPI_INTERNAL_TOKEN=None,
        SUPABASE_URL="https://mock.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="mock-key",
    )
    app = create_app(unconfigured_settings)
    app.dependency_overrides[get_settings] = lambda: unconfigured_settings

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/jobs",
            headers={"Authorization": "Bearer any-token"},
            json={"job_id": "job-1", "video_id": "vid-1"},
        )
        assert resp.status_code == 500
        assert "Server security configuration error" in resp.json()["detail"]


# ==============================================================================
# 2. INPUT VALIDATION & RELATIONAL INTEGRITY TESTS
# ==============================================================================

def test_missing_required_ids_returns_422(test_client: TestClient, auth_token: str):
    """Missing job_id or video_id in payload must return 422 Unprocessable Entity."""
    headers = {"Authorization": f"Bearer {auth_token}"}
    resp = test_client.post("/api/v1/jobs", headers=headers, json={"job_id": "job-1"})
    assert resp.status_code == 422

    resp2 = test_client.post("/api/v1/jobs", headers=headers, json={"video_id": "vid-1"})
    assert resp2.status_code == 422


def test_job_not_found_returns_404(test_app_settings: Settings, auth_token: str):
    """If the job ID does not exist in database, return 404."""
    mock_service = MockSupabaseService(test_app_settings)
    # Only video exists, job does not
    mock_service.videos_table["vid-1"] = {"id": "vid-1", "user_id": "usr-1", "storage_path": "usr-1/vid-1/video.mp4"}

    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings

    with patch("app.api.v1.endpoints.jobs.SupabaseService", return_value=mock_service):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"job_id": "non-existent-job", "video_id": "vid-1"},
            )
            assert resp.status_code == 404
            assert "Processing job 'non-existent-job' not found" in resp.json()["detail"]


def test_video_not_found_returns_404(test_app_settings: Settings, auth_token: str):
    """If the video ID does not exist in database, return 404."""
    mock_service = MockSupabaseService(test_app_settings)
    mock_service.jobs_table["job-1"] = {"id": "job-1", "video_id": "vid-1", "user_id": "usr-1"}

    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings

    with patch("app.api.v1.endpoints.jobs.SupabaseService", return_value=mock_service):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"job_id": "job-1", "video_id": "non-existent-video"},
            )
            assert resp.status_code == 404
            assert "Video 'non-existent-video' not found" in resp.json()["detail"]


def test_mismatched_job_and_video_returns_400(test_app_settings: Settings, auth_token: str):
    """If the job references video_A but request sends video_B, return 400."""
    mock_service = MockSupabaseService(test_app_settings)
    mock_service.jobs_table["job-1"] = {"id": "job-1", "video_id": "vid-A", "user_id": "usr-1"}
    mock_service.videos_table["vid-B"] = {"id": "vid-B", "user_id": "usr-1", "storage_path": "path"}

    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings

    with patch("app.api.v1.endpoints.jobs.SupabaseService", return_value=mock_service):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"job_id": "job-1", "video_id": "vid-B"},
            )
            assert resp.status_code == 400
            assert "Relational mismatch" in resp.json()["detail"]


def test_successful_dispatch_returns_202(test_app_settings: Settings, auth_token: str):
    """Valid request with matching job and video returns 202 Accepted immediately."""
    mock_service = MockSupabaseService(test_app_settings)
    mock_service.jobs_table["job-1"] = {"id": "job-1", "video_id": "vid-1", "user_id": "usr-1"}
    mock_service.videos_table["vid-1"] = {"id": "vid-1", "user_id": "usr-1", "storage_path": "usr-1/vid-1/video.mp4"}

    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings

    with patch("app.api.v1.endpoints.jobs.SupabaseService", return_value=mock_service):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"job_id": "job-1", "video_id": "vid-1"},
            )
            assert resp.status_code == 202
            data = resp.json()
            assert data["success"] is True
            assert data["job_id"] == "job-1"
            assert data["video_id"] == "vid-1"
            assert data["status"] == "processing"


def test_alias_route_process_returns_202(test_app_settings: Settings, auth_token: str):
    """The /api/v1/jobs/process alias route accepts requests and returns 202."""
    mock_service = MockSupabaseService(test_app_settings)
    mock_service.jobs_table["job-1"] = {"id": "job-1", "video_id": "vid-1", "user_id": "usr-1"}
    mock_service.videos_table["vid-1"] = {"id": "vid-1", "user_id": "usr-1", "storage_path": "usr-1/vid-1/video.mp4"}

    app = create_app(test_app_settings)
    app.dependency_overrides[get_settings] = lambda: test_app_settings

    with patch("app.api.v1.endpoints.jobs.SupabaseService", return_value=mock_service):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/jobs/process",
                headers={"X-Internal-Secret": auth_token},
                json={"job_id": "job-1", "video_id": "vid-1"},
            )
            assert resp.status_code == 202
            assert resp.json()["success"] is True


# ==============================================================================
# 3. BACKGROUND WORKER END-TO-END PIPELINE TESTS
# ==============================================================================

def test_worker_success_pipeline(test_app_settings: Settings, tiny_video_path: Path):
    """Worker downloads video, extracts frames, uploads artifacts, updates DB, and marks completed."""
    mock_service = MockSupabaseService(test_app_settings, sample_video_path=tiny_video_path)
    job_id = "550e8400-e29b-41d4-a716-446655440000"
    video_id = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

    mock_service.jobs_table[job_id] = {
        "id": job_id,
        "video_id": video_id,
        "user_id": "usr_test_123",
        "status": "queued",
        "stage": "initialized",
        "progress": 0,
    }
    mock_service.videos_table[video_id] = {
        "id": video_id,
        "user_id": "usr_test_123",
        "storage_path": "usr_test_123/vid_1/video.mp4",
        "status": "uploaded",
    }

    # Execute worker function
    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_service,
        settings=test_app_settings,
    )

    # 1. Verify job state
    job = mock_service.jobs_table[job_id]
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["stage"] == "Processing completed successfully"
    assert job["error_message"] is None
    assert job.get("completed_at") is not None

    # 2. Verify video state
    video = mock_service.videos_table[video_id]
    assert video["status"] == "ready"
    assert video["duration_seconds"] > 0
    assert video["width"] == 160
    assert video["height"] == 120
    assert video["fps"] > 0
    assert video["frame_count"] >= 1
    assert video["error_message"] is None

    # 3. Verify video_frames inserted
    assert len(mock_service.video_frames_table) >= 1
    for frame in mock_service.video_frames_table:
        assert frame["video_id"] == video_id
        assert frame["user_id"] == "usr_test_123"
        assert frame["timestamp_seconds"] >= 0.0
        assert "keyframes/frame_" in frame["storage_path"]
        assert frame["width"] == 160
        assert frame["height"] == 120

    # 4. Verify storage uploads
    assert len(mock_service.storage_uploads) == len(mock_service.video_frames_table)
    for upload in mock_service.storage_uploads:
        assert upload["bucket"] == "video-artifacts"
        assert upload["content_type"] == "image/jpeg"
        assert upload["size"] > 0


def test_worker_storage_download_failure(test_app_settings: Settings):
    """Storage download failure should record error and mark job and video failed."""
    mock_service = MockSupabaseService(test_app_settings)
    mock_service.download_fail = True

    job_id = "job-err-1"
    video_id = "vid-err-1"

    mock_service.jobs_table[job_id] = {"id": job_id, "video_id": video_id, "status": "queued"}
    mock_service.videos_table[video_id] = {"id": video_id, "user_id": "usr-1", "storage_path": "bad_path.mp4", "status": "uploaded"}

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_service,
        settings=test_app_settings,
    )

    job = mock_service.jobs_table[job_id]
    assert job["status"] == "failed"
    assert "Storage object 'bad_path.mp4' not found" in job["error_message"]

    video = mock_service.videos_table[video_id]
    assert video["status"] == "failed"
    assert "Storage object 'bad_path.mp4' not found" in video["error_message"]


def test_worker_db_write_failure_does_not_mark_completed(test_app_settings: Settings, tiny_video_path: Path):
    """If DB insert fails, job must be marked failed, never completed."""
    mock_service = MockSupabaseService(test_app_settings, sample_video_path=tiny_video_path)
    job_id = "job-db-fail"
    video_id = "vid-db-fail"

    mock_service.jobs_table[job_id] = {"id": job_id, "video_id": video_id, "status": "queued"}
    mock_service.videos_table[video_id] = {"id": video_id, "user_id": "usr-1", "storage_path": "path.mp4", "status": "uploaded"}

    # Simulate DB failure during frame insert
    mock_service.insert_frames_fail = True

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_service,
        settings=test_app_settings,
    )

    # Status must NOT be completed
    assert mock_service.jobs_table[job_id]["status"] == "failed"
    assert "Simulated database" in mock_service.jobs_table[job_id]["error_message"]


def test_supabase_unconfigured_returns_500(auth_token: str):
    """If Supabase credentials are missing on the server, endpoint returns 500."""
    unconfigured_supabase_settings = Settings(
        ENVIRONMENT="test",
        FASTAPI_INTERNAL_TOKEN=auth_token,
        SUPABASE_URL=None,
        SUPABASE_SERVICE_ROLE_KEY=None,
    )
    app = create_app(unconfigured_supabase_settings)
    app.dependency_overrides[get_settings] = lambda: unconfigured_supabase_settings

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/jobs",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"job_id": "job-1", "video_id": "vid-1"},
        )
        assert resp.status_code == 500
        assert "Server database configuration error" in resp.json()["detail"]


def test_worker_storage_upload_failure(test_app_settings: Settings, tiny_video_path: Path):
    """If uploading keyframes to storage fails, job must be marked failed, never completed."""
    mock_service = MockSupabaseService(test_app_settings, sample_video_path=tiny_video_path)
    job_id = "job-upload-fail"
    video_id = "vid-upload-fail"

    mock_service.jobs_table[job_id] = {"id": job_id, "video_id": video_id, "status": "queued"}
    mock_service.videos_table[video_id] = {"id": video_id, "user_id": "usr-1", "storage_path": "path.mp4", "status": "uploaded"}

    # Simulate storage upload failure
    mock_service.upload_fail = True

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_service,
        settings=test_app_settings,
    )

    # Status must NOT be completed
    job = mock_service.jobs_table[job_id]
    assert job["status"] == "failed"
    assert "Simulated storage upload failure" in job["error_message"]
    assert mock_service.videos_table[video_id]["status"] == "failed"


def test_worker_temp_dir_cleaned_up_on_success_and_failure(test_app_settings: Settings, tiny_video_path: Path):
    """Verify managed temporary workspace directory is purged on both success and failure."""
    created_temp_dirs: List[Path] = []

    from app.services import job_runner

    original_managed_temp = job_runner.ManagedTempDirectory

    class TrackingManagedTempDirectory(original_managed_temp):
        def __enter__(self) -> Path:
            p = super().__enter__()
            created_temp_dirs.append(p)
            return p

    # 1. Test success path
    mock_service_success = MockSupabaseService(test_app_settings, sample_video_path=tiny_video_path)
    job_id_success = "job-cleanup-success"
    video_id_success = "vid-cleanup-success"
    mock_service_success.jobs_table[job_id_success] = {"id": job_id_success, "video_id": video_id_success, "status": "queued"}
    mock_service_success.videos_table[video_id_success] = {"id": video_id_success, "user_id": "usr-1", "storage_path": "path.mp4", "status": "uploaded"}

    with patch("app.services.job_runner.ManagedTempDirectory", TrackingManagedTempDirectory):
        process_video_job(
            job_id=job_id_success,
            video_id=video_id_success,
            supabase_service=mock_service_success,
            settings=test_app_settings,
        )

    assert len(created_temp_dirs) == 1
    assert not created_temp_dirs[0].exists(), "Temporary directory was not cleaned up on success!"

    # 2. Test failure path (e.g. storage download failure)
    mock_service_fail = MockSupabaseService(test_app_settings)
    mock_service_fail.download_fail = True
    job_id_fail = "job-cleanup-fail"
    video_id_fail = "vid-cleanup-fail"
    mock_service_fail.jobs_table[job_id_fail] = {"id": job_id_fail, "video_id": video_id_fail, "status": "queued"}
    mock_service_fail.videos_table[video_id_fail] = {"id": video_id_fail, "user_id": "usr-1", "storage_path": "bad.mp4", "status": "uploaded"}

    with patch("app.services.job_runner.ManagedTempDirectory", TrackingManagedTempDirectory):
        process_video_job(
            job_id=job_id_fail,
            video_id=video_id_fail,
            supabase_service=mock_service_fail,
            settings=test_app_settings,
        )

    assert len(created_temp_dirs) == 2
    assert not created_temp_dirs[1].exists(), "Temporary directory was not cleaned up on failure!"
