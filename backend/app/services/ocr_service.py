import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from PIL import Image

from app.core.config import Settings, get_settings
from app.core.exceptions import OCRError, VideoNotFoundError
from app.schemas.ocr import BoundingBox, OcrDetection, OcrResult
from app.schemas.video import ExtractedFrame, VideoMetadata
from app.services.video_processor import (
    ManagedTempDirectory,
    extract_keyframes,
    validate_video_file,
)
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.ocr_service")


class EasyOCRReaderManager:
    """Thread-safe manager for lazy initialization and reuse of EasyOCR Reader instances."""

    _readers: Dict[Tuple[Tuple[str, ...], bool, Optional[str]], Any] = {}
    _lock = threading.Lock()

    @classmethod
    def get_reader(
        cls,
        languages: Optional[List[str]] = None,
        gpu: bool = False,
        model_storage_directory: Optional[str] = None,
    ) -> Any:
        """Get or lazily load a cached easyocr.Reader instance."""
        lang_tuple = tuple(languages or ["en"])
        key = (lang_tuple, gpu, model_storage_directory)

        with cls._lock:
            if key not in cls._readers:
                logger.info(
                    "Initializing EasyOCR reader (languages=%s, gpu=%s, model_storage_directory=%s)...",
                    list(lang_tuple),
                    gpu,
                    model_storage_directory,
                )
                try:
                    import os
                    import easyocr

                    # Resolve safe, writable model storage directory
                    target_dir = model_storage_directory
                    if not target_dir:
                        try:
                            home_dir = Path.home() / ".EasyOCR"
                            home_dir.mkdir(parents=True, exist_ok=True)
                            target_dir = str(home_dir)
                        except (PermissionError, OSError):
                            temp_dir = Path("/tmp/videoassist/ocr_models")
                            temp_dir.mkdir(parents=True, exist_ok=True)
                            target_dir = str(temp_dir)

                    os.environ["EASYOCR_MODULE_PATH"] = target_dir
                    user_network_dir = Path(target_dir) / "user_network"
                    try:
                        user_network_dir.mkdir(parents=True, exist_ok=True)
                    except (PermissionError, OSError):
                        pass

                    kwargs: Dict[str, Any] = {
                        "lang_list": list(lang_tuple),
                        "gpu": gpu,
                        "model_storage_directory": target_dir,
                        "user_network_directory": str(user_network_dir),
                    }

                    cls._readers[key] = easyocr.Reader(**kwargs)
                except Exception as e:
                    logger.error("Failed to initialize EasyOCR reader: %s", str(e))
                    raise OCRError(f"Failed to initialize EasyOCR reader: {str(e)}") from e
            return cls._readers[key]

    @classmethod
    def clear_cache(cls) -> None:
        """Clear all cached reader instances."""
        with cls._lock:
            cls._readers.clear()


class OcrService:
    """Dedicated service for optical character recognition on video frames using EasyOCR."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        reader: Optional[Any] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._custom_reader = reader

    def get_reader(self) -> Any:
        """Retrieve the EasyOCR Reader instance (custom reader or cached singleton)."""
        if self._custom_reader is not None:
            return self._custom_reader
        return EasyOCRReaderManager.get_reader(
            languages=self.settings.OCR_LANGUAGES,
            gpu=self.settings.OCR_GPU,
            model_storage_directory=self.settings.OCR_MODEL_STORAGE_DIRECTORY,
        )

    def process_frame(
        self,
        frame_path: Union[str, Path],
        timestamp_seconds: float,
        frame_index: Optional[int] = None,
        frame_id: Optional[str] = None,
        confidence_threshold: Optional[float] = None,
    ) -> List[OcrDetection]:
        """Run OCR on a single image frame and return structured detections with normalized bounding boxes.

        Args:
            frame_path: Path to the target image file.
            timestamp_seconds: Time in seconds from video start when frame was captured.
            frame_index: Optional index of the keyframe in sequence.
            frame_id: Optional database UUID of the corresponding video_frames row.
            confidence_threshold: Optional override for minimum confidence to retain detections.

        Returns:
            List of detected OcrDetection items.

        Raises:
            OCRError: If the frame cannot be read or OCR inference fails.
        """
        path = Path(frame_path).resolve()
        sanitized = sanitize_url_or_path(path)

        if not path.exists() or not path.is_file():
            logger.error("Target frame image does not exist: %s", sanitized)
            raise OCRError(f"Frame image not found: {sanitized}")

        # Obtain image dimensions for bounding box normalization
        try:
            with Image.open(path) as img:
                img_width, img_height = img.size
        except Exception as img_err:
            logger.error("Failed to read image dimensions for %s: %s", sanitized, str(img_err))
            raise OCRError(f"Invalid or unreadable image file {sanitized}: {str(img_err)}") from img_err

        if img_width <= 0 or img_height <= 0:
            logger.warning("Zero dimension frame encountered for %s (%dx%d)", sanitized, img_width, img_height)
            return []

        threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else self.settings.OCR_CONFIDENCE_THRESHOLD
        )

        try:
            reader = self.get_reader()
            raw_results = reader.readtext(str(path))
        except Exception as ocr_err:
            logger.error("EasyOCR inference failed on frame %s: %s", sanitized, str(ocr_err))
            raise OCRError(f"EasyOCR inference error on {sanitized}: {str(ocr_err)}") from ocr_err

        detections: List[OcrDetection] = []
        for raw in raw_results:
            # EasyOCR raw output format: (bbox, text, prob)
            # where bbox is list of 4 [x, y] coordinates
            if not raw or len(raw) < 2:
                continue

            bbox_raw = raw[0]
            text = str(raw[1]).strip() if raw[1] is not None else ""
            prob = float(raw[2]) if len(raw) > 2 and raw[2] is not None else None

            # Skip empty or whitespace-only detections
            if not text:
                continue

            # Filter detections below confidence threshold
            if prob is not None and prob < threshold:
                logger.debug(
                    "Skipping detection '%s' with confidence %.3f below threshold %.3f",
                    text,
                    prob,
                    threshold,
                )
                continue

            # Calculate normalized bounding box [0.0 - 1.0]
            norm_bbox: Optional[BoundingBox] = None
            if bbox_raw and len(bbox_raw) >= 4:
                try:
                    xs = [pt[0] for pt in bbox_raw]
                    ys = [pt[1] for pt in bbox_raw]
                    x_min = max(0.0, min(1.0, float(min(xs)) / img_width))
                    y_min = max(0.0, min(1.0, float(min(ys)) / img_height))
                    x_max = max(0.0, min(1.0, float(max(xs)) / img_width))
                    y_max = max(0.0, min(1.0, float(max(ys)) / img_height))
                    norm_bbox = BoundingBox(
                        x_min=round(x_min, 4),
                        y_min=round(y_min, 4),
                        x_max=round(x_max, 4),
                        y_max=round(y_max, 4),
                    )
                except Exception as box_err:
                    logger.debug("Failed to calculate normalized bounding box for detection '%s': %s", text, str(box_err))

            detection = OcrDetection(
                timestamp_seconds=round(timestamp_seconds, 3),
                text=text,
                confidence=round(prob, 4) if prob is not None else None,
                bbox=norm_bbox,
                frame_index=frame_index,
                frame_path=path.name,
                frame_id=frame_id,
            )
            detections.append(detection)

        logger.debug(
            "Frame %s at %.3fs: %d text detections (threshold=%.2f)",
            path.name,
            timestamp_seconds,
            len(detections),
            threshold,
        )
        return detections

    def process_keyframes(
        self,
        keyframes: List[ExtractedFrame],
        frame_records: Optional[List[Dict[str, Any]]] = None,
        confidence_threshold: Optional[float] = None,
    ) -> OcrResult:
        """Run OCR over a set of representative keyframes, avoiding redundant processing.

        Args:
            keyframes: List of ExtractedFrame objects (paths, timestamps, dimensions).
            frame_records: Optional persisted video_frames records (used to resolve frame_id).
            confidence_threshold: Optional confidence threshold.

        Returns:
            OcrResult containing all detections and summary metrics.
        """
        if not keyframes:
            logger.info("No keyframes provided for OCR processing.")
            return OcrResult(detections=[], frames_processed=0, frames_with_text=0)

        # Build lookup for frame_id from persisted frame_records if available
        frame_id_by_ts: Dict[float, str] = {}
        if frame_records:
            for rec in frame_records:
                ts = rec.get("timestamp_seconds")
                fid = rec.get("id")
                if ts is not None and fid:
                    frame_id_by_ts[round(float(ts), 3)] = str(fid)

        # Deduplicate keyframes by resolved absolute path to avoid redundant inference
        seen_paths = set()
        unique_frames: List[Tuple[int, ExtractedFrame]] = []
        for idx, kf in enumerate(keyframes):
            res_path = str(Path(kf.frame_path).resolve())
            if res_path not in seen_paths:
                seen_paths.add(res_path)
                unique_frames.append((idx, kf))

        all_detections: List[OcrDetection] = []
        frames_with_text = 0

        for frame_idx, kf in unique_frames:
            ts = round(float(kf.timestamp_seconds), 3)
            matched_frame_id = frame_id_by_ts.get(ts)

            try:
                frame_detections = self.process_frame(
                    frame_path=kf.frame_path,
                    timestamp_seconds=ts,
                    frame_index=frame_idx,
                    frame_id=matched_frame_id,
                    confidence_threshold=confidence_threshold,
                )
                if frame_detections:
                    frames_with_text += 1
                    all_detections.extend(frame_detections)
            except Exception as e:
                # Log error and continue to subsequent frames so partial frame failures do not abort the pipeline
                logger.error(
                    "Error processing keyframe %s at %.3fs for OCR: %s",
                    Path(kf.frame_path).name,
                    ts,
                    str(e),
                )

        logger.info(
            "OCR complete: processed %d unique frames, found %d text regions across %d frames.",
            len(unique_frames),
            len(all_detections),
            frames_with_text,
        )

        return OcrResult(
            detections=all_detections,
            frames_processed=len(unique_frames),
            frames_with_text=frames_with_text,
            engine_name="easyocr",
        )

    def process_video(
        self,
        video_path: Union[str, Path],
        max_keyframes: int = 3,
        metadata: Optional[VideoMetadata] = None,
        confidence_threshold: Optional[float] = None,
    ) -> OcrResult:
        """Standalone helper to extract keyframes from a video and run OCR end-to-end.

        Args:
            video_path: Path to the target video.
            max_keyframes: Number of keyframes to extract for OCR (default 3).
            metadata: Pre-extracted VideoMetadata if available.
            confidence_threshold: Optional confidence threshold.

        Returns:
            OcrResult with all detections.
        """
        resolved_path = validate_video_file(
            video_path,
            max_size_bytes=self.settings.MAX_VIDEO_SIZE_BYTES,
        )

        with ManagedTempDirectory(prefix="va_ocr_test_") as temp_dir:
            keyframes_dir = temp_dir / "keyframes"
            keyframes = extract_keyframes(
                video_path=resolved_path,
                output_dir=keyframes_dir,
                max_keyframes=max_keyframes,
                metadata=metadata,
            )
            return self.process_keyframes(
                keyframes=keyframes,
                confidence_threshold=confidence_threshold,
            )
