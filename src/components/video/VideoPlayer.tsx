import React from 'react';
import { Video } from '@/types';

interface VideoPlayerProps {
  video: Video;
  currentTimeMs: number;
}

export default function VideoPlayer({ video, currentTimeMs }: VideoPlayerProps) {
  // Format MS to MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = (currentTimeMs / video.durationMs) * 100;

  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-border shadow-xl flex flex-col h-full transition-theme">
      <div className="aspect-video bg-black relative flex items-center justify-center border-b border-border">
        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 bg-[url('https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center mix-blend-luminosity">
        </div>
        <div className="absolute inset-0 bg-[var(--video-overlay)] transition-colors duration-300" />
        
        <div className="z-10 text-center">
          <span className="text-white font-medium text-lg">Demo Video Player</span>
          <p className="text-gray-300 text-sm mt-2">Simulated Playback: {formatTime(currentTimeMs)}</p>
        </div>
        
        {/* Scrubber */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-border cursor-pointer hover:h-2 transition-all">
          <div 
            className="h-full bg-primary relative" 
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm scale-0 hover:scale-100 transition-transform"></div>
          </div>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg text-text-primary">{video.title}</h3>
            <span className="text-xs font-mono text-text-secondary bg-surface-secondary border border-border px-2 py-1 rounded">
              {formatTime(video.durationMs)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-primary-soft text-primary border border-primary/20 px-2.5 py-1 rounded-md font-medium">Router Troubleshooting</span>
            <span className="text-xs bg-surface-elevated text-text-primary border border-border px-2.5 py-1 rounded-md">Site #42</span>
          </div>
        </div>
      </div>
    </div>
  );
}
