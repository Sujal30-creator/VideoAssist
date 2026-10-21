'use client';

import React, { useRef, useState } from 'react';
import { useResumableUpload } from '@/hooks/useResumableUpload';

interface VideoUploadAreaProps {
  onUploadSuccess?: (videoId: string, path: string) => void;
}

export function VideoUploadArea({ onUploadSuccess }: VideoUploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { uploadFile, reset, progress, state, errorMessage } = useResumableUpload({
    onSuccess: (videoId, path) => {
      setSelectedFile(null);
      onUploadSuccess?.(videoId, path);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
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

  return (
    <div className="w-full max-w-2xl mx-auto p-6 border-2 border-dashed border-gray-300 rounded-xl bg-white shadow-sm">
      <input
        type="file"
        ref={fileInputRef}
        accept="video/mp4,video/quicktime,video/webm"
        onChange={handleFileChange}
        disabled={state === 'uploading' || state === 'registering'}
        className="hidden"
      />

      {state === 'idle' && !selectedFile && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center py-10 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
        >
          <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-base font-semibold text-gray-700">Click to upload or drag & drop video</p>
          <p className="text-xs text-gray-500 mt-1">MP4, MOV, or WebM up to 120MB (Direct TUS Resumable Upload)</p>
        </div>
      )}

      {selectedFile && state === 'idle' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="truncate pr-4">
              <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <button
              onClick={handleCancel}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Remove
            </button>
          </div>

          <button
            onClick={handleStartUpload}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
          >
            Start Direct Upload
          </button>
        </div>
      )}

      {(state === 'uploading' || state === 'registering') && (
        <div className="space-y-3 py-4">
          <div className="flex justify-between text-sm font-medium text-gray-700">
            <span>{state === 'uploading' ? 'Uploading directly to Storage...' : 'Initializing Video Pipeline...'}</span>
            <span>{progress}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-xs text-gray-500 text-center">
            {state === 'uploading'
              ? 'Using chunked TUS upload. Safe against temporary connection drops.'
              : 'Creating database records and enqueuing background job.'}
          </p>
        </div>
      )}

      {state === 'completed' && (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-800">Upload Complete!</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">Video processing job has been queued.</p>
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition-colors"
          >
            Upload Another Video
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4 py-2">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <strong>Upload Error:</strong> {errorMessage}
          </div>
          <button
            onClick={handleCancel}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}