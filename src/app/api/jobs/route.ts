import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side Next.js Route Handler to initiate video processing with Python FastAPI worker.
 * Enforces server-only authentication and internal token authorization.
 *
 * Sequence:
 * 1. Verify the user's session.
 * 2. Verify that the user owns the requested video.
 * 3. Create the processing-job record.
 * 4. Mark the video as processing.
 * 5. Call the FastAPI endpoint POST /api/v1/jobs with job_id and video_id using server-only internal token.
 * 6. Handle API errors and update the job/video state where appropriate.
 * 7. Return the created job status to the client.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Verify user's session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Supabase session required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { video_id } = body;

    if (!video_id) {
      return NextResponse.json(
        { error: 'Missing required field: video_id.' },
        { status: 400 }
      );
    }

    // 2. Verify user ownership of the video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', video_id)
      .eq('user_id', user.id)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: 'Video not found or access denied.' },
        { status: 404 }
      );
    }

    // 3. Create processing-job record in Supabase DB
    const jobId = crypto.randomUUID();
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        id: jobId,
        video_id: video.id,
        user_id: user.id,
        status: 'queued',
        stage: 'Queued for Python worker',
        progress: 0,
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: `Failed to create processing job: ${jobError?.message}` },
        { status: 500 }
      );
    }

    // 4. Mark video as processing
    await supabase
      .from('videos')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', video.id);

    // 5. Call FastAPI endpoint POST /api/v1/jobs with server-only internal token
    const fastApiUrl = process.env.FASTAPI_API_URL || 'http://localhost:8000';
    const internalToken = process.env.FASTAPI_INTERNAL_TOKEN || 'internal-secret-token';

    let fastApiDispatched = false;
    let fastApiError: string | null = null;

    try {
      const response = await fetch(`${fastApiUrl}/api/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          job_id: job.id,
          video_id: video.id,
          storage_path: video.storage_path,
          user_id: user.id,
        }),
      });

      if (response.ok) {
        fastApiDispatched = true;
      } else {
        const errorText = await response.text();
        fastApiError = `FastAPI worker responded with ${response.status}: ${errorText}`;
      }
    } catch (err: unknown) {
      // Worker offline or unreachable
      fastApiError = err instanceof Error ? err.message : 'FastAPI worker connection failed';
    }

    // 6. Handle API errors: if FastAPI failed immediately, record details
    if (fastApiError && !fastApiDispatched) {
      console.warn('FastAPI worker notification status:', fastApiError);
      // We keep status as queued if the worker polls the DB, or record notice
      await supabase
        .from('processing_jobs')
        .update({
          stage: 'Queued in database (waiting for worker pickup)',
        })
        .eq('id', job.id);
    }

    // 7. Let UI read the persisted job status
    return NextResponse.json({
      success: true,
      job_id: job.id,
      video_id: video.id,
      status: job.status,
      worker_notified: fastApiDispatched,
      message: fastApiDispatched
        ? 'Job dispatched to FastAPI worker'
        : 'Job recorded in database; will be processed when worker is online.',
    });
  } catch (error: unknown) {
    console.error('Processing route handler error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
