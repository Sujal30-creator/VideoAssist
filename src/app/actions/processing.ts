"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "./auth";
import {
  ProcessingJobRecord,
  TranscriptRecord,
  OcrDetectionRecord,
  VideoResults,
} from "@/types/database";

/**
 * Get processing status for a specific job
 */
export async function getProcessingStatusAction(
  jobId: string
): Promise<ProcessingJobRecord | null> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return {
        id: jobId,
        video_id: "vid_demo_router_42",
        user_id: user.id,
        status: "completed",
        stage: "Analysis Completed",
        progress: 100,
        error_message: null,
        results_summary: {
          transcript_count: 12,
          ocr_count: 8,
          total_speech_seconds: 142.5,
          languages_detected: ["en"],
          processing_time_seconds: 45.2,
        },
        created_at: new Date(Date.now() - 3600000).toISOString(),
        started_at: new Date(Date.now() - 3550000).toISOString(),
        completed_at: new Date(Date.now() - 3400000).toISOString(),
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !data) {
      console.error("Error fetching processing status:", error);
      return null;
    }

    return data as ProcessingJobRecord;
  } catch (e) {
    console.error("getProcessingStatusAction error:", e);
    return null;
  }
}

/**
 * Get all transcripts for a video, ordered by start_time
 */
export async function getVideoTranscriptsAction(
  videoId: string
): Promise<TranscriptRecord[]> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return getDemoTranscripts(videoId, user.id);
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("transcripts")
      .select("*")
      .eq("video_id", videoId)
      .order("start_time", { ascending: true });

    if (error || !data) {
      console.error("Error fetching transcripts:", error);
      return [];
    }

    return data as TranscriptRecord[];
  } catch (e) {
    console.error("getVideoTranscriptsAction error:", e);
    return [];
  }
}

/**
 * Get all OCR detections for a video, ordered by timestamp
 */
export async function getVideoOcrDetectionsAction(
  videoId: string
): Promise<OcrDetectionRecord[]> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return getDemoOcrDetections(videoId, user.id);
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ocr_detections")
      .select("*")
      .eq("video_id", videoId)
      .order("timestamp_seconds", { ascending: true });

    if (error || !data) {
      console.error("Error fetching OCR detections:", error);
      return [];
    }

    return data as OcrDetectionRecord[];
  } catch (e) {
    console.error("getVideoOcrDetectionsAction error:", e);
    return [];
  }
}

/**
 * Fetch complete results bundle for a video (transcripts + OCR + latest job)
 */
export async function getVideoResultsAction(
  videoId: string
): Promise<VideoResults> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return {
        transcripts: getDemoTranscripts(videoId, user.id),
        ocr_detections: getDemoOcrDetections(videoId, user.id),
        job: {
          id: "job_demo_1",
          video_id: videoId,
          user_id: user.id,
          status: "completed",
          stage: "Analysis Completed",
          progress: 100,
          error_message: null,
          results_summary: {
            transcript_count: 12,
            ocr_count: 8,
            total_speech_seconds: 142.5,
            languages_detected: ["en"],
            processing_time_seconds: 45.2,
          },
          created_at: new Date(Date.now() - 3600000).toISOString(),
          started_at: new Date(Date.now() - 3550000).toISOString(),
          completed_at: new Date(Date.now() - 3400000).toISOString(),
        },
      };
    }

    const supabase = await createClient();

    const [transcriptsRes, ocrRes, jobRes] = await Promise.all([
      supabase
        .from("transcripts")
        .select("*")
        .eq("video_id", videoId)
        .order("start_time", { ascending: true }),
      supabase
        .from("ocr_detections")
        .select("*")
        .eq("video_id", videoId)
        .order("timestamp_seconds", { ascending: true }),
      supabase
        .from("processing_jobs")
        .select("*")
        .eq("video_id", videoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    return {
      transcripts: (transcriptsRes.data as TranscriptRecord[]) || [],
      ocr_detections: (ocrRes.data as OcrDetectionRecord[]) || [],
      job: (jobRes.data as ProcessingJobRecord) || null,
    };
  } catch (e) {
    console.error("getVideoResultsAction error:", e);
    return { transcripts: [], ocr_detections: [], job: null };
  }
}

/**
 * Retry processing for a failed video — creates a new queued job
 */
export async function retryProcessingAction(
  videoId: string
): Promise<{ success: boolean; error?: string; jobId?: string }> {
  try {
    const user = await requireAuth();

    if (user.isDemo) {
      return { success: true, jobId: "job_demo_retry_1" };
    }

    const supabase = await createClient();

    // Verify ownership
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, status")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return { success: false, error: "Video not found or access denied." };
    }

    // Mark any existing failed jobs as superseded
    await supabase
      .from("processing_jobs")
      .update({ stage: "Superseded by retry" })
      .eq("video_id", videoId)
      .eq("status", "failed");

    // Create new queued job
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        id: jobId,
        video_id: videoId,
        user_id: user.id,
        status: "queued",
        stage: "Queued for retry",
        progress: 0,
      });

    if (jobError) {
      return {
        success: false,
        error: `Failed to create retry job: ${jobError.message}`,
      };
    }

    // Update video status back to processing
    await supabase
      .from("videos")
      .update({ status: "processing", error_message: null })
      .eq("id", videoId);

    // Notify FastAPI worker (non-blocking)
    const fastApiUrl =
      process.env.FASTAPI_API_URL || "http://localhost:8000";
    const internalToken =
      process.env.FASTAPI_INTERNAL_TOKEN || "internal-secret-token";

    try {
      fetch(`${fastApiUrl}/api/v1/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          video_id: videoId,
          storage_path: video.id,
          user_id: user.id,
          is_retry: true,
        }),
      }).catch(() => {
        // Non-blocking — worker will poll DB
      });
    } catch {
      // Non-blocking
    }

    return { success: true, jobId };
  } catch (e) {
    console.error("retryProcessingAction error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unexpected error",
    };
  }
}

// =============================================================================
// DEMO DATA — Realistic field-service transcript and OCR samples
// =============================================================================

function getDemoTranscripts(
  videoId: string,
  userId: string
): TranscriptRecord[] {
  return [
    {
      id: "tr_demo_1",
      video_id: videoId,
      user_id: userId,
      start_time: 2.1,
      end_time: 8.4,
      text: "Alright, I'm on-site at location 42. Starting the router replacement procedure now.",
      speaker: "Technician",
      language: "en",
      confidence: 0.96,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_2",
      video_id: videoId,
      user_id: userId,
      start_time: 12.5,
      end_time: 18.2,
      text: "First, I need to disconnect the existing Cisco 4431 from the rack. Power LED is currently green.",
      speaker: "Technician",
      language: "en",
      confidence: 0.94,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_3",
      video_id: videoId,
      user_id: userId,
      start_time: 22.0,
      end_time: 27.8,
      text: "Removing the fiber patch cable from port GigabitEthernet 0/0/0. The SFP module is still warm.",
      speaker: "Technician",
      language: "en",
      confidence: 0.91,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_4",
      video_id: videoId,
      user_id: userId,
      start_time: 35.0,
      end_time: 42.5,
      text: "Control, this is unit 7. Confirming the old router serial number is FJC2401R0KP. About to power it down.",
      speaker: "Technician",
      language: "en",
      confidence: 0.93,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_5",
      video_id: videoId,
      user_id: userId,
      start_time: 48.2,
      end_time: 53.0,
      text: "Copy that, unit 7. Proceed with the power-down. We've notified the NOC about the expected outage window.",
      speaker: "Dispatch",
      language: "en",
      confidence: 0.89,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_6",
      video_id: videoId,
      user_id: userId,
      start_time: 60.0,
      end_time: 68.4,
      text: "Old unit is powered down. Now racking the replacement Cisco ISR 4461. Checking the mounting ears align with the rack posts.",
      speaker: "Technician",
      language: "en",
      confidence: 0.95,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_7",
      video_id: videoId,
      user_id: userId,
      start_time: 75.0,
      end_time: 82.1,
      text: "New router is secure in the rack. Connecting the console cable for initial configuration. Serial shows FJC2409L1MQ.",
      speaker: "Technician",
      language: "en",
      confidence: 0.92,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_8",
      video_id: videoId,
      user_id: userId,
      start_time: 90.5,
      end_time: 97.0,
      text: "Power-on successful. IOS XE is booting. The LED sequence looks normal — system, then activity.",
      speaker: "Technician",
      language: "en",
      confidence: 0.97,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_9",
      video_id: videoId,
      user_id: userId,
      start_time: 105.0,
      end_time: 112.5,
      text: "Loading the pre-staged configuration from the USB drive. This should set up the VLANs, OSPF, and ACLs automatically.",
      speaker: "Technician",
      language: "en",
      confidence: 0.90,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_10",
      video_id: videoId,
      user_id: userId,
      start_time: 125.0,
      end_time: 135.8,
      text: "Configuration loaded. Running a quick ping test to the gateway... All pings successful. Uplink is operational. Site 42 router replacement is complete.",
      speaker: "Technician",
      language: "en",
      confidence: 0.94,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_11",
      video_id: videoId,
      user_id: userId,
      start_time: 140.0,
      end_time: 148.2,
      text: "Excellent work, unit 7. NOC confirms all circuits on the new router are passing traffic. Marking ticket SR-42887 as resolved.",
      speaker: "Dispatch",
      language: "en",
      confidence: 0.88,
      created_at: new Date().toISOString(),
    },
    {
      id: "tr_demo_12",
      video_id: videoId,
      user_id: userId,
      start_time: 155.0,
      end_time: 163.0,
      text: "Copy. Cleaning up and documenting the before-and-after photos. Will upload the full report when I'm back in the van.",
      speaker: "Technician",
      language: "en",
      confidence: 0.93,
      created_at: new Date().toISOString(),
    },
  ];
}

function getDemoOcrDetections(
  videoId: string,
  userId: string
): OcrDetectionRecord[] {
  return [
    {
      id: "ocr_demo_1",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 5.0,
      text: "SITE 42 - MAIN DISTRIBUTION FRAME",
      confidence: 0.97,
      bbox_x_min: 0.12,
      bbox_y_min: 0.05,
      bbox_x_max: 0.88,
      bbox_y_max: 0.12,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_2",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 15.0,
      text: "Cisco 4431 ISR",
      confidence: 0.95,
      bbox_x_min: 0.35,
      bbox_y_min: 0.42,
      bbox_x_max: 0.65,
      bbox_y_max: 0.48,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_3",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 15.0,
      text: "S/N: FJC2401R0KP",
      confidence: 0.92,
      bbox_x_min: 0.35,
      bbox_y_min: 0.50,
      bbox_x_max: 0.65,
      bbox_y_max: 0.55,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_4",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 40.0,
      text: "CAUTION: HIGH VOLTAGE",
      confidence: 0.98,
      bbox_x_min: 0.1,
      bbox_y_min: 0.7,
      bbox_x_max: 0.45,
      bbox_y_max: 0.78,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_5",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 65.0,
      text: "Cisco ISR 4461",
      confidence: 0.96,
      bbox_x_min: 0.3,
      bbox_y_min: 0.38,
      bbox_x_max: 0.7,
      bbox_y_max: 0.44,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_6",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 78.0,
      text: "S/N: FJC2409L1MQ",
      confidence: 0.91,
      bbox_x_min: 0.32,
      bbox_y_min: 0.46,
      bbox_x_max: 0.68,
      bbox_y_max: 0.52,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_7",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 110.0,
      text: "USB0: config-4461-site42.bin",
      confidence: 0.87,
      bbox_x_min: 0.15,
      bbox_y_min: 0.6,
      bbox_x_max: 0.85,
      bbox_y_max: 0.66,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "ocr_demo_8",
      video_id: videoId,
      user_id: userId,
      timestamp_seconds: 130.0,
      text: "Reply from 10.42.1.1: bytes=64 time<1ms TTL=255",
      confidence: 0.93,
      bbox_x_min: 0.05,
      bbox_y_min: 0.35,
      bbox_x_max: 0.95,
      bbox_y_max: 0.41,
      frame_id: null,
      created_at: new Date().toISOString(),
    },
  ];
}
