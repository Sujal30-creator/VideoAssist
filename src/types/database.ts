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
  results_summary: ResultsSummary | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Summary metadata returned after processing completes */
export interface ResultsSummary {
  transcript_count?: number;
  ocr_count?: number;
  total_speech_seconds?: number;
  languages_detected?: string[];
  processing_time_seconds?: number;
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

/** Real Whisper transcript segment stored in the transcripts table */
export interface TranscriptRecord {
  id: string;
  video_id: string;
  user_id: string;
  job_id?: string | null;
  segment_index?: number | null;
  start_time: number;
  end_time: number;
  text: string;
  speaker: string | null;
  language: string | null;
  confidence: number | null;
  model_name?: string | null;
  created_at: string;
}

/** PaddleOCR detection stored in the ocr_detections table */
export interface OcrDetectionRecord {
  id: string;
  video_id: string;
  user_id: string;
  job_id?: string | null;
  timestamp_seconds: number;
  text: string;
  confidence: number | null;
  bbox_x_min: number | null;
  bbox_y_min: number | null;
  bbox_x_max: number | null;
  bbox_y_max: number | null;
  frame_id: string | null;
  frame_width?: number | null;
  frame_height?: number | null;
  storage_path?: string | null;
  model_name?: string | null;
  created_at: string;
}

export interface VideoWithJob extends VideoRecord {
  jobs?: ProcessingJobRecord[];
  frames?: VideoFrameRecord[];
  signedPlaybackUrl?: string;
}

/** Full video results including transcripts and OCR detections */
export interface VideoResults {
  transcripts: TranscriptRecord[];
  ocr_detections: OcrDetectionRecord[];
  job: ProcessingJobRecord | null;
}
