"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/dashboard/Header";
import VideoPlayer from "@/components/video/VideoPlayer";
import ProcessingStatusPanel from "@/components/processing/ProcessingStatusPanel";
import TranscriptViewer from "@/components/processing/TranscriptViewer";
import OcrDetectionsViewer from "@/components/processing/OcrDetectionsViewer";
import EventTimeline from "@/components/timeline/EventTimeline";
import SearchPanel from "@/components/query/SearchPanel";
import { VideoUploadArea } from "@/components/dashboard/VideoUploadArea";
import {
  Network,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  ScanText,
  Layers,
  Upload,
  Video as VideoIcon,
  Film,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  getUserVideosAction,
  getSignedVideoUrlAction,
} from "@/app/actions/videos";
import {
  getVideoResultsAction,
  retryProcessingAction,
} from "@/app/actions/processing";
import { useProcessingStatus } from "@/hooks/useProcessingStatus";
import {
  VideoWithJob,
  TranscriptRecord,
  OcrDetectionRecord,
  ProcessingJobRecord,
} from "@/types/database";
import { mockVideo, mockEvents, mockSegments } from "@/data/mockData";

type ActiveTab = "transcripts" | "ocr" | "timeline";

export default function VideoAssistDashboard() {
  const [showArch, setShowArch] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("transcripts");

  // User's videos
  const [videos, setVideos] = useState<VideoWithJob[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoWithJob | null>(null);
  const [signedPlaybackUrl, setSignedPlaybackUrl] = useState<string | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(true);

  // Playback state
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Results state
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [ocrDetections, setOcrDetections] = useState<OcrDetectionRecord[]>([]);
  const [latestJob, setLatestJob] = useState<ProcessingJobRecord | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Load user videos
  const loadVideos = useCallback(async (selectId?: string) => {
    setLoadingVideos(true);
    try {
      const vids = await getUserVideosAction();
      setVideos(vids);
      if (vids.length > 0) {
        const toSelect = selectId
          ? vids.find((v) => v.id === selectId) || vids[0]
          : vids[0];
        setSelectedVideo(toSelect);
      } else {
        setSelectedVideo(null);
      }
    } catch (e) {
      console.error("Failed to load videos:", e);
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadVideos();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadVideos]);

  // Load results and signed URL when selected video changes
  const fetchResults = useCallback(async (vid: VideoWithJob) => {
    setLoadingResults(true);
    setResultsError(null);
    try {
      // 1. Fetch signed playback URL
      if (vid.storage_path) {
        const url = await getSignedVideoUrlAction(vid.storage_path);
        setSignedPlaybackUrl(url);
      } else {
        setSignedPlaybackUrl(null);
      }

      // 2. Fetch real results (transcripts + OCR + latest job)
      const results = await getVideoResultsAction(vid.id);
      setTranscripts(results.transcripts || []);
      setOcrDetections(results.ocr_detections || []);
      setLatestJob(results.job || (vid.jobs && vid.jobs[0]) || null);
    } catch (e) {
      setResultsError(
        e instanceof Error ? e.message : "Failed to load video results."
      );
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedVideo) {
        fetchResults(selectedVideo);
      } else {
        setTranscripts([]);
        setOcrDetections([]);
        setLatestJob(null);
        setSignedPlaybackUrl(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedVideo, fetchResults]);

  // Live polling for in-flight jobs
  const isJobActive =
    latestJob?.status === "queued" || latestJob?.status === "processing";

  const { job: polledJob, isPolling } = useProcessingStatus({
    jobId: latestJob?.id,
    enabled: Boolean(isJobActive && latestJob?.id),
    onComplete: () => {
      if (selectedVideo) {
        fetchResults(selectedVideo);
      }
    },
    onFailed: () => {
      if (selectedVideo) {
        fetchResults(selectedVideo);
      }
    },
  });

  // Effective job displayed
  const currentJob = polledJob || latestJob;

  // Handle retry
  const handleRetry = async () => {
    if (!selectedVideo) return;
    setRetrying(true);
    try {
      const res = await retryProcessingAction(selectedVideo.id);
      if (res.success && selectedVideo) {
        await fetchResults(selectedVideo);
      }
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetrying(false);
    }
  };

  // Seeking interaction
  const handleSeekSeconds = (timeSeconds: number) => {
    setCurrentTimeMs(Math.floor(timeSeconds * 1000));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEventClick = (startTimeMs: number) => {
    setCurrentTimeMs(startTimeMs);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Upload handler
  const handleUploadSuccess = async (newVideoId: string) => {
    setShowUploadModal(false);
    await loadVideos(newVideoId);
  };

  // Player video object wrapper
  const playerVideo = selectedVideo
    ? {
        id: selectedVideo.id,
        title: selectedVideo.title,
        durationMs: (selectedVideo.duration_seconds || 180) * 1000,
        url: signedPlaybackUrl || "",
        signedUrl: signedPlaybackUrl || undefined,
        width: selectedVideo.width,
        height: selectedVideo.height,
        fileSizeBytes: selectedVideo.file_size_bytes,
      }
    : mockVideo;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary-soft transition-theme">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Top Controls: Video Selector + Upload Button + Arch Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase font-bold tracking-wider block">
                Active Video
              </label>
              {loadingVideos ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading videos...
                </div>
              ) : videos.length > 0 ? (
                <select
                  value={selectedVideo?.id || ""}
                  onChange={(e) => {
                    const found = videos.find((v) => v.id === e.target.value);
                    if (found) setSelectedVideo(found);
                  }}
                  className="bg-surface-secondary text-text-primary text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} ({v.status})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-text-muted">No videos uploaded yet</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => selectedVideo && fetchResults(selectedVideo)}
              className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-elevated border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Refresh video results"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Video
            </button>

            <button
              onClick={() => setShowArch(!showArch)}
              className="px-3.5 py-2 rounded-xl bg-surface-secondary hover:bg-surface-elevated border border-border text-text-secondary hover:text-text-primary transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Network className="w-3.5 h-3.5" />
              Architecture
              {showArch ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Upload Modal Drawer */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <VideoIcon className="w-4 h-4 text-primary" />
                  Upload Field Video for Multimodal Analysis
                </h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-text-muted hover:text-text-primary text-xs px-2 py-1 rounded-md"
                >
                  ✕
                </button>
              </div>

              <VideoUploadArea onUploadSuccess={handleUploadSuccess} />
            </div>
          </div>
        )}

        {/* System Architecture Section */}
        {showArch && (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl overflow-x-auto transition-theme animate-in slide-in-from-top-4 fade-in duration-300">
            <h3 className="text-center font-bold text-text-primary uppercase tracking-widest text-xs mb-6">
              VideoAssist Phase 2 Multimodal Pipeline
            </h3>
            <div className="flex items-center justify-between min-w-[760px] text-xs font-mono text-center">
              <div className="flex flex-col items-center gap-1 w-28">
                <div className="bg-surface-secondary border border-border p-2 rounded-xl w-full">
                  User Video
                </div>
                <div className="text-text-muted my-0.5">↓</div>
                <div className="bg-surface-secondary border border-border p-1.5 rounded-lg w-full text-[10px]">
                  Audio / Frames
                </div>
              </div>
              <div className="text-text-muted">→</div>

              <div className="flex flex-col gap-2">
                <div className="bg-surface-elevated border border-[var(--color-chart-speech)] text-[var(--color-chart-speech)] p-2 rounded-xl w-36">
                  Whisper ASR
                </div>
                <div className="bg-surface-elevated border border-[var(--color-chart-ocr)] text-[var(--color-chart-ocr)] p-2 rounded-xl w-36">
                  PaddleOCR Text
                </div>
              </div>
              <div className="text-text-muted">→</div>

              <div className="flex flex-col items-center gap-1 w-36">
                <div className="bg-surface-elevated border border-success/50 text-success p-2 rounded-xl w-full font-bold">
                  PostgreSQL / RLS
                </div>
                <div className="text-text-muted my-0.5">↓</div>
                <div className="bg-surface-secondary border border-border p-1.5 rounded-lg w-full text-[10px]">
                  Transcripts & OCR
                </div>
              </div>
              <div className="text-text-muted">→</div>

              <div className="flex flex-col items-center gap-2 w-36">
                <div className="bg-primary-soft border border-primary/30 text-primary p-2 rounded-xl w-full">
                  Evidence Seek
                </div>
                <div className="bg-primary text-primary-foreground p-2 rounded-xl w-full font-bold shadow-md">
                  Grounded QA
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Player + Processing Pipeline Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
          {/* Left: Video Player */}
          <div className="lg:col-span-2">
            <VideoPlayer
              video={playerVideo}
              currentTimeMs={currentTimeMs}
              onTimeUpdate={setCurrentTimeMs}
            />
          </div>

          {/* Right: Processing Pipeline Status */}
          <div className="lg:col-span-1">
            <ProcessingStatusPanel
              job={currentJob}
              isPolling={isPolling}
              onRetry={handleRetry}
              retrying={retrying}
            />
          </div>
        </div>

        {/* Evidence Viewers: Tabs for Speech Transcripts, OCR Detections, Timeline & Search */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <button
              onClick={() => setActiveTab("transcripts")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                activeTab === "transcripts"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-surface text-text-muted hover:text-text-primary border-border"
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              Speech Transcripts ({transcripts.length})
            </button>

            <button
              onClick={() => setActiveTab("ocr")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                activeTab === "ocr"
                  ? "bg-chart-ocr text-white border-chart-ocr shadow-sm"
                  : "bg-surface text-text-muted hover:text-text-primary border-border"
              }`}
            >
              <ScanText className="w-3.5 h-3.5" />
              OCR Detections ({ocrDetections.length})
            </button>

            <button
              onClick={() => setActiveTab("timeline")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                activeTab === "timeline"
                  ? "bg-surface-elevated text-text-primary border-primary/40 shadow-sm"
                  : "bg-surface text-text-muted hover:text-text-primary border-border"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Timeline & QA
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "transcripts" && (
            <div className="animate-in fade-in duration-300">
              <TranscriptViewer
                transcripts={transcripts}
                onSeekToTime={handleSeekSeconds}
                loading={loadingResults}
                jobStatus={currentJob?.status}
                error={resultsError}
              />
            </div>
          )}

          {activeTab === "ocr" && (
            <div className="animate-in fade-in duration-300">
              <OcrDetectionsViewer
                detections={ocrDetections}
                onSeekToTime={handleSeekSeconds}
                loading={loadingResults}
                jobStatus={currentJob?.status}
                error={resultsError}
              />
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <EventTimeline
                events={mockEvents}
                segments={mockSegments}
                onEventClick={handleEventClick}
                videoDurationMs={playerVideo.durationMs}
              />
              <SearchPanel onSeek={handleEventClick} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
