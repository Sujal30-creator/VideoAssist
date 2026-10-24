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
