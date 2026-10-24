import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from app.core.exceptions import (
    FrameExtractionError,
    MetadataExtractionError,
    VideoFormatError,
    VideoNotFoundError,
    VideoSizeLimitExceededError,
)
from app.schemas.video import ExtractedFrame, VideoMetadata, VideoProcessingResult
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.video_processor")

DEFAULT_MAX_VIDEO_SIZE_BYTES = 120 * 1024 * 1024  # 120 MB
DEFAULT_FFMPEG_BINARY = "ffmpeg"
DEFAULT_FFPROBE_BINARY = "ffprobe"


class ManagedTempDirectory:
    """Managed temporary directory context manager ensuring reliable cleanup."""

    def __init__(
        self,
        prefix: str = "va_media_",
        base_dir: Optional[Union[str, Path]] = None,
    ) -> None:
        self.prefix = prefix
        self.base_dir = str(base_dir) if base_dir else None
        self._path: Optional[Path] = None

    @property
    def path(self) -> Path:
        if self._path is None:
            created = tempfile.mkdtemp(prefix=self.prefix, dir=self.base_dir)
            self._path = Path(created).resolve()
            logger.debug("Created managed temporary directory: %s", self._path)
        return self._path

    def __enter__(self) -> Path:
        return self.path

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.cleanup()

    def cleanup(self) -> None:
        """Remove the directory and all contained files reliably."""
        if self._path and self._path.exists():
            try:
                shutil.rmtree(self._path, ignore_errors=True)
                logger.debug("Cleaned up managed temporary directory: %s", self._path)
            except Exception as e:
                logger.warning(
                    "Failed to delete temporary directory %s: %s",
                    self._path,
                    str(e),
                )
            finally:
                self._path = None


def validate_video_file(
    video_path: Union[str, Path],
    max_size_bytes: int = DEFAULT_MAX_VIDEO_SIZE_BYTES,
) -> Path:
    """Validate that the target video file exists, is readable, and within size constraints.

    Args:
        video_path: Path to the target video file.
        max_size_bytes: Maximum permitted file size in bytes.

    Returns:
        Resolved Path object for the video file.

    Raises:
        VideoNotFoundError: If the file does not exist or is not readable.
        VideoFormatError: If the file is zero bytes.
        VideoSizeLimitExceededError: If file exceeds max_size_bytes.
    """
    sanitized = sanitize_url_or_path(video_path)
    path = Path(video_path).resolve()

    if not path.exists() or not path.is_file():
        logger.error("Video file does not exist: %s", sanitized)
        raise VideoNotFoundError(f"Video file not found: {sanitized}")

    if not os.access(path, os.R_OK):
        logger.error("Video file is not readable: %s", sanitized)
        raise VideoNotFoundError(f"Video file cannot be read: {sanitized}")

    file_size = path.stat().st_size
    if file_size == 0:
        logger.error("Video file is empty (0 bytes): %s", sanitized)
        raise VideoFormatError("Video file is empty (0 bytes).")

    if file_size > max_size_bytes:
        logger.error(
            "Video size %d bytes exceeds configured limit of %d bytes: %s",
            file_size,
            max_size_bytes,
            sanitized,
        )
        raise VideoSizeLimitExceededError(
            f"Video size ({file_size} bytes) exceeds limit ({max_size_bytes} bytes)."
        )

    return path


def _parse_fps(rate_str: Optional[str]) -> Optional[float]:
    """Parse rational or decimal frame rate string (e.g. '25/1', '30000/1001', '29.97')."""
    if not rate_str or rate_str == "0/0" or rate_str.strip() == "":
        return None
    try:
        if "/" in rate_str:
            num, den = rate_str.split("/", 1)
            f_num, f_den = float(num), float(den)
            if f_den != 0 and f_num > 0:
                return f_num / f_den
        else:
            val = float(rate_str)
            if val > 0:
                return val
    except (ValueError, ZeroDivisionError):
        pass
    return None


def extract_video_metadata(
    video_path: Union[str, Path],
    max_size_bytes: Optional[int] = None,
    ffprobe_binary: str = DEFAULT_FFPROBE_BINARY,
) -> VideoMetadata:
    """Inspect a video file using FFprobe and return structured metadata.

    Args:
        video_path: Path to the target video.
        max_size_bytes: Optional file size limit; defaults to DEFAULT_MAX_VIDEO_SIZE_BYTES.
        ffprobe_binary: Executable name or absolute path for ffprobe.

    Returns:
        VideoMetadata containing duration, width, height, FPS, and frame count.

    Raises:
        VideoNotFoundError: If the file does not exist.
        VideoSizeLimitExceededError: If the file exceeds size limits.
        VideoFormatError: If the media is invalid, corrupt, or lacks a video stream.
        MetadataExtractionError: If essential video properties cannot be determined.
    """
    limit = max_size_bytes or DEFAULT_MAX_VIDEO_SIZE_BYTES
    path = validate_video_file(video_path, max_size_bytes=limit)
    sanitized = sanitize_url_or_path(path)

    cmd = [
        ffprobe_binary,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,codec_name",
        "-show_entries",
        "format=duration,size,format_name",
        "-of",
        "json",
        str(path),
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
            check=False,
        )
    except FileNotFoundError:
        logger.critical("ffprobe executable not found in PATH: %s", ffprobe_binary)
        raise MetadataExtractionError(
            f"FFprobe executable '{ffprobe_binary}' was not found in system PATH."
        )
    except subprocess.TimeoutExpired:
        logger.error("ffprobe inspection timed out for: %s", sanitized)
        raise MetadataExtractionError("FFprobe inspection timed out.")

    if proc.returncode != 0:
        err_msg = proc.stderr.strip() or "Unknown error"
        logger.error("FFprobe execution failed for %s: %s", sanitized, err_msg)
        raise VideoFormatError(f"Invalid video container or corrupt media file: {err_msg}")

    try:
        data: Dict[str, Any] = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse FFprobe JSON output for %s: %s", sanitized, str(e))
        raise MetadataExtractionError("Malformed FFprobe JSON output.")

    streams = data.get("streams", [])
    if not streams:
        logger.error("No video stream found in file: %s", sanitized)
        raise VideoFormatError("No video stream found in the specified media file.")

    v_stream = streams[0]
    fmt = data.get("format", {})

    width = v_stream.get("width")
    height = v_stream.get("height")
    if not width or not height or width <= 0 or height <= 0:
        logger.error("Invalid dimensions for video %s: width=%s, height=%s", sanitized, width, height)
        raise MetadataExtractionError("Failed to extract valid video dimensions.")

    fps = _parse_fps(v_stream.get("avg_frame_rate")) or _parse_fps(v_stream.get("r_frame_rate"))
    if not fps or fps <= 0.0:
        logger.error("Failed to extract valid FPS for %s", sanitized)
        raise MetadataExtractionError("Failed to extract valid video FPS.")

    # Duration: prefer stream duration, fall back to container format duration
    duration: Optional[float] = None
    stream_dur = v_stream.get("duration")
    if stream_dur and stream_dur != "N/A":
        try:
            d_val = float(stream_dur)
            if d_val > 0.0:
                duration = d_val
        except ValueError:
            pass

    if duration is None:
        fmt_dur = fmt.get("duration")
        if fmt_dur and fmt_dur != "N/A":
            try:
                d_val = float(fmt_dur)
                if d_val > 0.0:
                    duration = d_val
            except ValueError:
                pass

    if duration is None or duration <= 0.0:
        logger.error("Failed to extract valid duration for %s", sanitized)
        raise MetadataExtractionError("Failed to extract valid video duration.")

    # Total frames: check stream metadata first, otherwise calculate from duration & fps
    nb_frames = None
    stream_nb_frames = v_stream.get("nb_frames")
    if stream_nb_frames and stream_nb_frames != "N/A":
        try:
            parsed_frames = int(stream_nb_frames)
            if parsed_frames > 0:
                nb_frames = parsed_frames
        except ValueError:
            pass

    if nb_frames is None:
        nb_frames = max(1, int(round(duration * fps)))

    file_size_bytes = path.stat().st_size
    codec_name = v_stream.get("codec_name")
    format_name = fmt.get("format_name")

    logger.info(
        "Extracted metadata for %s: duration=%.2fs, res=%dx%d, fps=%.2f, frames=%d",
        sanitized,
        duration,
        width,
        height,
        fps,
        nb_frames,
    )

    return VideoMetadata(
        duration_seconds=round(duration, 3),
        width=int(width),
        height=int(height),
        fps=round(fps, 3),
        frame_count=int(nb_frames),
        format_name=format_name,
        codec_name=codec_name,
        file_size_bytes=file_size_bytes,
    )


def calculate_keyframe_timestamps(
    duration_seconds: float,
    fps: float,
    frame_count: Optional[int] = None,
    max_keyframes: int = 3,
) -> List[float]:
    """Calculate representative keyframe timestamps without duplicates or out-of-range values.

    Args:
        duration_seconds: Video duration in seconds.
        fps: Frames per second.
        frame_count: Optional total frame count.
        max_keyframes: Upper bound on the number of keyframes to sample (default 3).

    Returns:
        List of unique, monotonically increasing float timestamps in seconds.
    """
    if duration_seconds <= 0.0 or fps <= 0.0 or max_keyframes <= 0:
        return []

    frame_interval = 1.0 / fps
    total_frames = frame_count if (frame_count and frame_count > 0) else max(1, int(round(duration_seconds * fps)))
    target_count = min(max_keyframes, total_frames)

    # For single-frame or ultra-short clips, only capture the first frame
    if target_count <= 1:
        return [0.0]

    max_valid_time = max(0.0, duration_seconds - frame_interval)

    # If only 2 frames exist
    if target_count == 2:
        t0 = 0.0
        t1 = round(min(duration_seconds * 0.5, max_valid_time), 3)
        if t1 <= t0:
            return [0.0]
        return [t0, t1]

    # For 3 or more keyframes, pick representative points: start, mid, late
    candidates = [
        0.0,
        round(duration_seconds * 0.5, 3),
        round(min(duration_seconds * 0.85, max_valid_time), 3),
    ]

    # Deduplicate candidate timestamps ensuring separation of at least half a frame interval
    min_gap = frame_interval * 0.5
    timestamps: List[float] = []
    for cand in candidates:
        clamped = max(0.0, min(cand, max_valid_time))
        if not timestamps:
            timestamps.append(clamped)
        elif (clamped - timestamps[-1]) >= min_gap:
            timestamps.append(clamped)

    return timestamps[:max_keyframes]


def extract_keyframes(
    video_path: Union[str, Path],
    output_dir: Union[str, Path],
    max_keyframes: int = 3,
    metadata: Optional[VideoMetadata] = None,
    ffmpeg_binary: str = DEFAULT_FFMPEG_BINARY,
    ffprobe_binary: str = DEFAULT_FFPROBE_BINARY,
) -> List[ExtractedFrame]:
    """Extract representative keyframes using FFmpeg with exact timestamps.

    Args:
        video_path: Path to the target video file.
        output_dir: Directory where extracted JPEG frames will be saved.
        max_keyframes: Maximum number of keyframes to extract (default 3).
        metadata: Optional pre-extracted VideoMetadata; extracted automatically if None.
        ffmpeg_binary: Executable name or absolute path for ffmpeg.
        ffprobe_binary: Executable name or path for ffprobe.

    Returns:
        List of ExtractedFrame objects containing paths, timestamps, and dimensions.

    Raises:
        FrameExtractionError: If FFmpeg fails to capture frames.
        MetadataExtractionError: If metadata cannot be determined.
    """
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if metadata is None:
        metadata = extract_video_metadata(video_path, ffprobe_binary=ffprobe_binary)

    timestamps = calculate_keyframe_timestamps(
        duration_seconds=metadata.duration_seconds,
        fps=metadata.fps,
        frame_count=metadata.frame_count,
        max_keyframes=max_keyframes,
    )

    sanitized = sanitize_url_or_path(video_path)
    logger.info("Extracting %d keyframes for %s at timestamps: %s", len(timestamps), sanitized, timestamps)

    extracted_frames: List[ExtractedFrame] = []

    for idx, ts in enumerate(timestamps):
        frame_filename = f"frame_{idx:03d}_{ts:.3f}s.jpg"
        target_path = out_dir / frame_filename

        cmd = [
            ffmpeg_binary,
            "-y",
            "-ss",
            f"{ts:.3f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(target_path),
        ]

        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
                check=False,
            )
        except FileNotFoundError:
            logger.critical("ffmpeg executable not found in PATH: %s", ffmpeg_binary)
            raise FrameExtractionError(f"FFmpeg binary '{ffmpeg_binary}' not found in system PATH.")
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg frame extraction timed out at timestamp %.3fs for: %s", ts, sanitized)
            raise FrameExtractionError(f"FFmpeg timed out extracting frame at timestamp {ts}s.")

        if proc.returncode != 0 or not target_path.exists() or target_path.stat().st_size == 0:
            err_msg = proc.stderr.strip() or "Empty image output"
            logger.error(
                "FFmpeg failed to extract frame at index %d (ts=%.3fs): %s",
                idx,
                ts,
                err_msg,
            )
            raise FrameExtractionError(
                f"Failed to extract frame at timestamp {ts}s: {err_msg}"
            )

        extracted_frames.append(
            ExtractedFrame(
                frame_path=str(target_path),
                timestamp_seconds=ts,
                width=metadata.width,
                height=metadata.height,
                frame_index=idx,
            )
        )

    return extracted_frames


class VideoProcessor:
    """Configurable service component for video metadata inspection and keyframe generation."""

    def __init__(
        self,
        max_input_size_bytes: int = DEFAULT_MAX_VIDEO_SIZE_BYTES,
        ffmpeg_binary: str = DEFAULT_FFMPEG_BINARY,
        ffprobe_binary: str = DEFAULT_FFPROBE_BINARY,
    ) -> None:
        self.max_input_size_bytes = max_input_size_bytes
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary

    def extract_metadata(self, video_path: Union[str, Path]) -> VideoMetadata:
        """Inspect and extract metadata for a video file."""
        return extract_video_metadata(
            video_path=video_path,
            max_size_bytes=self.max_input_size_bytes,
            ffprobe_binary=self.ffprobe_binary,
        )

    def extract_keyframes(
        self,
        video_path: Union[str, Path],
        output_dir: Union[str, Path],
        max_keyframes: int = 3,
        metadata: Optional[VideoMetadata] = None,
    ) -> List[ExtractedFrame]:
        """Extract representative keyframes into the specified output directory."""
        return extract_keyframes(
            video_path=video_path,
            output_dir=output_dir,
            max_keyframes=max_keyframes,
            metadata=metadata,
            ffmpeg_binary=self.ffmpeg_binary,
            ffprobe_binary=self.ffprobe_binary,
        )

    def process_video(
        self,
        video_path: Union[str, Path],
        output_dir: Union[str, Path],
        max_keyframes: int = 3,
    ) -> VideoProcessingResult:
        """Validate, extract metadata, and generate representative keyframes."""
        metadata = self.extract_metadata(video_path)
        keyframes = self.extract_keyframes(
            video_path=video_path,
            output_dir=output_dir,
            max_keyframes=max_keyframes,
            metadata=metadata,
        )
        return VideoProcessingResult(metadata=metadata, keyframes=keyframes)
