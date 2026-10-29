import os
import subprocess
from pathlib import Path
from typing import Any, Generator, List, Optional, Tuple
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.core.exceptions import (
    AudioExtractionError,
    MetadataExtractionError,
    TranscriptionError,
    VideoFormatError,
    VideoNotFoundError,
    VideoSizeLimitExceededError,
)
from app.schemas.transcript import TranscriptResult, TranscriptSegment
from app.services.transcript_service import (
    TranscriptService,
    WhisperModelManager,
    check_audio_stream,
    extract_audio_from_video,
    transcribe_video,
)
from app.services.video_processor import ManagedTempDirectory


# ==============================================================================
# Helper Mock Objects for Whisper
# ==============================================================================

class MockSegment:
    """Mock of a faster_whisper.transcribe.Segment."""

    def __init__(
        self,
        start: float,
        end: float,
        text: str,
        avg_logprob: float = -0.35,
        no_speech_prob: float = 0.02,
    ) -> None:
        self.start = start
        self.end = end
        self.text = text
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob


class MockTranscriptionInfo:
    """Mock of faster_whisper.transcribe.TranscriptionInfo."""

    def __init__(
        self,
        language: str = "en",
        language_probability: float = 0.985,
        duration: float = 4.25,
    ) -> None:
        self.language = language
        self.language_probability = language_probability
        self.duration = duration


class MockWhisperModel:
    """Mock WhisperModel returning configured mock segments."""

    def __init__(
        self,
        segments: Optional[List[MockSegment]] = None,
        info: Optional[MockTranscriptionInfo] = None,
        raise_on_transcribe: Optional[Exception] = None,
    ) -> None:
        self.segments = segments or [
            MockSegment(0.2, 2.5, "Checking router power supply and cables."),
            MockSegment(2.6, 4.1, "LED indicator shows solid amber."),
        ]
        self.info = info or MockTranscriptionInfo()
        self.raise_on_transcribe = raise_on_transcribe
        self.call_count = 0

    def transcribe(self, audio: str, **kwargs: Any) -> Tuple[Any, Any]:
        self.call_count += 1
        if self.raise_on_transcribe:
            raise self.raise_on_transcribe
        return (s for s in self.segments), self.info


# ==============================================================================
# Synthetic Video Generators
# ==============================================================================

def _generate_video_without_audio(output_path: Path, duration: float = 2.0) -> Path:
    """Generate a valid MP4 with only a video stream (no audio)."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=size=320x240:rate=25",
        "-t", str(duration),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(output_path),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        pytest.skip(f"FFmpeg synthetic video generation failed: {proc.stderr}")
    return output_path


def _generate_video_with_audio(output_path: Path, duration: float = 2.0) -> Path:
    """Generate a valid MP4 containing both a video stream and an audio stream."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=size=320x240:rate=25",
        "-f", "lavfi",
        "-i", "sine=frequency=1000",
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        str(output_path),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        pytest.skip(f"FFmpeg synthetic video with audio generation failed: {proc.stderr}")
    return output_path


# ==============================================================================
# Fixtures
# ==============================================================================

@pytest.fixture
def temp_workspace() -> Generator[Path, None, None]:
    """Provide a managed temporary directory for test media."""
    with ManagedTempDirectory(prefix="test_transcript_") as temp_dir:
        yield temp_dir


@pytest.fixture
def video_with_audio(temp_workspace: Path) -> Path:
    return _generate_video_with_audio(temp_workspace / "video_audio.mp4", duration=2.5)


@pytest.fixture
def video_no_audio(temp_workspace: Path) -> Path:
    return _generate_video_without_audio(temp_workspace / "video_no_audio.mp4", duration=2.0)


@pytest.fixture(autouse=True)
def clear_model_cache():
    """Ensure clean model manager cache before and after each test."""
    WhisperModelManager.clear_cache()
    yield
    WhisperModelManager.clear_cache()


# ==============================================================================
# Unit Tests
# ==============================================================================

def test_check_audio_stream_detection(video_with_audio: Path, video_no_audio: Path):
    """FFprobe audio check should correctly distinguish audio vs no-audio media."""
    assert check_audio_stream(video_with_audio) is True
    assert check_audio_stream(video_no_audio) is False


def test_extract_audio_from_video_success(video_with_audio: Path, temp_workspace: Path):
    """Audio extraction should yield a non-empty 16 kHz mono WAV file."""
    output_wav = temp_workspace / "extracted.wav"
    extracted = extract_audio_from_video(video_with_audio, output_wav)

    assert extracted.exists()
    assert extracted.stat().st_size > 0
    assert extracted.suffix == ".wav"


def test_extract_audio_from_video_failure_on_missing_audio(video_no_audio: Path, temp_workspace: Path):
    """Attempting to extract audio from video lacking an audio stream should raise AudioExtractionError."""
    output_wav = temp_workspace / "extracted_fail.wav"
    with pytest.raises(AudioExtractionError) as exc_info:
        extract_audio_from_video(video_no_audio, output_wav)
    assert "FFmpeg failed to extract audio" in str(exc_info.value)


def test_transcribe_video_success_normalized_schema(video_with_audio: Path):
    """Transcription should produce structured TranscriptResult with normalized segments."""
    mock_model = MockWhisperModel(
        segments=[
            MockSegment(0.1234, 2.4567, "Testing field router hardware.", avg_logprob=-0.21, no_speech_prob=0.01),
            MockSegment(2.5, 4.0, "Power LED is operational.", avg_logprob=-0.15, no_speech_prob=0.005),
        ],
        info=MockTranscriptionInfo(language="en", language_probability=0.99, duration=4.0),
    )

    service = TranscriptService(model=mock_model)
    result = service.transcribe_video(video_with_audio, duration_seconds=5.0)

    assert isinstance(result, TranscriptResult)
    assert result.has_audio is True
    assert result.detected_language == "en"
    assert result.language_probability == 0.99
    assert result.audio_duration_seconds == 4.0
    assert len(result.segments) == 2

    # Validate first segment normalization
    seg0 = result.segments[0]
    assert seg0.start_time == 0.123
    assert seg0.end_time == 2.457
    assert seg0.text == "Testing field router hardware."
    assert seg0.speaker is None  # Diarization is not invented
    assert seg0.confidence is None  # Average logprob is not converted to fake probability
    assert seg0.avg_logprob == -0.21
    assert seg0.no_speech_prob == 0.01
    assert seg0.language == "en"


def test_transcribe_video_timestamp_bounding(video_with_audio: Path):
    """Timestamps must be non-negative and bounded to known video duration."""
    mock_model = MockWhisperModel(
        segments=[
            MockSegment(-0.5, 2.0, "Start negative clamp test"),
            MockSegment(2.0, 5.5, "End exceeds duration clamp test"),
        ]
    )

    service = TranscriptService(model=mock_model)
    # Known video duration is 4.0 seconds
    result = service.transcribe_video(video_with_audio, duration_seconds=4.0)

    assert result.segments[0].start_time == 0.0  # Clamped to >= 0.0
    assert result.segments[0].end_time == 2.0

    assert result.segments[1].start_time == 2.0
    assert result.segments[1].end_time == 4.0  # Clamped to duration_seconds (4.0)


def test_transcribe_video_no_audio_explicit_outcome(video_no_audio: Path):
    """Videos lacking an audio track should return has_audio=False without error."""
    mock_model = MockWhisperModel()
    service = TranscriptService(model=mock_model)

    result = service.transcribe_video(video_no_audio)

    assert isinstance(result, TranscriptResult)
    assert result.has_audio is False
    assert result.segments == []
    assert result.detected_language is None
    assert result.no_audio_reason is not None
    assert "No audio stream" in result.no_audio_reason
    # Ensure model transcribe was never called
    assert mock_model.call_count == 0


def test_transcribe_video_handles_empty_segments(video_with_audio: Path):
    """Whitespace-only segments produced by Whisper should be filtered out."""
    mock_model = MockWhisperModel(
        segments=[
            MockSegment(0.0, 1.0, "   "),
            MockSegment(1.0, 2.5, "Valid recognized speech."),
            MockSegment(2.5, 3.0, ""),
        ]
    )

    service = TranscriptService(model=mock_model)
    result = service.transcribe_video(video_with_audio)

    assert len(result.segments) == 1
    assert result.segments[0].text == "Valid recognized speech."


def test_transcribe_video_missing_file():
    """Missing video path should raise VideoNotFoundError."""
    service = TranscriptService(model=MockWhisperModel())
    with pytest.raises(VideoNotFoundError):
        service.transcribe_video("/nonexistent/path/to/video.mp4")


def test_transcribe_video_empty_file(temp_workspace: Path):
    """Zero-byte file should raise VideoFormatError."""
    empty_file = temp_workspace / "empty.mp4"
    empty_file.touch()

    service = TranscriptService(model=MockWhisperModel())
    with pytest.raises(VideoFormatError):
        service.transcribe_video(empty_file)


def test_transcribe_video_exceeds_size_limit(temp_workspace: Path):
    """File exceeding MAX_VIDEO_SIZE_BYTES should raise VideoSizeLimitExceededError."""
    large_file = temp_workspace / "oversize.mp4"
    large_file.write_bytes(b"x" * 200)

    settings = Settings(MAX_VIDEO_SIZE_BYTES=100)
    service = TranscriptService(settings=settings, model=MockWhisperModel())

    with pytest.raises(VideoSizeLimitExceededError):
        service.transcribe_video(large_file)


def test_transcribe_video_inference_failure_raises_typed_error(video_with_audio: Path):
    """Runtime exceptions during Whisper inference should raise TranscriptionError."""
    mock_model = MockWhisperModel(raise_on_transcribe=RuntimeError("CUDA out of memory / compute fault"))
    service = TranscriptService(model=mock_model)

    with pytest.raises(TranscriptionError) as exc_info:
        service.transcribe_video(video_with_audio)

    assert "Whisper speech transcription failed" in str(exc_info.value)
    assert "CUDA out of memory" in str(exc_info.value)


def test_temporary_audio_cleanup_on_success_and_failure(video_with_audio: Path):
    """Temporary audio files must be cleaned up on both successful completion and failure."""
    captured_temp_dirs: List[Path] = []

    original_enter = ManagedTempDirectory.__enter__

    def spy_enter(self_mgr):
        path = original_enter(self_mgr)
        captured_temp_dirs.append(path)
        return path

    with patch.object(ManagedTempDirectory, "__enter__", spy_enter):
        # 1. Success case
        mock_model = MockWhisperModel()
        service = TranscriptService(model=mock_model)
        service.transcribe_video(video_with_audio)

        assert len(captured_temp_dirs) == 1
        assert not captured_temp_dirs[0].exists(), "Temporary directory must be cleaned up on success"

        # 2. Failure case
        fail_model = MockWhisperModel(raise_on_transcribe=ValueError("Inference crash"))
        fail_service = TranscriptService(model=fail_model)
        with pytest.raises(TranscriptionError):
            fail_service.transcribe_video(video_with_audio)

        assert len(captured_temp_dirs) == 2
        assert not captured_temp_dirs[1].exists(), "Temporary directory must be cleaned up on failure"


def test_whisper_model_manager_caching_and_reuse():
    """WhisperModelManager should reuse model instances for identical configuration."""
    dummy_model_instance = object()

    with patch("faster_whisper.WhisperModel", return_value=dummy_model_instance) as mock_cls:
        m1 = WhisperModelManager.get_model(model_size="base", device="cpu", compute_type="default")
        m2 = WhisperModelManager.get_model(model_size="base", device="cpu", compute_type="default")

        assert m1 is dummy_model_instance
        assert m2 is dummy_model_instance
        # Should only be constructed once
        assert mock_cls.call_count == 1

        # Different configuration instantiates new model
        m3 = WhisperModelManager.get_model(model_size="small", device="cpu", compute_type="default")
        assert mock_cls.call_count == 2


def test_whisper_model_manager_initialization_failure():
    """Model initialization errors must be wrapped in TranscriptionError."""
    with patch("faster_whisper.WhisperModel", side_effect=Exception("Model weights corrupted")):
        with pytest.raises(TranscriptionError) as exc_info:
            WhisperModelManager.get_model(model_size="corrupted_model")
        assert "Failed to initialize Whisper model" in str(exc_info.value)


def test_convenience_transcribe_video_function(video_with_audio: Path):
    """Top-level transcribe_video functional wrapper should function identically."""
    mock_model = MockWhisperModel()
    result = transcribe_video(video_with_audio, duration_seconds=3.0, model=mock_model)

    assert result.has_audio is True
    assert len(result.segments) == 2
