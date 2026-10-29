-- ==============================================================================
-- VideoAssist Schema Migration: Reconcile processing_jobs Schema
-- Migration: 20261029224500_reconcile_processing_jobs_schema.sql
-- ==============================================================================
-- Purpose:
-- Additively reconciles public.processing_jobs to support results_summary JSONB
-- metadata (transcript counts, OCR detection counts, speech metrics, detected languages)
-- without data loss, table recreation, or security vulnerabilities.
-- ==============================================================================

-- 1. Additive Column Alteration
-- Adds results_summary JSONB column if not already present.
-- Safe to execute even if the column already exists.
ALTER TABLE public.processing_jobs
    ADD COLUMN IF NOT EXISTS results_summary JSONB;

-- 2. Explicit PostgREST Schema Cache Reload
-- Instructs PostgREST to reload its schema cache so that PGRST204 errors cease immediately.
NOTIFY pgrst, 'reload schema';
