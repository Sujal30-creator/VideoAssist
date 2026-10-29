import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Verify Authentication
        let user = (await supabase.auth.getUser()).data.user;
        if (!user) {
            // Fall back to cookie session if getUser fails
            const session = (await supabase.auth.getSession()).data.session;
            user = session?.user || null;
        }

        if (!user) {
            return NextResponse.json(
                { message: 'Unauthorized: Valid Supabase session required.' },
                { status: 401 }
            );
        }

        const userId = user.id;

        // 2. Parse and Validate Request Payload
        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { message: 'Invalid JSON request body.' },
                { status: 400 }
            );
        }

        const { storagePath, originalFilename, mimeType, fileSizeBytes } = body || {};

        if (!storagePath || typeof storagePath !== 'string') {
            return NextResponse.json(
                { message: 'Missing or invalid required parameter: storagePath' },
                { status: 400 }
            );
        }

        if (!originalFilename || typeof originalFilename !== 'string') {
            return NextResponse.json(
                { message: 'Missing or invalid required parameter: originalFilename' },
                { status: 400 }
            );
        }

        const numericSizeBytes = Number(fileSizeBytes);
        if (!fileSizeBytes || isNaN(numericSizeBytes) || numericSizeBytes <= 0) {
            return NextResponse.json(
                { message: 'Missing or invalid required parameter: fileSizeBytes must be a positive number' },
                { status: 400 }
            );
        }

        const MAX_BYTES = 120 * 1024 * 1024; // 120 MB
        if (numericSizeBytes > MAX_BYTES) {
            return NextResponse.json(
                { message: `File size exceeds maximum allowed limit of 120MB (${(numericSizeBytes / (1024 * 1024)).toFixed(1)} MB provided).` },
                { status: 400 }
            );
        }

        // Ensure user is inserting into their own bucket directory
        if (!storagePath.startsWith(`${userId}/`)) {
            return NextResponse.json(
                { message: 'Forbidden storage path prefix: file must reside in user directory' },
                { status: 403 }
            );
        }

        // 3. Check for existing video record to prevent duplicate rows on retry
        let videoId: string;
        let jobId: string;

        const { data: existingVideo } = await supabase
            .from('videos')
            .select('id, status')
            .eq('user_id', userId)
            .eq('storage_path', storagePath)
            .maybeSingle();

        if (existingVideo) {
            videoId = existingVideo.id;

            // Check if processing job already exists for this video
            const { data: existingJob } = await supabase
                .from('processing_jobs')
                .select('id, status')
                .eq('video_id', videoId)
                .maybeSingle();

            if (existingJob) {
                jobId = existingJob.id;
            } else {
                const { data: newJob, error: newJobError } = await supabase
                    .from('processing_jobs')
                    .insert({
                        video_id: videoId,
                        user_id: userId,
                        status: 'queued',
                        stage: 'initialized',
                        progress: 0,
                    })
                    .select('id')
                    .single();

                if (newJobError || !newJob) {
                    console.error('Job creation error for existing video:', newJobError);
                    return NextResponse.json(
                        { message: `Failed to initialize processing job: ${newJobError?.message || 'Database error'}` },
                        { status: 500 }
                    );
                }
                jobId = newJob.id;
            }
        } else {
            // 4. Insert Video Record into Database
            const { data: video, error: videoError } = await supabase
                .from('videos')
                .insert({
                    user_id: userId,
                    title: originalFilename.replace(/\.[^/.]+$/, '').trim() || originalFilename,
                    original_filename: originalFilename,
                    mime_type: mimeType || 'video/mp4',
                    file_size_bytes: numericSizeBytes,
                    storage_path: storagePath,
                    status: 'processing',
                })
                .select('id')
                .single();

            if (videoError || !video) {
                console.error('Database video registration error:', videoError);
                return NextResponse.json(
                    {
                        message: `Database video registration error: ${videoError?.message || 'Failed to record video in database'}`,
                        code: videoError?.code,
                    },
                    { status: 500 }
                );
            }

            videoId = video.id;

            // 5. Create Initial Processing Job
            const { data: job, error: jobError } = await supabase
                .from('processing_jobs')
                .insert({
                    video_id: videoId,
                    user_id: userId,
                    status: 'queued',
                    stage: 'initialized',
                    progress: 0,
                })
                .select('id')
                .single();

            if (jobError || !job) {
                console.error('Job creation error:', jobError);
                return NextResponse.json(
                    { message: `Failed to initialize processing job: ${jobError?.message || 'Database error'}` },
                    { status: 500 }
                );
            }

            jobId = job.id;
        }

        // 6. Dispatch Job to FastAPI Worker / Async Background Task
        const backendUrl = process.env.FASTAPI_API_URL || process.env.FASTAPI_BACKEND_URL;
        const internalToken = process.env.FASTAPI_INTERNAL_TOKEN || process.env.INTERNAL_API_SECRET;

        if (backendUrl) {
            // Fire-and-forget request to backend processing service
            fetch(`${backendUrl}/api/v1/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken || ''}`,
                    'X-Internal-Secret': internalToken || '',
                },
                body: JSON.stringify({
                    job_id: jobId,
                    video_id: videoId,
                    storage_path: storagePath,
                    user_id: userId,
                }),
            }).catch((err) => {
                console.warn('Async trigger dispatch warning:', err.message);
            });
        }

        return NextResponse.json({ videoId, jobId }, { status: 201 });
    } catch (error: unknown) {
        console.error('Video registration handler failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}