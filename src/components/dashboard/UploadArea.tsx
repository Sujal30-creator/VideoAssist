'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileVideo, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';

interface UploadAreaProps {
  onAnalyze: (videoPath?: string, fileName?: string) => void;
  fileSelected?: boolean;
  setFileSelected?: (val: boolean) => void;
}

export default function UploadArea({ onAnalyze }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-border rounded-2xl bg-surface transition-theme text-center">
        <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
          <FileVideo className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1 truncate max-w-md">
          {selectedFile.name}
        </h2>
        <div className="flex items-center gap-2 text-text-secondary mb-6 text-xs font-mono">
          <span>{formatBytes(selectedFile.size)}</span>
          <span>•</span>
          <span className="flex items-center gap-1 text-emerald-500 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Ready for Offline Indexing
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedFile(null)}
            className="px-4 py-2 bg-surface-secondary hover:bg-surface border border-border text-text-secondary hover:text-text-primary rounded-xl text-xs font-medium transition-all"
          >
            Change File
          </button>
          <button 
            onClick={() => onAnalyze(URL.createObjectURL(selectedFile), selectedFile.name)}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-semibold transition-all shadow-md text-xs cursor-pointer"
          >
            Add to Records & Analyze
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
        accept="video/mp4,video/mkv,video/webm,video/quicktime,.mp4,.mkv,.webm" 
        className="hidden" 
      />

      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center py-14 px-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center group ${
          isDragging 
            ? 'border-primary bg-primary-soft/30 scale-[0.99]' 
            : 'border-border hover:border-primary/50 bg-surface/50 hover:bg-surface'
        }`}
      >
        <div className="w-16 h-16 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-colors shadow-sm">
          <HardDrive className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors" />
        </div>
        <h2 className="text-base font-bold text-text-primary mb-1">
          Select or Drop Offline Field Video
        </h2>
        <p className="text-text-secondary max-w-sm text-xs mb-3">
          Supports local recordings (.mp4, .mkv, .webm). Files remain stored on your machine.
        </p>
        <span className="text-[11px] text-text-muted bg-surface-secondary px-3 py-1 rounded-full border border-border font-mono">
          Click to browse local files
        </span>
      </div>
    </div>
  );
}
