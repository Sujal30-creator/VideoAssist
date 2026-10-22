-- ==============================================================================
-- VideoAssist Phase 2: Transcripts & OCR Detections Schema
-- Migration: transcripts_ocr.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE: transcripts
-- Stores real Whisper-generated speech segments with precise timestamps
-- Each row = one contiguous speech segment from the audio track
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Temporal boundaries (seconds from video start)
    start_time NUMERIC(10, 3) NOT NULL,
    end_time NUMERIC(10, 3) NOT NULL,
    -- Transcript content
    text TEXT NOT NULL,
    speaker VARCHAR(100),           -- Speaker label if diarization is available
    language VARCHAR(10),           -- ISO 639-1 code (e.g. 'en', 'hi')
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints
    CHECK (end_time >= start_time)
);

-- Indexes for transcripts
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON public.transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_user_id ON public.transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time_range ON public.transcripts(video_id, start_time, end_time);

-- Enable RLS for transcripts
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transcripts (user isolation)
CREATE POLICY "Users can select their own transcripts"
    ON public.transcripts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transcripts"
    ON public.transcripts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transcripts"
    ON public.transcripts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transcripts"
    ON public.transcripts FOR DELETE
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. TABLE: ocr_detections
-- Stores PaddleOCR text detections from sampled video frames
-- Each row = one OCR text region detected in a specific frame
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Temporal position (seconds from video start when frame was sampled)
    timestamp_seconds NUMERIC(10, 3) NOT NULL,
    -- OCR content
    text TEXT NOT NULL,
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
    -- Bounding box in normalized coordinates [x_min, y_min, x_max, y_max] (0.0-1.0)
    bbox_x_min REAL,
    bbox_y_min REAL,
    bbox_x_max REAL,
    bbox_y_max REAL,
    -- Optional: source frame reference
    frame_id UUID REFERENCES public.video_frames(id) ON DELETE SET NULL,
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ocr_detections
CREATE INDEX IF NOT EXISTS idx_ocr_detections_video_id ON public.ocr_detections(video_id);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_user_id ON public.ocr_detections(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_timestamp ON public.ocr_detections(video_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_confidence ON public.ocr_detections(video_id, confidence DESC);

-- Enable RLS for ocr_detections
ALTER TABLE public.ocr_detections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ocr_detections (user isolation)
CREATE POLICY "Users can select their own OCR detections"
    ON public.ocr_detections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OCR detections"
    ON public.ocr_detections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OCR detections"
    ON public.ocr_detections FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OCR detections"
    ON public.ocr_detections FOR DELETE
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. SERVICE ROLE POLICIES
-- Allow the Python worker (using service_role key) to update processing status
-- The service_role key bypasses RLS by default in Supabase, but these policies
-- are here as documentation of the access pattern.
-- ------------------------------------------------------------------------------

-- Add a results_summary JSONB column to processing_jobs for storing summary metadata
ALTER TABLE public.processing_jobs
    ADD COLUMN IF NOT EXISTS results_summary JSONB;
