#!/usr/bin/env python3
"""Manual smoke-test script for VideoAssist optical character recognition (OCR) service.

Usage:
    python backend/scripts/smoke_test_ocr.py <path_to_video.mp4>
    python backend/scripts/smoke_test_ocr.py --sample

Requirements:
    - Runs standalone without Supabase credentials or database connection.
    - Executes real EasyOCR inference on extracted keyframes.
    - Outputs recognized visible text, timestamps, genuine confidence scores, and bounding boxes.
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import Settings
from app.services.ocr_service import OcrService
from app.services.video_processor import extract_video_metadata, extract_keyframes


def generate_sample_video_with_text(output_path: Path) -> Path:
    """Generate a temporary 3-second sample MP4 video with visible equipment text overlay."""
    with tempfile.TemporaryDirectory(prefix="va_ocr_sample_") as tmp_dir:
        tmp = Path(tmp_dir)

        # Create 3 frames with distinct text labels
        frames = [
            ("MODEL: RT-AC68U", "SERIAL: SN-987654321"),
            ("STATUS: NORMAL", "VOLTAGE: 120V AC"),
            ("CAUTION: HIGH TEMPERATURE", "INSPECTION PASSED"),
        ]

        img_paths = []
        for idx, (line1, line2) in enumerate(frames):
            img = Image.new("RGB", (640, 480), color=(30, 40, 60))
            draw = ImageDraw.Draw(img)
            # Draw rectangular equipment plate
            draw.rectangle([80, 100, 560, 380], fill=(240, 240, 240), outline=(200, 200, 200), width=3)
            draw.text((120, 180), line1, fill=(10, 10, 10))
            draw.text((120, 260), line2, fill=(200, 30, 30))
            frame_img = tmp / f"frame_{idx}.png"
            img.save(frame_img)
            img_paths.append(frame_img)

        # Assemble video from image sequence
        cmd = [
            "ffmpeg",
            "-y",
            "-framerate", "1",
            "-loop", "0",
            "-t", "3",
            "-i", str(tmp / "frame_%d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    return output_path


def run_smoke_test(video_path: Path, languages: str = "en") -> int:
    print("=" * 70)
    print("VideoAssist Phase 2B — OCR Smoke Test")
    print("=" * 70)

    if not video_path.exists():
        print(f"Error: Target video file not found: {video_path}")
        return 1

    file_size_mb = video_path.stat().st_size / (1024 * 1024)
    print(f"Input Video: {video_path.resolve()}")
    print(f"File Size:   {file_size_mb:.2f} MB")

    # 1. Metadata inspection
    try:
        metadata = extract_video_metadata(video_path)
        print(f"Duration:    {metadata.duration_seconds:.2f}s")
        print(f"Resolution:  {metadata.width}x{metadata.height}")
        print(f"Frame Rate:  {metadata.fps:.2f} fps")
    except Exception as e:
        print(f"Warning: Could not parse video metadata: {e}")
        metadata = None

    # 2. Keyframe extraction
    with tempfile.TemporaryDirectory(prefix="va_ocr_test_") as tmp_dir:
        keyframes_dir = Path(tmp_dir) / "keyframes"
        print(f"\n[1/3] Extracting keyframes...")
        keyframes = extract_keyframes(
            video_path=video_path,
            output_dir=keyframes_dir,
            max_keyframes=3,
            metadata=metadata,
        )
        print(f"Extracted {len(keyframes)} representative keyframe(s):")
        for kf in keyframes:
            print(f"  - Frame at {kf.timestamp_seconds:.3f}s: {Path(kf.frame_path).name} ({kf.width}x{kf.height})")

        # 3. EasyOCR initialization
        print(f"\n[2/3] Initializing EasyOCR (languages='{languages}')...")
        lang_list = [l.strip() for l in languages.split(",") if l.strip()]
        settings = Settings(
            _env_file=None,
            OCR_ENABLED=True,
            OCR_LANGUAGES=lang_list,
            OCR_GPU=False,
            OCR_CONFIDENCE_THRESHOLD=0.2,
        )
        ocr_service = OcrService(settings=settings)

        # 4. Optical character recognition
        print(f"\n[3/3] Running text detection on extracted keyframes...")
        result = ocr_service.process_keyframes(keyframes=keyframes)

        print("\n" + "=" * 70)
        print("OCR Inference Results")
        print("=" * 70)
        print(f"Frames Processed: {result.frames_processed}")
        print(f"Frames With Text: {result.frames_with_text}")
        print(f"Total Detections: {len(result.detections)}")
        print(f"Engine:           {result.engine_name}")

        if not result.detections:
            print("\nNo visible text regions detected in keyframes.")
        else:
            print("\nDetected Text Regions:")
            for idx, det in enumerate(result.detections, 1):
                conf_str = f"{det.confidence * 100:.1f}%" if det.confidence is not None else "N/A"
                bbox_str = (
                    f"[{det.bbox.x_min:.2f}, {det.bbox.y_min:.2f}] - [{det.bbox.x_max:.2f}, {det.bbox.y_max:.2f}]"
                    if det.bbox else "None"
                )
                print(f"  {idx:2d}. [{det.timestamp_seconds:6.3f}s] Conf: {conf_str:6s} | Box: {bbox_str}")
                print(f"      Text: \"{det.text}\"")

    print("\n" + "=" * 70)
    print("Smoke test completed successfully!")
    print("=" * 70)
    return 0


def main():
    parser = argparse.ArgumentParser(description="Smoke test VideoAssist OCR Service")
    parser.add_argument("video_path", nargs="?", help="Path to video file")
    parser.add_argument("--sample", action="store_true", help="Generate synthetic test video with text overlays")
    parser.add_argument("--lang", default="en", help="Comma-separated language codes (default: 'en')")

    args = parser.parse_args()

    if args.sample:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            sample_path = Path(f.name)
        try:
            print(f"Generating synthetic test video with text overlays...")
            generate_sample_video_with_text(sample_path)
            sys.exit(run_smoke_test(sample_path, languages=args.lang))
        finally:
            sample_path.unlink(missing_ok=True)
    elif args.video_path:
        sys.exit(run_smoke_test(Path(args.video_path), languages=args.lang))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()

