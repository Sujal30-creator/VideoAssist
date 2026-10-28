'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Video } from '@/types';
import { ShieldCheck, Film } from 'lucide-react';

interface VideoPlayerProps {
  video: Video & {
    signedUrl?: string;
    width?: number | null;
    height?: number | null;
    fileSizeBytes?: number | null;
  };
  currentTimeMs: number;
  onTimeUpdate?: (timeMs: number) => void;
}

export default function VideoPlayer({ video, currentTimeMs, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // NEW:
  const [loadedDurationMs, setLoadedDurationMs] = useState<number | null>(null);
  const effectiveDurationMs = loadedDurationMs || (video.durationMs > 0 ? video.durationMs : null);

  // OLD:
  // const formatTime = (ms: number) => {
  //   const totalSeconds = Math.floor(ms / 1000);
  //   const minutes = Math.floor(totalSeconds / 60);
  //   const seconds = totalSeconds % 60;
  //   return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  // };
  // const progressPercent = video.durationMs > 0 ? (currentTimeMs / video.durationMs) * 100 : 0;

  // NEW:
  const formatTime = (ms: number | null) => {
    if (ms === null || ms <= 0) return "--:--";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = (effectiveDurationMs && effectiveDurationMs > 0)
    ? (currentTimeMs / effectiveDurationMs) * 100
    : 0;

  // Sync external seek if user clicks an event
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime * 1000 - currentTimeMs) > 1000) {
      videoRef.current.currentTime = currentTimeMs / 1000;
    }
  }, [currentTimeMs]);

  const hasRealVideo = Boolean(video.signedUrl || (video.url && video.url.startsWith('http') && !video.url.includes('example.com')));

  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-border shadow-xl flex flex-col h-full transition-theme">
      <div className="aspect-video bg-black relative flex items-center justify-center border-b border-border overflow-hidden">
        {hasRealVideo ? (
          <video
            ref={videoRef}
            src={video.signedUrl || video.url}
            controls
            className="w-full h-full object-contain"
            onLoadedMetadata={(e) => {
              const durMs = Math.floor(e.currentTarget.duration * 1000);
              if (!isNaN(durMs) && durMs > 0) {
                setLoadedDurationMs(durMs);
              }
            }}
            onTimeUpdate={(e) => {
              const currentMs = Math.floor(e.currentTarget.currentTime * 1000);
              if (onTimeUpdate) onTimeUpdate(currentMs);
            }}
          />
        ) : (
          <>
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 bg-[url('https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center mix-blend-luminosity" />
            <div className="absolute inset-0 bg-[var(--video-overlay)] transition-colors duration-300" />

            <div className="z-10 text-center px-4">
              <span className="text-white font-semibold text-lg flex items-center justify-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                {video.title}
              </span>
              <p className="text-gray-300 text-xs mt-2 font-mono">
                Playback: {formatTime(currentTimeMs)} / {formatTime(video.durationMs)}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/20 text-[10px] text-gray-300 font-mono">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Private Storage: field-service-videos
              </div>
            </div>

            {/* Simulated Scrubber */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-border cursor-pointer hover:h-2 transition-all">
              <div
                className="h-full bg-primary relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm scale-0 hover:scale-100 transition-transform" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg text-text-primary truncate max-w-[70%]">
              {video.title}
            </h3>
            {/* OLD:
            <span className="text-xs font-mono text-text-secondary bg-surface-secondary border border-border px-2 py-1 rounded">
              {formatTime(video.durationMs)}
            </span>
            */}
            {/* NEW: Use effectiveDurationMs computed from loaded video or DB */}
            <span className="text-xs font-mono text-text-secondary bg-surface-secondary border border-border px-2 py-1 rounded">
              {formatTime(effectiveDurationMs)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {video.width && video.height && (
              <span className="bg-surface-elevated text-text-muted border border-border px-2.5 py-1 rounded-md font-mono">
                {video.width}x{video.height}
              </span>
            )}
            <span className="bg-primary-soft text-primary border border-primary/20 px-2.5 py-1 rounded-md font-medium">
              Field-Service Evidence
            </span>
            <span className="bg-surface-elevated text-text-primary border border-border px-2.5 py-1 rounded-md">
              Encrypted Private Storage
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
