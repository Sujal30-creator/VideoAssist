# VideoAssist Backend Service (Phase 1 Skeleton)

FastAPI microservice for **VideoAssist**: *Multimodal Temporal Event Retrieval and Evidence-Grounded Question Answering for IT Field-Service Videos*.

This service is responsible for background video preprocessing, keyframe extraction, and eventual multimodal pipeline orchestration while remaining completely decoupled from the Next.js frontend application.

---

## 1. Modular Directory Structure

```text
backend/
├── pyproject.toml              # Build metadata, dependency declarations & pytest options
├── requirements.txt            # Pinned dependencies (including Supabase client)
├── README.md                   # Service documentation & setup guide
├── .env.example                # Template with placeholder environment variables
├── .gitignore                  # Python caches, venvs, and media ignore rules
├── tests/                      # Automated test suite (53 tests)
│   ├── __init__.py
│   ├── conftest.py             # Pytest fixtures and TestClient configuration
│   ├── test_config.py          # Settings validation tests (13 tests)
│   ├── test_health.py          # Health & OpenAPI documentation tests (5 tests)
│   ├── test_jobs_api.py        # Token auth, validation & worker tests (16 tests)
│   └── test_video_processor.py # Video metadata and keyframe tests (19 tests)
└── app/
    ├── __init__.py             # Application package
    ├── main.py                 # FastAPI app factory, CORS, and root endpoints
    ├── core/
    │   ├── __init__.py
    │   ├── config.py           # Pydantic BaseSettings with strict validation
    │   ├── exceptions.py       # Custom media processing exception hierarchy
    │   └── security.py         # Fail-closed internal token verification
    ├── schemas/
    │   ├── __init__.py
    │   ├── health.py           # Pydantic schema for health response
    │   ├── job.py              # Pydantic schemas for job dispatch request/response
    │   └── video.py            # Schemas for VideoMetadata, ExtractedFrame, VideoProcessingResult
    ├── services/
    │   ├── __init__.py
    │   ├── health.py           # Service health logic
    │   ├── job_runner.py       # Background worker pipeline
    │   ├── supabase_service.py # Supabase client, database CRUD, and storage
    │   └── video_processor.py  # FFprobe metadata inspection & FFmpeg keyframe extraction
    ├── utils/
    │   ├── __init__.py
    │   └── logging.py          # Structured logging and secret/URL sanitizer
    └── api/
        ├── __init__.py
        └── v1/
            ├── __init__.py
            ├── router.py       # Aggregator for all v1 endpoint routers
            └── endpoints/
                ├── __init__.py
                ├── health.py   # GET /api/v1/health route handler
                └── jobs.py     # POST /api/v1/jobs & /api/v1/jobs/process handlers
```

---

## 2. Prerequisites (macOS)

- **Operating System**: macOS (Apple Silicon or Intel).
- **Python**: Python 3.9+ (Python 3.10+ recommended). Check with:
  ```bash
  python3 --version
  ```
- **Virtual Environment Support**: Standard `venv` module.
- **FFmpeg & FFprobe**: Required for media inspection and frame extraction. Check with:
  ```bash
  ffmpeg -version && ffprobe -version
  ```
  If not installed, install via Homebrew:
  ```bash
  brew install ffmpeg
  ```

---

## 3. Setup & Installation

### Step 1: Navigate to the Backend Directory
```bash
cd backend
```

### Step 2: Create a Dedicated Python Virtual Environment
```bash
python3 -m venv .venv
```

### Step 3: Activate the Virtual Environment
```bash
source .venv/bin/activate
```
*(Your terminal prompt should now indicate `(.venv)`)*.

### Step 4: Upgrade Pip and Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 5: Configure Environment Variables
Copy the provided `.env.example` file to create your local `.env`:
```bash
cp .env.example .env
```

#### Required Environment Variables Reference:

| Variable | Required? | Default | Description |
|---|---|---|---|
| `FASTAPI_INTERNAL_TOKEN` | **Yes** (fail-closed) | `placeholder-internal-secret-token` | Shared secret token for Next.js internal server action dispatch (`Authorization: Bearer <token>`) |
| `SUPABASE_URL` | **Yes** (for worker) | `https://placeholder-project.supabase.co` | Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** (for worker) | `placeholder-service-role-key` | Service role key (bypasses RLS for backend worker ingestion) |
| `STORAGE_BUCKET_VIDEOS` | Optional | `field-service-videos` | Private Supabase bucket for raw uploaded videos |
| `STORAGE_BUCKET_ARTIFACTS` | Optional | `video-artifacts` | Private Supabase bucket for extracted keyframes |
| `PORT` | Optional | `8000` | Port for server binding (1 - 65535) |
| `ALLOWED_ORIGINS` | Optional | `http://localhost:3000,http://127.0.0.1:3000` | CORS permitted origins for Next.js frontend |
| `TEMP_STORAGE_DIR` | Optional | `/tmp/videoassist` | Local scratch directory for temporary staging |
| `MAX_VIDEO_SIZE_BYTES` | Optional | `125829120` (120 MB) | Maximum permitted video file size |
| `WHISPER_MODEL_SIZE` | Optional | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `WHISPER_DEVICE` | Optional | `auto` | Inference device (`auto`, `cpu`, `cuda`) |
| `WHISPER_COMPUTE_TYPE` | Optional | `default` | Quantization compute type (`default`, `int8`, `float16`, `float32`) |
| `WHISPER_LANGUAGE` | Optional | `None` | Optional forced ISO 639-1 language code (e.g. `en`); auto-detects if omitted |
| `WHISPER_DOWNLOAD_ROOT` | Optional | `None` | Optional custom model weights cache directory (defaults to Hugging Face cache) |

---

## 4. Running the Development Server

With the virtual environment activated:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Alternatively, from the repository root:
```bash
./backend/.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

---

## 5. API Endpoints & Interactive Documentation

Once running on `http://localhost:8000`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health status, version, and runtime environment |
| `GET` | `/openapi.json` | OpenAPI 3.x machine-readable specification schema |
| `GET` | `/docs` | Interactive Swagger UI API documentation |
| `GET` | `/redoc` | Interactive ReDoc API documentation |
| `POST` | `/api/v1/jobs` | Verify and schedule background video preprocessing (`Authorization: Bearer <token>`) |
| `POST` | `/api/v1/jobs/process` | Alias route handler for full frontend compatibility |
| `GET` | `/` | Root service discovery summary and navigation links |

### Sample Job Dispatch Request (`POST /api/v1/jobs`)
```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-internal-secret-token" \
  -d '{
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "video_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  }'
```

### Sample Job Dispatch Response (`202 Accepted`)
```json
{
  "success": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "video_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "status": "processing",
  "message": "Job verified and background processing initiated."
}
```

---

## 6. Supabase Integration & Background Worker Workflow

When a video upload completes in Next.js, the frontend triggers `POST /api/v1/jobs`. The FastAPI service coordinates the following background pipeline via `app.services.job_runner`:

1. **Relational Verification**: Confirms that `job_id` and `video_id` exist in Supabase and that `job.video_id == video.id`. Fails with `404` or `400` if validation fails.
2. **Download Video**: Reads `videos.storage_path` and downloads the file from private bucket `field-service-videos` using the privileged service-role key.
3. **Stage Updates**: Progressively updates `processing_jobs` (`status='processing'`, `stage`, `progress`).
4. **Media Processing**: Extracts stream metadata and up to 3 representative keyframes using FFprobe and FFmpeg.
5. **Artifact Upload**: Uploads extracted keyframes to the private `video-artifacts` bucket under `{user_id}/{video_id}/keyframes/{filename}`.
6. **Persistence**:
   - Inserts records into `public.video_frames`
   - Updates `public.videos` (`status='ready'`, `duration_seconds`, `width`, `height`, `fps`, `frame_count`)
   - Marks `public.processing_jobs` (`status='completed'`, `progress=100`) only after writes succeed.
7. **Error Isolation**: On failure, updates both `processing_jobs` and `videos` with `status='failed'` and a sanitized error message, ensuring temporary files are always purged.

---

## 7. Running the Automated Tests

The test suite includes **53 automated tests** covering:
- **Settings validation**: Environment names, port range boundaries, CORS origin parsing (13 tests in `test_config.py`).
- **API endpoints**: Health check (`/api/v1/health`), OpenAPI JSON (`/openapi.json`), Swagger UI (`/docs`), ReDoc (`/redoc`), root route (5 tests in `test_health.py`).
- **Video Preprocessing**: Metadata parsing, keyframe sampling (standard, 1-frame, 2-frame clips), timestamp bounds, file size validation, corrupted file rejection, audio-only rejection, and URL/secret log sanitization (19 tests in `test_video_processor.py`).
- **Security & Supabase Integration**: Bearer and X-Internal-Secret auth, fail-closed handling, ID mismatch validation, 404 handling, background worker success pipeline, storage download failure, storage upload failure, DB write failure, and temporary directory cleanup on both success and failure (16 tests in `test_jobs_api.py`).

### Run from the `backend/` directory:
```bash
cd backend
source .venv/bin/activate
pytest -v
```

### Run from the repository root:
```bash
backend/.venv/bin/pytest backend/tests -v
```

---

## 8. How to Run a Sample Video Through the Processor

You can run any real or synthetic video through the local media processing engine without needing a live Supabase connection:

### Option A: Quick Standalone CLI Verification
From `backend/` with the virtual environment activated:

```bash
# 1. Synthesize a 5-second test video using FFmpeg
ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=25 -t 5 sample_service.mp4

# 2. Run the media processor using Python interactive one-liner
python3 -c "
from pathlib import Path
from app.services.video_processor import VideoProcessor

processor = VideoProcessor()
result = processor.process_video(
    video_path=Path('sample_service.mp4'),
    output_dir=Path('sample_extracted_frames'),
    max_keyframes=3
)

print('=== METADATA ===')
print(f'Duration: {result.metadata.duration_seconds:.2f}s | Resolution: {result.metadata.width}x{result.metadata.height} | FPS: {result.metadata.fps} | Frames: {result.metadata.frame_count}')

print('=== EXTRACTED KEYFRAMES ===')
for frame in result.keyframes:
    print(f'Timestamp: {frame.timestamp_seconds:.2f}s -> {frame.frame_path}')
"
```

### Option B: Clean Up Local Test Video Artifacts
```bash
rm -rf sample_service.mp4 sample_extracted_frames
```

### Option C: Manual Speech Transcription Smoke Test (Phase 2A)
Run speech transcription with real `faster-whisper` inference on a video containing audible speech (or let the script synthesize a short sample clip with speech automatically):

```bash
# Run against auto-synthesized audible speech clip:
backend/.venv/bin/python scripts/smoke_test_transcription.py

# Or run against an existing local video:
backend/.venv/bin/python scripts/smoke_test_transcription.py path/to/my_video.mp4
```

> **Note on Model Download**: On the first execution with a given model size (e.g. `base`), `faster-whisper` automatically downloads model weights (~74 MB for `base`, ~39 MB for `tiny`) from Hugging Face Hub and caches them locally in `~/.cache/huggingface/hub`. Model weights are never committed to git. Subsequent runs load instantly from local disk cache.

### Option D: Triggering Job Pipeline via API
When the FastAPI server is running with valid credentials configured in `.env`:
```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer placeholder-internal-secret-token" \
  -d '{
    "job_id": "<existing-job-uuid>",
    "video_id": "<existing-video-uuid>"
  }'
```
The server will return `202 Accepted` immediately and process the video in the background while logging stage progress:
- `5%`: Initializing video processing
- `15%`: Downloading video from private storage (`field-service-videos`)
- `35%`: Extracting video metadata (FFprobe)
- `60%`: Extracting representative keyframes (FFmpeg)
- `80%`: Uploading keyframes to private storage (`video-artifacts`)
- `90%`: Persisting frame records to `public.video_frames` and stream metrics to `public.videos`
- `100%`: Processing completed successfully

---

## 9. Next Steps in Phase 2

1. **Whisper Speech-to-Text**: Audio track demuxing and speech transcription with timestamp alignment.
2. **OCR Equipment Reading**: Screen and label text detection with bounding boxes.
3. **Temporal Multimodal Indexing**: Semantic vector index construction with FAISS / pgvector for evidence-grounded QA.

