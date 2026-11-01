"use client";

import React from "react";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  RefreshCw,
  Activity,
  Timer,
} from "lucide-react";
import { ProcessingJobRecord } from "@/types/database";

interface ProcessingStatusPanelProps {
  job: ProcessingJobRecord | null;
  isPolling: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock className="w-4 h-4 text-amber-500" />,
  processing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
};

export default function ProcessingStatusPanel({
  job,
  isPolling,
  onRetry,
  retrying,
}: ProcessingStatusPanelProps) {
  if (!job) {
    return (
      <div className="bg-surface rounded-2xl p-5 border border-border">
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-xs text-text-muted">
            No processing job linked to this video.
          </p>
        </div>
      </div>
    );
  }

  const statusColor =
    job.status === "completed"
      ? "emerald"
      : job.status === "failed"
        ? "red"
        : job.status === "processing"
          ? "violet"
          : "amber";

  const progressBarGradient =
    job.status === "completed"
      ? "from-emerald-500 to-emerald-400"
      : job.status === "failed"
        ? "from-red-500 to-red-400"
        : "from-primary to-accent";

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${statusColor}-500/10`}
          >
            {STAGE_ICONS[job.status]}
          </div>
          <div>
            <h3 className="font-bold text-text-primary text-sm flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Processing Pipeline
            </h3>
            <span className="text-[10px] text-text-muted font-mono">
              Job {job.id.slice(0, 8)}...
            </span>
          </div>
        </div>

        {isPolling && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Progress Section */}
      <div className="px-5 py-4 space-y-4">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border
              ${job.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : job.status === "failed"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : job.status === "processing"
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                }`}
            >
              {job.status}
            </span>
          </div>
          <span className="font-mono text-sm font-bold text-text-primary">
            {job.progress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="h-2.5 w-full bg-surface-secondary rounded-full overflow-hidden border border-border">
            <div
              className={`h-full bg-gradient-to-r ${progressBarGradient} rounded-full transition-all duration-700 ease-out`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        {/* Pipeline Stage Indicators */}
        <div className="space-y-1.5 pt-1">
          {[
            { label: "Extracting audio", matcher: /audio/i },
            { label: "Transcribing speech", matcher: /transcrib|whisper|speech/i },
            { label: "Sampling video frames", matcher: /frame|sample|extracting frame/i },
            { label: "Recognizing on-screen text", matcher: /ocr|text|paddle/i },
            { label: "Saving results", matcher: /saving|index|finaliz/i },
          ].map((stageItem, sIdx) => {
            const stageLower = (job.stage || "").toLowerCase();
            const isCompletedJob = job.status === "completed";
            const isFailedJob = job.status === "failed";
            
            // Determine stage status
            let isCurrentStage = false;
            let isPastStage = false;

            if (isCompletedJob) {
              isPastStage = true;
            } else if (job.status === "processing") {
              if (stageItem.matcher.test(stageLower)) {
                isCurrentStage = true;
              } else if (job.progress >= (sIdx + 1) * 20) {
                isPastStage = true;
              }
            }

            return (
              <div
                key={stageItem.label}
                className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isCurrentStage
                    ? "bg-primary/10 border-primary/30 text-primary font-medium"
                    : isPastStage
                      ? "bg-emerald-500/5 border-emerald-500/15 text-text-primary"
                      : "bg-surface-secondary/30 border-border/40 text-text-muted"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isPastStage ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : isCurrentStage ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                  ) : isFailedJob && stageItem.matcher.test(stageLower) ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0 flex items-center justify-center text-[8px] font-mono">
                      {sIdx + 1}
                    </div>
                  )}
                  <span>{stageItem.label}</span>
                </div>
                <span className="text-[10px] font-mono text-text-muted">
                  {isPastStage ? "Done" : isCurrentStage ? "In Progress" : isFailedJob && stageItem.matcher.test(stageLower) ? "Failed" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-2">
          {job.started_at && (
            <div className="bg-surface-secondary/60 rounded-xl px-3 py-2 border border-border/50">
              <span className="text-[10px] text-text-muted block">Started</span>
              <span className="text-[11px] text-text-primary font-mono">
                {new Date(job.started_at).toLocaleTimeString()}
              </span>
            </div>
          )}
          {job.completed_at && (
            <div className="bg-surface-secondary/60 rounded-xl px-3 py-2 border border-border/50">
              <span className="text-[10px] text-text-muted block">Completed</span>
              <span className="text-[11px] text-text-primary font-mono">
                {new Date(job.completed_at).toLocaleTimeString()}
              </span>
            </div>
          )}
          {job.started_at && job.completed_at && (
            <div className="bg-surface-secondary/60 rounded-xl px-3 py-2 border border-border/50 col-span-2">
              <span className="text-[10px] text-text-muted block flex items-center gap-1">
                <Timer className="w-3 h-3" /> Duration
              </span>
              <span className="text-[11px] text-text-primary font-mono">
                {(
                  (new Date(job.completed_at).getTime() -
                    new Date(job.started_at).getTime()) /
                  1000
                ).toFixed(1)}
                s
              </span>
            </div>
          )}
        </div>

        {/* Results Summary */}
        {job.results_summary && job.status === "completed" && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider block mb-2">
              Results Summary
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {job.results_summary.transcript_count !== undefined && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Transcripts:</span>
                  <span className="font-semibold text-text-primary">
                    {job.results_summary.transcript_count}
                  </span>
                </div>
              )}
              {job.results_summary.ocr_count !== undefined && (
                <div className="flex justify-between">
                  <span className="text-text-muted">OCR Texts:</span>
                  <span className="font-semibold text-text-primary">
                    {job.results_summary.ocr_count}
                  </span>
                </div>
              )}
              {job.results_summary.total_speech_seconds !== undefined && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Speech:</span>
                  <span className="font-semibold text-text-primary">
                    {job.results_summary.total_speech_seconds.toFixed(1)}s
                  </span>
                </div>
              )}
              {job.results_summary.languages_detected && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Language:</span>
                  <span className="font-semibold text-text-primary uppercase">
                    {job.results_summary.languages_detected.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error State */}
        {job.status === "failed" && (
          <div className="space-y-3">
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider block mb-1">
                Error Details
              </span>
              <p className="text-xs text-red-400">
                {job.error_message || "Processing failed with an unknown error."}
              </p>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                disabled={retrying}
                className="w-full px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {retrying ? "Retrying..." : "Retry Processing"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
