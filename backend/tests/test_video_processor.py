import os
import subprocess
from pathlib import Path
from typing import Generator
import pytest

from app.core.exceptions import (
    FrameExtractionError,
    MetadataExtractionError,
    VideoFormatError,
    VideoNotFoundError,
    VideoSizeLimitExceededError,
)
from app.services.video_processor import (
    ManagedTempDirectory,
    VideoProcessor,
    calculate_keyframe_timestamps,
    extract_keyframes,
    extract_video_metadata,
    validate_video_file,
)
from app.utils.logging import sanitize_url_or_path


def _generate_synthetic_video(output_path: Path, duration: float = 2.0, fps: int = 25, width: int = 320, height: int = 240) -> Path:
    """Helper to synthesize tiny, valid MP4 test videos using FFmpeg lavfi testsrc."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"testsrc=size={width}x{height}:rate={fps}",
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        pytest.skip(f"FFmpeg video synthesis failed: {proc.stderr}")
    return output_path


@pytest.fixture
def temp_workspace() -> Generator[Path, None, None]:
    """Provide a managed temporary directory for test artifacts."""
    with ManagedTempDirectory(prefix="test_video_") as temp_dir:
        yield temp_dir


@pytest.fixture
def sample_video(temp_workspace: Path) -> Path:
    """Generate a 2.0-second 320x240 @ 25fps video (50 frames total)."""
    vid_path = temp_workspace / "sample_2s.mp4"
    return _generate_synthetic_video(vid_path, duration=2.0, fps=25, width=320, height=240)


@pytest.fixture
def single_frame_video(temp_workspace: Path) -> Path:
    """Generate a single-frame 160x120 @ 25fps video (0.04s)."""
    vid_path = temp_workspace / "single_frame.mp4"
    return _generate_synthetic_video(vid_path, duration=0.04, fps=25, width=160, height=120)


@pytest.fixture
def two_frame_video(temp_workspace: Path) -> Path:
    """Generate a two-frame 160x120 @ 25fps video (0.08s)."""
    vid_path = temp_workspace / "two_frames.mp4"
    return _generate_synthetic_video(vid_path, duration=0.08, fps=25, width=160, height=120)


# ==============================================================================
# 1. METADATA EXTRACTION TESTS
# ==============================================================================

def test_extract_metadata_success(sample_video: Path):
    """Validate extraction of duration, dimensions, fps, frame count, and codec."""
    metadata = extract_video_metadata(sample_video)

    assert metadata.duration_seconds == pytest.approx(2.0, rel=0.1)
    assert metadata.width == 320
    assert metadata.height == 240
    assert metadata.fps == pytest.approx(25.0, rel=0.05)
    assert metadata.frame_count in (49, 50, 51)  # 2.0s * 25fps
    assert metadata.codec_name == "h264"
    assert metadata.file_size_bytes > 0
    assert metadata.format_name is not None


def test_extract_metadata_single_frame(single_frame_video: Path):
    """Ensure metadata for single-frame videos reports correct dimensions and 1 frame."""
    metadata = extract_video_metadata(single_frame_video)

    assert metadata.duration_seconds > 0.0
    assert metadata.width == 160
    assert metadata.height == 120
    assert metadata.frame_count >= 1


# ==============================================================================
# 2. KEYFRAME EXTRACTION & TIMESTAMPS TESTS
# ==============================================================================

def test_extract_keyframes_standard(sample_video: Path, temp_workspace: Path):
    """Extract up to 3 keyframes from a standard video and verify files and timestamps."""
    out_dir = temp_workspace / "frames_standard"
    frames = extract_keyframes(sample_video, output_dir=out_dir, max_keyframes=3)

    assert len(frames) == 3

    # Check timestamps: must be unique, non-negative, and strictly increasing
    timestamps = [f.timestamp_seconds for f in frames]
    assert timestamps == sorted(timestamps)
    assert len(timestamps) == len(set(timestamps))
    assert timestamps[0] == 0.0
    assert timestamps[-1] < 2.0

    # Verify physical image files exist on disk
    for f in frames:
        p = Path(f.frame_path)
        assert p.exists()
        assert p.stat().st_size > 0
        assert f.width == 320
        assert f.height == 240


def test_extract_keyframes_single_frame_video(single_frame_video: Path, temp_workspace: Path):
    """Very short 1-frame video should produce exactly 1 keyframe without duplicates."""
    out_dir = temp_workspace / "frames_single"
    frames = extract_keyframes(single_frame_video, output_dir=out_dir, max_keyframes=3)

    assert len(frames) == 1
    assert frames[0].timestamp_seconds == 0.0
    assert Path(frames[0].frame_path).exists()


def test_extract_keyframes_two_frames_video(two_frame_video: Path, temp_workspace: Path):
    """2-frame video should produce at most 2 keyframes without duplicates."""
    out_dir = temp_workspace / "frames_two"
    frames = extract_keyframes(two_frame_video, output_dir=out_dir, max_keyframes=3)

    assert 1 <= len(frames) <= 2
    timestamps = [f.timestamp_seconds for f in frames]
    assert len(timestamps) == len(set(timestamps))


@pytest.mark.parametrize(
    "dur, fps, frames, expected_len, first_ts",
    [
        (10.0, 25.0, 250, 3, 0.0),
        (2.0, 25.0, 50, 3, 0.0),
        (0.08, 25.0, 2, 2, 0.0),
        (0.04, 25.0, 1, 1, 0.0),
        (0.0, 25.0, 0, 0, None),
        (5.0, 0.0, 0, 0, None),
    ],
)
def test_calculate_keyframe_timestamps_variations(dur, fps, frames, expected_len, first_ts):
    """Directly test timestamp calculation edge cases and bounds."""
    ts = calculate_keyframe_timestamps(duration_seconds=dur, fps=fps, frame_count=frames, max_keyframes=3)
    assert len(ts) == expected_len
    if expected_len > 0:
        assert ts[0] == first_ts
        # Ensure monotonic order and uniqueness
        assert ts == sorted(ts)
        assert len(ts) == len(set(ts))


# ==============================================================================
# 3. INPUT VALIDATION & ERROR HANDLING TESTS
# ==============================================================================

def test_video_not_found():
    """Verify VideoNotFoundError when accessing non-existent video path."""
    with pytest.raises(VideoNotFoundError) as exc_info:
        extract_video_metadata("/tmp/non_existent_video_path_12345.mp4")
    assert "Video file not found" in str(exc_info.value)


def test_video_empty_file(temp_workspace: Path):
    """Verify VideoFormatError when video file is 0 bytes."""
    empty_file = temp_workspace / "empty.mp4"
    empty_file.touch()

    with pytest.raises(VideoFormatError) as exc_info:
        extract_video_metadata(empty_file)
    assert "empty (0 bytes)" in str(exc_info.value)


def test_video_corrupted_file(temp_workspace: Path):
    """Verify VideoFormatError when file contains arbitrary text instead of video data."""
    corrupt_file = temp_workspace / "corrupted.mp4"
    corrupt_file.write_text("This is arbitrary non-video content.")

    with pytest.raises(VideoFormatError) as exc_info:
        extract_video_metadata(corrupt_file)
    assert "Invalid video container or corrupt media file" in str(exc_info.value)


def test_audio_only_file_rejected(temp_workspace: Path):
    """Verify VideoFormatError when file contains only audio and no video streams."""
    audio_path = temp_workspace / "audio_only.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:duration=1",
        "-c:a",
        "aac",
        str(audio_path),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        pytest.skip(f"Audio synthesis failed: {proc.stderr}")

    with pytest.raises(VideoFormatError) as exc_info:
        extract_video_metadata(audio_path)
    assert "No video stream found" in str(exc_info.value)


def test_file_size_limit_exceeded(sample_video: Path):
    """Verify VideoSizeLimitExceededError when file exceeds configured max_size_bytes."""
    with pytest.raises(VideoSizeLimitExceededError) as exc_info:
        extract_video_metadata(sample_video, max_size_bytes=100)
    assert "exceeds limit" in str(exc_info.value)


# ==============================================================================
# 4. MANAGED DIRECTORY & SERVICE COMPONENT TESTS
# ==============================================================================

def test_managed_temp_directory_cleanup():
    """Verify that ManagedTempDirectory reliably creates and removes its folder upon exit."""
    captured_dir: Path
    with ManagedTempDirectory(prefix="test_mgr_") as tmp_dir:
        captured_dir = tmp_dir
        assert captured_dir.exists()
        dummy_file = captured_dir / "test.txt"
        dummy_file.write_text("hello")
        assert dummy_file.exists()

    # Outside context block, directory should be completely removed
    assert not captured_dir.exists()


def test_video_processor_class_end_to_end(sample_video: Path, temp_workspace: Path):
    """Verify VideoProcessor full pipeline returning metadata and keyframes."""
    processor = VideoProcessor(max_input_size_bytes=50 * 1024 * 1024)
    out_dir = temp_workspace / "processor_out"

    result = processor.process_video(sample_video, output_dir=out_dir, max_keyframes=3)

    assert result.metadata.duration_seconds == pytest.approx(2.0, rel=0.1)
    assert result.metadata.width == 320
    assert result.metadata.height == 240
    assert len(result.keyframes) == 3
    for kf in result.keyframes:
        assert Path(kf.frame_path).exists()


# ==============================================================================
# 5. LOGGING SANITIZER TESTS
# ==============================================================================

def test_logging_sanitizer_masks_secrets():
    """Verify that URL and secret sanitizer redacts tokens, signatures, and auth headers."""
    # Supabase signed URL with token parameter
    url = "https://example.supabase.co/storage/v1/object/sign/videos/v1.mp4?token=secret_token_123&expires=99999"
    sanitized_url = sanitize_url_or_path(url)
    assert "secret_token_123" not in sanitized_url
    assert "token=REDACTED" in sanitized_url
    assert "expires=99999" in sanitized_url

    # AWS presigned URL with X-Amz-Signature
    aws_url = "https://s3.amazonaws.com/bucket/file.mp4?X-Amz-Signature=abcd1234efgh&other=keep"
    sanitized_aws = sanitize_url_or_path(aws_url)
    assert "abcd1234efgh" not in sanitized_aws
    assert "X-Amz-Signature=REDACTED" in sanitized_aws

    # Bearer token string
    auth_str = "Authorization: Bearer secret_access_token_xyz"
    sanitized_auth = sanitize_url_or_path(auth_str)
    assert "secret_access_token_xyz" not in sanitized_auth
    assert "Bearer REDACTED" in sanitized_auth
