import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as tus from 'tus-js-client';

export type UploadState = 'idle' | 'uploading' | 'registering' | 'completed' | 'error';

interface UseResumableUploadOptions {
    bucketName?: string;
    onSuccess?: (videoId: string, storagePath: string) => void;
    onError?: (error: Error) => void;
}

export function useResumableUpload(options: UseResumableUploadOptions = {}) {

    const hasRegistered = useRef(false);  ///  TO LOCK the already uploaded

    const { bucketName = 'user-videos', onSuccess, onError } = options;
    const [progress, setProgress] = useState<number>(0);
    const [state, setState] = useState<UploadState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const uploadTaskRef = useRef<tus.Upload | null>(null);

    const uploadFile = useCallback(async (file: File) => {
        // Reset the lock the exact moment a new upload starts
        hasRegistered.current = false;

        const supabase = createClient();

        // Check authentication and get session token for TUS authorization
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
            const err = new Error('User must be authenticated to upload files.');
            setErrorMessage(err.message);
            setState('error');
            onError?.(err);
            return;
        }

        // Validate size (120MB limit)
        const MAX_SIZE = 120 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            const err = new Error('File size exceeds maximum allowed limit of 120MB.');
            setErrorMessage(err.message);
            setState('error');
            onError?.(err);
            return;
        }

        setState('uploading');
        setProgress(0);
        setErrorMessage(null);

        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        // const storagePath = `${session.user.id}/${Date.now()}_${sanitizedFileName}`;
        const storagePath = `${session.user.id}/${sanitizedFileName}`;

        // Supabase URL is required for the absolute TUS endpoint
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
            const err = new Error('NEXT_PUBLIC_SUPABASE_URL is not defined in environment variables.');
            setErrorMessage(err.message);
            setState('error');
            onError?.(err);
            return;
        }

        // Initialize TUS Upload
        const upload = new tus.Upload(file, {
            endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
                authorization: `Bearer ${session.access_token}`,
                'x-upsert': 'true',
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true, // Prevents caching issues if the same file is uploaded twice
            metadata: {
                bucketName: bucketName,
                objectName: storagePath,
                contentType: file.type,
                cacheControl: '3600',
            },
            chunkSize: 6 * 1024 * 1024, // Break into 6MB chunks for stability
            onError: (error: Error) => {
                setErrorMessage(error.message);
                setState('error');
                onError?.(error);
            },
            onProgress: (bytesUploaded: number, bytesTotal: number) => {
                if (bytesTotal > 0) {
                    const percent = (bytesUploaded / bytesTotal) * 100;
                    setProgress(Math.round(percent));
                }
            },
            onSuccess: async () => {

                // THE LOCK: If this is true, immediately abort. Do not fire the API route again.
                if (hasRegistered.current) return;

                hasRegistered.current = true;  ///// Lock the gate for any future ghost callbacks


                // Step 2: Register uploaded file in Database once TUS completes
                setState('registering');

                try {
                    const response = await fetch('/api/videos/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            storagePath: storagePath,
                            originalFilename: file.name,
                            mimeType: file.type,
                            fileSizeBytes: file.size,
                        }),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to register video metadata.');
                    }

                    const { videoId } = await response.json();

                    setState('completed');
                    setProgress(100);
                    onSuccess?.(videoId, storagePath);
                } catch (err: unknown) {
                    const errorObj = err instanceof Error
                        ? err
                        : new Error(typeof err === 'string' ? err : 'Registration failed');

                    setErrorMessage(errorObj.message);
                    setState('error');
                    onError?.(errorObj);
                }
            }
        });

        uploadTaskRef.current = upload;
        upload.start();

    }, [bucketName, onSuccess, onError]);

    const reset = useCallback(() => {
        if (uploadTaskRef.current && state === 'uploading') {
            uploadTaskRef.current.abort();
        }
        setProgress(0);
        setState('idle');
        setErrorMessage(null);
    }, [state]);

    return {
        uploadFile,
        reset,
        progress,
        state,
        errorMessage,
    };
}