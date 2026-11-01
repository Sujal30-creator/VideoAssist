"use server";

import { requireAuth } from "./auth";
import { createClient } from "@/lib/supabase/server";

export interface UserProject {
    id: string;
    user_id: string;
    title?: string;
    original_filename?: string;
    mime_type?: string;
    file_size_bytes?: number;
    storage_path?: string;
    status: 'uploaded' | 'processing' | 'ready' | 'failed';
    duration_seconds?: number;
    width?: number;
    height?: number;
    fps?: number;
    frame_count?: number;
    error_message?: string;
    created_at: string;
    updated_at?: string;
}

/**
 * Fetch all video projects securely scoped to the authenticated user via RLS.
 */
export async function getUserProjectsAction(): Promise<UserProject[]> {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to fetch user projects: ${error.message}`);
    }

    return data || [];
}

/**
 * Fetch a single video project by ID, strictly verified against the user ID.
 */
export async function getProjectByIdAction(projectId: string): Promise<UserProject | null> {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Record not found
        throw new Error(`Failed to fetch project: ${error.message}`);
    }

    return data;
}

/**
 * Create a new video project record directly in the Supabase 'videos' table.
 */
export async function createProjectAction(title: string, videoFileName: string, videoKey?: string): Promise<UserProject> {
    const user = await requireAuth();
    const supabase = await createClient();

    const videoId = crypto.randomUUID();
    const storagePath = videoKey || `${user.id}/${videoId}/${videoFileName}`;

    const { data, error } = await supabase
        .from('videos')
        .insert({
            id: videoId,
            user_id: user.id,
            title: title || videoFileName,
            original_filename: videoFileName,
            storage_path: storagePath,
            status: 'uploaded',
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create project record: ${error.message}`);
    }

    return data;
}

/**
 * Update the status of a video project.
 */
export async function updateProjectStatusAction(
    projectId: string,
    status: 'uploaded' | 'processing' | 'ready' | 'failed'
): Promise<UserProject | null> {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('videos')
        .update({
            status,
            updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update project status: ${error.message}`);
    }

    return data;
}