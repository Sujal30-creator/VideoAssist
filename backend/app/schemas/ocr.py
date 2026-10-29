from typing import List, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Normalized bounding box coordinates [0.0 - 1.0]."""

    x_min: float = Field(..., ge=0.0, le=1.0, description="Normalized min X coordinate")
    y_min: float = Field(..., ge=0.0, le=1.0, description="Normalized min Y coordinate")
    x_max: float = Field(..., ge=0.0, le=1.0, description="Normalized max X coordinate")
    y_max: float = Field(..., ge=0.0, le=1.0, description="Normalized max Y coordinate")


class OcrDetection(BaseModel):
    """Represents a single text region detected in a video frame."""

    timestamp_seconds: float = Field(
        ...,
        ge=0.0,
        description="Temporal position in seconds from video start when frame was captured",
    )
    text: str = Field(
        ...,
        description="Recognized visible text content",
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Confidence score between 0.0 and 1.0; None if uncalibrated or unavailable",
    )
    bbox: Optional[BoundingBox] = Field(
        default=None,
        description="Normalized bounding box of the detected text region",
    )
    frame_index: Optional[int] = Field(
        default=None,
        description="Zero-based index of the keyframe",
    )
    frame_path: Optional[str] = Field(
        default=None,
        description="Local path or filename of the frame",
    )
    frame_id: Optional[str] = Field(
        default=None,
        description="Optional database UUID of the corresponding video_frames record",
    )


class OcrResult(BaseModel):
    """Aggregated outcome of OCR processing across video keyframes."""

    detections: List[OcrDetection] = Field(
        default_factory=list,
        description="List of detected text regions across all processed frames",
    )
    frames_processed: int = Field(
        default=0,
        ge=0,
        description="Number of keyframes evaluated for OCR",
    )
    frames_with_text: int = Field(
        default=0,
        ge=0,
        description="Number of keyframes where at least one text region was detected",
    )
    engine_name: str = Field(
        default="easyocr",
        description="OCR engine utilized",
    )

