export type VideoStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoRecord {
  id: string;
  user_id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  status: VideoStatus;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  frame_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJobRecord {
  id: string;
  video_id: string;
  user_id: string;
  status: JobStatus;
  stage: string | null;
  progress: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface VideoFrameRecord {
  id: string;
  video_id: string;
  user_id: string;
  timestamp_seconds: number;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
  // Optional signed URL populated by the client/API for rendering
  signedUrl?: string;
}

export interface VideoWithJob extends VideoRecord {
  jobs?: ProcessingJobRecord[];
  frames?: VideoFrameRecord[];
  signedPlaybackUrl?: string;
}
