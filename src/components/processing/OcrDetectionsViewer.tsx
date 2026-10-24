"use client";

import React, { useState, useMemo } from "react";
import {
  ScanText,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Square,
  BarChart3,
  SortAsc,
  SortDesc,
} from "lucide-react";
import { OcrDetectionRecord } from "@/types/database";

interface OcrDetectionsViewerProps {
  detections: OcrDetectionRecord[];
  onSeekToTime?: (timeSeconds: number) => void;
  loading?: boolean;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
}

type SortMode = "time-asc" | "time-desc" | "confidence-desc";

export default function OcrDetectionsViewer({
  detections,
  onSeekToTime,
  loading,
}: OcrDetectionsViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("time-asc");

  // Stats
  const avgConfidence = useMemo(() => {
    const withConf = detections.filter((d) => d.confidence !== null);
    if (withConf.length === 0) return 0;
    return withConf.reduce((sum, d) => sum + (d.confidence || 0), 0) / withConf.length;
  }, [detections]);

  // Group by unique timestamps for context
  const uniqueTimestamps = useMemo(() => {
    const set = new Set<number>();
    detections.forEach((d) => set.add(d.timestamp_seconds));
    return set.size;
  }, [detections]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = detections;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.text.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      switch (sortMode) {
        case "time-asc":
          return a.timestamp_seconds - b.timestamp_seconds;
        case "time-desc":
          return b.timestamp_seconds - a.timestamp_seconds;
        case "confidence-desc":
          return (b.confidence || 0) - (a.confidence || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [detections, searchQuery, sortMode]);

  if (loading) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-chart-ocr border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-xs text-text-muted">Loading OCR detections...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between border-b border-border hover:bg-surface-secondary/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-chart-ocr/10 flex items-center justify-center">
            <ScanText className="w-4 h-4 text-chart-ocr" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-text-primary text-sm">
              OCR Detections
            </h3>
            <span className="text-[10px] text-text-muted">
              {detections.length} detection{detections.length !== 1 ? "s" : ""}{" "}
              across {uniqueTimestamps} frame{uniqueTimestamps !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {detections.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-text-muted">
              <BarChart3 className="w-3 h-3" />
              <span>
                Avg confidence: {(avgConfidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 py-4">
          {detections.length === 0 ? (
            <div className="text-center py-10">
              <ScanText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-xs text-text-muted">
                No OCR detections available yet.
                <br />
                Text detections will appear after PaddleOCR processing completes.
              </p>
            </div>
          ) : (
            <>
              {/* Search + Sort Bar */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search detected text..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-surface-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-chart-ocr/30 text-text-primary placeholder:text-text-muted"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setSortMode(
                        sortMode === "time-asc" ? "time-desc" : "time-asc"
                      )
                    }
                    className={`p-1.5 rounded-lg text-[10px] transition-all cursor-pointer border ${
                      sortMode.startsWith("time")
                        ? "bg-chart-ocr/10 text-chart-ocr border-chart-ocr/20"
                        : "bg-surface-secondary text-text-muted border-border"
                    }`}
                    title="Sort by time"
                  >
                    {sortMode === "time-desc" ? (
                      <SortDesc className="w-3.5 h-3.5" />
                    ) : (
                      <SortAsc className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setSortMode("confidence-desc")}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                      sortMode === "confidence-desc"
                        ? "bg-chart-ocr/10 text-chart-ocr border-chart-ocr/20"
                        : "bg-surface-secondary text-text-muted border-border"
                    }`}
                    title="Sort by confidence"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Detection Cards */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                {filtered.map((detection) => (
                  <div
                    key={detection.id}
                    className="group bg-surface-secondary/40 hover:bg-surface-secondary/70 border border-border/60 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Detected Text */}
                        <p className="text-xs text-text-primary font-mono leading-relaxed mb-2">
                          {searchQuery.trim()
                            ? highlightMatches(detection.text, searchQuery)
                            : detection.text}
                        </p>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() =>
                              onSeekToTime?.(detection.timestamp_seconds)
                            }
                            className="flex items-center gap-1 text-[10px] font-mono text-chart-ocr hover:text-chart-ocr/80 transition-colors cursor-pointer bg-chart-ocr/5 px-1.5 py-0.5 rounded"
                            title={`Seek to ${formatTimestamp(detection.timestamp_seconds)}`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {formatTimestamp(detection.timestamp_seconds)}
                          </button>

                          {detection.bbox_x_min !== null && (
                            <span className="flex items-center gap-1 text-[9px] text-text-muted font-mono bg-surface-secondary px-1.5 py-0.5 rounded border border-border/50">
                              <Square className="w-2.5 h-2.5" />
                              [{detection.bbox_x_min?.toFixed(2)},{" "}
                              {detection.bbox_y_min?.toFixed(2)}] — [
                              {detection.bbox_x_max?.toFixed(2)},{" "}
                              {detection.bbox_y_max?.toFixed(2)}]
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Confidence Gauge */}
                      {detection.confidence !== null && (
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                          <div className="relative w-10 h-10">
                            <svg
                              className="w-10 h-10 -rotate-90"
                              viewBox="0 0 36 36"
                            >
                              <circle
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="text-surface-secondary"
                              />
                              <circle
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                strokeWidth="3"
                                strokeDasharray={`${(detection.confidence || 0) * 88} 88`}
                                strokeLinecap="round"
                                className={
                                  (detection.confidence || 0) >= 0.9
                                    ? "text-emerald-500"
                                    : (detection.confidence || 0) >= 0.7
                                      ? "text-amber-500"
                                      : "text-red-500"
                                }
                                stroke="currentColor"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-text-primary">
                              {((detection.confidence || 0) * 100).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && searchQuery.trim() && (
                  <div className="text-center py-6 text-xs text-text-muted">
                    No detections matching &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="bg-chart-ocr/20 text-chart-ocr rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}
