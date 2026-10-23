import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Verify session
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const body = await req.json();

        const { storagePath, originalFilename, mimeType, fileSizeBytes } = body;

        if (!storagePath || !originalFilename || !fileSizeBytes) {
            return NextResponse.json({ message: 'Missing required parameters' }, { status: 400 });
        }

        // Ensure user is inserting into their own bucket directory
        if (!storagePath.startsWith(`${userId}/`)) {
            return NextResponse.json({ message: 'Forbidden storage path prefix' }, { status: 403 });
        }

        // 1. Insert Video Record into Database
        const { data: video, error: videoError } = await supabase
            .from('videos')
            .insert({
                user_id: userId,
                title: originalFilename.replace(/\.[^/.]+$/, ''),
                original_filename: originalFilename,
                mime_type: mimeType || 'video/mp4',
                file_size_bytes: fileSizeBytes,
                storage_path: storagePath,
                status: 'processing',
            })
            .select('id')
            .single();

        if (videoError || !video) {
            console.error('Database video registration error:', videoError);
            return NextResponse.json({ message: 'Failed to record video in database' }, { status: 500 });
        }

        // 2. Create Initial Processing Job
        const { data: job, error: jobError } = await supabase
            .from('processing_jobs')
            .insert({
                video_id: video.id,
                user_id: userId,
                status: 'queued',
                stage: 'initialized',
                progress: 0,
            })
            .select('id')
            .single();

        if (jobError || !job) {
            console.error('Job creation error:', jobError);
            return NextResponse.json({ message: 'Failed to initialize processing job' }, { status: 500 });
        }

        // 3. Dispatch Job to FastAPI Worker / Async Background Task
        const backendUrl = process.env.FASTAPI_BACKEND_URL;
        const internalSecret = process.env.INTERNAL_API_SECRET;

        if (backendUrl) {
            // Fire-and-forget request to backend processing service
            fetch(`${backendUrl}/api/v1/jobs/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': internalSecret || '',
                },
                body: JSON.stringify({
                    job_id: job.id,
                    video_id: video.id,
                    storage_path: storagePath,
                    user_id: userId,
                }),
            }).catch((err) => {
                console.error('Async trigger dispatch warning:', err.message);
            });
        }

        return NextResponse.json({ videoId: video.id, jobId: job.id }, { status: 201 });
    } catch (error: unknown) {
        console.error('Video registration handler failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to record video in database';
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}