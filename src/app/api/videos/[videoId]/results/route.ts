import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/videos/[videoId]/results
 * Fetch transcripts + OCR detections + latest job for a video
 */
export async function GET(
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

    // Verify video ownership
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: "Video not found or access denied." },
        { status: 404 }
      );
    }

    // Fetch transcripts, OCR, and latest job in parallel
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

    return NextResponse.json({
      transcripts: transcriptsRes.data || [],
      ocr_detections: ocrRes.data || [],
      job: jobRes.data || null,
    });
  } catch (error: unknown) {
    console.error("Video results error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
