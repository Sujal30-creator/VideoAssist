from pathlib import Path
from typing import Any, List, Optional
import pytest
from PIL import Image

from app.core.config import Settings
from app.core.exceptions import OCRError
from app.schemas.ocr import BoundingBox, OcrDetection, OcrResult
from app.schemas.video import ExtractedFrame
from app.services.ocr_service import EasyOCRReaderManager, OcrService


class MockEasyOCRReader:
    """Mock reader simulating easyocr.Reader.readtext."""

    def __init__(self, mock_results: Optional[List[Any]] = None, raise_error: bool = False):
        self.mock_results = mock_results or []
        self.raise_error = raise_error
        self.calls = []

    def readtext(self, image_path: str):
        self.calls.append(image_path)
        if self.raise_error:
            raise RuntimeError("Underlying OCR engine internal failure")
        return self.mock_results


@pytest.fixture
def test_image_path(tmp_path: Path) -> Path:
    """Generate a valid test JPEG image."""
    img_path = tmp_path / "test_frame.jpg"
    img = Image.new("RGB", (640, 480), color=(255, 255, 255))
    img.save(img_path, format="JPEG")
    return img_path


def test_ocr_service_initialization_defaults():
    """Verify OcrService loads default settings cleanly."""
    svc = OcrService()
    assert svc.settings.OCR_ENABLED is True
    assert svc.settings.OCR_LANGUAGES == ["en"]
    assert svc.settings.OCR_GPU is False
    assert svc.settings.OCR_CONFIDENCE_THRESHOLD == 0.3


def test_ocr_service_process_frame_success(test_image_path: Path):
    """Verify structured output and normalized bounding boxes from process_frame."""
    # 640x480 image
    # Bounding box coordinates: [ [64, 48], [320, 48], [320, 144], [64, 144] ]
    # Normalized: x_min=0.1, y_min=0.1, x_max=0.5, y_max=0.3
    raw_mock = [
        ([[64, 48], [320, 48], [320, 144], [64, 144]], "SYSTEM-PUMP-4000", 0.9421)
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    detections = svc.process_frame(
        frame_path=test_image_path,
        timestamp_seconds=2.5,
        frame_index=1,
        frame_id="frame-uuid-123",
    )

    assert len(detections) == 1
    det = detections[0]
    assert det.text == "SYSTEM-PUMP-4000"
    assert det.confidence == 0.9421
    assert det.timestamp_seconds == 2.5
    assert det.frame_index == 1
    assert det.frame_id == "frame-uuid-123"
    assert det.bbox is not None
    assert det.bbox.x_min == 0.1
    assert det.bbox.y_min == 0.1
    assert det.bbox.x_max == 0.5
    assert det.bbox.y_max == 0.3


def test_ocr_service_empty_text_and_no_text_frames(test_image_path: Path):
    """Verify that empty detections or whitespace text are ignored gracefully."""
    raw_mock = [
        ([[0, 0], [10, 0], [10, 10], [0, 10]], "   ", 0.8),
        ([[0, 0], [10, 0], [10, 10], [0, 10]], "", 0.9),
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    detections = svc.process_frame(test_image_path, timestamp_seconds=0.0)
    assert len(detections) == 0


def test_ocr_service_confidence_threshold_filtering(test_image_path: Path):
    """Verify low-confidence detections below configured threshold are excluded."""
    raw_mock = [
        ([[10, 10], [50, 10], [50, 20], [10, 20]], "HIGH_CONF", 0.88),
        ([[10, 30], [50, 30], [50, 40], [10, 40]], "LOW_CONF", 0.15),
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    detections = svc.process_frame(
        test_image_path, timestamp_seconds=1.0, confidence_threshold=0.3
    )
    assert len(detections) == 1
    assert detections[0].text == "HIGH_CONF"
    assert detections[0].confidence == 0.88


def test_ocr_service_preserves_null_confidence_without_fabrication(test_image_path: Path):
    """Verify confidence remains None when engine returns None (never fabricated)."""
    raw_mock = [
        ([[10, 10], [50, 10], [50, 20], [10, 20]], "TEXT_WITHOUT_SCORE", None)
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    detections = svc.process_frame(test_image_path, timestamp_seconds=1.0, confidence_threshold=0.0)
    assert len(detections) == 1
    assert detections[0].text == "TEXT_WITHOUT_SCORE"
    assert detections[0].confidence is None


def test_ocr_service_handles_engine_error(test_image_path: Path):
    """Verify OCRError is raised when underlying engine throws."""
    mock_reader = MockEasyOCRReader(raise_error=True)
    svc = OcrService(reader=mock_reader)

    with pytest.raises(OCRError, match="EasyOCR inference error"):
        svc.process_frame(test_image_path, timestamp_seconds=1.0)


def test_ocr_service_handles_missing_frame_image(tmp_path: Path):
    """Verify OCRError is raised when the target image file does not exist."""
    missing_path = tmp_path / "non_existent_frame.jpg"
    svc = OcrService(reader=MockEasyOCRReader())

    with pytest.raises(OCRError, match="Frame image not found"):
        svc.process_frame(missing_path, timestamp_seconds=1.0)


def test_ocr_service_process_keyframes_deduplicates_and_links_frame_id(tmp_path: Path):
    """Verify batch keyframe processing deduplicates frames and attaches frame_id from DB records."""
    frame1_path = tmp_path / "frame1.jpg"
    frame2_path = tmp_path / "frame2.jpg"
    Image.new("RGB", (320, 240)).save(frame1_path)
    Image.new("RGB", (320, 240)).save(frame2_path)

    keyframes = [
        ExtractedFrame(frame_path=str(frame1_path), timestamp_seconds=0.5, frame_index=0, width=320, height=240),
        ExtractedFrame(frame_path=str(frame1_path), timestamp_seconds=0.5, frame_index=0, width=320, height=240),  # Duplicate
        ExtractedFrame(frame_path=str(frame2_path), timestamp_seconds=1.5, frame_index=1, width=320, height=240),
    ]

    frame_records = [
        {"id": "db-frame-uuid-1", "timestamp_seconds": 0.5},
        {"id": "db-frame-uuid-2", "timestamp_seconds": 1.5},
    ]

    raw_mock = [
        ([[10, 10], [50, 10], [50, 30], [10, 30]], "LABEL-A", 0.95)
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    result: OcrResult = svc.process_keyframes(keyframes=keyframes, frame_records=frame_records)

    # 3 keyframes supplied, but 1 duplicate -> 2 unique processed frames
    assert result.frames_processed == 2
    assert result.frames_with_text == 2
    assert len(result.detections) == 2
    assert result.engine_name == "easyocr"

    # Frame 1 detection should have matched db-frame-uuid-1
    assert result.detections[0].frame_id == "db-frame-uuid-1"
    assert result.detections[0].timestamp_seconds == 0.5

    # Frame 2 detection should have matched db-frame-uuid-2
    assert result.detections[1].frame_id == "db-frame-uuid-2"
    assert result.detections[1].timestamp_seconds == 1.5


def test_ocr_service_process_keyframes_partial_failure_resilience(tmp_path: Path):
    """Verify that an individual frame failure does not abort processing of subsequent frames."""
    good_frame_path = tmp_path / "good_frame.jpg"
    corrupt_frame_path = tmp_path / "corrupt_frame.jpg"

    Image.new("RGB", (320, 240)).save(good_frame_path)
    corrupt_frame_path.write_bytes(b"not an image file")

    keyframes = [
        ExtractedFrame(frame_path=str(good_frame_path), timestamp_seconds=0.0, frame_index=0, width=320, height=240),
        ExtractedFrame(frame_path=str(corrupt_frame_path), timestamp_seconds=1.0, frame_index=1, width=320, height=240),
    ]

    raw_mock = [
        ([[10, 10], [50, 10], [50, 30], [10, 30]], "GOOD_TEXT", 0.9)
    ]
    mock_reader = MockEasyOCRReader(mock_results=raw_mock)
    svc = OcrService(reader=mock_reader)

    result = svc.process_keyframes(keyframes=keyframes)
    # The good frame succeeds and its detection is kept
    assert result.frames_processed == 2
    assert len(result.detections) == 1
    assert result.detections[0].text == "GOOD_TEXT"
