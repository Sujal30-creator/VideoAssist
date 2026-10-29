import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    AudioExtractionError,
    MetadataExtractionError,
    TranscriptionError,
    VideoFormatError,
)
from app.schemas.transcript import TranscriptResult, TranscriptSegment
from app.services.video_processor import (
    DEFAULT_FFMPEG_BINARY,
    DEFAULT_FFPROBE_BINARY,
    ManagedTempDirectory,
    validate_video_file,
)
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.transcript_service")


def check_audio_stream(
    video_path: Union[str, Path],
    ffprobe_binary: str = DEFAULT_FFPROBE_BINARY,
) -> bool:
    """Inspect a media container using FFprobe to determine if an audio stream is present.

    Args:
        video_path: Local path to the validated video file.
        ffprobe_binary: FFprobe executable name or path.

    Returns:
        True if at least one audio stream is present, False otherwise.

    Raises:
        MetadataExtractionError: If FFprobe is missing or execution times out.
        VideoFormatError: If FFprobe fails to inspect the container.
    """
    sanitized = sanitize_url_or_path(video_path)
    cmd = [
        ffprobe_binary,
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=index,codec_name,channels,sample_rate",
        "-of",
        "json",
        str(video_path),
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
        raise MetadataExtractionError("FFprobe inspection timed out checking for audio stream.")

    if proc.returncode != 0:
        err_msg = proc.stderr.strip() or "Unknown error inspecting audio"
        logger.error("FFprobe audio inspection failed for %s: %s", sanitized, err_msg)
        raise VideoFormatError(f"Failed to inspect media file for audio streams: {err_msg}")

    try:
        data: Dict[str, Any] = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        logger.error("Malformed FFprobe JSON output for %s: %s", sanitized, str(e))
        raise MetadataExtractionError("Malformed FFprobe JSON output while inspecting audio.") from e

    streams = data.get("streams", [])
    has_audio = len(streams) > 0
    logger.debug("Audio stream check for %s: has_audio=%s", sanitized, has_audio)
    return has_audio


def extract_audio_from_video(
    video_path: Union[str, Path],
    output_audio_path: Union[str, Path],
    ffmpeg_binary: str = DEFAULT_FFMPEG_BINARY,
) -> Path:
    """Extract audio from a video into 16 kHz mono 16-bit PCM WAV format using FFmpeg.

    Args:
        video_path: Path to the input video.
        output_audio_path: Target path for the output .wav file.
        ffmpeg_binary: Executable name or path for ffmpeg.

    Returns:
        Path to the successfully extracted WAV file.

    Raises:
        AudioExtractionError: If FFmpeg fails, times out, or produces empty output.
    """
    sanitized = sanitize_url_or_path(video_path)
    out_path = Path(output_audio_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        ffmpeg_binary,
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(out_path),
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
        )
    except FileNotFoundError:
        logger.critical("ffmpeg executable not found in PATH: %s", ffmpeg_binary)
        raise AudioExtractionError(f"FFmpeg binary '{ffmpeg_binary}' not found in system PATH.")
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg timed out extracting audio for: %s", sanitized)
        raise AudioExtractionError("FFmpeg timed out during audio extraction.")

    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        err_msg = proc.stderr.strip() or "Empty audio extraction output"
        logger.error("FFmpeg audio extraction failed for %s: %s", sanitized, err_msg)
        raise AudioExtractionError(f"FFmpeg failed to extract audio: {err_msg}")

    logger.debug("Extracted 16kHz mono audio (%d bytes) for %s", out_path.stat().st_size, sanitized)
    return out_path


class WhisperModelManager:
    """Thread-safe manager for lazy initialization and reuse of WhisperModel instances."""

    _models: Dict[Tuple[str, str, str, Optional[str]], Any] = {}
    _lock = threading.Lock()

    @classmethod
    def get_model(
        cls,
        model_size: str = "base",
        device: str = "auto",
        compute_type: str = "default",
        download_root: Optional[str] = None,
    ) -> Any:
        """Get or lazily load a cached WhisperModel instance."""
        key = (model_size, device, compute_type, download_root)
        with cls._lock:
            if key not in cls._models:
                logger.info(
                    "Initializing faster-whisper model (size=%s, device=%s, compute_type=%s, download_root=%s)...",
                    model_size,
                    device,
                    compute_type,
                    download_root,
                )
                try:
                    from faster_whisper import WhisperModel

                    cls._models[key] = WhisperModel(
                        model_size,
                        device=device,
                        compute_type=compute_type,
                        download_root=download_root,
                    )
                except Exception as e:
                    logger.error("Failed to load faster-whisper model '%s': %s", model_size, str(e))
                    raise TranscriptionError(
                        f"Failed to initialize Whisper model '{model_size}': {str(e)}"
                    ) from e
            return cls._models[key]

    @classmethod
    def clear_cache(cls) -> None:
        """Clear all cached model instances."""
        with cls._lock:
            cls._models.clear()


class TranscriptService:
    """Service component for audio inspection, extraction, and speech transcription."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        model: Optional[Any] = None,
        ffmpeg_binary: str = DEFAULT_FFMPEG_BINARY,
        ffprobe_binary: str = DEFAULT_FFPROBE_BINARY,
    ) -> None:
        self.settings = settings or get_settings()
        self._custom_model = model
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary

    def get_model(self) -> Any:
        """Retrieve the Whisper model instance (custom injected model or cached singleton)."""
        if self._custom_model is not None:
            return self._custom_model
        return WhisperModelManager.get_model(
            model_size=self.settings.WHISPER_MODEL_SIZE,
            device=self.settings.WHISPER_DEVICE,
            compute_type=self.settings.WHISPER_COMPUTE_TYPE,
            download_root=self.settings.WHISPER_DOWNLOAD_ROOT,
        )

    def transcribe_video(
        self,
        video_path: Union[str, Path],
        duration_seconds: Optional[float] = None,
        language: Optional[str] = None,
    ) -> TranscriptResult:
        """Inspect video for audio, extract waveform, and transcribe speech with faster-whisper.

        Args:
            video_path: Path to the target local video file.
            duration_seconds: Known video duration in seconds (used to bound segment timestamps).
            language: Optional ISO 639-1 language code (e.g. 'en'); None uses auto-detection.

        Returns:
            TranscriptResult containing segments, detected language, and audio presence flag.

        Raises:
            VideoNotFoundError: If the video does not exist or is unreadable.
            VideoFormatError: If the media container is corrupt or unreadable.
            AudioExtractionError: If audio extraction fails.
            TranscriptionError: If Whisper model loading or inference fails.
        """
        sanitized = sanitize_url_or_path(video_path)
        path = validate_video_file(video_path, max_size_bytes=self.settings.MAX_VIDEO_SIZE_BYTES)

        # 1. Inspect for audio stream
        has_audio = check_audio_stream(path, ffprobe_binary=self.ffprobe_binary)
        if not has_audio:
            logger.info("Video %s contains no audio stream; returning no-audio result.", sanitized)
            return TranscriptResult(
                has_audio=False,
                segments=[],
                detected_language=None,
                language_probability=None,
                audio_duration_seconds=0.0,
                model_size=self.settings.WHISPER_MODEL_SIZE,
                no_audio_reason="No audio stream detected in video container",
            )

        # 2. Extract audio and run inference within a managed temporary directory
        with ManagedTempDirectory(prefix="va_audio_") as temp_dir:
            audio_path = temp_dir / "extracted_audio.wav"
            extract_audio_from_video(
                video_path=path,
                output_audio_path=audio_path,
                ffmpeg_binary=self.ffmpeg_binary,
            )

            # 3. Resolve Whisper model and language settings
            model = self.get_model()
            lang_to_use = language or self.settings.WHISPER_LANGUAGE

            logger.info(
                "Running speech transcription on %s (model=%s, forced_language=%s)...",
                sanitized,
                self.settings.WHISPER_MODEL_SIZE,
                lang_to_use or "auto-detect",
            )

            try:
                segments_generator, info = model.transcribe(
                    str(audio_path),
                    language=lang_to_use,
                    task="transcribe",
                    beam_size=5,
                )

                segments: List[TranscriptSegment] = []
                for seg in segments_generator:
                    text = seg.text.strip()
                    if not text:
                        continue

                    raw_start = float(seg.start)
                    raw_end = float(seg.end)

                    # Ensure non-negative start time
                    start_time = max(0.0, round(raw_start, 3))
                    end_time = max(start_time, round(raw_end, 3))

                    # Bound timestamps to known video duration (handling harmless rounding)
                    if duration_seconds is not None and duration_seconds > 0.0:
                        max_dur = round(duration_seconds, 3)
                        start_time = min(start_time, max_dur)
                        end_time = min(end_time, max_dur)
                        if end_time < start_time:
                            end_time = start_time

                    segments.append(
                        TranscriptSegment(
                            start_time=start_time,
                            end_time=end_time,
                            text=text,
                            speaker=None,  # No diarization assumed without evidence
                            language=info.language if info else None,
                            confidence=None,  # No uncalibrated probability assigned
                            avg_logprob=(
                                round(float(seg.avg_logprob), 4)
                                if getattr(seg, "avg_logprob", None) is not None
                                else None
                            ),
                            no_speech_prob=(
                                round(float(seg.no_speech_prob), 4)
                                if getattr(seg, "no_speech_prob", None) is not None
                                else None
                            ),
                        )
                    )

            except Exception as e:
                logger.error("Whisper inference failed for %s: %s", sanitized, str(e))
                raise TranscriptionError(f"Whisper speech transcription failed: {str(e)}") from e

        logger.info(
            "Transcription completed for %s: %d segments, detected language='%s'",
            sanitized,
            len(segments),
            info.language if info else "unknown",
        )

        return TranscriptResult(
            has_audio=True,
            segments=segments,
            detected_language=info.language if info else None,
            language_probability=(
                round(float(info.language_probability), 4)
                if info and getattr(info, "language_probability", None) is not None
                else None
            ),
            audio_duration_seconds=(
                round(float(info.duration), 3)
                if info and getattr(info, "duration", None) is not None
                else None
            ),
            model_size=self.settings.WHISPER_MODEL_SIZE,
            no_audio_reason=None,
        )


def transcribe_video(
    video_path: Union[str, Path],
    duration_seconds: Optional[float] = None,
    language: Optional[str] = None,
    settings: Optional[Settings] = None,
    model: Optional[Any] = None,
) -> TranscriptResult:
    """Convenience functional wrapper for transcript extraction."""
    service = TranscriptService(settings=settings, model=model)
    return service.transcribe_video(
        video_path=video_path,
        duration_seconds=duration_seconds,
        language=language,
    )

