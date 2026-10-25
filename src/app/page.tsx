"use client";

import React, { useState } from 'react';
import Header from '@/components/dashboard/Header';
import UploadArea from '@/components/dashboard/UploadArea';
import VideoPlayer from '@/components/video/VideoPlayer';
import AnalysisPanel from '@/components/dashboard/AnalysisPanel';
import EventTimeline from '@/components/timeline/EventTimeline';
import SearchPanel from '@/components/query/SearchPanel';
import { Network, ChevronDown, ChevronUp } from 'lucide-react';

import { mockVideo, mockStages, mockEvents, mockSegments } from '@/data/mockData';

export default function VideoAssistDashboard() {
  const [appState, setAppState] = useState<'idle' | 'uploading' | 'processing' | 'ready'>('idle');
  const [fileSelected, setFileSelected] = useState(false);
  const [activeStage, setActiveStage] = useState(-1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showArch, setShowArch] = useState(false);

  // Simulation: Processing Pipeline
  const startAnalysis = () => {
    setAppState('processing');
    setActiveStage(0);

    // Simulate pipeline progression
    let currentStage = 0;
    const interval = setInterval(() => {
      currentStage++;
      if (currentStage >= mockStages.length) {
        clearInterval(interval);
        setTimeout(() => {
          setAppState('ready');
        }, 800);
      } else {
        setActiveStage(currentStage);
      }
    }, 1200);
  };

  const handleEventClick = (startTimeMs: number) => {
    setCurrentTimeMs(startTimeMs);
    // Smooth scroll back to video if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary-soft transition-theme">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* System Architecture Section */}
        <div className="mb-6">
          <button
            onClick={() => setShowArch(!showArch)}
            className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-sm font-medium mx-auto bg-surface px-4 py-2 rounded-full border border-border"
          >
            <Network className="w-4 h-4" />
            {showArch ? 'Hide System Architecture' : 'View System Architecture'}
            {showArch ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showArch && (
            <div className="mt-6 bg-surface border border-border rounded-2xl p-8 animate-in slide-in-from-top-4 fade-in duration-500 shadow-xl overflow-x-auto transition-theme">
              <h3 className="text-center font-bold text-text-primary uppercase tracking-widest text-xs mb-8">
                VideoAssist Simulated Architecture
              </h3>
              <div className="flex items-center justify-between min-w-[800px] text-xs font-mono text-center">
                {/* Pipeline Flow */}
                <div className="flex flex-col items-center gap-1 w-24">
                  <div className="bg-surface-secondary border border-border p-2 rounded w-full">Video</div>
                  <div className="text-text-muted my-1">↓</div>
                  <div className="bg-surface-secondary border border-border p-2 rounded w-full">Frames/Audio</div>
                </div>
                <div className="text-text-muted">→</div>

                {/* Modalities */}
                <div className="flex flex-col gap-2">
                  <div className="bg-surface-elevated border border-[var(--color-chart-visual)] text-[var(--color-chart-visual)] p-2 rounded w-28">Visual Analysis</div>
                  <div className="bg-surface-elevated border border-[var(--color-chart-speech)] text-[var(--color-chart-speech)] p-2 rounded w-28">Speech Transact</div>
                  <div className="bg-surface-elevated border border-[var(--color-chart-ocr)] text-[var(--color-chart-ocr)] p-2 rounded w-28">OCR Text</div>
                </div>
                <div className="text-text-muted">→</div>

                {/* Structure */}
                <div className="flex flex-col items-center gap-1 w-32">
                  <div className="bg-surface-elevated border border-success/50 text-success p-2 rounded w-full">Temporal<br />Segmentation</div>
                  <div className="text-text-muted my-1">↓</div>
                  <div className="bg-surface-elevated border border-success/50 text-success p-2 rounded w-full font-bold">Multimodal Index</div>
                </div>
                <div className="text-text-muted">→</div>

                {/* Query Pipeline */}
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-primary-soft border border-primary/30 text-primary p-2 rounded w-40 flex items-center justify-center gap-2">
                    Query Understanding
                  </div>
                  <div className="bg-primary-soft border border-primary/30 text-primary p-2 rounded w-40 flex items-center justify-center gap-2">
                    Coarse Retrieval
                  </div>
                  <div className="bg-primary-soft border border-primary/30 text-primary p-2 rounded w-40 flex items-center justify-center gap-2 font-bold shadow-sm">
                    Temporal Grounding
                  </div>
                </div>
                <div className="text-text-muted">→</div>

                {/* Final Verification */}
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-surface-elevated border border-primary/50 text-primary p-2 rounded w-36">Evidence Verification</div>
                  <div className="bg-primary text-primary-foreground p-2 rounded w-36 font-bold shadow-md">Grounded QA</div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Upload State */}
        {(appState === 'idle' || (appState === 'processing' && !fileSelected)) && (
          <UploadArea
            fileSelected={fileSelected}
            setFileSelected={setFileSelected}
            onAnalyze={startAnalysis}
          />
        )}

        {/* Processing and Ready States */}
        {appState !== 'idle' && fileSelected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-700">

            {/* Left Area: Video Player */}
            <div className="lg:col-span-2">
              <VideoPlayer
                video={mockVideo}
                currentTimeMs={currentTimeMs}
              />
            </div>

            {/* Right Area: Analysis Panel */}
            <div className="lg:col-span-1">
              <AnalysisPanel
                appState={appState}
                stages={mockStages}
                activeStageIndex={activeStage}
                events={mockEvents}
              />
            </div>

          </div>
        )}

        {/* Under Video: Timeline and QA */}
        {appState === 'ready' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <EventTimeline
              events={mockEvents}
              segments={mockSegments}
              onEventClick={handleEventClick}
              videoDurationMs={mockVideo.durationMs}
            />
            <SearchPanel onSeek={handleEventClick} />
          </div>
        )}

      </main>
    </div>
  );
}

