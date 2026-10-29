"use client";

import React, { useState, useMemo } from "react";
import {
  MessageSquareText,
  Clock,
  User2,
  ChevronDown,
  ChevronUp,
  Search,
  Languages,
  BarChart3,
} from "lucide-react";
import { TranscriptRecord } from "@/types/database";

interface TranscriptViewerProps {
  transcripts: TranscriptRecord[];
  onSeekToTime?: (timeSeconds: number) => void;
  loading?: boolean;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
}

export default function TranscriptViewer({
  transcripts,
  onSeekToTime,
  loading,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  // Extract unique speakers
  const speakers = useMemo(() => {
    const set = new Set<string>();
    transcripts.forEach((t) => {
      if (t.speaker) set.add(t.speaker);
    });
    return Array.from(set);
  }, [transcripts]);

  // Filter transcripts
  const filtered = useMemo(() => {
    let result = transcripts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.text.toLowerCase().includes(q) ||
          t.speaker?.toLowerCase().includes(q)
      );
    }
    if (selectedSpeaker) {
      result = result.filter((t) => t.speaker === selectedSpeaker);
    }
    return result;
  }, [transcripts, searchQuery, selectedSpeaker]);

  // Stats
  const totalDuration = useMemo(() => {
    return transcripts.reduce(
      (sum, t) => sum + (t.end_time - t.start_time),
      0
    );
  }, [transcripts]);

  const avgConfidence = useMemo<number | null>(() => {
    const withConf = transcripts.filter(
      (t) => t.confidence !== null && t.confidence !== undefined
    );
    if (withConf.length === 0) return null;
    return withConf.reduce((sum, t) => sum + (t.confidence || 0), 0) / withConf.length;
  }, [transcripts]);

  if (loading) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-xs text-text-muted">Loading transcripts...</span>
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
          <div className="w-8 h-8 rounded-lg bg-chart-speech/10 flex items-center justify-center">
            <MessageSquareText className="w-4 h-4 text-chart-speech" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-text-primary text-sm">
              Speech Transcript
            </h3>
            <span className="text-[10px] text-text-muted">
              {transcripts.length} segment{transcripts.length !== 1 ? "s" : ""}{" "}
              • {formatTimestamp(totalDuration)} total speech
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {transcripts.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-text-muted">
              <BarChart3 className="w-3 h-3" />
              <span>
                Avg confidence:{" "}
                {avgConfidence !== null
                  ? `${(avgConfidence * 100).toFixed(0)}%`
                  : "N/A"}
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
          {transcripts.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquareText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-xs text-text-muted">
                No transcript data available yet.
                <br />
                Transcripts will appear after Whisper processing completes.
              </p>
            </div>
          ) : (
            <>
              {/* Search + Filter Bar */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search transcripts..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-surface-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-text-primary placeholder:text-text-muted"
                  />
                </div>

                {speakers.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedSpeaker(null)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                        !selectedSpeaker
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-surface-secondary text-text-muted border-border hover:text-text-primary"
                      }`}
                    >
                      All
                    </button>
                    {speakers.map((speaker) => (
                      <button
                        key={speaker}
                        onClick={() =>
                          setSelectedSpeaker(
                            selectedSpeaker === speaker ? null : speaker
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                          selectedSpeaker === speaker
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-surface-secondary text-text-muted border-border hover:text-text-primary"
                        }`}
                      >
                        {speaker}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Transcript Segments */}
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                {filtered.map((segment, index) => (
                  <div
                    key={segment.id}
                    className="group flex gap-3 py-2.5 px-3 rounded-xl hover:bg-surface-secondary/50 transition-colors"
                  >
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center pt-0.5">
                      <div className="w-2 h-2 rounded-full bg-chart-speech/60 border-2 border-chart-speech/20 shrink-0" />
                      {index < filtered.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Timestamp + Speaker */}
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => onSeekToTime?.(segment.start_time)}
                          className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary-hover transition-colors cursor-pointer bg-primary/5 px-1.5 py-0.5 rounded"
                          title={`Seek to ${formatTimestamp(segment.start_time)}`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimestamp(segment.start_time)} — {formatTimestamp(segment.end_time)}
                        </button>

                        {segment.speaker && (
                          <span className="flex items-center gap-1 text-[10px] text-text-muted">
                            <User2 className="w-2.5 h-2.5" />
                            {segment.speaker}
                          </span>
                        )}

                        {segment.language && (
                          <span className="flex items-center gap-1 text-[10px] text-text-muted">
                            <Languages className="w-2.5 h-2.5" />
                            {segment.language.toUpperCase()}
                          </span>
                        )}

                        {segment.confidence !== null && (
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                              segment.confidence >= 0.9
                                ? "bg-emerald-500/10 text-emerald-500"
                                : segment.confidence >= 0.7
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {(segment.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Text */}
                      <p className="text-xs text-text-primary leading-relaxed">
                        {searchQuery.trim()
                          ? highlightMatches(segment.text, searchQuery)
                          : segment.text}
                      </p>
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && searchQuery.trim() && (
                  <div className="text-center py-6 text-xs text-text-muted">
                    No segments matching &ldquo;{searchQuery}&rdquo;
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

/** Highlight search term matches in text */
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="bg-primary/20 text-primary rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}
