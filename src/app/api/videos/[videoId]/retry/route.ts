import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/videos/[videoId]/retry
 * Re-queue a failed video for processing
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify video ownership and get current status
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, status, storage_path")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: "Video not found or access denied." },
        { status: 404 }
      );
    }

    if (video.status !== "failed") {
      return NextResponse.json(
        { error: `Cannot retry: video status is '${video.status}', expected 'failed'.` },
        { status: 400 }
      );
    }

    // Mark existing failed jobs as superseded
    await supabase
      .from("processing_jobs")
      .update({ stage: "Superseded by retry" })
      .eq("video_id", videoId)
      .eq("status", "failed");

    // Clear old results for a clean re-run
    await Promise.all([
      supabase.from("transcripts").delete().eq("video_id", videoId),
      supabase.from("ocr_detections").delete().eq("video_id", videoId),
    ]);

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
      return NextResponse.json(
        { error: `Failed to create retry job: ${jobError.message}` },
        { status: 500 }
      );
    }

    // Update video status
    await supabase
      .from("videos")
      .update({
        status: "processing",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Notify FastAPI worker (non-blocking)
    const fastApiUrl = process.env.FASTAPI_API_URL || "http://localhost:8000";
    const internalToken = process.env.FASTAPI_INTERNAL_TOKEN || "internal-secret-token";

    let workerNotified = false;
    try {
      const res = await fetch(`${fastApiUrl}/api/v1/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          video_id: videoId,
          storage_path: video.storage_path,
          user_id: user.id,
          is_retry: true,
        }),
      });
      workerNotified = res.ok;
    } catch {
      // Worker offline — job will be picked up via DB polling
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      worker_notified: workerNotified,
      message: workerNotified
        ? "Retry job dispatched to FastAPI worker"
        : "Retry job queued in database; will be processed when worker is online.",
    });
  } catch (error: unknown) {
    console.error("Video retry error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
