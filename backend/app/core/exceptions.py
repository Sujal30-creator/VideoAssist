"""Custom exception hierarchy for VideoAssist backend services."""


class MediaProcessingError(Exception):
    """Base exception for all video and media processing errors."""

    def __init__(self, message: str, details: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.details = details

    def __str__(self) -> str:
        if self.details:
            return f"{self.message} ({self.details})"
        return self.message


class VideoNotFoundError(MediaProcessingError):
    """Raised when a requested video file does not exist or is unreadable."""

    pass


class VideoSizeLimitExceededError(MediaProcessingError):
    """Raised when a video file exceeds the configured maximum allowed file size."""

    pass


class VideoFormatError(MediaProcessingError):
    """Raised when an input file is not a supported or valid video container."""

    pass


class MetadataExtractionError(MediaProcessingError):
    """Raised when container or stream metadata cannot be reliably parsed."""

    pass


class FrameExtractionError(MediaProcessingError):
    """Raised when keyframe image extraction fails."""

    pass
