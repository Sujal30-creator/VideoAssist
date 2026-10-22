import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/[jobId]/status
 * Poll processing job status — authenticated users only, ownership enforced
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
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

    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      video_id: job.video_id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error_message: job.error_message,
      results_summary: job.results_summary,
      started_at: job.started_at,
      completed_at: job.completed_at,
    });
  } catch (error: unknown) {
    console.error("Job status polling error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
