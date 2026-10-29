import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from supabase import Client, create_client

from app.core.config import Settings, get_settings
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.supabase_service")


def get_supabase_client(settings: Optional[Settings] = None) -> Client:
    """Create and return a Supabase client using privileged service-role credentials.

    Raises:
        RuntimeError: If Supabase URL or service role key is not configured.
    """
    cfg = settings or get_settings()
    if not cfg.is_supabase_configured:
        logger.error("Attempted to initialize Supabase client without valid credentials.")
        raise RuntimeError(
            "Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured."
        )

    return create_client(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY)


_SENTINEL = object()


class SupabaseService:
    """Service layer managing database interactions and private storage bucket operations."""

    def __init__(
        self,
        client: Optional[Client] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = client
        self.last_degraded_columns: List[str] = []

    @property
    def client(self) -> Client:
        """Lazily initialize or return the injected Supabase client."""
        if self._client is None:
            self._client = get_supabase_client(self.settings)
        return self._client

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a processing job by ID from public.processing_jobs."""
        response = (
            self.client.table("processing_jobs")
            .select("*")
            .eq("id", job_id)
            .execute()
        )
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def get_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a video record by ID from public.videos."""
        response = (
            self.client.table("videos")
            .select("*")
            .eq("id", video_id)
            .execute()
        )
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def verify_job_and_video(
        self, job_id: str, video_id: str
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Verify that the job and video exist and that the job belongs to the video.

        Returns:
            Tuple of (job_dict, video_dict).

        Raises:
            KeyError: If job or video is not found.
            ValueError: If job does not belong to the given video_id.
        """
        job = self.get_job(job_id)
        if not job:
            raise KeyError(f"Processing job '{job_id}' not found in database.")

        video = self.get_video(video_id)
        if not video:
            raise KeyError(f"Video '{video_id}' not found in database.")

        # Enforce relational integrity inside backend
        job_video_id = str(job.get("video_id", ""))
        if job_video_id != str(video_id):
            raise ValueError(
                f"Relational mismatch: Job '{job_id}' references video '{job_video_id}', "
                f"but dispatch requested video '{video_id}'."
            )

        return job, video

    def update_job(
        self,
        job_id: str,
        status: Optional[str] = None,
        stage: Optional[str] = None,
        progress: Optional[int] = None,
        error_message: Any = _SENTINEL,
        started_at: Optional[str] = None,
        completed_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update job fields in public.processing_jobs."""
        payload: Dict[str, Any] = {}
        if status is not None:
            payload["status"] = status
        if stage is not None:
            payload["stage"] = stage
        if progress is not None:
            payload["progress"] = max(0, min(100, progress))
        if error_message is not _SENTINEL:
            payload["error_message"] = (
                sanitize_url_or_path(error_message) if error_message is not None else None
            )
        if started_at is not None:
            payload["started_at"] = started_at
        if completed_at is not None:
            payload["completed_at"] = completed_at

        if not payload:
            return {}

        logger.debug("Updating job %s with payload: %s", job_id, payload)
        response = (
            self.client.table("processing_jobs")
            .update(payload)
            .eq("id", job_id)
            .execute()
        )
        return response.data[0] if response.data else payload

    def update_video(
        self,
        video_id: str,
        status: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        fps: Optional[float] = None,
        frame_count: Optional[int] = None,
        error_message: Any = _SENTINEL,
    ) -> Dict[str, Any]:
        """Update video metadata and status in public.videos."""
        payload: Dict[str, Any] = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if status is not None:
            payload["status"] = status
        if duration_seconds is not None:
            payload["duration_seconds"] = duration_seconds
        if width is not None:
            payload["width"] = width
        if height is not None:
            payload["height"] = height
        if fps is not None:
            payload["fps"] = fps
        if frame_count is not None:
            payload["frame_count"] = frame_count
        if error_message is not _SENTINEL:
            payload["error_message"] = (
                sanitize_url_or_path(error_message) if error_message is not None else None
            )
        logger.debug("Updating video %s with payload: %s", video_id, payload)
        response = (
            self.client.table("videos")
            .update(payload)
            .eq("id", video_id)
            .execute()
        )
        return response.data[0] if response.data else payload

    def insert_video_frames(
        self, frame_records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Insert extracted frame records into public.video_frames."""
        if not frame_records:
            return []

        logger.debug("Inserting %d video_frames records", len(frame_records))
        response = (
            self.client.table("video_frames")
            .insert(frame_records)
            .execute()
        )
        return response.data or []

    def delete_transcripts_for_video(self, video_id: str) -> None:
        """Delete existing transcript records for a video to prevent duplicate rows on retry."""
        logger.debug("Deleting existing transcripts for video %s", video_id)
        self.client.table("transcripts").delete().eq("video_id", video_id).execute()

    def delete_transcripts_for_job(self, job_id: str) -> None:
        """Delete existing transcript records for a specific processing job."""
        logger.debug("Deleting existing transcripts for job %s", job_id)
        self.client.table("transcripts").delete().eq("job_id", job_id).execute()

    def insert_transcripts(
        self,
        transcript_records: List[Dict[str, Any]],
        video_id: Optional[str] = None,
        job_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Insert transcript records into public.transcripts using failure-safe replacement.

        Failure-Safety Architecture:
        1. Validates authenticated user_id ownership on every record before writing.
        2. Tries the atomic PostgreSQL RPC function 'replace_transcripts_atomic' first,
           which wraps deletion of old records and insertion of new records into a single
           database transaction. Any network or constraint failure rolls back the entire
           transaction, preserving the previous successful transcript.
        3. If the RPC function is unavailable (e.g. pre-migration environments), falls back
           to safe two-phase REST replacement:
           a. Cleans up only partial remnants from the *current* job_id (preventing duplicate
              segments if re-running the same job).
           b. Inserts the new transcript records. If this step fails, execution halts
              immediately—prior successful transcripts from earlier jobs are NEVER deleted.
           c. ONLY after the new records are safely persisted, cleans up old records from
              previous jobs (job_id != target_job_id).
        4. Schema Resilience: If PostgREST reports PGRST204 (column not found in schema cache),
           records the missing column in `self.last_degraded_columns`, strips that specific
           column, and retries. Does NOT hide unrelated errors or strip arbitrary columns.
        """
        self.last_degraded_columns = []

        target_video_id = video_id or (transcript_records[0].get("video_id") if transcript_records else None)
        target_job_id = job_id or (transcript_records[0].get("job_id") if transcript_records else None)

        if not transcript_records:
            if target_video_id:
                self.delete_transcripts_for_video(target_video_id)
            return []

        # Validate that every record has a non-empty user_id ownership
        for idx, rec in enumerate(transcript_records):
            uid = rec.get("user_id")
            if not uid or not str(uid).strip():
                raise ValueError(
                    f"Refusing to persist transcripts: record index {idx} has invalid or missing user_id ownership."
                )

        payload = [dict(record) for record in transcript_records]

        # ----------------------------------------------------------------------
        # Strategy 1: Transaction-safe PostgreSQL RPC (preferred)
        # ----------------------------------------------------------------------
        if target_video_id:
            try:
                rpc_resp = (
                    self.client.rpc(
                        "replace_transcripts_atomic",
                        {
                            "p_video_id": target_video_id,
                            "p_records": payload,
                            "p_job_id": target_job_id,
                        },
                    ).execute()
                )
                if rpc_resp.data is not None:
                    logger.debug(
                        "Successfully replaced %d transcripts atomically via RPC for video=%s",
                        len(transcript_records),
                        target_video_id,
                    )
                    return rpc_resp.data
            except Exception as rpc_err:
                logger.debug(
                    "Atomic RPC replace_transcripts_atomic unavailable (%s). Using safe two-phase REST replacement.",
                    rpc_err,
                )

        # ----------------------------------------------------------------------
        # Strategy 2: Safe Two-Phase REST Replacement
        # ----------------------------------------------------------------------
        # Step A: Clean up any partial remnants from the *current* job_id
        if target_video_id and target_job_id:
            try:
                self.client.table("transcripts").delete().eq("video_id", target_video_id).eq("job_id", target_job_id).execute()
            except Exception as clean_err:
                logger.debug("Non-fatal: could not clear current job remnants before insert: %s", clean_err)

        # Step B: Insert new records (with targeted PGRST204 column retry if live schema is unmigrated)
        logger.debug("Inserting %d transcript records into public.transcripts", len(payload))
        max_attempts = 5
        attempt = 0
        inserted_data = None

        while attempt < max_attempts:
            attempt += 1
            try:
                response = (
                    self.client.table("transcripts")
                    .insert(payload)
                    .execute()
                )
                inserted_data = response.data or payload
                break
            except Exception as err:
                err_msg = str(err)
                code_match = "PGRST204" in err_msg or getattr(err, "code", None) == "PGRST204"
                col_match = re.search(r"Could not find the '([^']+)' column", err_msg)

                if (code_match or col_match) and attempt < max_attempts:
                    missing_col = col_match.group(1) if col_match else None
                    if not missing_col and payload:
                        for k in list(payload[0].keys()):
                            if f"'{k}'" in err_msg or f'"{k}"' in err_msg:
                                missing_col = k
                                break

                    if missing_col:
                        if missing_col not in self.last_degraded_columns:
                            self.last_degraded_columns.append(missing_col)
                        logger.warning(
                            "Live table 'public.transcripts' is missing column '%s' (PGRST204). "
                            "Retrying insert without '%s'. Apply 'supabase/migrations/20261029103000_reconcile_transcripts_schema.sql' "
                            "to synchronize live schema.",
                            missing_col,
                            missing_col,
                        )
                        for r in payload:
                            r.pop(missing_col, None)
                        continue

                # Unrelated error or unidentifiable column: fail visibly without destroying previous data
                logger.error("Failed to insert transcript records: %s", err)
                raise

        # Step C: ONLY after insert succeeds, delete old records from prior jobs
        if target_video_id:
            try:
                if target_job_id:
                    self.client.table("transcripts").delete().eq("video_id", target_video_id).neq("job_id", target_job_id).execute()
                else:
                    logger.debug("No job_id provided; prior video transcripts may remain until superseded.")
            except Exception as del_err:
                logger.warning(
                    "New transcripts saved, but cleanup of superseded records for video=%s failed: %s",
                    target_video_id,
                    del_err,
                )

        return inserted_data or []

    def download_file(
        self,
        bucket_name: str,
        storage_path: str,
        destination_path: Path,
    ) -> Path:
        """Download a file from a private Supabase Storage bucket to a local destination."""
        sanitized_path = sanitize_url_or_path(storage_path)
        logger.info(
            "Downloading file from bucket '%s': %s -> %s",
            bucket_name,
            sanitized_path,
            destination_path.name,
        )

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        raw_bytes = self.client.storage.from_(bucket_name).download(storage_path)

        if not raw_bytes:
            raise FileNotFoundError(
                f"Downloaded zero bytes from storage path: {sanitized_path}"
            )

        destination_path.write_bytes(raw_bytes)
        return destination_path

    def upload_file(
        self,
        bucket_name: str,
        storage_path: str,
        file_path: Path,
        content_type: str = "image/jpeg",
    ) -> str:
        """Upload a local file to a private Supabase Storage bucket."""
        sanitized_path = sanitize_url_or_path(storage_path)
        logger.info(
            "Uploading file to bucket '%s': %s -> %s",
            bucket_name,
            file_path.name,
            sanitized_path,
        )

        file_bytes = file_path.read_bytes()
        self.client.storage.from_(bucket_name).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": content_type,
                "upsert": "true",
            },
        )
        return storage_path
