-- ==============================================================================
-- VideoAssist Schema Migration: Reconcile Live Transcripts Schema
-- Version: reconcile_transcripts_schema.sql (Copy of 20261029103000_reconcile_transcripts_schema.sql)
-- ==============================================================================
-- Purpose:
-- Additively reconciles public.transcripts to support Whisper speech transcription
-- without data loss, table recreation, or security vulnerabilities.
--
-- Security Hardening:
-- 1. replace_transcripts_atomic uses SECURITY INVOKER and a locked search_path.
-- 2. Execution of replace_transcripts_atomic is granted exclusively to service_role,
--    and explicitly revoked from PUBLIC, anon, and authenticated.
-- 3. Validates p_video_id existence and enforces canonical parent user_id ownership.
-- 4. Removes any existing permissive policies on public.transcripts.
-- 5. Strict canonical RLS: auth.uid() = user_id (no loose bypasses).
-- 6. Unresolvable legacy rows are preserved under RLS without deletion or fabrication.
-- ==============================================================================

-- 1. Ensure required cryptographic and UUID extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Add missing columns additively (preserving all existing columns and data)
ALTER TABLE public.transcripts
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS speaker VARCHAR(100),
    ADD COLUMN IF NOT EXISTS language VARCHAR(10),
    ADD COLUMN IF NOT EXISTS confidence REAL,
    ADD COLUMN IF NOT EXISTS job_id UUID,
    ADD COLUMN IF NOT EXISTS segment_index INTEGER,
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);

-- Ensure default expressions for primary key and timestamp
ALTER TABLE public.transcripts
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at SET DEFAULT NOW();

-- 3. Remove all existing policies on public.transcripts to prevent permissive leaks
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'transcripts'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.transcripts', pol.policyname);
    END LOOP;
END $$;

-- 4. Backfill user_id ownership from public.videos (canonical source of truth)
UPDATE public.transcripts t
SET user_id = v.user_id
FROM public.videos v
WHERE t.video_id = v.id
  AND t.user_id IS NULL;

-- 5. Fallback backfill from public.processing_jobs for any transcripts with job_id
UPDATE public.transcripts t
SET user_id = j.user_id
FROM public.processing_jobs j
WHERE t.job_id = j.id
  AND t.user_id IS NULL;

-- 6. Backfill video_id from public.processing_jobs if video_id is NULL but job_id is present
UPDATE public.transcripts t
SET video_id = j.video_id
FROM public.processing_jobs j
WHERE t.job_id = j.id
  AND t.video_id IS NULL;

-- 7. Ownership integrity check & conditional NOT NULL constraint
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM public.transcripts
    WHERE user_id IS NULL;

    IF orphan_count > 0 THEN
        RAISE WARNING 'ATTENTION: Found % transcript rows with unresolved user ownership. These rows remain safely preserved in the table and are protected under RLS (unviewable by standard users). Skipping SET NOT NULL on user_id.', orphan_count;
    ELSE
        RAISE NOTICE 'SUCCESS: All transcript rows have verified user ownership. Enforcing NOT NULL on user_id.';
        ALTER TABLE public.transcripts ALTER COLUMN user_id SET NOT NULL;
    END IF;
END $$;

-- 8. Defensive Foreign Key Constraints
DO $$
DECLARE
    orphaned_users INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transcripts_user_id_fkey'
          AND table_name = 'transcripts'
    ) THEN
        SELECT COUNT(*) INTO orphaned_users
        FROM public.transcripts t
        LEFT JOIN auth.users u ON t.user_id = u.id
        WHERE t.user_id IS NOT NULL AND u.id IS NULL;

        IF orphaned_users = 0 THEN
            ALTER TABLE public.transcripts
                ADD CONSTRAINT transcripts_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        ELSE
            RAISE WARNING 'Skipping foreign key transcripts_user_id_fkey: % transcripts reference non-existent auth.users.', orphaned_users;
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    orphaned_videos INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transcripts_video_id_fkey'
          AND table_name = 'transcripts'
    ) THEN
        SELECT COUNT(*) INTO orphaned_videos
        FROM public.transcripts t
        LEFT JOIN public.videos v ON t.video_id = v.id
        WHERE t.video_id IS NOT NULL AND v.id IS NULL;

        IF orphaned_videos = 0 THEN
            ALTER TABLE public.transcripts
                ADD CONSTRAINT transcripts_video_id_fkey
                FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
        ELSE
            RAISE WARNING 'Skipping foreign key transcripts_video_id_fkey: % transcripts reference non-existent videos.', orphaned_videos;
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    orphaned_jobs INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transcripts_job_id_fkey'
          AND table_name = 'transcripts'
    ) THEN
        SELECT COUNT(*) INTO orphaned_jobs
        FROM public.transcripts t
        LEFT JOIN public.processing_jobs j ON t.job_id = j.id
        WHERE t.job_id IS NOT NULL AND j.id IS NULL;

        IF orphaned_jobs = 0 THEN
            ALTER TABLE public.transcripts
                ADD CONSTRAINT transcripts_job_id_fkey
                FOREIGN KEY (job_id) REFERENCES public.processing_jobs(id) ON DELETE SET NULL;
        ELSE
            RAISE WARNING 'Skipping foreign key transcripts_job_id_fkey: % transcripts reference non-existent processing_jobs.', orphaned_jobs;
        END IF;
    END IF;
END $$;

-- 9. Defensive Check Constraints
DO $$
DECLARE
    bad_conf_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transcripts_confidence_check'
          AND table_name = 'transcripts'
    ) THEN
        SELECT COUNT(*) INTO bad_conf_count
        FROM public.transcripts
        WHERE confidence IS NOT NULL AND (confidence < 0.0 OR confidence > 1.0);

        IF bad_conf_count = 0 THEN
            ALTER TABLE public.transcripts
                ADD CONSTRAINT transcripts_confidence_check
                CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
        ELSE
            RAISE WARNING 'Skipping check constraint transcripts_confidence_check: % rows have out-of-range confidence.', bad_conf_count;
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    inverted_times INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transcripts_check_end_time'
          AND table_name = 'transcripts'
    ) THEN
        SELECT COUNT(*) INTO inverted_times
        FROM public.transcripts
        WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND end_time < start_time;

        IF inverted_times = 0 THEN
            ALTER TABLE public.transcripts
                ADD CONSTRAINT transcripts_check_end_time
                CHECK (start_time IS NULL OR end_time IS NULL OR end_time >= start_time);
        ELSE
            RAISE WARNING 'Skipping check constraint transcripts_check_end_time: % rows have end_time < start_time.', inverted_times;
        END IF;
    END IF;
END $$;

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON public.transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_user_id ON public.transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_job_id ON public.transcripts(job_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time_range ON public.transcripts(video_id, start_time, end_time);

-- 11. Conditional Partial Unique Index for idempotent retries on (job_id, segment_index)
DO $$
DECLARE
    dup_job_segments INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'transcripts' AND indexname = 'idx_transcripts_job_segment'
    ) THEN
        SELECT COUNT(*) INTO dup_job_segments
        FROM (
            SELECT job_id, segment_index
            FROM public.transcripts
            WHERE job_id IS NOT NULL AND segment_index IS NOT NULL
            GROUP BY job_id, segment_index
            HAVING COUNT(*) > 1
        ) d;

        IF dup_job_segments = 0 THEN
            CREATE UNIQUE INDEX idx_transcripts_job_segment
                ON public.transcripts(job_id, segment_index)
                WHERE job_id IS NOT NULL AND segment_index IS NOT NULL;
        ELSE
            RAISE WARNING 'Skipping UNIQUE index on (job_id, segment_index): % duplicate pairs found in live table.', dup_job_segments;
        END IF;
    END IF;
END $$;

-- 12. Transaction-Safe Atomic Replacement RPC Function (SECURITY INVOKER)
-- Security design:
-- - Uses SECURITY INVOKER with fixed search_path = public, pg_temp
-- - Granted ONLY to service_role; explicitly revoked from PUBLIC, anon, and authenticated
-- - Validates p_video_id existence and extracts canonical owner v_owner_id
-- - Rejects payloads containing ownership mismatches
-- - Fully atomic: if insertion or constraint checks fail, delete rolls back completely
CREATE OR REPLACE FUNCTION public.replace_transcripts_atomic(
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

    -- Validate record payload integrity: every segment must match p_video_id and v_owner_id
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
    -- In PostgreSQL, any exception during insert automatically rolls back this deletion.
    DELETE FROM public.transcripts WHERE video_id = p_video_id;

    IF p_records IS NOT NULL AND jsonb_array_length(p_records) > 0 THEN
        WITH inserted AS (
            INSERT INTO public.transcripts (
                id,
                video_id,
                user_id,
                job_id,
                segment_index,
                model_name,
                start_time,
                end_time,
                text,
                speaker,
                language,
                confidence
            )
            SELECT
                COALESCE((r->>'id')::UUID, gen_random_uuid()),
                p_video_id,
                v_owner_id, -- strictly bind to canonical owner of the video
                COALESCE((r->>'job_id')::UUID, p_job_id),
                (r->>'segment_index')::INTEGER,
                r->>'model_name',
                (r->>'start_time')::NUMERIC,
                (r->>'end_time')::NUMERIC,
                r->>'text',
                r->>'speaker',
                r->>'language',
                (r->>'confidence')::REAL
            FROM jsonb_array_elements(p_records) AS r
            RETURNING *
        )
        SELECT jsonb_agg(to_jsonb(inserted.*)) INTO inserted_rows FROM inserted;
    END IF;

    RETURN COALESCE(inserted_rows, '[]'::jsonb);
END;
$$;

-- Explicitly revoke execute permission from all standard and unauthenticated roles
REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) FROM authenticated;

-- Grant execution ONLY to the trusted backend service_role
GRANT EXECUTE ON FUNCTION public.replace_transcripts_atomic(UUID, JSONB, UUID) TO service_role;

-- 13. Canonical Row Level Security (RLS)
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Service role full access on transcripts"
    ON public.transcripts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 14. Explicit PostgREST Schema Cache Reload
NOTIFY pgrst, 'reload schema';
