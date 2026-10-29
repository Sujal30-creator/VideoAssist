-- ==============================================================================
-- VideoAssist Schema Migration: audit_logs
-- Version: audit_logs.sql
-- ==============================================================================
-- Creates or aligns the public.audit_logs table schema to support application
-- activity logging and audit trail features (such as UPLOAD_VIDEO, LOGIN).
-- Resolves PostgreSQL error 42703 (column "target_table" does not exist).
-- ==============================================================================

-- 1. Create audit_logs table if it does not exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    target_table TEXT,
    target_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Additive migration: Ensure target_table and target_id columns exist on pre-existing tables
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS target_table TEXT,
    ADD COLUMN IF NOT EXISTS target_id UUID;

-- 3. Indexes for audit query performance and user history filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies
-- Users can view their own activity history (for UserProfileModal Operator Audit trail)
DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.audit_logs;
CREATE POLICY "Users can view their own audit logs"
    ON public.audit_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Authenticated users can insert audit logs for their actions
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Service role bypasses RLS automatically, but explicit policy guarantees administrative access
DROP POLICY IF EXISTS "Service role full access on audit logs" ON public.audit_logs;
CREATE POLICY "Service role full access on audit logs"
    ON public.audit_logs FOR ALL
    USING (true)
    WITH CHECK (true);
