-- ==============================================================================
-- VideoAssist: Read-Only Preflight Inspection for public.transcripts
-- File: supabase/preflight_transcripts_check.sql
-- ==============================================================================
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR BEFORE RUNNING THE MIGRATION.
-- This script is completely read-only and will NOT alter any tables or rows.
-- It dynamically adapts to the existing live schema whether user_id / confidence
-- are present or absent, avoiding syntax errors on missing columns.
-- ==============================================================================

-- 1. Check existing columns on public.transcripts
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transcripts'
ORDER BY ordinal_position;

-- 2. Check existing Row Level Security policies on public.transcripts
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'transcripts';

-- 3. Check ownership resolvability of existing rows
-- Safe for live table: does NOT reference t.user_id, only confirmed columns (video_id, job_id)
SELECT
    COUNT(*) AS total_transcripts,
    COUNT(*) FILTER (WHERE v.id IS NOT NULL) AS resolvable_from_parent_video,
    COUNT(*) FILTER (WHERE v.id IS NULL AND j.id IS NOT NULL) AS resolvable_from_parent_job,
    COUNT(*) FILTER (WHERE v.id IS NULL AND j.id IS NULL) AS unresolvable_orphans
FROM public.transcripts t
LEFT JOIN public.videos v ON t.video_id = v.id
LEFT JOIN public.processing_jobs j ON t.job_id = j.id;

-- 4. Check for foreign key integrity anomalies
-- a) Transcripts referencing non-existent videos:
SELECT COUNT(*) AS orphaned_video_ids
FROM public.transcripts t
LEFT JOIN public.videos v ON t.video_id = v.id
WHERE t.video_id IS NOT NULL AND v.id IS NULL;

-- b) Transcripts referencing non-existent processing jobs:
SELECT COUNT(*) AS orphaned_job_ids
FROM public.transcripts t
LEFT JOIN public.processing_jobs j ON t.job_id = j.id
WHERE t.job_id IS NOT NULL AND j.id IS NULL;

-- 5. Check for time range anomalies (end_time < start_time or negative numbers)
SELECT COUNT(*) AS inverted_or_negative_time_ranges
FROM public.transcripts
WHERE (start_time IS NOT NULL AND start_time < 0)
   OR (end_time IS NOT NULL AND end_time < 0)
   OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time < start_time);

-- 6. Check for duplicate (job_id, segment_index) pairs
SELECT job_id, segment_index, COUNT(*) AS duplicate_count
FROM public.transcripts
WHERE job_id IS NOT NULL AND segment_index IS NOT NULL
GROUP BY job_id, segment_index
HAVING COUNT(*) > 1;

-- 7. Dynamic Inspection Block for potentially unmigrated columns (user_id, confidence)
-- Safely detects whether user_id and confidence exist before querying them.
DO $$
DECLARE
    has_user_id BOOLEAN;
    has_confidence BOOLEAN;
    mismatch_count INTEGER := 0;
    null_user_count INTEGER := 0;
    bad_conf_count INTEGER := 0;
BEGIN
    -- Check if user_id column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transcripts' AND column_name = 'user_id'
    ) INTO has_user_id;

    IF has_user_id THEN
        EXECUTE 'SELECT COUNT(*) FROM public.transcripts WHERE user_id IS NULL' INTO null_user_count;
        EXECUTE 'SELECT COUNT(*) FROM public.transcripts t JOIN public.videos v ON t.video_id = v.id WHERE t.user_id IS NOT NULL AND t.user_id != v.user_id' INTO mismatch_count;
        RAISE NOTICE '[Preflight Check] user_id column EXISTS. Rows with NULL user_id: %, Ownership mismatches (transcript.user_id != video.user_id): %', null_user_count, mismatch_count;
    ELSE
        RAISE NOTICE '[Preflight Check] user_id column DOES NOT EXIST yet on public.transcripts. The migration will add it and backfill from parent public.videos.';
    END IF;

    -- Check if confidence column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transcripts' AND column_name = 'confidence'
    ) INTO has_confidence;

    IF has_confidence THEN
        EXECUTE 'SELECT COUNT(*) FROM public.transcripts WHERE confidence IS NOT NULL AND (confidence < 0.0 OR confidence > 1.0)' INTO bad_conf_count;
        RAISE NOTICE '[Preflight Check] confidence column EXISTS. Rows with out-of-range confidence (<0 or >1): %', bad_conf_count;
    ELSE
        RAISE NOTICE '[Preflight Check] confidence column DOES NOT EXIST yet on public.transcripts. The migration will add it as nullable REAL.';
    END IF;
END $$;
