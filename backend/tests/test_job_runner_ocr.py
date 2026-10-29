from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import pytest

from app.core.config import Settings
from app.schemas.ocr import BoundingBox, OcrDetection, OcrResult
from app.schemas.transcript import TranscriptResult, TranscriptSegment
from app.schemas.video import ExtractedFrame, VideoMetadata
from app.services.job_runner import process_video_job
from app.services.ocr_service import OcrService
from app.services.supabase_service import SupabaseService
from app.services.transcript_service import TranscriptService
from tests.test_jobs_api import MockSupabaseService


class MockTranscriptService(TranscriptService):
    """Stub transcript service for deterministic testing."""

    def __init__(self, segments: Optional[List[TranscriptSegment]] = None, has_audio: bool = True):
        super().__init__()
        self._segments = segments if segments is not None else [
            TranscriptSegment(start_time=0.2, end_time=1.5, text="Testing transcription", confidence=0.91),
        ]
        self._has_audio = has_audio

    def transcribe_video(self, video_path, duration_seconds=None, language=None) -> TranscriptResult:
        if not self._has_audio:
            return TranscriptResult(
                has_audio=False,
                segments=[],
                detected_language=None,
                no_audio_reason="No audio stream found",
            )
        return TranscriptResult(
            has_audio=True,
            segments=self._segments,
            detected_language="en",
            language_probability=0.98,
            model_size="base",
        )


class MockOcrService(OcrService):
    """Stub OCR service returning deterministic detections."""

    def __init__(self, detections: Optional[List[OcrDetection]] = None, raise_error: bool = False):
        super().__init__()
        self._detections = detections if detections is not None else [
            OcrDetection(
                timestamp_seconds=1.0,
                text="SERIAL-ABC-12345",
                confidence=0.96,
                bbox=BoundingBox(x_min=0.1, y_min=0.2, x_max=0.5, y_max=0.4),
                frame_index=1,
            ),
            OcrDetection(
                timestamp_seconds=1.7,
                text="PRESSURE: 45 PSI",
                confidence=0.88,
                bbox=BoundingBox(x_min=0.2, y_min=0.6, x_max=0.8, y_max=0.8),
                frame_index=2,
            ),
        ]
        self._raise_error = raise_error

    def process_keyframes(self, keyframes, frame_records=None, confidence_threshold=None) -> OcrResult:
        if self._raise_error:
            raise RuntimeError("Synthetic OCR failure")
        return OcrResult(
            detections=self._detections,
            frames_processed=len(keyframes),
            frames_with_text=len(self._detections),
            engine_name="easyocr",
        )


def _setup_job_and_video(mock_supabase: MockSupabaseService, video_id: str, job_id: str, user_id: str = "test-user-id"):
    """Helper to seed video and job records in the mock Supabase client."""
    mock_supabase.videos[video_id] = {
        "id": video_id,
        "user_id": user_id,
        "filename": "equipment_inspection.mp4",
        "storage_path": f"{user_id}/{video_id}/source.mp4",
        "status": "pending",
    }
    mock_supabase.jobs[job_id] = {
        "id": job_id,
        "video_id": video_id,
        "user_id": user_id,
        "status": "pending",
        "stage": "Job created",
        "progress": 0,
        "error_message": None,
    }


def test_job_runner_persists_ocr_and_transcripts_end_to_end(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify that both speech transcripts and OCR detections are successfully extracted and persisted."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    user_id = "user-ocr-test-01"
    _setup_job_and_video(mock_supabase, video_id, job_id, user_id=user_id)

    mock_tx = MockTranscriptService()
    mock_ocr = MockOcrService()

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_tx,
        ocr_service=mock_ocr,
    )

    # 1. Job must reach completed status with progress 100
    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["error_message"] is None

    # 2. Results summary must include transcript and OCR counts
    summary = job.get("results_summary")
    assert summary is not None
    assert summary["transcript_count"] == 1
    assert summary["ocr_count"] == 2
    assert summary["has_audio"] is True
    assert summary["has_ocr"] is True

    # 3. Video record marked 'ready'
    video = mock_supabase.get_video(video_id)
    assert video["status"] == "ready"

    # 4. Transcripts table contains persisted records
    transcripts = mock_supabase.transcripts.get(video_id, [])
    assert len(transcripts) == 1
    assert transcripts[0]["user_id"] == user_id
    assert transcripts[0]["text"] == "Testing transcription"

    # 5. OCR detections table contains persisted records
    ocr_rows = mock_supabase.ocr_detections.get(video_id, [])
    assert len(ocr_rows) == 2
    assert ocr_rows[0]["user_id"] == user_id
    assert ocr_rows[0]["text"] == "SERIAL-ABC-12345"
    assert ocr_rows[0]["confidence"] == 0.96
    assert ocr_rows[0]["bbox_x_min"] == 0.1
    assert ocr_rows[1]["text"] == "PRESSURE: 45 PSI"


def test_job_runner_video_with_ocr_text_but_no_audio(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify video with visible on-screen text but no audio completes successfully."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Silent video
    mock_tx = MockTranscriptService(has_audio=False)
    mock_ocr = MockOcrService()

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_tx,
        ocr_service=mock_ocr,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["results_summary"]["has_audio"] is False
    assert job["results_summary"]["has_ocr"] is True
    assert job["results_summary"]["ocr_count"] == 2
    assert len(mock_supabase.transcripts.get(video_id, [])) == 0
    assert len(mock_supabase.ocr_detections.get(video_id, [])) == 2


def test_job_runner_video_with_audio_but_no_ocr_text(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify video with speech but no visible on-screen text completes successfully."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    mock_tx = MockTranscriptService(has_audio=True)
    # Empty OCR detections
    mock_ocr = MockOcrService(detections=[])

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=mock_tx,
        ocr_service=mock_ocr,
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert job["results_summary"]["has_audio"] is True
    assert job["results_summary"]["has_ocr"] is False
    assert job["results_summary"]["transcript_count"] == 1
    assert job["results_summary"]["ocr_count"] == 0
    assert len(mock_supabase.transcripts.get(video_id, [])) == 1
    assert len(mock_supabase.ocr_detections.get(video_id, [])) == 0


def test_job_runner_retry_idempotency_cleans_up_old_ocr_detections(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify retrying a job completely replaces prior OCR records without duplicating rows."""
    video_id = str(uuid.uuid4())
    job_id_1 = str(uuid.uuid4())
    job_id_2 = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id_1)

    det_run1 = [
        OcrDetection(timestamp_seconds=1.0, text="RUN 1 OLD TEXT", confidence=0.8)
    ]
    det_run2 = [
        OcrDetection(timestamp_seconds=1.0, text="RUN 2 NEW TEXT", confidence=0.95),
        OcrDetection(timestamp_seconds=2.0, text="RUN 2 SECOND TEXT", confidence=0.91),
    ]

    # Run 1
    process_video_job(
        job_id=job_id_1,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
        ocr_service=MockOcrService(detections=det_run1),
    )
    assert len(mock_supabase.ocr_detections[video_id]) == 1
    assert mock_supabase.ocr_detections[video_id][0]["text"] == "RUN 1 OLD TEXT"

    # Seed Run 2
    mock_supabase.jobs[job_id_2] = {
        "id": job_id_2,
        "video_id": video_id,
        "user_id": "test-user-id",
        "status": "pending",
        "stage": "Job created",
        "progress": 0,
        "error_message": None,
    }

    # Run 2 (retry)
    process_video_job(
        job_id=job_id_2,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
        ocr_service=MockOcrService(detections=det_run2),
    )

    # Must contain only Run 2 detections (no stale Run 1 rows)
    current_ocr = mock_supabase.ocr_detections[video_id]
    assert len(current_ocr) == 2
    assert current_ocr[0]["text"] == "RUN 2 NEW TEXT"
    assert current_ocr[1]["text"] == "RUN 2 SECOND TEXT"


def test_job_runner_fails_honestly_when_database_write_fails(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify job reports honest failure status if OCR database persistence throws an error."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Simulate database insert failure
    def failing_insert_ocr(*args, **kwargs):
        raise RuntimeError("Database connection refused during OCR persistence")

    mock_supabase.insert_ocr_detections = failing_insert_ocr

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
        ocr_service=MockOcrService(),
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "failed"
    assert "Database connection refused" in job["error_message"]
    assert "Processing failed" in job["stage"]

    video = mock_supabase.get_video(video_id)
    assert video["status"] == "failed"


def test_insert_ocr_detections_validates_user_id_ownership():
    """Verify insert_ocr_detections refuses to persist records with missing user_id."""
    svc = SupabaseService()
    invalid_records = [
        {"video_id": str(uuid.uuid4()), "user_id": "", "text": "NO_USER_ID", "timestamp_seconds": 1.0}
    ]

    with pytest.raises(ValueError, match="invalid or missing user_id"):
        svc.insert_ocr_detections(invalid_records, video_id=str(uuid.uuid4()))


def test_migration_sql_ocr_security_invoker_and_role_grants():
    """Verify the OCR reconciliation migration SQL enforces SECURITY INVOKER and grants ONLY to service_role."""
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261029213000_reconcile_ocr_schema.sql"
    assert migration_path.exists(), "Migration file 20261029213000_reconcile_ocr_schema.sql does not exist"
    sql = migration_path.read_text(encoding="utf-8")

    # 1. Function must be SECURITY INVOKER
    assert "SECURITY INVOKER" in sql
    assert "SECURITY DEFINER" not in sql

    # 2. search_path must be locked
    assert "search_path = public, pg_temp" in sql

    # 3. Explicit revocation from unprivileged roles
    assert "REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM PUBLIC;" in sql
    assert "REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM anon;" in sql
    assert "REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM authenticated;" in sql

    # 4. Granted exclusively to service_role
    assert "GRANT EXECUTE ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) TO service_role;" in sql

    # 5. Explicitly adds all required columns additively
    assert "ADD COLUMN IF NOT EXISTS confidence REAL" in sql
    assert "ADD COLUMN IF NOT EXISTS bbox_x_min REAL" in sql
    assert "ADD COLUMN IF NOT EXISTS bbox_y_min REAL" in sql
    assert "ADD COLUMN IF NOT EXISTS bbox_x_max REAL" in sql
    assert "ADD COLUMN IF NOT EXISTS bbox_y_max REAL" in sql
    assert "ADD COLUMN IF NOT EXISTS job_id UUID" in sql


def test_job_runner_degraded_schema_with_multiple_missing_ocr_columns(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify job runner gracefully survives 5 missing columns (bbox + confidence) and records degradation."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    # Simulate 5 columns missing from live schema: all 4 bounding box fields + confidence
    mock_supabase.simulate_degraded_columns = [
        "bbox_x_min", "bbox_x_max", "bbox_y_min", "bbox_y_max", "confidence"
    ]

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
        ocr_service=MockOcrService(),
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert "schema degradation" in job["stage"]
    assert "confidence" in job["stage"]
    assert "Warning: Columns" in job["error_message"]
    assert "Apply migration" in job["error_message"]
    assert "20261029213000_reconcile_ocr_schema.sql" in job["error_message"]


def test_insert_ocr_detections_pgrst204_sequential_column_recovery():
    """Verify insert_ocr_detections recovers from sequential PGRST204 errors without crashing on attempt 5."""
    svc = SupabaseService()

    missing_cols_queue = ["bbox_x_min", "bbox_x_max", "bbox_y_min", "bbox_y_max", "confidence"]

    class MockTableClient:
        def __init__(self):
            self.inserted = None

        def delete(self):
            return self

        def eq(self, *args, **kwargs):
            return self

        def neq(self, *args, **kwargs):
            return self

        def insert(self, payload):
            if missing_cols_queue:
                col = missing_cols_queue.pop(0)
                # Simulate PostgREST PGRST204 error
                raise RuntimeError(f"Could not find the '{col}' column of 'ocr_detections' in the schema cache (PGRST204)")
            self.inserted = payload
            return self

        def execute(self):
            class Response:
                data = [{"id": str(uuid.uuid4())}]
            return Response()

    class MockClient:
        def rpc(self, *args, **kwargs):
            raise RuntimeError("RPC replace_ocr_detections_atomic unavailable")

        def table(self, name):
            return MockTableClient()

    svc._client = MockClient()

    records = [
        {
            "video_id": str(uuid.uuid4()),
            "user_id": str(uuid.uuid4()),
            "job_id": str(uuid.uuid4()),
            "timestamp_seconds": 1.5,
            "text": "MOTOR-MODEL-Z",
            "confidence": 0.95,
            "bbox_x_min": 0.1,
            "bbox_y_min": 0.2,
            "bbox_x_max": 0.5,
            "bbox_y_max": 0.6,
        }
    ]

    # Should not raise; should succeed after popping all 5 missing columns
    result = svc.insert_ocr_detections(records, video_id=records[0]["video_id"])
    assert result is not None
    assert "confidence" in svc.last_degraded_columns
    assert "bbox_x_min" in svc.last_degraded_columns
    assert len(svc.last_degraded_columns) == 5


def test_results_summary_successful_persistence(
    test_settings: Settings, mock_supabase: MockSupabaseService
):
    """Verify results_summary is completely persisted with all metadata when column exists."""
    video_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    _setup_job_and_video(mock_supabase, video_id, job_id)

    process_video_job(
        job_id=job_id,
        video_id=video_id,
        supabase_service=mock_supabase,
        settings=test_settings,
        transcript_service=MockTranscriptService(),
        ocr_service=MockOcrService(),
    )

    job = mock_supabase.get_job(job_id)
    assert job["status"] == "completed"
    assert job["results_summary"] is not None
    assert job["results_summary"]["transcript_count"] == 1
    assert job["results_summary"]["ocr_count"] == 2
    assert job["results_summary"]["has_audio"] is True
    assert job["results_summary"]["has_ocr"] is True
    assert job["results_summary"]["languages_detected"] == ["en"]


def test_results_summary_pgrst204_missing_column_fallback():
    """Verify update_job catches PGRST204 for missing results_summary column and retries cleanly."""
    svc = SupabaseService()
    job_id = str(uuid.uuid4())

    first_call = True

    class MockJobTable:
        def update(self, payload):
            nonlocal first_call
            if first_call:
                first_call = False
                raise RuntimeError("Could not find the 'results_summary' column of 'processing_jobs' in the schema cache (PGRST204)")
            # Second call should not have results_summary
            assert "results_summary" not in payload
            self.saved_payload = payload
            return self

        def eq(self, col, val):
            return self

        def execute(self):
            class Resp:
                data = [{"id": job_id, "status": "completed"}]
            return Resp()

    class MockClient:
        def table(self, name):
            return MockJobTable()

    svc._client = MockClient()

    updated = svc.update_job(
        job_id=job_id,
        status="completed",
        stage="Processing completed successfully",
        progress=100,
        results_summary={"transcript_count": 5, "ocr_count": 3},
    )

    assert updated["status"] == "completed"
    assert updated["results_summary"] is None
    assert "results_summary" in svc.last_degraded_columns


def test_migration_sql_processing_jobs_reconciliation():
    """Verify the processing_jobs reconciliation migration adds results_summary JSONB safely."""
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261029224500_reconcile_processing_jobs_schema.sql"
    assert migration_path.exists(), "Migration file 20261029224500_reconcile_processing_jobs_schema.sql does not exist"
    sql = migration_path.read_text(encoding="utf-8")

    # 1. Additive column definition with JSONB type
    assert "ADD COLUMN IF NOT EXISTS results_summary JSONB" in sql

    # 2. No unneeded extensions or unneeded GIN index
    assert "CREATE EXTENSION" not in sql
    assert "USING GIN" not in sql

    # 3. PostgREST schema cache notification
    assert "NOTIFY pgrst, 'reload schema';" in sql

