"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "./auth";
import { VideoRecord, ProcessingJobRecord, VideoWithJob } from "@/types/database";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
];

export interface UploadVideoResponse {
  success: boolean;
  error?: string;
  video?: VideoRecord;
  job?: ProcessingJobRecord;
}

export async function uploadFieldVideoAction(formData: FormData): Promise<UploadVideoResponse> {
  try {
    const user = await requireAuth();
    const file = formData.get("file") as File;
    const title = (formData.get("title") as string)?.trim() || file?.name || "Field Inspection Video";

    if (!file) {
      return { success: false, error: "No video file provided." };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File size exceeds the 100 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      };
    }

    const mimeType = file.type || "video/mp4";
    if (!ALLOWED_MIME_TYPES.includes(mimeType) && !file.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
      return {
        success: false,
        error: `Unsupported video format. Allowed formats: MP4, MOV, WebM. Received: ${mimeType}`,
      };
    }

    const videoId = crypto.randomUUID();
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${videoId}/${cleanFilename}`;

    if (user.isDemo) {
      const demoVideo: VideoRecord = {
        id: videoId,
        user_id: user.id,
        title,
        original_filename: file.name,
        mime_type: mimeType,
        file_size_bytes: file.size,
        storage_path: storagePath,
        status: "uploaded",
        duration_seconds: 180,
        width: 1920,
        height: 1080,
        fps: 30,
        frame_count: 5400,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const demoJob: ProcessingJobRecord = {
        id: crypto.randomUUID(),
        video_id: videoId,
        user_id: user.id,
        status: "queued",
        stage: "Queued for processing",
        progress: 0,
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      };
      return { success: true, video: demoVideo, job: demoJob };
    }

    const supabase = await createClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("field-service-videos")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
      };
    }

    const { data: videoData, error: videoError } = await supabase
      .from("videos")
      .insert({
        id: videoId,
        user_id: user.id,
        title,
        original_filename: file.name,
        mime_type: mimeType,
        file_size_bytes: file.size,
        storage_path: storagePath,
        status: "uploaded",
      })
      .select()
      .single();

    if (videoError || !videoData) {
      return {
        success: false,
        error: `Failed to insert video record: ${videoError?.message || "Unknown database error"}`,
      };
    }

    const { data: jobData, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        video_id: videoId,
        user_id: user.id,
        status: "queued",
        stage: "Queued for multimodal analysis",
        progress: 0,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Warning: processing job entry failed:", jobError);
    }

    const fastApiUrl = process.env.FASTAPI_API_URL || "http://localhost:8000";
    const internalToken = process.env.FASTAPI_INTERNAL_TOKEN || "internal-secret-token";

    try {
      fetch(`${fastApiUrl}/api/v1/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          job_id: jobData?.id,
          video_id: videoId,
          storage_path: storagePath,
          user_id: user.id,
        }),
      }).catch((e) => {
        console.log("FastAPI worker webhook dispatched (or worker will poll DB):", e.message);
      });
    } catch {
      // Non-blocking
    }

    revalidatePath("/", "layout");
    return {
      success: true,
      video: videoData as VideoRecord,
      job: jobData as ProcessingJobRecord,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error during upload",
    };
  }
}

export async function getUserVideosAction(): Promise<VideoWithJob[]> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return [
        {
          id: "vid_demo_router_42",
          user_id: user.id,
          title: "Router Hardware Diagnostic - Site 42",
          original_filename: "router_troubleshoot_site42.mp4",
          mime_type: "video/mp4",
          file_size_bytes: 42500000,
          storage_path: `${user.id}/vid_demo_router_42/router_troubleshoot_site42.mp4`,
          status: "ready",
          duration_seconds: 180,
          width: 1920,
          height: 1080,
          fps: 30,
          frame_count: 5400,
          error_message: null,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date().toISOString(),
          jobs: [
            {
              id: "job_demo_1",
              video_id: "vid_demo_router_42",
              user_id: user.id,
              status: "completed",
              stage: "Analysis Completed",
              progress: 100,
              error_message: null,
              created_at: new Date(Date.now() - 3600000).toISOString(),
              started_at: new Date(Date.now() - 3550000).toISOString(),
              completed_at: new Date(Date.now() - 3400000).toISOString(),
            },
          ],
        },
      ];
    }

    const supabase = await createClient();
    const { data: videos, error } = await supabase
      .from("videos")
      .select(`
        *,
        jobs:processing_jobs(*),
        frames:video_frames(*)
      `)
      .order("created_at", { ascending: false });

    if (error || !videos) {
      console.error("Error fetching user videos:", error);
      return [];
    }

    return videos as VideoWithJob[];
  } catch (e) {
    console.error("getUserVideosAction error:", e);
    return [];
  }
}

export async function getSignedVideoUrlAction(storagePath: string): Promise<string | null> {
  try {
    const user = await requireAuth();

    if (!storagePath.startsWith(`${user.id}/`) && !user.isDemo) {
      throw new Error("Unauthorized storage path access.");
    }

    if (user.isDemo) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("field-service-videos")
      .createSignedUrl(storagePath, 3600);

    if (error || !data) {
      console.error("Failed to generate signed video URL:", error);
      return null;
    }

    return data.signedUrl;
  } catch (e) {
    console.error("getSignedVideoUrlAction error:", e);
    return null;
  }
}

export async function getSignedArtifactUrlAction(storagePath: string): Promise<string | null> {
  try {
    const user = await requireAuth();

    if (!storagePath.startsWith(`${user.id}/`) && !user.isDemo) {
      throw new Error("Unauthorized artifact path access.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("video-artifacts")
      .createSignedUrl(storagePath, 3600);

    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}