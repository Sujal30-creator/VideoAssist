"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useResumableUpload } from "@/hooks/useResumableUpload";
import { VideoRecord, ProcessingJobRecord } from "@/types/database";

export interface UploadAreaProps {
  // Real Supabase TUS upload props
  onUploadSuccess?: (video: VideoRecord, job?: ProcessingJobRecord) => void;
  onCancel?: () => void;
  // Demo simulation props
  onAnalyze?: () => void;
  fileSelected?: boolean;
  setFileSelected?: (val: boolean) => void;
}

export default function UploadArea({
  onUploadSuccess,
  onCancel,
  onAnalyze,
  fileSelected,
  setFileSelected,
}: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const MAX_MB = 120; // Matches backend 120MB configuration
  const MAX_BYTES = MAX_MB * 1024 * 1024;

  const { uploadFile, reset, progress, state, errorMessage } =
    useResumableUpload({
      bucketName: "field-service-videos",
      onSuccess: (videoId, storagePath) => {
        onUploadSuccess?.(
          {
            id: videoId,
            title: title || selectedFile?.name || "",
            status: "processing",
            storage_path: storagePath,
          } as VideoRecord,
          { video_id: videoId, status: "queued" } as ProcessingJobRecord
        );
      },
    });

  const isProcessing = state === "uploading" || state === "registering";
  const displayError = validationError || errorMessage;

  // If this is purely the demo simulation mode without onUploadSuccess
  if (!onUploadSuccess && onAnalyze && setFileSelected !== undefined) {
    if (fileSelected) {
      return (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-border rounded-2xl bg-surface transition-theme text-center">
          <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
            <FileVideo className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-1 text-text-primary">
            router_troubleshoot_site42.mp4
          </h2>
          <p className="text-text-secondary mb-8 text-sm">
            Ready for multimodal analysis.
          </p>

          <button
            onClick={onAnalyze}
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg font-medium transition-colors shadow-sm text-lg cursor-pointer"
          >
            Analyze Video
          </button>
        </div>
      );
    }

    return (
      <div
        className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl bg-surface/50 hover:bg-surface transition-theme group cursor-pointer text-center"
        onClick={() => setFileSelected(true)}
      >
        <div className="w-20 h-20 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-6 transition-colors">
          <Upload className="w-10 h-10 text-text-muted group-hover:text-primary transition-colors" />
        </div>
        <h2 className="text-2xl font-semibold mb-2 text-text-primary">
          Upload Service Video
        </h2>
        <p className="text-text-secondary max-w-md text-center mb-2">
          Drag and drop a local field-service video (MP4, MKV) to begin.
        </p>
        <p className="text-text-muted text-sm">
          Click here to simulate selecting a file for the demo.
        </p>
      </div>
    );
  }

  // Real TUS resumable upload workflow
  const handleFile = (file: File) => {
    setValidationError(null);
    reset();

    if (file.size > MAX_BYTES) {
      setValidationError(
        `File exceeds ${MAX_MB} MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller field video.`
      );
      return;
    }
    const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    setTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleStartUpload = () => {
    if (!selectedFile) return;
    uploadFile(selectedFile);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6 border-2 border-border rounded-2xl bg-surface transition-theme text-center">
        <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
          <FileVideo className="w-8 h-8 text-primary" />
        </div>

        <div className="w-full max-w-md mb-3 text-left">
          <label className="block text-xs font-semibold text-text-primary mb-1">
            Video Title / Service Event
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isProcessing}
            placeholder="e.g. Router Replacement - Site 42"
            className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
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

        {/* Real-time Progress Bar UI */}
        {isProcessing && (
          <div className="w-full max-w-md mb-5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-text-secondary">
              <span>
                {state === "uploading"
                  ? "Uploading directly to Storage..."
                  : "Registering in Database..."}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {displayError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2 max-w-md text-left">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isProcessing) reset();
              if (onCancel) onCancel();
              else setSelectedFile(null);
            }}
            disabled={state === "registering"}
            className="px-4 py-2 bg-surface-secondary hover:bg-surface border border-border text-text-secondary hover:text-text-primary rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            {isProcessing ? "Cancel Upload" : "Cancel"}
          </button>

          <button
            onClick={handleStartUpload}
            disabled={isProcessing}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-semibold transition-all shadow-md text-xs cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Upload directly via TUS</span>
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
            ? "border-primary bg-primary-soft/30 scale-[0.99]"
            : "border-border hover:border-primary/50 bg-surface/50 hover:bg-surface"
        }`}
      >
        <div className="w-16 h-16 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-colors shadow-sm">
          <Upload className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors" />
        </div>
        <h2 className="text-base font-bold text-text-primary mb-1">
          Upload Real Field-Service Video
        </h2>
        <p className="text-text-secondary max-w-sm text-xs mb-3">
          Drop your recording here. Uploads directly to{" "}
          <code className="bg-surface px-1 py-0.5 rounded text-primary">
            field-service-videos
          </code>
          .
        </p>
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-mono bg-surface-secondary px-3 py-1 rounded-full border border-border">
          <span>MP4, MOV, WebM</span>
          <span>•</span>
          <span>Max {MAX_MB} MB</span>
        </div>
      </div>

      {displayError && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
