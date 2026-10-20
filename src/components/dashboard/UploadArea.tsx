'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileVideo, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { uploadFieldVideoAction } from '@/app/actions/videos';
import { VideoRecord, ProcessingJobRecord } from '@/types/database';

interface UploadAreaProps {
  onUploadSuccess: (video: VideoRecord, job?: ProcessingJobRecord) => void;
  onCancel?: () => void;
}

export default function UploadArea({ onUploadSuccess, onCancel }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_MB = 100;
  const MAX_BYTES = MAX_MB * 1024 * 1024;

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`File exceeds ${MAX_MB} MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller field video.`);
      return;
    }
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', title || selectedFile.name);

    const res = await uploadFieldVideoAction(formData);

    if (!res.success || !res.video) {
      setError(res.error || 'Failed to upload video to private storage.');
      setUploading(false);
      return;
    }

    setUploading(false);
    onUploadSuccess(res.video, res.job);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6 border-2 border-border rounded-2xl bg-surface transition-theme text-center">
        <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
          <FileVideo className="w-8 h-8 text-primary" />
        </div>
        
        {/* Title input */}
        <div className="w-full max-w-md mb-3 text-left">
          <label className="block text-xs font-semibold text-text-primary mb-1">
            Video Title / Service Event
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
            placeholder="e.g. Router Replacement - Site 42"
            className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-2 text-text-secondary mb-5 text-xs font-mono">
          <span>{selectedFile.name}</span>
          <span>•</span>
          <span>{formatBytes(selectedFile.size)}</span>
          <span>•</span>
          <span className="text-emerald-500 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Validated
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2 max-w-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (onCancel) onCancel();
              else setSelectedFile(null);
            }}
            disabled={uploading}
            className="px-4 py-2 bg-surface-secondary hover:bg-surface border border-border text-text-secondary hover:text-text-primary rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-semibold transition-all shadow-md text-xs cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading to Supabase Storage...</span>
              </>
            ) : (
              <span>Upload & Register Processing Job</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center group ${
          isDragging
            ? 'border-primary bg-primary-soft/30 scale-[0.99]'
            : 'border-border hover:border-primary/50 bg-surface/50 hover:bg-surface'
        }`}
      >
        <div className="w-16 h-16 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-colors shadow-sm">
          <Upload className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors" />
        </div>
        <h2 className="text-base font-bold text-text-primary mb-1">
          Upload Real Field-Service Video
        </h2>
        <p className="text-text-secondary max-w-sm text-xs mb-3">
          Drop your recording here. Stored in private Supabase bucket <code className="bg-surface px-1 py-0.5 rounded text-primary">field-service-videos</code>.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-mono bg-surface-secondary px-3 py-1 rounded-full border border-border">
          <span>MP4, MOV, WebM</span>
          <span>•</span>
          <span>Max 100 MB</span>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
