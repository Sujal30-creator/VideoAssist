"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/dashboard/Header";
import VideoPlayer from "@/components/video/VideoPlayer";
import ProcessingStatusPanel from "@/components/processing/ProcessingStatusPanel";
import TranscriptViewer from "@/components/processing/TranscriptViewer";
import OcrDetectionsViewer from "@/components/processing/OcrDetectionsViewer";
// OLD (Phase 1 mock timeline):
// import EventTimeline from "@/components/timeline/EventTimeline";
// import SearchPanel from "@/components/query/SearchPanel";
import UploadArea from "@/components/dashboard/UploadArea";
import {
  Network,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  ScanText,
  Layers,
  Upload,
  Film,
  RefreshCw,
  ArrowLeft,
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
// OLD (Phase 1 mock data):
// import { mockEvents, mockSegments } from "@/data/mockData";

type ActiveTab = "transcripts" | "ocr" | "timeline";

export default function VideoAssistDashboard() {
  const [showArch, setShowArch] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("transcripts");

  // User's videos
  const [videos, setVideos] = useState<VideoWithJob[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoWithJob | null>(null);
  const [signedPlaybackUrl, setSignedPlaybackUrl] = useState<string | null>(null);

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
    try {
      const vids = await getUserVideosAction();
      setVideos(vids);
      if (selectId) {
        const found = vids.find((v) => v.id === selectId);
        if (found) setSelectedVideo(found);
      }
    } catch (e) {
      console.error("Failed to load videos:", e);
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

  const currentJob = polledJob || latestJob;

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

  const handleSeekSeconds = (timeSeconds: number) => {
    setCurrentTimeMs(Math.floor(timeSeconds * 1000));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // OLD (Phase 1 mock handler):
  // const handleEventClick = (startTimeMs: number) => {
  //   setCurrentTimeMs(startTimeMs);
  //   window.scrollTo({ top: 0, behavior: "smooth" });
  // };

  const handleUploadSuccess = async (newVideoId: string) => {
    await loadVideos(newVideoId);
  };

  const playerVideo = selectedVideo
    ? {
      id: selectedVideo.id,
      title: selectedVideo.title,
      // OLD:
      // durationMs: (selectedVideo.duration_seconds || 180) * 1000,
      // NEW: Real video duration in ms (defaults to 0 so VideoPlayer detects real HTML5 metadata)
      durationMs: selectedVideo.duration_seconds ? selectedVideo.duration_seconds * 1000 : 0,
      url: signedPlaybackUrl || "",
      signedUrl: signedPlaybackUrl || undefined,
      width: selectedVideo.width,
      height: selectedVideo.height,
      fileSizeBytes: selectedVideo.file_size_bytes,
    }
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary-soft transition-theme">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* System Architecture Section */}
        <div>
          <button
            onClick={() => setShowArch(!showArch)}
            className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-xs font-medium mx-auto bg-surface px-4 py-2 rounded-full border border-border shadow-sm cursor-pointer"
          >
            <Network className="w-3.5 h-3.5" />
            {showArch ? "Hide System Architecture" : "View System Architecture"}
            {showArch ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showArch && (
            <div className="mt-4 bg-surface border border-border rounded-2xl p-6 shadow-xl overflow-x-auto transition-theme animate-in slide-in-from-top-4 fade-in duration-300">
              <h3 className="text-center font-bold text-text-primary uppercase tracking-widest text-xs mb-6">
                VideoAssist Multimodal Pipeline Architecture
              </h3>
              <div className="flex items-center justify-between min-w-[760px] text-xs font-mono text-center">
                <div className="flex flex-col items-center gap-1 w-28">
                  <div className="bg-surface-secondary border border-border p-2 rounded-xl w-full">
                    Video Upload
                  </div>
                  <div className="text-text-muted my-0.5">↓</div>
                  <div className="bg-surface-secondary border border-border p-1.5 rounded-lg w-full text-[10px]">
                    Audio / Frames
                  </div>
                </div>
                <div className="text-text-muted">→</div>

                <div className="flex flex-col gap-2">
                  <div className="bg-surface-elevated border border-[var(--color-chart-speech)] text-[var(--color-chart-speech)] p-2 rounded-xl w-36">
                    Whisper Speech
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
                    Temporal Grounding
                  </div>
                  <div className="bg-primary text-primary-foreground p-2 rounded-xl w-full font-bold shadow-md">
                    Grounded QA
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* View 1: When no video is selected yet -> Show clean UploadArea */}
        {!selectedVideo && (
          <div className="animate-in fade-in duration-500">
            <UploadArea
              onUploadSuccess={handleUploadSuccess}
              existingVideos={videos}
              onSelectExistingVideo={(vid) => setSelectedVideo(vid)}
            />
          </div>
        )}

        {/* View 2: When video is selected -> Video Player + Pipeline Status + Viewers */}
        {selectedVideo && playerVideo && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Navigation Bar: Back to Upload / Switch Video */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-3">
                {/* <button
                  onClick={() => setSelectedVideo(null)}
                  className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-elevated border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                  title="Upload another video"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload New</span>
                </button> */}

                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary shrink-0" />
                  {videos.length > 1 ? (
                    <select
                      value={selectedVideo.id}
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
                    <span className="text-xs font-bold text-text-primary truncate max-w-xs sm:max-w-md">
                      {selectedVideo.title}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchResults(selectedVideo)}
                  className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-elevated border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-xs flex items-center gap-1"
                  title="Refresh results"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Refresh</span>
                </button>

                <button
                  onClick={() => setSelectedVideo(null)}
                  className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Video</span>
                </button>
              </div>
            </div>

            {/* Video Player + Processing Pipeline Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${activeTab === "transcripts"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-surface text-text-muted hover:text-text-primary border-border"
                    }`}
                >
                  <MessageSquareText className="w-3.5 h-3.5" />
                  Speech Transcripts ({transcripts.length})
                </button>

                <button
                  onClick={() => setActiveTab("ocr")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${activeTab === "ocr"
                    ? "bg-chart-ocr text-white border-chart-ocr shadow-sm"
                    : "bg-surface text-text-muted hover:text-text-primary border-border"
                    }`}
                >
                  <ScanText className="w-3.5 h-3.5" />
                  OCR Detections ({ocrDetections.length})
                </button>

                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${activeTab === "timeline"
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
                  {/* OLD:
                  <EventTimeline
                    events={mockEvents}
                    segments={mockSegments}
                    onEventClick={handleEventClick}
                    videoDurationMs={playerVideo.durationMs}
                  />
                  <SearchPanel onSeek={handleEventClick} />
                  */}

                  {/* NEW: Clean handling for real videos — distinguish processing/pending from Phase 3 indexed timeline */}
                  {currentJob?.status === "queued" || currentJob?.status === "processing" ? (
                    <div className="bg-surface rounded-2xl border border-border p-8 text-center">
                      <Layers className="w-10 h-10 text-primary mx-auto mb-3 opacity-60 animate-pulse" />
                      <h4 className="text-sm font-bold text-text-primary mb-1">
                        Temporal Event Segmentation Pending
                      </h4>
                      <p className="text-xs text-text-muted max-w-md mx-auto">
                        This video is currently processing in the pipeline. Temporal boundaries, event extraction,
                        and multimodal indexing will become active once transcription and OCR complete.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-surface rounded-2xl border border-border p-6 text-center">
                        <Layers className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                        <h4 className="text-sm font-bold text-text-primary mb-1">
                          Temporal Event Graph (Phase 3 Milestone)
                        </h4>
                        <p className="text-xs text-text-muted max-w-lg mx-auto mb-3">
                          Phase 2 delivers speech transcripts (Whisper) and OCR text detections (PaddleOCR).
                          Multimodal embeddings, CLIP visual grounding, and natural language semantic QA are scheduled for Phase 3.
                        </p>
                        <div className="inline-flex items-center gap-2 text-[11px] font-mono text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                          Check the &quot;Speech Transcripts&quot; and &quot;OCR Detections&quot; tabs above for Phase 2 outputs
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
