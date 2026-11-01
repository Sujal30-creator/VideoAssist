'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileVideo, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useResumableUpload } from '@/hooks/useResumableUpload';
import { VideoWithJob } from '@/types/database';

interface UploadAreaProps {
  onUploadSuccess: (videoId: string) => void;
  existingVideos?: VideoWithJob[];
  onSelectExistingVideo?: (video: VideoWithJob) => void;
}

export default function UploadArea({
  onUploadSuccess,
  existingVideos = [],
  onSelectExistingVideo,
}: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');

  const { uploadFile, reset, progress, state, errorMessage } = useResumableUpload({
    onSuccess: (videoId) => {
      setSelectedFile(null);
      onUploadSuccess(videoId);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    }
  };

  const handleStartUpload = () => {
    if (selectedFile) {
      uploadFile(selectedFile);
    }
  };

  const handleCancel = () => {
    reset();
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isUploading = state === 'uploading' || state === 'registering';

  if (selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-border rounded-2xl bg-surface transition-theme text-center">
        <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
          <FileVideo className="w-8 h-8 text-primary" />
        </div>

        <div className="w-full max-w-md mb-4 text-left">
          <label className="block text-xs font-semibold text-text-primary mb-1">
            Video Title / Service Event
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
            placeholder="e.g. Fiber Terminal Inspection"
            className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-secondary text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-2 text-text-secondary mb-5 text-xs font-mono">
          <span>{selectedFile.name}</span>
          <span>•</span>
          <span>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
          <span>•</span>
          <span className="text-emerald-500 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready to Upload
          </span>
        </div>

        {/* Real-time Progress Bar */}
        {isUploading && (
          <div className="w-full max-w-md mb-5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-text-secondary">
              <span>
                {state === 'uploading'
                  ? 'Uploading directly to Storage...'
                  : 'Registering video & initializing pipeline...'}
              </span>
              <span className="font-mono font-bold text-primary">{progress}%</span>
            </div>
            <div className="w-full bg-surface-secondary rounded-full h-2 overflow-hidden border border-border/50">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2 max-w-md text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            disabled={state === 'registering'}
            className="px-4 py-2 bg-surface-secondary hover:bg-surface border border-border text-text-secondary hover:text-text-primary rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleStartUpload}
            disabled={isUploading}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-semibold transition-all shadow-md text-xs cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Upload...</span>
              </>
            ) : (
              <span>Start Multimodal Analysis</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
      />

      {/* Main Drag & Drop Box */}
      <div
        className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl bg-surface/50 hover:bg-surface transition-theme group cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-20 h-20 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-6 transition-colors shadow-sm">
          <Upload className="w-10 h-10 text-text-muted group-hover:text-primary transition-colors" />
        </div>
        <h2 className="text-2xl font-semibold mb-2 text-text-primary">
          Upload Field-Service Video
        </h2>
        <p className="text-text-secondary max-w-md text-center mb-3 text-sm">
          Select or drag and drop a recording (MP4, MOV, WebM) to begin Whisper speech transcription & PaddleOCR text recognition.
        </p>
        <div className="inline-flex items-center gap-2 text-xs text-text-muted font-mono bg-surface-secondary px-3 py-1 rounded-full border border-border">
          <span>Max 120 MB</span>
          <span>•</span>
          <span>Encrypted Private Storage</span>
        </div>
      </div>

      {/* Existing Videos Quick Select */}
      {existingVideos.length > 0 && onSelectExistingVideo && (
        <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
            Or select an existing video from your library
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {existingVideos.map((vid) => (
              <button
                key={vid.id}
                onClick={() => onSelectExistingVideo(vid)}
                className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface-secondary/40 hover:bg-surface-secondary hover:border-primary/40 transition-all text-left cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FileVideo className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                    {vid.title}
                  </p>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    Status: <span className="capitalize">{vid.status}</span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}