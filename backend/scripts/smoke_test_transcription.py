#!/usr/bin/env python3
"""Manual smoke-test script for VideoAssist speech transcription service.

Usage:
    python backend/scripts/smoke_test_transcription.py <path_to_video.mp4>
    python backend/scripts/smoke_test_transcription.py --sample

Requirements:
    - Runs standalone without Supabase credentials or database connection.
    - Executes actual faster-whisper inference (unmocked).
    - Distinguishes between videos lacking audio vs. audio with zero detected speech.
"""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import Settings
from app.core.exceptions import (
    AudioExtractionError,
    MetadataExtractionError,
    TranscriptionError,
    VideoFormatError,
    VideoNotFoundError,
    VideoSizeLimitExceededError,
)
from app.services.transcript_service import TranscriptService, check_audio_stream


def generate_sample_video_with_speech(output_path: Path) -> Path:
    """Generate a temporary 3-second sample MP4 with audible speech using macOS 'say' or FFmpeg."""
    with tempfile.TemporaryDirectory(prefix="va_sample_") as tmp_dir:
        aiff_path = Path(tmp_dir) / "speech.aiff"
        has_say = subprocess.run(["which", "say"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

        if has_say:
            subprocess.run(
                ["say", "-v", "Samantha", "-o", str(aiff_path), "Starting the router replacement procedure now."],
                check=True,
            )
            audio_args = ["-i", str(aiff_path)]
        else:
            audio_args = ["-f", "lavfi", "-i", "sine=frequency=1000"]

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", "color=c=navy:s=320x240:d=4",
            *audio_args,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-shortest",
            str(output_path),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    return output_path


def run_smoke_test(video_path: Path, model_size: str = "base") -> int:
    print("=" * 70)
    print(" VideoAssist Phase 2A — Standalone Speech Transcription Smoke Test")
    print("=" * 70)
    print(f"Target Video Path: {video_path}")
    print(f"File Size:         {video_path.stat().st_size if video_path.exists() else 'N/A'} bytes")

    # Load settings without requiring Supabase or database credentials
    settings = Settings(
        _env_file=None,
        WHISPER_MODEL_SIZE=os.getenv("WHISPER_MODEL_SIZE", model_size),
        WHISPER_DEVICE=os.getenv("WHISPER_DEVICE", "auto"),
        WHISPER_COMPUTE_TYPE=os.getenv("WHISPER_COMPUTE_TYPE", "default"),
    )
    print(f"Whisper Model:     '{settings.WHISPER_MODEL_SIZE}' (device={settings.WHISPER_DEVICE}, compute={settings.WHISPER_COMPUTE_TYPE})")
    print("-" * 70)

    service = TranscriptService(settings=settings)

    try:
        result = service.transcribe_video(video_path=video_path)
    except VideoNotFoundError as e:
        print(f"\n[ERROR] Video file not found or unreadable: {e.message}", file=sys.stderr)
        return 1
    except VideoFormatError as e:
        print(f"\n[ERROR] Invalid or corrupt video container: {e.message}", file=sys.stderr)
        return 1
    except VideoSizeLimitExceededError as e:
        print(f"\n[ERROR] File size exceeds permitted limit: {e.message}", file=sys.stderr)
        return 1
    except AudioExtractionError as e:
        print(f"\n[ERROR] Audio extraction failed (FFmpeg): {e.message}", file=sys.stderr)
        return 1
    except TranscriptionError as e:
        print(f"\n[ERROR] Model loading or transcription inference failed: {e.message}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\n[ERROR] Unexpected error during transcription: {e}", file=sys.stderr)
        return 1

    print("\n--- TRANSCRIPTION OUTCOME ---")
    if not result.has_audio:
        print("[OUTCOME: NO AUDIO]")
        print("Status:           The input video container has NO audio stream.")
        print(f"Reason:           {result.no_audio_reason or 'No audio stream detected.'}")
        print("Note:             Handled cleanly without error or fabricated transcript.")
        return 0

    if result.has_audio and len(result.segments) == 0:
        print("[OUTCOME: AUDIO DETECTED - NO SPEECH RECOGNIZED]")
        print(f"Audio Duration:   {result.audio_duration_seconds}s")
        print(f"Detected Lang:    {result.detected_language} (prob: {result.language_probability})")
        print("Recognized Text:  (none / silent or non-verbal audio track)")
        return 0

    print("[OUTCOME: TRANSCRIPTION SUCCESSFUL]")
    print(f"Detected Language: {result.detected_language} (confidence prob: {result.language_probability})")
    print(f"Audio Duration:    {result.audio_duration_seconds}s")
    print(f"Segment Count:     {len(result.segments)}")
    print("\nSegments:")
    for idx, seg in enumerate(result.segments, 1):
        print(f"  [{idx}] {seg.start_time:06.2f}s -> {seg.end_time:06.2f}s | \"{seg.text}\"")
        print(f"      (avg_logprob={seg.avg_logprob}, no_speech_prob={seg.no_speech_prob}, speaker={seg.speaker})")

    print("\n Smoke test verified with real unmocked Whisper inference.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual smoke-test for VideoAssist speech transcription service.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "video_path",
        nargs="?",
        type=str,
        help="Path to local video file (.mp4, .mov, .mkv, etc.) to transcribe.",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Synthesize a temporary 3-second sample video with speech and transcribe it.",
    )
    parser.add_argument(
        "--model-size",
        type=str,
        default="base",
        help="Whisper model size to use (default: 'base'). Options: tiny, base, small, medium, large-v3.",
    )

    args = parser.parse_args()

    if args.sample or not args.video_path:
        if not args.sample and not args.video_path:
            print("No video path provided. Synthesizing temporary sample video with audible speech...\n")
        with tempfile.TemporaryDirectory(prefix="va_smoke_run_") as tmp_dir:
            sample_file = Path(tmp_dir) / "sample_speech.mp4"
            generate_sample_video_with_speech(sample_file)
            exit_code = run_smoke_test(sample_file, model_size=args.model_size)
        sys.exit(exit_code)
    else:
        target_path = Path(args.video_path).resolve()
        exit_code = run_smoke_test(target_path, model_size=args.model_size)
        sys.exit(exit_code)


if __name__ == "__main__":
    main()

