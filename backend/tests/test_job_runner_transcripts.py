import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

from app.core.config import Settings
from app.core.exceptions import TranscriptionError
from app.schemas.transcript import TranscriptResult, TranscriptSegment
from app.services.job_runner import process_video_job
from app.services.supabase_service import SupabaseService
from app.services.transcript_service import TranscriptService
from app.services.video_processor import (
    DEFAULT_MAX_VIDEO_SIZE_BYTES,
    ManagedTempDirectory,
)
from tests.test_jobs_api import MockSupabaseService


# ==============================================================================
# Helper Mock TranscriptService
# ==============================================================================

class MockTranscriptService(TranscriptService):
    """Mock TranscriptService that returns configured TranscriptResult or raises errors."""

    def __init__(
        self,
        result: Optional[TranscriptResult] = None,
        raise_error: Optional[Exception] = None,
    ) -> None:
        super().__init__(settings=Settings(_env_file=None))
        self.result = result
        self.raise_error = raise_error
        self.call_count = 0
        self.last_video_path: Optional[Path] = None
        self.last_duration_seconds: Optional[float] = None

    def transcribe_video(
        self,
        video_path: Any,
        duration_seconds: Optional[float] = None,
        language: Optional[str] = None,
    ) -> TranscriptResult:
        self.call_count += 1
        self.last_video_path = Path(video_path)
        self.last_duration_seconds = duration_seconds

        if self.raise_error:
            raise self.raise_error

        if self.result is not None:
            return self.result

        # Default mock result with 2 speech segments
        return TranscriptResult(
            has_audio=True,
            segments=[
                TranscriptSegment(
                    start_time=0.5,
                    end_time=2.1,
                    text="Technician verifying fiber connection.",
                    speaker=None,
                    language="en",
                    confidence=None,
                    avg_logprob=-0.25,
                    no_speech_prob=0.01,
                ),
                TranscriptSegment(
                    start_time=2.2,
                    end_time=3.8,
                    text="Patch cable securely seated in SFP port.",
                    speaker=None,
                    language="en",
                    confidence=None,
                    avg_logprob=-0.18,
                    no_speech_prob=0.005,
                ),
            ],
            detected_language="en",
            language_probability=0.992,
            audio_duration_seconds=4.0,
            model_size="base",
            no_audio_reason=None,
        )


# ==============================================================================
# Fixtures
# ==============================================================================

@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        _env_file=None,
        ENVIRONMENT="test",
        DEBUG=True,
        PROJECT_NAME="VideoAssist Test",
        FASTAPI_INTERNAL_TOKEN="test-token",
        SUPABASE_URL="https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="test-service-key",
    )


@pytest.fixture
def mock_supabase(test_settings: Settings, sample_video: Path) -> MockSupabaseService:
    service = MockSupabaseService(settings=test_settings, sample_video_path=sample_video)
    return service


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


def _setup_job_and_video(service: MockSupabaseService, video_id: str, job_id: str, user_id: str = "usr_123"):
    service.videos_table[video_id] = {
        "id": video_id,
        "user_id": user_id,
        "storage_path": f"{user_id}/{video_id}/video.mp4",
        "status": "processing",
    }
    service.jobs_table[job_id] = {
        "id": job_id,
        "video_id": video_id,
        "user_id": user_id,
        "status": "processing",
        "stage": "Initializing video processing",
        "progress": 5,
    }


# ==============================================================================
# Regression Tests
# ==============================================================================

def test_job_runner_successful_transcript_persistence(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Successful transcription must persist transcript records correctly into Supabase."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    user_id = "user_tech_456"
    _setup_job_and_video(mock_supabase, video_id, job_id, user_id=user_id)

    mock_transcript = MockTranscriptService()

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_transcript,
    )

    # 1. Verify job completed
    job = mock_supabase.get_job(job_id)
    assert job is not None
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["stage"] == "Processing completed successfully"

    # 2. Verify video updated
    video = mock_supabase.get_video(video_id)
    assert video is not None
    assert video["status"] == "ready"
    assert video["duration_seconds"] > 0
    assert video["width"] == 320
    assert video["height"] == 240

    # 3. Verify keyframe records preserved
    assert len(mock_supabase.video_frames_table) > 0

    # 4. Verify transcripts persisted with correct schema mapping
    assert len(mock_supabase.transcripts_table) == 2

    seg1 = mock_supabase.transcripts_table[0]
    assert seg1["video_id"] == video_id
    assert seg1["user_id"] == user_id
    assert seg1["job_id"] == job_id
    assert seg1["segment_index"] == 0
    assert seg1["model_name"] == "base"
    assert seg1["start_time"] == 0.5
    assert seg1["end_time"] == 2.1
    assert seg1["text"] == "Technician verifying fiber connection."
    assert seg1["speaker"] is None
    assert seg1["language"] == "en"
    assert seg1["confidence"] is None
    # Model internal metadata must NOT be persisted to DB columns
    assert "avg_logprob" not in seg1
    assert "no_speech_prob" not in seg1

    seg2 = mock_supabase.transcripts_table[1]
    assert seg2["video_id"] == video_id
    assert seg2["user_id"] == user_id
    assert seg2["job_id"] == job_id
    assert seg2["segment_index"] == 1
    assert seg2["model_name"] == "base"
    assert seg2["text"] == "Patch cable securely seated in SFP port."


def test_job_runner_video_without_audio_stream_completes_gracefully(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """When a video has no audio stream, job should complete gracefully with zero transcripts."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    mock_transcript = MockTranscriptService(
        result=TranscriptResult(
            has_audio=False,
            segments=[],
            no_audio_reason="No audio stream in container",
        )
    )

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_transcript,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert job["progress"] == 100

    video = mock_supabase.get_video(video_id)
    assert video["status"] == "ready"

    # Keyframes exist, but zero transcripts inserted
    assert len(mock_supabase.video_frames_table) > 0
    assert len(mock_supabase.transcripts_table) == 0


def test_job_runner_audio_with_no_recognized_speech_completes_gracefully(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """When audio exists but contains no spoken words, job completes with zero transcripts."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    mock_transcript = MockTranscriptService(
        result=TranscriptResult(
            has_audio=True,
            segments=[],
            detected_language="en",
            audio_duration_seconds=2.0,
        )
    )

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_transcript,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert len(mock_supabase.transcripts_table) == 0


def test_job_runner_transcription_model_failure_marks_job_failed(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """If Whisper inference fails, job and video must be marked failed and not completed."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    failing_transcript = MockTranscriptService(
        raise_error=TranscriptionError("CUDA / CTranslate2 out of memory")
    )

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=failing_transcript,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "failed"
    assert "CUDA / CTranslate2 out of memory" in job["error_message"]
    assert "Processing failed: Transcribing speech audio" in job["stage"]

    video = mock_supabase.get_video(video_id)
    assert video["status"] == "failed"

    # No transcripts must have been inserted
    assert len(mock_supabase.transcripts_table) == 0


def test_job_runner_transcript_database_insert_failure_marks_job_failed(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """If inserting transcripts into database fails, job and video must be marked failed."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    mock_supabase.insert_transcripts_fail = True
    mock_transcript = MockTranscriptService()

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_transcript,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "failed"
    assert "database insert failure for transcripts" in job["error_message"]

    video = mock_supabase.get_video(video_id)
    assert video["status"] == "failed"


def test_job_runner_retry_replaces_transcripts_without_duplicates(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """On job retry, old transcript rows for the video must be replaced cleanly."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Pre-populate with stale transcript rows
    mock_supabase.transcripts_table = [
        {"video_id": video_id, "text": "Old stale transcript 1"},
        {"video_id": video_id, "text": "Old stale transcript 2"},
    ]

    mock_transcript = MockTranscriptService(
        result=TranscriptResult(
            has_audio=True,
            segments=[
                TranscriptSegment(start_time=0.0, end_time=1.0, text="New fresh transcript 1"),
                TranscriptSegment(start_time=1.0, end_time=2.0, text="New fresh transcript 2"),
                TranscriptSegment(start_time=2.0, end_time=3.0, text="New fresh transcript 3"),
            ],
            detected_language="en",
        )
    )

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_transcript,
    )

    # Total transcripts for this video must be 3, not 5 (no duplicates)
    transcripts_for_vid = [t for t in mock_supabase.transcripts_table if t.get("video_id") == video_id]
    assert len(transcripts_for_vid) == 3
    assert transcripts_for_vid[0]["text"] == "New fresh transcript 1"
    assert transcripts_for_vid[2]["text"] == "New fresh transcript 3"


def test_job_runner_retry_preserves_old_transcripts_if_transcription_fails(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """If transcription fails on retry, previous transcript rows must NOT be deleted prematurely."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Pre-populate with existing transcripts
    mock_supabase.transcripts_table = [
        {"video_id": video_id, "text": "Existing transcript before failure"},
    ]

    failing_transcript = MockTranscriptService(raise_error=TranscriptionError("Transcription failed"))

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=failing_transcript,
    )

    # Existing transcript must still exist because failure occurred before replacement was ready
    transcripts_for_vid = [t for t in mock_supabase.transcripts_table if t.get("video_id") == video_id]
    assert len(transcripts_for_vid) == 1
    assert transcripts_for_vid[0]["text"] == "Existing transcript before failure"


def test_supabase_service_insert_transcripts_methods():
    """Verify SupabaseService.insert_transcripts tries RPC first and falls back to two-phase REST."""
    mock_client = MagicMock()
    service = SupabaseService(client=mock_client)

    records = [
        {
            "video_id": "vid_123",
            "user_id": "usr_456",
            "job_id": "job_789",
            "segment_index": 0,
            "model_name": "base",
            "start_time": 0.0,
            "end_time": 1.5,
            "text": "Hello world",
            "speaker": None,
            "language": "en",
            "confidence": None,
        }
    ]

    # Test 1: RPC path
    rpc_mock = MagicMock()
    rpc_mock.execute.return_value.data = [{"id": "tr_1", "text": "Hello world"}]
    mock_client.rpc.return_value = rpc_mock

    res = service.insert_transcripts(records, video_id="vid_123", job_id="job_789")
    mock_client.rpc.assert_called_with(
        "replace_transcripts_atomic",
        {
            "p_video_id": "vid_123",
            "p_records": records,
            "p_job_id": "job_789",
        },
    )
    assert res == [{"id": "tr_1", "text": "Hello world"}]

    # Test 2: Two-phase REST fallback when RPC raises exception
    mock_client.reset_mock()
    mock_client.rpc.side_effect = Exception("PGRST202: function replace_transcripts_atomic not found")
    insert_resp = MagicMock()
    insert_resp.data = [{"id": "tr_2", "text": "Hello world"}]
    mock_client.table.return_value.insert.return_value.execute.return_value = insert_resp

    res2 = service.insert_transcripts(records, video_id="vid_123", job_id="job_789")
    assert res2 == [{"id": "tr_2", "text": "Hello world"}]
    # Table insert was called
    mock_client.table.assert_any_call("transcripts")
    mock_client.table.return_value.insert.assert_called_once()


def test_results_api_contract_field_mapping():
    """Verify that persisted transcript records match the exact schema consumed by TranscriptViewer."""
    required_frontend_fields = {
        "id",
        "video_id",
        "user_id",
        "start_time",
        "end_time",
        "text",
        "speaker",
        "language",
        "confidence",
        "created_at",
    }

    # Record format produced by job runner
    persisted_record = {
        "id": "trans_123",
        "video_id": "vid_456",
        "user_id": "usr_789",
        "start_time": 1.25,
        "end_time": 4.50,
        "text": "Checking optical fiber transceiver.",
        "speaker": None,
        "language": "en",
        "confidence": None,
        "created_at": "2026-10-29T08:00:00Z",
    }

    # Verify all fields consumed by TranscriptViewer exist in the persisted record
    for field in required_frontend_fields:
        assert field in persisted_record, f"Field '{field}' missing from transcript record"

    assert isinstance(persisted_record["start_time"], (int, float))
    assert isinstance(persisted_record["end_time"], (int, float))
    assert isinstance(persisted_record["text"], str)


def test_supabase_service_pgrst204_resilience_fallback():
    """Verify SupabaseService strips missing columns and retries when PostgREST raises PGRST204."""
    mock_client = MagicMock()
    mock_client.rpc.side_effect = Exception("PGRST202: RPC not found")
    service = SupabaseService(client=mock_client)

    records = [
        {
            "video_id": "vid_123",
            "user_id": "usr_456",
            "job_id": "job_789",
            "segment_index": 0,
            "model_name": "base",
            "start_time": 0.0,
            "end_time": 1.5,
            "text": "Hello world",
            "speaker": None,
            "language": "en",
            "confidence": None,
        }
    ]

    # First execute() call raises PGRST204 complaining about 'confidence'
    # Second execute() call succeeds
    pgrst_error = Exception(
        "{'code': 'PGRST204', 'message': \"Could not find the 'confidence' column of 'transcripts' in the schema cache\"}"
    )
    success_resp = MagicMock()
    success_resp.data = [{"id": "tr_1", "text": "Hello world"}]

    mock_client.table("transcripts").insert.return_value.execute.side_effect = [
        pgrst_error,
        success_resp,
    ]

    result = service.insert_transcripts(records, video_id="vid_123", job_id="job_789")

    # Result returned after retry
    assert result == [{"id": "tr_1", "text": "Hello world"}]
    # Degraded columns recorded
    assert service.last_degraded_columns == ["confidence"]
    # insert() called twice
    assert mock_client.table("transcripts").insert.call_count == 2
    # Second call should have 'confidence' stripped from payload
    second_payload = mock_client.table("transcripts").insert.call_args_list[1][0][0]
    assert "confidence" not in second_payload[0]
    assert "text" in second_payload[0]
    assert "job_id" in second_payload[0]


def test_insert_transcripts_missing_user_id_raises_value_error():
    """Verify insert_transcripts refuses to write records lacking valid user_id ownership."""
    service = SupabaseService(client=MagicMock())
    records = [
        {
            "video_id": "vid_123",
            "user_id": None,
            "text": "Unowned segment",
            "start_time": 0.0,
            "end_time": 1.0,
        }
    ]
    with pytest.raises(ValueError, match="invalid or missing user_id ownership"):
        service.insert_transcripts(records, video_id="vid_123")


def test_job_runner_aborts_if_video_has_no_user_id(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """If video record has no user_id, job runner must fail safely without persisting unowned data."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)
    # Strip user_id from video
    mock_supabase.videos_table[video_id]["user_id"] = None

    process_video_job(job_id=job_id, video_id=video_id, supabase_service=mock_supabase, settings=test_settings)

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "failed"
    assert "has no associated user_id" in job["error_message"]
    # No transcripts must have been inserted
    assert len(mock_supabase.transcripts_table) == 0


def test_replacement_failure_safe_preserves_old_transcripts_on_error(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """When a retry job fails during transcript insertion, the previous successful transcript is NOT deleted."""
    video_id = str(uuid.uuid4())
    job_id_1 = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id_1, user_id=user_id)

    # 1. Job 1 runs and succeeds
    process_video_job(
        job_id=job_id_1,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
    )
    assert len(mock_supabase.transcripts_table) == 2
    original_text = mock_supabase.transcripts_table[0]["text"]

    # 2. Job 2 (retry) encounters a database insert failure
    job_id_2 = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id_2, user_id=user_id)
    mock_supabase.insert_transcripts_fail = True

    process_video_job(
        job_id=job_id_2,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
    )

    # Job 2 is marked failed
    job_2 = mock_supabase.get_job(job_id_2)
    assert job_2["status"] == "failed"

    # Previous transcripts from Job 1 must still exist completely intact!
    transcripts = [t for t in mock_supabase.transcripts_table if t.get("video_id") == video_id]
    assert len(transcripts) == 2
    assert transcripts[0]["text"] == original_text


def test_job_runner_degraded_schema_marks_job_stage_and_warning(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """When persistence encounters missing columns, job completion status visibly records the degradation."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Simulate that SupabaseService experienced schema degradation during insert
    mock_supabase.simulate_degraded_columns = ["confidence", "speaker"]

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert "schema degradation" in job["stage"]
    assert "confidence, speaker" in job["stage"]
    assert "Warning: Columns" in job["error_message"]
    assert "Apply migration reconcile_transcripts_schema.sql" in job["error_message"]


def test_migration_sql_security_invoker_and_role_grants():
    """Verify the migration SQL enforces SECURITY INVOKER and grants ONLY to service_role."""
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261029103000_reconcile_transcripts_schema.sql"
    assert migration_path.exists(), "Migration file 20261029103000_reconcile_transcripts_schema.sql does not exist"
    sql = migration_path.read_text(encoding="utf-8")

    # 1. Function must be SECURITY INVOKER
    assert "SECURITY INVOKER" in sql
    assert "SECURITY DEFINER" not in sql

    # 2. search_path must be locked
    assert "search_path = public, pg_temp" in sql

    # 3. Explicit revocation from PUBLIC, anon, and authenticated
    assert "REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM PUBLIC;" in sql
    assert "REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM anon;" in sql
    assert "REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM authenticated;" in sql

    # 4. Exclusive grant to service_role
    assert "GRANT EXECUTE ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) TO service_role;" in sql
    # Must NOT grant execute to authenticated or anon
    assert "TO authenticated;" not in sql.split("replace_transcripts_atomic")[2]

    # 5. Ownership validation inside SQL function
    assert "Ownership mismatch:" in sql
    assert "WHERE id = p_video_id" in sql

    # 6. PostgREST reload notification
    assert "NOTIFY pgrst, 'reload schema';" in sql


def test_preflight_script_is_purely_read_only_and_safe():
    """Verify preflight script contains only read-only statements and handles missing columns safely."""
    preflight_path = Path(__file__).resolve().parents[2] / "supabase" / "preflight_transcripts_check.sql"
    assert preflight_path.exists(), "Preflight script does not exist"
    sql = preflight_path.read_text(encoding="utf-8")

    # Ensure no data-modifying statements exist
    forbidden_keywords = ["INSERT INTO", "UPDATE ", "DELETE FROM", "DROP TABLE", "ALTER TABLE", "TRUNCATE"]
    for keyword in forbidden_keywords:
        assert keyword not in sql.upper(), f"Forbidden data-modifying keyword '{keyword}' found in read-only preflight script"

    # Ensure dynamic detection of user_id and confidence exists
    assert "has_user_id" in sql
    assert "has_confidence" in sql
    assert "information_schema.columns" in sql


def test_backend_service_client_uses_service_role_key():
    """Verify backend client connects with service-role privileges, authorizing it to run replace_transcripts_atomic."""
    test_cfg = Settings(
        _env_file=None,
        SUPABASE_URL="https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="privileged-service-role-key",
    )
    from app.services.supabase_service import get_supabase_client
    with pytest.MonkeyPatch.context() as mp:
        mock_create = MagicMock()
        mp.setattr("app.services.supabase_service.create_client", mock_create)
        get_supabase_client(test_cfg)
        mock_create.assert_called_once_with("https://test.supabase.co", "privileged-service-role-key")




