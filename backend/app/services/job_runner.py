from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import Settings, get_settings
from app.services.supabase_service import SupabaseService
from app.services.transcript_service import TranscriptService
from app.services.video_processor import (
    ManagedTempDirectory,
    extract_keyframes,
    extract_video_metadata,
)
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.job_runner")


def _update_stage(
    service: SupabaseService,
    job_id: str,
    stage: str,
    progress: int,
) -> None:
    """Helper to log stage transition and persist update to database."""
    logger.info("Job %s -> Stage: '%s' (%d%%)", job_id, stage, progress)
    service.update_job(
        job_id=job_id,
        stage=stage,
        progress=progress,
    )


def process_video_job(
    job_id: str,
    video_id: str,
    supabase_service: Optional[SupabaseService] = None,
    settings: Optional[Settings] = None,
    transcript_service: Optional[TranscriptService] = None,
) -> None:
    """Execute asynchronous end-to-end video preprocessing in a background worker task.

    Pipeline Stages:
    1. Verify records and mark status='processing' (5%)
    2. Download source video from private bucket 'field-service-videos' (15%)
    3. Extract metadata using FFprobe (25%)
    4. Extract up to 3 representative keyframes using FFmpeg (40%)
    5. Upload keyframes to private bucket 'video-artifacts' (55%)
    6. Transcribe speech audio using faster-whisper (70%)
    7. Persist metadata, keyframes, and transcripts to database (85%)
    8. Mark processing_jobs status='completed' (100%)
    """
    cfg = settings or get_settings()
    service = supabase_service or SupabaseService(settings=cfg)
    tx_service = transcript_service or TranscriptService(settings=cfg)
    current_stage = "Initializing video processing"

    logger.info("Starting background processing for job=%s, video=%s", job_id, video_id)

    try:
        # 1. Mark processing started in both tables
        now_iso = datetime.now(timezone.utc).isoformat()
        service.update_job(
            job_id=job_id,
            status="processing",
            stage=current_stage,
            progress=5,
            started_at=now_iso,
        )
        service.update_video(
            video_id=video_id,
            status="processing",
        )

        # 2. Retrieve video record and storage path
        video = service.get_video(video_id)
        if not video:
            raise ValueError(f"Video '{video_id}' not found in database.")

        storage_path = video.get("storage_path")
        if not storage_path or not str(storage_path).strip():
            raise ValueError(f"Video '{video_id}' has no storage_path recorded in database.")

        raw_user_id = video.get("user_id")
        if not raw_user_id or str(raw_user_id).strip().lower() in ("", "none"):
            raise ValueError(f"Video '{video_id}' has no associated user_id.")
        user_id = str(raw_user_id).strip()

        # 3. Managed Temporary Staging Workspace
        with ManagedTempDirectory(prefix=f"va_job_{job_id[:8]}_") as temp_dir:
            current_stage = "Downloading video from private storage"
            _update_stage(service, job_id, current_stage, progress=15)

            # Preserve extension or default to .mp4
            ext = Path(storage_path).suffix or ".mp4"
            local_video_path = temp_dir / f"source_video{ext}"

            service.download_file(
                bucket_name=cfg.STORAGE_BUCKET_VIDEOS,
                storage_path=storage_path,
                destination_path=local_video_path,
            )

            # 4. Extract Video Metadata
            current_stage = "Extracting video metadata"
            _update_stage(service, job_id, current_stage, progress=25)

            metadata = extract_video_metadata(
                video_path=local_video_path,
                max_size_bytes=cfg.MAX_VIDEO_SIZE_BYTES,
            )

            # 5. Extract Representative Keyframes
            current_stage = "Extracting representative keyframes"
            _update_stage(service, job_id, current_stage, progress=40)

            keyframes_dir = temp_dir / "keyframes"
            keyframes = extract_keyframes(
                video_path=local_video_path,
                output_dir=keyframes_dir,
                max_keyframes=3,
                metadata=metadata,
            )

            # 6. Upload Keyframes to private 'video-artifacts' storage
            current_stage = "Uploading keyframes to private artifact storage"
            _update_stage(service, job_id, current_stage, progress=55)

            frame_records = []
            for frame in keyframes:
                frame_filename = Path(frame.frame_path).name
                artifact_path = f"{user_id}/{video_id}/keyframes/{frame_filename}"

                service.upload_file(
                    bucket_name=cfg.STORAGE_BUCKET_ARTIFACTS,
                    storage_path=artifact_path,
                    file_path=Path(frame.frame_path),
                    content_type="image/jpeg",
                )

                frame_records.append(
                    {
                        "video_id": video_id,
                        "user_id": user_id,
                        "timestamp_seconds": frame.timestamp_seconds,
                        "storage_path": artifact_path,
                        "width": frame.width,
                        "height": frame.height,
                    }
                )

            # 7. Transcribe Speech Audio
            current_stage = "Transcribing speech audio"
            _update_stage(service, job_id, current_stage, progress=70)

            transcript_result = tx_service.transcribe_video(
                video_path=local_video_path,
                duration_seconds=metadata.duration_seconds,
            )

            transcript_records = []
            if transcript_result.has_audio and transcript_result.segments:
                for idx, seg in enumerate(transcript_result.segments):
                    transcript_records.append(
                        {
                            "video_id": video_id,
                            "user_id": user_id,
                            "job_id": job_id,
                            "segment_index": idx,
                            "model_name": transcript_result.model_size or "whisper",
                            "start_time": seg.start_time,
                            "end_time": seg.end_time,
                            "text": seg.text,
                            "speaker": seg.speaker,
                            "language": seg.language or transcript_result.detected_language,
                            "confidence": seg.confidence,
                        }
                    )

            # 8. Persist Database Records
            current_stage = "Persisting metadata, keyframes, and transcripts"
            _update_stage(service, job_id, current_stage, progress=85)

            # Insert into public.video_frames
            if frame_records:
                service.insert_video_frames(frame_records)

            # Insert into public.transcripts (replacing prior rows for this video to ensure retry idempotency)
            service.insert_transcripts(transcript_records, video_id=video_id, job_id=job_id)

            # Update public.videos with extracted stream metrics
            service.update_video(
                video_id=video_id,
                status="ready",
                duration_seconds=metadata.duration_seconds,
                width=metadata.width,
                height=metadata.height,
                fps=metadata.fps,
                frame_count=metadata.frame_count,
                error_message=None,
            )

            # 9. Mark processing_jobs status='completed' only after writes succeed
            completed_iso = datetime.now(timezone.utc).isoformat()
            if service.last_degraded_columns:
                degraded_str = ", ".join(service.last_degraded_columns)
                logger.warning(
                    "Job %s completed with degraded transcript persistence (missing columns: %s)",
                    job_id,
                    degraded_str,
                )
                service.update_job(
                    job_id=job_id,
                    status="completed",
                    stage=f"Processing completed with schema degradation (missing columns: {degraded_str})",
                    progress=100,
                    error_message=f"Warning: Columns {service.last_degraded_columns} missing in public.transcripts. Apply migration 20261029103000_reconcile_transcripts_schema.sql to persist full metadata.",
                    completed_at=completed_iso,
                )
            else:
                service.update_job(
                    job_id=job_id,
                    status="completed",
                    stage="Processing completed successfully",
                    progress=100,
                    error_message=None,
                    completed_at=completed_iso,
                )
                logger.info("Job %s -> Stage: 'Processing completed successfully' (100%%)", job_id)

        logger.info(
            "Job %s for video %s completed successfully with %d keyframes and %d transcript segments.",
            job_id,
            video_id,
            len(frame_records),
            len(transcript_records),
        )

    except Exception as err:
        safe_error = sanitize_url_or_path(str(err))
        logger.error(
            "Failed background video processing for job=%s, video=%s at stage '%s': %s",
            job_id,
            video_id,
            current_stage,
            safe_error,
        )

        completed_iso = datetime.now(timezone.utc).isoformat()
        try:
            service.update_job(
                job_id=job_id,
                status="failed",
                stage=f"Processing failed: {current_stage}",
                error_message=safe_error,
                completed_at=completed_iso,
            )
            service.update_video(
                video_id=video_id,
                status="failed",
                error_message=safe_error,
            )
        except Exception as db_err:
            logger.critical(
                "Failed to update error status in database for job=%s: %s",
                job_id,
                sanitize_url_or_path(str(db_err)),
            )
