import uuid
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class JobDispatchRequest(BaseModel):
    """Payload sent by Next.js server actions / route handlers to trigger video processing."""

    job_id: str = Field(
        ...,
        description="UUID of the processing job in public.processing_jobs",
        examples=["550e8400-e29b-41d4-a716-446655440000"],
    )
    video_id: str = Field(
        ...,
        description="UUID of the video in public.videos",
        examples=["6ba7b810-9dad-11d1-80b4-00c04fd430c8"],
    )
    storage_path: Optional[str] = Field(
        default=None,
        description="Optional storage path hint from upload event",
        examples=["usr_123/vid_456/sample.mp4"],
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Optional user UUID hint",
        examples=["usr_123"],
    )

    @field_validator("job_id", "video_id")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("ID field cannot be empty or whitespace.")
        # Attempt UUID validation if formatted as UUID
        try:
            uuid.UUID(trimmed)
        except ValueError:
            # Allow custom string IDs in dev/tests if necessary, but strip whitespace
            pass
        return trimmed


class JobDispatchResponse(BaseModel):
    """Response returned immediately to the caller upon job acceptance."""

    success: bool = Field(default=True, description="Indicates whether the job was accepted")
    job_id: str = Field(..., description="ID of the accepted processing job")
    video_id: str = Field(..., description="ID of the associated video")
    status: str = Field(default="processing", description="Current job status")
    message: str = Field(
        default="Job verified and asynchronous processing scheduled.",
        description="Human-readable dispatch confirmation message",
    )
