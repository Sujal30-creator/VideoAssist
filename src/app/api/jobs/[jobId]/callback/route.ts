import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * PATCH /api/jobs/[jobId]/callback
 * 
 * Webhook endpoint for the Python FastAPI worker to update processing status.
 * Authenticated via internal bearer token (FASTAPI_INTERNAL_TOKEN).
 * Uses the Supabase service-role client to bypass RLS.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Verify internal service token
    const authHeader = request.headers.get("Authorization");
    const expectedToken = process.env.FASTAPI_INTERNAL_TOKEN || "internal-secret-token";

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid internal token." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      status,
      stage,
      progress,
      error_message,
      results_summary,
    } = body;

    const supabase = createServiceClient();

    // Build the update payload (only update fields that are provided)
    const updatePayload: Record<string, unknown> = {};
    if (status !== undefined) updatePayload.status = status;
    if (stage !== undefined) updatePayload.stage = stage;
    if (progress !== undefined) updatePayload.progress = progress;
    if (error_message !== undefined) updatePayload.error_message = error_message;
    if (results_summary !== undefined) updatePayload.results_summary = results_summary;

    // Set timestamps based on status transitions
    if (status === "processing" && !body.started_at) {
      updatePayload.started_at = new Date().toISOString();
    }
    if (status === "completed" || status === "failed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No update fields provided." },
        { status: 400 }
      );
    }

    // Update the processing job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .update(updatePayload)
      .eq("id", jobId)
      .select("id, video_id, status, stage, progress")
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: `Job update failed: ${jobError?.message || "Not found"}` },
        { status: 404 }
      );
    }

    // Also update the parent video status when job completes or fails
    if (status === "completed") {
      await supabase
        .from("videos")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", job.video_id);
    } else if (status === "failed") {
      await supabase
        .from("videos")
        .update({
          status: "failed",
          error_message: error_message || "Processing failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.video_id);
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
    });
  } catch (error: unknown) {
    console.error("Job callback error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
