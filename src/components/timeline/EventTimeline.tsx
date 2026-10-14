'use client';

import React, { useState, useRef } from 'react';
import { Event, TemporalSegment } from '@/types';
import {
  GitCommitHorizontal,
  Eye,
  Mic,
  Type,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ListFilter,
  LayoutGrid,
  Move,
} from 'lucide-react';

interface EventTimelineProps {
  events: Event[];
  segments: TemporalSegment[];
  onEventClick: (startTimeMs: number) => void;
  videoDurationMs?: number;
}

export default function EventTimeline({
  events,
  segments,
  onEventClick,
  videoDurationMs = 180000,
}: EventTimelineProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.6x, 0.8x, 1x, 1.5x, 2x
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
      setZoomLevel((prev) => Math.max(prev - 0.25, 0.5)); // Zoom out to 50% to fit big staircases!
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
      {/* Timeline Controls & Visualization Wrapper */}
      <div className="bg-surface rounded-2xl p-6 md:p-8 border border-border shadow-xl transition-theme">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-border pb-4">
          <div>
            <h3 className="font-bold text-text-primary flex items-center gap-2 text-base">
              <GitCommitHorizontal className="w-5 h-5 text-primary" /> Temporal Event Staircase
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Sequential chronological steps ({events.length} events) • 00:00 to {formatTime(videoDurationMs)}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex bg-surface-secondary p-1 rounded-xl border border-border text-xs">
              <button
                onClick={() => setViewMode('GRAPH')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'GRAPH'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title="Staircase Graph View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'LIST'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title="Structured Event Feed"
              >
                <ListFilter className="w-4 h-4" />
              </button>
            </div>

            {/* Zoom Slider & Controls */}
            {viewMode === 'GRAPH' && (
              <div className="flex items-center gap-1.5 bg-surface-secondary px-2 py-1 rounded-xl border border-border text-xs">
                <button
                  onClick={() => handleZoom('out')}
                  disabled={zoomLevel <= 0.5}
                  className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface disabled:opacity-40 transition-all cursor-pointer"
                  title="Zoom Out (Fit All Steps)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                {/* Direct Zoom Slider */}
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                  className="w-16 h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                  title="Adjust Timeline Scale"
                />

                <button
                  onClick={() => handleZoom('fit')}
                  className="px-1.5 py-0.5 text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-all cursor-pointer"
                  title="Reset 100%"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>

                <button
                  onClick={() => handleZoom('in')}
                  disabled={zoomLevel >= 2.5}
                  className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface disabled:opacity-40 transition-all cursor-pointer"
                  title="Zoom In (Enlarge Steps)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* View Mode 1: 2D Scrollable Sequential Staircase */}
        {viewMode === 'GRAPH' && (
          <div className="relative">
            
            {/* Scroll Container: Fixed 380px height with BOTH horizontal and vertical scroll! */}
            <div
              ref={scrollContainerRef}
              className="w-full h-96 bg-background rounded-xl border border-border overflow-auto transition-theme scrollbar-thin select-none relative"
            >
              <div
                className="relative transition-all duration-300 ease-out p-4"
                style={{
                  width: `${trackWidthPercent}%`,
                  minWidth: '100%',
                  height: `${totalStaircaseHeight}px`,
                }}
              >
                {/* Sticky Time Ruler Bar (stays at top and NEVER collides with cards) */}
                <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border pb-2 mb-4">
                  <div className="relative h-6">
                    {markers.map((m, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                        style={{ left: `${m.percent}%` }}
                      >
                        <span className="text-[10px] font-mono text-text-muted mb-0.5">
                          {formatTime(m.timeMs)}
                        </span>
                        <div className="w-0.5 h-1.5 bg-border" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Staircase Step Progression */}
                <div className="relative w-full">
                  {events.map((event, idx) => {
                    const segment = segments.find((s) => s.id === event.segmentId);
                    if (!segment) return null;

                    const leftPercent = (segment.startTimeMs / videoDurationMs) * 100;
                    const durationPercent = ((segment.endTimeMs - segment.startTimeMs) / videoDurationMs) * 100;
                    const widthPercent = Math.max(durationPercent, 6);
                    const isSelected = selectedEventId === event.id;

                    // Each event steps down like stairs
                    const topOffset = idx * staircaseRowHeight;

                    return (
                      <div
                        key={event.id}
                        className={`absolute rounded-lg border flex items-center px-3 font-medium cursor-pointer transition-all duration-200 shadow-xs ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary-hover z-20 scale-[1.02] shadow-md ring-2 ring-primary/30'
                            : 'bg-surface-elevated text-text-primary border-border hover:bg-surface-secondary hover:border-primary/50 z-10'
                        }`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          top: `${topOffset}px`,
                          height: `${Math.max(28 * zoomLevel, 26)}px`,
                          fontSize: `${Math.max(11 * zoomLevel, 9.5)}px`,
                          minWidth: `${Math.max(130 * zoomLevel, 95)}px`,
                        }}
                        onClick={() => handleEventSelect(event.id, segment.startTimeMs)}
                      >
                        <span className="truncate mr-2 font-medium">{event.description}</span>
                        <span
                          className={`ml-auto font-mono shrink-0 opacity-80 ${
                            isSelected ? 'text-primary-foreground' : 'text-text-muted'
                          }`}
                          style={{ fontSize: `${Math.max(10 * zoomLevel, 8.5)}px` }}
                        >
                          {formatTime(segment.startTimeMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Navigation Helper Footer */}
            <div className="flex flex-wrap justify-between items-center text-[11px] text-text-muted mt-2 px-1 font-mono">
              <span className="flex items-center gap-1">
                <Move className="w-3.5 h-3.5 text-primary" />
                Scroll freely in 2D (Side & Down) • Zoom Out to fit all steps
              </span>
              <span>Scale: {Math.round(zoomLevel * 100)}%</span>
            </div>
          </div>
        )}

        {/* View Mode 2: Compact Structured Feed View */}
        {viewMode === 'LIST' && (
          <div className="space-y-2 max-h-84 overflow-y-auto pr-1">
            {events.map((event, idx) => {
              const segment = segments.find((s) => s.id === event.segmentId);
              const isSelected = selectedEventId === event.id;

              return (
                <div
                  key={event.id}
                  onClick={() => segment && handleEventSelect(event.id, segment.startTimeMs)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary-soft/30 shadow-xs'
                      : 'border-border bg-surface hover:border-border/80 hover:bg-surface-secondary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-primary px-2.5 py-1 rounded-md bg-background border border-border">
                      {segment ? `${formatTime(segment.startTimeMs)} - ${formatTime(segment.endTimeMs)}` : '00:00'}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-text-primary leading-tight">
                        {event.description}
                      </p>
                      <span className="text-[10px] text-text-muted">
                        Confidence: {Math.round(event.confidence * 100)}% • {event.eventType || 'Operational Event'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {event.evidence.visuals.length > 0 && <Eye className="w-3.5 h-3.5 text-purple-500" />}
                    {event.evidence.transcripts.length > 0 && <Mic className="w-3.5 h-3.5 text-indigo-500" />}
                    {event.evidence.ocr.length > 0 && <Type className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Event Details Panel */}
      {selectedEvent && selectedSegment && (
        <div className="bg-surface rounded-2xl p-6 md:p-8 border border-primary/30 shadow-md animate-in fade-in zoom-in-95 duration-300 transition-theme">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-border pb-6">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-2">{selectedEvent.description}</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono bg-background border border-border px-3 py-1 rounded-lg text-primary text-xs font-semibold transition-theme">
                  {formatTime(selectedSegment.startTimeMs)} - {formatTime(selectedSegment.endTimeMs)}
                </span>
                <span className="bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded-md text-xs font-semibold">
                  {Math.round(selectedEvent.confidence * 100)}% Confidence
                </span>
              </div>
            </div>

            {/* Temporal Relations Summary Box */}
            <div className="bg-background border border-border rounded-xl p-4 min-w-[240px] transition-theme">
              <h4 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-3">
                Temporal Reasoning Linkages
              </h4>
              <div className="space-y-2">
                {selectedEvent.temporalRelations.length === 0 && (
                  <p className="text-xs text-text-muted">No linked prior/subsequent events.</p>
                )}
                {selectedEvent.temporalRelations.map((rel, i) => {
                  const relEvent = events.find((e) => e.id === rel.relatedEventId);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          rel.relationType === 'BEFORE' ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
                        }`}
                      >
                        {rel.relationType}
                      </span>
                      <span className="text-text-primary truncate">{relEvent?.description}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evidence Modalities Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-background rounded-xl p-4 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-xs font-bold text-text-secondary mb-3">
                <Eye className="w-4 h-4 text-[var(--color-chart-visual)]" /> Visual Evidence
              </h4>
              {selectedEvent.evidence.visuals.length > 0 ? (
                selectedEvent.evidence.visuals.map((v, i) => (
                  <p key={i} className="text-xs text-text-primary mb-2 leading-relaxed">
                    {v.description}
                  </p>
                ))
              ) : (
                <p className="text-xs text-text-muted italic">No visual frame highlighted.</p>
              )}
            </div>

            <div className="bg-background rounded-xl p-4 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-xs font-bold text-text-secondary mb-3">
                <Mic className="w-4 h-4 text-[var(--color-chart-speech)]" /> Speech Transcript (Whisper)
              </h4>
              {selectedEvent.evidence.transcripts.length > 0 ? (
                selectedEvent.evidence.transcripts.map((t, i) => (
                  <p
                    key={i}
                    className="text-xs text-text-primary italic border-l-2 border-[var(--color-chart-speech)]/50 pl-3 mb-2"
                  >
                    &quot;{t.text}&quot;
                  </p>
                ))
              ) : (
                <p className="text-xs text-text-muted italic">No speech detected.</p>
              )}
            </div>

            <div className="bg-background rounded-xl p-4 border border-border transition-theme">
              <h4 className="flex items-center gap-2 text-xs font-bold text-text-secondary mb-3">
                <Type className="w-4 h-4 text-[var(--color-chart-ocr)]" /> OCR Screen/Label Text
              </h4>
              {selectedEvent.evidence.ocr.length > 0 ? (
                selectedEvent.evidence.ocr.map((o, i) => (
                  <div key={i} className="bg-surface border border-border rounded-lg p-2 mb-2 transition-theme">
                    <p className="text-xs font-mono text-text-primary">&quot;{o.text}&quot;</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-text-muted italic">No text extracted from frame.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
