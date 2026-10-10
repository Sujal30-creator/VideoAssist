import React, { useState, useEffect } from 'react';
import { Eye, Mic, Type, Activity, CheckCircle2, Loader2, FastForward, Clock } from 'lucide-react';
import { ProcessingStage, Event } from '@/types';

interface AnalysisPanelProps {
  appState: 'idle' | 'uploading' | 'processing' | 'ready';
  stages: ProcessingStage[];
  activeStageIndex: number;
  events: Event[];
}

export default function AnalysisPanel({ appState, stages, activeStageIndex, events }: AnalysisPanelProps) {
  const isReady = appState === 'ready';
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (appState === 'processing') {
      timer = setInterval(() => setElapsedMs(prev => prev + 100), 100);
    } else if (appState === 'ready') {
      setElapsedMs(stages.length * 1200); // Fixed time for demo completion
    } else {
      setElapsedMs(0);
    }
    return () => clearInterval(timer);
  }, [appState, stages.length]);

  const formatElapsed = (ms: number) => {
    return (ms / 1000).toFixed(1) + 's';
  };

  const getStageProgress = (idx: number) => {
    if (idx < activeStageIndex || isReady) return 100;
    if (idx === activeStageIndex && appState === 'processing') {
      // Simulate progress counting up for the active stage
      return Math.min(99, Math.floor((elapsedMs % 1200) / 12));
    }
    return 0;
  };

  return (
    <div className="bg-surface rounded-2xl p-6 border border-border shadow-xl h-full flex flex-col relative overflow-hidden transition-theme">
      
      {/* Demo Warning */}
      <div className="absolute top-0 right-0 bg-warning/10 text-warning text-[10px] uppercase font-bold px-3 py-1 border-b border-l border-warning/20 rounded-bl-lg tracking-wider">
        Demo / Simulated AI Processing
      </div>

      <div className="flex items-center justify-between mb-6 border-b border-border pb-4 mt-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-text-primary">
          <Activity className="w-5 h-5 text-primary" /> Video Analysis
        </h3>
        {(appState === 'processing' || isReady) && (
          <div className="text-xs font-mono text-text-secondary flex items-center gap-1.5 bg-background px-2.5 py-1 rounded-md border border-border">
            <Clock className="w-3.5 h-3.5" /> {formatElapsed(elapsedMs)}
          </div>
        )}
      </div>
      
      {/* Processing Pipeline */}
      {(appState === 'processing' || appState === 'ready') && (
        <div className="space-y-4 mb-6">
          {stages.map((stage, idx) => {
            const isPast = idx < activeStageIndex || isReady;
            const isCurrent = idx === activeStageIndex && appState === 'processing';
            const isFuture = idx > activeStageIndex && !isReady;
            const progress = getStageProgress(idx);

            return (
              <div key={stage.id} className={`transition-opacity duration-500 ${isFuture ? 'opacity-40' : 'opacity-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-text-muted" />
                    )}
                    <h4 className={`text-sm font-medium ${isCurrent ? 'text-primary' : isPast ? 'text-text-primary' : 'text-text-muted'}`}>
                      {stage.name}
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-text-muted">{progress}%</span>
                </div>
                
                {/* Mini progress bar */}
                <div className="h-1 w-full bg-surface-elevated rounded-full overflow-hidden ml-7 w-[calc(100%-1.75rem)] border border-border">
                  <div 
                    className={`h-full ${isPast ? 'bg-success' : 'bg-primary'}`} 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pipeline Details Flowchart */}
      <div className="mt-auto pt-6 border-t border-border">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 text-center">Pipeline Architecture</h4>
        <div className="flex flex-col items-center justify-center gap-1 text-[10px] font-mono text-text-secondary">
          <div className="bg-background border border-border px-3 py-1 rounded w-32 text-center">VIDEO</div>
          <div className="text-text-muted">↓</div>
          <div className="bg-background border border-border px-3 py-1 rounded w-32 text-center">FRAMES</div>
          <div className="text-text-muted">↓</div>
          <div className="flex gap-2">
            <div className="bg-background border border-[var(--color-chart-visual)]/50 text-[var(--color-chart-visual)] px-2 py-1 rounded w-16 text-center">VISION</div>
            <div className="bg-background border border-[var(--color-chart-speech)]/50 text-[var(--color-chart-speech)] px-2 py-1 rounded w-16 text-center">SPEECH</div>
            <div className="bg-background border border-[var(--color-chart-ocr)]/50 text-[var(--color-chart-ocr)] px-2 py-1 rounded w-16 text-center">OCR</div>
          </div>
          <div className="text-text-muted">↓</div>
          <div className="bg-background border border-border px-3 py-1 rounded w-48 text-center text-primary">TEMPORAL SEGMENTS</div>
          <div className="text-text-muted">↓</div>
          <div className="bg-background border border-success/50 text-success px-3 py-1 rounded w-48 text-center font-bold shadow-sm">MULTIMODAL INDEX</div>
        </div>
      </div>

    </div>
  );
}
