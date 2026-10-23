import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const videoId = searchParams.get('videoId');

        if (!videoId) {
            return NextResponse.json({ message: 'Missing videoId parameter' }, { status: 400 });
        }

        // Retrieve video record to confirm ownership
        const { data: video, error: videoError } = await supabase
            .from('videos')
            .select('storage_path, user_id')
            .eq('id', videoId)
            .single();

        if (videoError || !video) {
            return NextResponse.json({ message: 'Video not found' }, { status: 404 });
        }

        if (video.user_id !== session.user.id) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        // Generate short-lived presigned URL (valid for 1 hour / 3600 seconds)
        const { data, error: signedUrlError } = await supabase.storage
            .from('user-videos')
            .createSignedUrl(video.storage_path, 3600);

        if (signedUrlError || !data) {
            return NextResponse.json({ message: 'Failed to generate presigned URL' }, { status: 500 });
        }

        return NextResponse.json({ signedUrl: data.signedUrl, expiresAt: Date.now() + 3600 * 1000 });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate presigned URL';
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}