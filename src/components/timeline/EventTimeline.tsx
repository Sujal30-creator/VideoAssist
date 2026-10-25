import React, { useState, useRef } from 'react';
import { Event, TemporalSegment } from '@/types';
import { Clock, MousePointer2, GitCommitHorizontal, Eye, Mic, Type, Activity } from 'lucide-react';

export interface EventTimelineProps {
  events: Event[];
  segments: TemporalSegment[];
  onEventClick: (startTimeMs: number) => void;
  videoDurationMs?: number;
}

export default function EventTimeline({ events, segments, onEventClick, videoDurationMs = 180000 }: EventTimelineProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'GRAPH' | 'LIST'>('GRAPH');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleEventSelect = (eventId: string, startTimeMs: number) => {
    setSelectedEventId(eventId);
    onEventClick(startTimeMs);
  };

  const handleZoom = (direction: 'in' | 'out' | 'fit') => {
    if (direction === 'fit') {
      setZoomLevel(1);
    } else if (direction === 'in') {
      setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
    } else {
      setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
    }
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedSegment = segments.find((s) => s.id === selectedEvent?.segmentId);

  // Width & height scale dynamically with zoom
  const trackWidthPercent = zoomLevel * 100;
  const staircaseRowHeight = 44 * zoomLevel;
  const totalStaircaseHeight = Math.max(events.length * staircaseRowHeight + 60, 260);

  // Time ruler notches
  const markerCount = Math.max(6, Math.floor(8 * zoomLevel));
  const markers = Array.from({ length: markerCount + 1 }).map((_, i) => {
    const timeMs = (videoDurationMs / markerCount) * i;
    const percent = (i / markerCount) * 100;
    return { timeMs, percent };
  });

  return (
    <div className="mt-6 flex flex-col gap-6 transition-theme">

      {/* Timeline Visualization */}
      <div className="bg-surface rounded-2xl p-8 border border-border shadow-xl transition-theme">
        <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <GitCommitHorizontal className="w-5 h-5 text-primary" /> Temporal Event Graph
          </h3>
          <span className="text-xs text-text-secondary font-mono">00:00 - {formatTime(videoDurationMs)}</span>
        </div>

        <div className="relative w-full h-80 bg-background rounded-xl border border-border p-4 overflow-hidden transition-theme">
          {/* Base Axis */}
          <div className="absolute left-4 right-4 top-4 h-0.5 bg-border"></div>

          <div className="relative w-full h-full mt-6">
            {events.map((event, idx) => {
              const segment = segments.find(s => s.id === event.segmentId);
              if (!segment) return null;

              const leftPercent = (segment.startTimeMs / videoDurationMs) * 100;
              const widthPercent = ((segment.endTimeMs - segment.startTimeMs) / videoDurationMs) * 100;
              const isSelected = selectedEventId === event.id;

              // Stagger vertically
              const topOffset = idx * 36;

              return (
                <div
                  key={event.id}
                  // onClick={() => handleEventSelect(event.id, segment.startTimeMs)}

                  onClick={() => segment && handleEventSelect(event.id, segment.startTimeMs)}
                  className={`absolute h-8 rounded-xl border flex items-center justify-between px-3 text-[10px] font-medium cursor-pointer transition-all shadow-sm ${isSelected
                    ? 'bg-primary text-primary-foreground border-primary-hover shadow-xs z-20 scale-105'
                    : 'bg-surface-elevated text-text-primary border-border hover:bg-surface-secondary hover:border-primary/50 z-10'
                    }`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    top: `${topOffset}px`,
                    minWidth: 'fit-content'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-primary px-2.5 py-1 rounded-md bg-background border border-border">
                      {segment
                        ? `${formatTime(segment.startTimeMs)} - ${formatTime(segment.endTimeMs)}`
                        : '00:00'}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-text-primary leading-tight">
                        {event.description}
                      </p>
                      <span className="text-[10px] text-text-muted">
                        Confidence: {Math.round(event.confidence * 100)}% •{' '}
                        {event.eventType || 'Operational Event'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {event.evidence.visuals.length > 0 && (
                      <Eye className="w-3.5 h-3.5 text-purple-500" />
                    )}
                    {event.evidence.transcripts.length > 0 && (
                      <Mic className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                    {event.evidence.ocr.length > 0 && (
                      <Type className="w-3.5 h-3.5 text-amber-500" />
                    )}
                  </div>

                  <span className="truncate mr-2">{event.description}</span>
                  <span className={`ml-auto font-mono opacity-80 ${isSelected ? 'text-primary-foreground' : 'text-text-muted'}`}>
                    {formatTime(segment.startTimeMs)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event Details Panel */}
      {selectedEvent && selectedSegment && (
        <div className="bg-surface rounded-2xl p-6 md:p-8 border border-primary/30 shadow-md animate-in fade-in zoom-in-95 duration-300 transition-theme">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-border pb-6">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {selectedEvent.description}
              </h2>
              <div className="flex items-center gap-3">
                <span className="font-mono bg-background border border-border px-3 py-1 rounded text-primary text-sm transition-theme">
                  {formatTime(selectedSegment.startTimeMs)} - {formatTime(selectedSegment.endTimeMs)}
                </span>
                <span className="bg-success/10 text-success border border-success/20 px-2 py-1 rounded text-xs font-semibold">
                  {Math.round(selectedEvent.confidence * 100)}% Confidence
                </span>
              </div>
            </div>

            {/* Temporal Relations Summary Box */}
            <div className="bg-background border border-border rounded-xl p-4 min-w-[240px] transition-theme">
              <h4 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-3">Temporal Reasoning</h4>
              <div className="space-y-2">
                {selectedEvent.temporalRelations.map((rel, i) => {
                  const relEvent = events.find(e => e.id === rel.relatedEventId);
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rel.relationType === 'BEFORE' ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'}`}>
                        {rel.relationType}
                      </span>
                      <span className="text-text-primary truncate">
                        {relEvent?.description}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evidence Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Visual Evidence */}
            <div className="bg-background rounded-xl p-5 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-4">
                <Eye className="w-4 h-4 text-[var(--color-chart-visual)]" /> Visual Evidence
              </h4>
              {selectedEvent.evidence.visuals.length > 0 ? (
                selectedEvent.evidence.visuals.map((v, i) => (
                  <p key={i} className="text-sm text-text-primary mb-2 leading-relaxed">
                    {v.description}
                  </p>
                ))
              ) : (
                <p className="text-sm text-text-muted italic">No visual evidence highlighted.</p>
              )}
            </div>

            {/* Speech Evidence */}
            <div className="bg-background rounded-xl p-5 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-4">
                <Mic className="w-4 h-4 text-[var(--color-chart-speech)]" /> Speech Evidence
              </h4>
              {selectedEvent.evidence.transcripts.length > 0 ? (
                selectedEvent.evidence.transcripts.map((t, i) => (
                  <p key={i} className="text-sm text-text-primary italic border-l-2 border-[var(--color-chart-speech)]/50 pl-3 mb-3">
                    "{t.text}"
                  </p>
                ))
              ) : (
                <p className="text-sm text-text-muted italic">No speech detected.</p>
              )}
            </div>

            {/* OCR Evidence */}
            <div className="bg-background rounded-xl p-5 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-4">
                <Type className="w-4 h-4 text-[var(--color-chart-ocr)]" /> OCR Evidence
              </h4>
              {selectedEvent.evidence.ocr.length > 0 ? (
                selectedEvent.evidence.ocr.map((o, i) => (
                  <div
                    key={i}
                    className="bg-surface border border-border rounded-lg p-2 mb-2 transition-theme"
                  >
                    <p className="text-xs font-mono text-text-primary">&quot;{o.text}&quot;</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-muted italic">No relevant text extracted.</p>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Empty State Prompt */}
      {!selectedEvent && (
        <div className="flex flex-col items-center justify-center p-8 bg-surface/50 border border-dashed border-border rounded-2xl text-text-muted transition-theme text-center">
          <MousePointer2 className="w-8 h-8 mb-3 opacity-50" />
          <p className="text-sm">
            Click any temporal event on the timeline to inspect evidence and reasoning.
          </p>
        </div>
      )}
    </div>
  );
}
