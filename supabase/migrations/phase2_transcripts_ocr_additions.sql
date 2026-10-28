-- ==============================================================================
-- VideoAssist Phase 2: Additive Fields for Transcripts & OCR Detections
-- Migration: phase2_transcripts_ocr_additions.sql
-- ==============================================================================

-- 1. Transcripts Additive Columns
-- Relates transcript segments to processing jobs, preserves segment order, and tracks model provenance
ALTER TABLE public.transcripts
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.processing_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS segment_index INTEGER,
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);

-- Index for querying transcripts by job
CREATE INDEX IF NOT EXISTS idx_transcripts_job_id ON public.transcripts(job_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_segment_index ON public.transcripts(video_id, segment_index);

-- 2. OCR Detections Additive Columns
-- Relates detections to processing jobs, records frame dimensions, artifact storage paths, and model provenance
ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.processing_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS frame_width INTEGER,
    ADD COLUMN IF NOT EXISTS frame_height INTEGER,
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);

-- Index for querying OCR detections by job
CREATE INDEX IF NOT EXISTS idx_ocr_detections_job_id ON public.ocr_detections(job_id);
