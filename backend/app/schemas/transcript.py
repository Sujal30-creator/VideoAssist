from typing import List, Optional
from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    """Represents an individual speech segment with normalized boundaries and text."""

    start_time: float = Field(
        ...,
        ge=0.0,
        description="Start time of the speech segment in seconds from beginning of video",
        examples=[1.25],
    )
    end_time: float = Field(
        ...,
        ge=0.0,
        description="End time of the speech segment in seconds from beginning of video",
        examples=[5.68],
    )
    text: str = Field(
        ...,
        description="Recognized speech text",
        examples=["Starting the router replacement procedure now."],
    )
    speaker: Optional[str] = Field(
        default=None,
        description="Speaker label if diarization is available (None by default)",
        examples=[None],
    )
    language: Optional[str] = Field(
        default=None,
        description="Detected or forced ISO 639-1 language code (e.g. 'en')",
        examples=["en"],
    )
    confidence: Optional[float] = Field(
        default=None,
        description="Calibrated confidence score if available; None when not calibrated",
        examples=[None],
    )
    # Available model metadata
    avg_logprob: Optional[float] = Field(
        default=None,
        description="Average log probability of tokens in this segment from Whisper",
        examples=[-0.25],
    )
    no_speech_prob: Optional[float] = Field(
        default=None,
        description="Model probability that the segment contains no speech",
        examples=[0.01],
    )


class TranscriptResult(BaseModel):
    """Outcome of audio inspection and speech transcription."""

    has_audio: bool = Field(
        ...,
        description="True if video has an audio stream that was processed; False if no audio stream exists",
    )
    segments: List[TranscriptSegment] = Field(
        default_factory=list,
        description="List of transcribed speech segments",
    )
    detected_language: Optional[str] = Field(
        default=None,
        description="Primary detected language code (e.g. 'en')",
    )
    language_probability: Optional[float] = Field(
        default=None,
        description="Model probability for the primary detected language",
    )
    audio_duration_seconds: Optional[float] = Field(
        default=None,
        description="Duration of the audio stream in seconds",
    )
    model_size: Optional[str] = Field(
        default=None,
        description="Whisper model size used for transcription (e.g. 'base')",
    )
    no_audio_reason: Optional[str] = Field(
        default=None,
        description="Explanation when has_audio is False (e.g. 'No audio stream found in media container')",
    )

