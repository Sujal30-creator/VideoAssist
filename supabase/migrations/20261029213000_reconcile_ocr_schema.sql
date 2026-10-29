-- ==============================================================================
-- VideoAssist Schema Migration: Reconcile Live OCR Detections Schema
-- Migration: 20261029213000_reconcile_ocr_schema.sql
-- ==============================================================================
-- Purpose:
-- Additively reconciles public.ocr_detections to support EasyOCR visible text
-- extraction without data loss, table recreation, or security vulnerabilities.
--
-- Security Hardening:
-- 1. replace_ocr_detections_atomic uses SECURITY INVOKER and a locked search_path.
-- 2. Execution of replace_ocr_detections_atomic is granted exclusively to service_role,
--    and explicitly revoked from PUBLIC, anon, and authenticated.
-- 3. Validates p_video_id existence and enforces canonical parent user_id ownership.
-- 4. Removes any existing permissive policies on public.ocr_detections.
-- 5. Strict canonical RLS: auth.uid() = user_id (no loose bypasses).
-- 6. Unresolvable legacy rows are preserved under RLS without deletion or fabrication.
-- ==============================================================================

-- 1. Ensure required cryptographic and UUID extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Additive Table Creation (if table does not yet exist)
CREATE TABLE IF NOT EXISTS public.ocr_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.processing_jobs(id) ON DELETE SET NULL,
    timestamp_seconds NUMERIC(10, 3) NOT NULL,
    text TEXT NOT NULL,
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
    bbox_x_min REAL,
    bbox_y_min REAL,
    bbox_x_max REAL,
    bbox_y_max REAL,
    frame_id UUID REFERENCES public.video_frames(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Additive Column Alterations (in case table was previously created with fewer columns)
ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS job_id UUID;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS timestamp_seconds NUMERIC(10, 3);

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS text TEXT;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS confidence REAL;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS bbox_x_min REAL;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS bbox_y_min REAL;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS bbox_x_max REAL;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS bbox_y_max REAL;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS frame_id UUID;

ALTER TABLE public.ocr_detections
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Check Constraint on Confidence (0.0 to 1.0 or NULL)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_ocr_detections_confidence'
           OR (conrelid = 'public.ocr_detections'::regclass AND conname LIKE '%confidence%')
    ) THEN
        ALTER TABLE public.ocr_detections
            ADD CONSTRAINT chk_ocr_detections_confidence
            CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
    END IF;
END $$;

-- 5. Backfill user_id from parent video for any legacy rows where user_id is NULL
UPDATE public.ocr_detections o
SET user_id = v.user_id
FROM public.videos v
WHERE o.video_id = v.id
  AND o.user_id IS NULL
  AND v.user_id IS NOT NULL;

-- 6. Safe Foreign Key Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_ocr_detections_video_id'
           OR (conrelid = 'public.ocr_detections'::regclass AND confrelid = 'public.videos'::regclass)
    ) THEN
        ALTER TABLE public.ocr_detections
            ADD CONSTRAINT fk_ocr_detections_video_id
            FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_ocr_detections_user_id'
           OR (conrelid = 'public.ocr_detections'::regclass AND confrelid = 'auth.users'::regclass)
    ) THEN
        ALTER TABLE public.ocr_detections
            ADD CONSTRAINT fk_ocr_detections_user_id
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'processing_jobs') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_ocr_detections_job_id'
               OR (conrelid = 'public.ocr_detections'::regclass AND confrelid = 'public.processing_jobs'::regclass)
        ) THEN
            ALTER TABLE public.ocr_detections
                ADD CONSTRAINT fk_ocr_detections_job_id
                FOREIGN KEY (job_id) REFERENCES public.processing_jobs(id) ON DELETE SET NULL;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_frames') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_ocr_detections_frame_id'
               OR (conrelid = 'public.ocr_detections'::regclass AND confrelid = 'public.video_frames'::regclass)
        ) THEN
            ALTER TABLE public.ocr_detections
                ADD CONSTRAINT fk_ocr_detections_frame_id
                FOREIGN KEY (frame_id) REFERENCES public.video_frames(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- 7. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ocr_detections_video_id ON public.ocr_detections(video_id);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_user_id ON public.ocr_detections(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_job_id ON public.ocr_detections(job_id);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_timestamp ON public.ocr_detections(video_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_ocr_detections_confidence ON public.ocr_detections(video_id, confidence DESC);

-- 8. Transaction-Safe Atomic Replacement RPC Function (SECURITY INVOKER)
-- Security design:
-- - Uses SECURITY INVOKER with fixed search_path = public, pg_temp
-- - Granted ONLY to service_role; explicitly revoked from PUBLIC, anon, and authenticated
-- - Validates p_video_id existence and extracts canonical owner v_owner_id
-- - Rejects payloads containing ownership mismatches
-- - Fully atomic: if insertion or constraint checks fail, delete rolls back completely
CREATE OR REPLACE FUNCTION public.replace_ocr_detections_atomic(
    p_video_id UUID,
    p_records JSONB,
    p_job_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id UUID;
    inserted_rows JSONB := '[]'::jsonb;
BEGIN
    -- Validate video existence and identify canonical user_id owner
    IF p_video_id IS NULL THEN
        RAISE EXCEPTION 'p_video_id parameter cannot be NULL';
    END IF;

    SELECT user_id INTO v_owner_id
    FROM public.videos
    WHERE id = p_video_id;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Video with id % does not exist or has no valid owner in public.videos', p_video_id;
    END IF;

    -- Validate record payload integrity: every detection must match p_video_id and v_owner_id
    IF p_records IS NOT NULL AND jsonb_array_length(p_records) > 0 THEN
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_records) AS r
            WHERE (r->>'video_id' IS NOT NULL AND (r->>'video_id')::UUID != p_video_id)
               OR (r->>'user_id' IS NOT NULL AND (r->>'user_id')::UUID != v_owner_id)
        ) THEN
            RAISE EXCEPTION 'Ownership mismatch: payload records specify a video_id or user_id inconsistent with parent video % (owner %)', p_video_id, v_owner_id;
        END IF;
    END IF;

    -- Atomic delete and replace:
    -- Any failure during insert rolls back this deletion.
    DELETE FROM public.ocr_detections WHERE video_id = p_video_id;

    IF p_records IS NOT NULL AND jsonb_array_length(p_records) > 0 THEN
        WITH inserted AS (
            INSERT INTO public.ocr_detections (
                id,
                video_id,
                user_id,
                job_id,
                timestamp_seconds,
                text,
                confidence,
                bbox_x_min,
                bbox_y_min,
                bbox_x_max,
                bbox_y_max,
                frame_id
            )
            SELECT
                COALESCE((r->>'id')::UUID, gen_random_uuid()),
                p_video_id,
                v_owner_id, -- strictly bind to canonical owner of the video
                COALESCE((r->>'job_id')::UUID, p_job_id),
                (r->>'timestamp_seconds')::NUMERIC,
                r->>'text',
                (r->>'confidence')::REAL,
                (r->>'bbox_x_min')::REAL,
                (r->>'bbox_y_min')::REAL,
                (r->>'bbox_x_max')::REAL,
                (r->>'bbox_y_max')::REAL,
                (r->>'frame_id')::UUID
            FROM jsonb_array_elements(p_records) AS r
            RETURNING *
        )
        SELECT jsonb_agg(to_jsonb(inserted.*)) INTO inserted_rows FROM inserted;
    END IF;

    RETURN COALESCE(inserted_rows, '[]'::jsonb);
END;
$$;

-- Explicitly revoke execute permission from all standard and unauthenticated roles
REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) FROM authenticated;

-- Grant execution ONLY to the trusted backend service_role
GRANT EXECUTE ON FUNCTION public.replace_ocr_detections_atomic(UUID, JSONB, UUID) TO service_role;

-- 9. Clean Up Existing/Permissive Policies on ocr_detections
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'ocr_detections'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.ocr_detections', pol.policyname);
    END LOOP;
END $$;

-- 10. Canonical Row Level Security (RLS)
ALTER TABLE public.ocr_detections ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Service role full access on ocr_detections"
    ON public.ocr_detections FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 11. Explicit PostgREST Schema Cache Reload
NOTIFY pgrst, 'reload schema';

