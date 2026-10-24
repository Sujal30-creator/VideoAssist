from typing import List, Optional
from pydantic import BaseModel, Field


class VideoMetadata(BaseModel):
    """Structured container and stream metadata extracted from a video."""

    duration_seconds: float = Field(
        ...,
        ge=0.0,
        description="Duration of the video in seconds",
        examples=[180.25],
    )
    width: int = Field(
        ...,
        gt=0,
        description="Frame width in pixels",
        examples=[1920],
    )
    height: int = Field(
        ...,
        gt=0,
        description="Frame height in pixels",
        examples=[1080],
    )
    fps: float = Field(
        ...,
        gt=0.0,
        description="Effective frame rate in frames per second",
        examples=[29.97],
    )
    frame_count: int = Field(
        ...,
        ge=1,
        description="Total estimated or reported frame count",
        examples=[5402],
    )
    format_name: Optional[str] = Field(
        default=None,
        description="Container format name (e.g. mov,mp4,m4a,3gp,3g2,mj2)",
        examples=["mov,mp4,m4a,3gp,3g2,mj2"],
    )
    codec_name: Optional[str] = Field(
        default=None,
        description="Video stream codec identifier (e.g. h264, hevc, vp9)",
        examples=["h264"],
    )
    file_size_bytes: int = Field(
        ...,
        ge=0,
        description="Physical size of the video file in bytes",
        examples=[42500000],
    )


class ExtractedFrame(BaseModel):
    """Information regarding an individual extracted video frame."""

    frame_path: str = Field(
        ...,
        description="Filesystem path where the extracted frame image is stored",
        examples=["/tmp/videoassist/keyframes/frame_000_0.000s.jpg"],
    )
    timestamp_seconds: float = Field(
        ...,
        ge=0.0,
        description="Exact timestamp position in the video where the frame was captured",
        examples=[1.5],
    )
    width: int = Field(
        ...,
        gt=0,
        description="Width of the extracted frame in pixels",
        examples=[1920],
    )
    height: int = Field(
        ...,
        gt=0,
        description="Height of the extracted frame in pixels",
        examples=[1080],
    )
    frame_index: int = Field(
        ...,
        ge=0,
        description="Sequential index of the keyframe in the extraction batch",
        examples=[0],
    )


class VideoProcessingResult(BaseModel):
    """Aggregate result of video validation, metadata parsing, and keyframe extraction."""

    metadata: VideoMetadata
    keyframes: List[ExtractedFrame] = Field(
        default_factory=list,
        description="List of representative keyframes extracted from the video",
    )
