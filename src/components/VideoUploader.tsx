import { createClient } from '@/lib/supabase/client';

export async function uploadVideoFlow(file: File, title: string, userId: string) {
    const supabase = createClient();

    const videoId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const storagePath = `${userId}/${videoId}/${file.name}`;

    // 1. Upload Video File to Private Supabase Storage Bucket
    const { error: uploadError } = await supabase.storage
        .from('field-service-videos')
        .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
            duplex: 'half',
        });

    if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 2. Insert metadata record into 'videos' table
    const { data: videoRecord, error: dbError } = await supabase
        .from('videos')
        .insert({
            id: videoId,
            user_id: userId,
            title: title || file.name,
            original_filename: file.name,
            mime_type: file.type,
            file_size_bytes: file.size,
            storage_path: storagePath,
            status: 'uploaded',
        })
        .select()
        .single();

    if (dbError) {
        await supabase.storage.from('field-service-videos').remove([storagePath]);
        throw new Error(`Database record creation failed: ${dbError.message}`);
    }

    // 3. Trigger Server-Side Route Handler to Create Job & Initiate FastAPI Processing
    const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_id: videoRecord.id,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            errorData.message || `Failed to initiate processing job (Status: ${response.status})`
        );
    }

    return videoRecord;
}