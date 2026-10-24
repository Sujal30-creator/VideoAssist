import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

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

    await supabase
      .from('videos')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', video.id);

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
      fastApiError = err instanceof Error ? err.message : 'FastAPI worker connection failed';
    }

    if (fastApiError && !fastApiDispatched) {
      console.warn('FastAPI worker notification status:', fastApiError);
      await supabase
        .from('processing_jobs')
        .update({
          stage: 'Queued in database (waiting for worker pickup)',
        })
        .eq('id', job.id);
    }

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