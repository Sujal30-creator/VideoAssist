"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/dashboard/Header";
import VideoPlayer from "@/components/video/VideoPlayer";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import EventTimeline from "@/components/timeline/EventTimeline";
import SearchPanel from "@/components/query/SearchPanel";
import UploadArea from "@/components/dashboard/UploadArea";
import ProcessingStatusPanel from "@/components/processing/ProcessingStatusPanel";
import TranscriptViewer from "@/components/processing/TranscriptViewer";
import OcrDetectionsViewer from "@/components/processing/OcrDetectionsViewer";
import { useAuth } from "@/components/AuthProvider";
import { useProcessingStatus } from "@/hooks/useProcessingStatus";
import { getUserVideosAction, getSignedVideoUrlAction } from "@/app/actions/videos";
import {
  getVideoTranscriptsAction,
  getVideoOcrDetectionsAction,
  retryProcessingAction,
} from "@/app/actions/processing";
import { VideoWithJob, TranscriptRecord, OcrDetectionRecord } from "@/types/database";
import { mockVideo, mockStages, mockEvents, mockSegments } from "@/data/mockData";
import {
  ShieldCheck,
  Plus,
  X,
  Database,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Film,
  Image as ImageIcon,
  HardDrive,
  MessageSquareText,
  ScanText,
} from "lucide-react";

type ResultsTab = "status" | "transcript" | "ocr";

export default function WorkspaceDashboard() {
  const { user, loading: authLoading } = useAuth();

  // Tab: 'supabase' (Real Supabase Storage & DB records) vs 'demo' (Pre-loaded field-service troubleshooting simulation)
  const [activeTab, setActiveTab] = useState<"supabase" | "demo">("supabase");

  // Supabase real state
  const [supabaseVideos, setSupabaseVideos] = useState<VideoWithJob[]>([]);
  const [selectedSupabaseVideo, setSelectedSupabaseVideo] = useState<VideoWithJob | null>(null);
  const [signedPlaybackUrl, setSignedPlaybackUrl] = useState<string | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Phase 2: Results state
  const [resultsTab, setResultsTab] = useState<ResultsTab>("status");
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [ocrDetections, setOcrDetections] = useState<OcrDetectionRecord[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Demo state
  const [demoAppState] = useState<"idle" | "processing" | "ready">("ready");
  const [demoActiveStage] = useState(mockStages.length - 1);
  const [demoCurrentTimeMs, setDemoCurrentTimeMs] = useState(0);

  // Get the latest job for the selected video
  const latestJob = selectedSupabaseVideo?.jobs?.[0];

  // Auto-polling hook for active processing jobs
  const {
    job: polledJob,
    isPolling,
  } = useProcessingStatus({
    jobId: latestJob?.id,
    intervalMs: 4000,
    enabled:
      !!latestJob &&
      latestJob.status !== "completed" &&
      latestJob.status !== "failed",
    onComplete: () => {
      // Refresh video list and results when processing completes
      loadSupabaseVideos(selectedSupabaseVideo?.id);
      if (selectedSupabaseVideo) {
        loadResultsForVideo(selectedSupabaseVideo.id);
      }
    },
  });

  // Use polled job data if available, otherwise use the static job from the video record
  const displayJob = polledJob || latestJob || null;

  // Fetch real videos & jobs from Supabase
  const loadSupabaseVideos = useCallback(async (selectId?: string) => {
    if (!user) return;
    setLoadingVideos(true);
    try {
      const videos = await getUserVideosAction();
      setSupabaseVideos(videos);

      if (videos.length > 0) {
        const target = selectId ? videos.find((v) => v.id === selectId) || videos[0] : videos[0];
        setSelectedSupabaseVideo(target);

        // Fetch signed playback URL for selected video
        if (target.storage_path) {
          const signedUrl = await getSignedVideoUrlAction(target.storage_path);
          setSignedPlaybackUrl(signedUrl);
        }
      } else {
        setSelectedSupabaseVideo(null);
        setSignedPlaybackUrl(null);
      }
    } catch (e) {
      console.error("Failed to load Supabase videos:", e);
    } finally {
      setLoadingVideos(false);
    }
  }, [user]);

  // Load transcript + OCR results for a video
  const loadResultsForVideo = useCallback(async (videoId: string) => {
    setLoadingResults(true);
    try {
      const [transcriptData, ocrData] = await Promise.all([
        getVideoTranscriptsAction(videoId),
        getVideoOcrDetectionsAction(videoId),
      ]);
      setTranscripts(transcriptData);
      setOcrDetections(ocrData);
    } catch (e) {
      console.error("Failed to load results:", e);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => loadSupabaseVideos(), 0);
      return () => clearTimeout(timer);
    }
  }, [user, loadSupabaseVideos]);

  // Load results when video selection changes
  useEffect(() => {
    if (selectedSupabaseVideo) {
      loadResultsForVideo(selectedSupabaseVideo.id);
    } else {
      setTranscripts([]);
      setOcrDetections([]);
    }
  }, [selectedSupabaseVideo, loadResultsForVideo]);

  // Handle switching video selection
  const handleSelectVideo = async (video: VideoWithJob) => {
    setSelectedSupabaseVideo(video);
    setSignedPlaybackUrl(null);
    setResultsTab("status");
    if (video.storage_path) {
      const signedUrl = await getSignedVideoUrlAction(video.storage_path);
      setSignedPlaybackUrl(signedUrl);
    }
  };

  // Retry processing handler
  const handleRetryProcessing = async () => {
    if (!selectedSupabaseVideo) return;
    setRetrying(true);
    try {
      const result = await retryProcessingAction(selectedSupabaseVideo.id);
      if (result.success) {
        // Refresh the video list to get the new job
        await loadSupabaseVideos(selectedSupabaseVideo.id);
        setResultsTab("status");
      }
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetrying(false);
    }
  };

  // Seek video to a specific timestamp (for clickable timestamps in transcript/OCR)
  const handleSeekToTime = (timeSeconds: number) => {
    // If there's a signed URL, we assume the video player is loaded
    // The VideoPlayer component handles seeking via currentTimeMs prop
    setDemoCurrentTimeMs(timeSeconds * 1000);
    window.scrollTo({ top: 150, behavior: "smooth" });
  };

  const handleDemoEventClick = (startTimeMs: number) => {
    setDemoCurrentTimeMs(startTimeMs);
    window.scrollTo({ top: 150, behavior: "smooth" });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-xs text-text-muted font-mono">Authenticating Supabase session...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary-soft transition-theme">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Workspace Identity Banner */}
        <div className="bg-surface border border-border rounded-2xl p-6 transition-theme shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary capitalize">
                {user?.role || "Technician"} Workspace
              </span>
              <span className="text-xs text-text-muted flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Supabase Auth: <strong className="text-text-primary">{user?.email}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Field-Service Video Intelligence & Evidence QA
            </h1>
            <p className="text-xs text-text-secondary">
              Upload recordings to private Supabase Storage, track Python processing jobs, and query grounded temporal evidence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Upload Service Video
            </button>
          </div>
        </div>

        {/* Upload Modal Drawer */}
        {showUploadModal && (
          <div className="p-6 bg-surface border border-primary/40 rounded-2xl animate-in slide-in-from-top-3 duration-300 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                Upload to Private Storage (field-service-videos)
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <UploadArea
              onUploadSuccess={(video) => {
                setShowUploadModal(false);
                loadSupabaseVideos(video.id);
              }}
              onCancel={() => setShowUploadModal(false)}
            />
          </div>
        )}

        {/* View Switcher: Supabase Real Records vs Interactive Demo */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("supabase")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === "supabase"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface hover:bg-surface-secondary text-text-muted border border-border"
                }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Supabase Records ({supabaseVideos.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("demo")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === "demo"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface hover:bg-surface-secondary text-text-muted border border-border"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Interactive Demo (Site 42 Router)</span>
            </button>
          </div>

          {activeTab === "supabase" && (
            <button
              onClick={() => loadSupabaseVideos(selectedSupabaseVideo?.id)}
              disabled={loadingVideos}
              title="Refresh database records"
              className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-all border border-border cursor-pointer text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingVideos ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: SUPABASE REAL RECORDS & PROCESSING JOBS                            */}
        {/* ========================================================================= */}
        {activeTab === "supabase" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Video Records Grid */}
            {supabaseVideos.length === 0 && !loadingVideos ? (
              <div className="py-16 text-center border-2 border-dashed border-border rounded-2xl bg-surface/40 p-6">
                <Film className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <h3 className="text-base font-semibold text-text-primary mb-1">
                  No Field Videos Uploaded Yet
                </h3>
                <p className="text-xs text-text-secondary max-w-md mx-auto mb-5">
                  Upload an MP4, MOV, or WebM recording (up to 100 MB). It will be saved into your private Supabase bucket and queued for Python worker analysis.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    Upload First Video
                  </button>
                  <button
                    onClick={() => setActiveTab("demo")}
                    className="px-5 py-2.5 bg-surface-elevated hover:bg-surface border border-border text-text-primary text-xs font-medium rounded-xl transition-all cursor-pointer"
                  >
                    Explore Demo Instead
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {supabaseVideos.map((vid) => {
                    const isSelected = selectedSupabaseVideo?.id === vid.id;
                    const job = vid.jobs?.[0];
                    return (
                      <div
                        key={vid.id}
                        onClick={() => handleSelectVideo(vid)}
                        className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${isSelected
                          ? "border-primary bg-primary-soft/30 shadow-md ring-1 ring-primary/40"
                          : "border-border bg-surface hover:border-border/80 hover:bg-surface-secondary"
                          }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${vid.status === "ready"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : vid.status === "processing"
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : vid.status === "failed"
                                  ? "bg-red-500/10 text-red-500 border border-red-500/20"
                                  : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                              }`}
                          >
                            {vid.status}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {formatBytes(vid.file_size_bytes)}
                          </span>
                        </div>

                        <h4 className="font-semibold text-text-primary text-sm truncate mb-1">
                          {vid.title}
                        </h4>

                        <div className="flex items-center justify-between text-[11px] text-text-muted mt-2 pt-2 border-t border-border/60">
                          <span className="truncate max-w-[60%]">{vid.original_filename}</span>
                          <span className="font-mono text-[10px]">
                            {job?.progress !== undefined ? `${job.progress}%` : "Queued"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Supabase Video Details & Results */}
                {selectedSupabaseVideo && (
                  <div className="space-y-6">
                    {/* Video Player + Processing Status — Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left 2 Cols: Player */}
                      <div className="lg:col-span-2">
                        <VideoPlayer
                          video={{
                            id: selectedSupabaseVideo.id,
                            title: selectedSupabaseVideo.title,
                            url: signedPlaybackUrl || selectedSupabaseVideo.storage_path,
                            signedUrl: signedPlaybackUrl || undefined,
                            durationMs: (selectedSupabaseVideo.duration_seconds || 180) * 1000,
                            width: selectedSupabaseVideo.width,
                            height: selectedSupabaseVideo.height,
                            fileSizeBytes: selectedSupabaseVideo.file_size_bytes,
                          }}
                          currentTimeMs={0}
                        />
                      </div>

                      {/* Right Col: Processing Status Panel */}
                      <div className="lg:col-span-1 space-y-4">
                        <ProcessingStatusPanel
                          job={displayJob}
                          isPolling={isPolling}
                          onRetry={handleRetryProcessing}
                          retrying={retrying}
                        />

                        {/* Extracted Keyframes from video_frames table */}
                        <div className="bg-surface rounded-2xl p-4 border border-border">
                          <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-primary" />
                            Extracted Artifacts (video-artifacts)
                          </h4>
                          {selectedSupabaseVideo.frames && selectedSupabaseVideo.frames.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                              {selectedSupabaseVideo.frames.map((frame) => (
                                <div
                                  key={frame.id}
                                  className="aspect-video bg-black/40 rounded border border-border overflow-hidden text-[9px] text-center flex items-center justify-center font-mono text-text-muted"
                                >
                                  {frame.timestamp_seconds}s
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-text-muted italic">
                              Keyframes will appear once Python worker completes extraction into bucket &quot;video-artifacts&quot;.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Phase 2: Results Tabs — Transcript & OCR */}
                    {(displayJob?.status === "completed" || transcripts.length > 0 || ocrDetections.length > 0) && (
                      <div className="space-y-4">
                        {/* Results Tab Switcher */}
                        <div className="flex items-center gap-2 border-b border-border pb-3">
                          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-2">
                            Results:
                          </span>
                          <button
                            onClick={() => setResultsTab("status")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                              resultsTab === "status"
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-surface text-text-muted border-border hover:text-text-primary hover:bg-surface-secondary"
                            }`}
                          >
                            <Database className="w-3 h-3" />
                            Status
                          </button>
                          <button
                            onClick={() => setResultsTab("transcript")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                              resultsTab === "transcript"
                                ? "bg-chart-speech text-white border-chart-speech shadow-sm"
                                : "bg-surface text-text-muted border-border hover:text-text-primary hover:bg-surface-secondary"
                            }`}
                          >
                            <MessageSquareText className="w-3 h-3" />
                            Transcript ({transcripts.length})
                          </button>
                          <button
                            onClick={() => setResultsTab("ocr")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                              resultsTab === "ocr"
                                ? "bg-chart-ocr text-white border-chart-ocr shadow-sm"
                                : "bg-surface text-text-muted border-border hover:text-text-primary hover:bg-surface-secondary"
                            }`}
                          >
                            <ScanText className="w-3 h-3" />
                            OCR ({ocrDetections.length})
                          </button>

                          <div className="flex-1" />

                          <button
                            onClick={() => {
                              if (selectedSupabaseVideo) {
                                loadResultsForVideo(selectedSupabaseVideo.id);
                              }
                            }}
                            disabled={loadingResults}
                            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-secondary rounded-lg transition-all border border-border cursor-pointer"
                            title="Refresh results"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingResults ? "animate-spin" : ""}`} />
                          </button>
                        </div>

                        {/* Render active results tab */}
                        <div className="animate-in fade-in duration-200">
                          {resultsTab === "status" && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <ProcessingStatusPanel
                                job={displayJob}
                                isPolling={isPolling}
                                onRetry={handleRetryProcessing}
                                retrying={retrying}
                              />
                              <div className="bg-surface rounded-2xl p-5 border border-border">
                                <h4 className="text-xs font-bold text-text-primary mb-3 uppercase tracking-wider flex items-center gap-1.5">
                                  <Database className="w-3.5 h-3.5 text-primary" />
                                  Database Records
                                </h4>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="text-text-muted">Video ID</span>
                                    <span className="font-mono text-text-primary truncate max-w-[200px]">
                                      {selectedSupabaseVideo.id}
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="text-text-muted">Storage Path</span>
                                    <span className="font-mono text-primary truncate max-w-[200px]">
                                      {selectedSupabaseVideo.storage_path}
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="text-text-muted">Transcripts</span>
                                    <span className="font-semibold text-chart-speech">
                                      {transcripts.length} segments
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="text-text-muted">OCR Detections</span>
                                    <span className="font-semibold text-chart-ocr">
                                      {ocrDetections.length} texts
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2">
                                    <span className="text-text-muted">Keyframes</span>
                                    <span className="font-semibold text-text-primary">
                                      {selectedSupabaseVideo.frames?.length || 0} frames
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {resultsTab === "transcript" && (
                            <TranscriptViewer
                              transcripts={transcripts}
                              onSeekToTime={handleSeekToTime}
                              loading={loadingResults}
                            />
                          )}

                          {resultsTab === "ocr" && (
                            <OcrDetectionsViewer
                              detections={ocrDetections}
                              onSeekToTime={handleSeekToTime}
                              loading={loadingResults}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: INTERACTIVE DEMO (SITE 42 ROUTER WITH FULL EVIDENCE & QA)          */}
        {/* ========================================================================= */}
        {activeTab === "demo" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Player */}
              <div className="lg:col-span-2">
                <VideoPlayer
                  video={mockVideo}
                  currentTimeMs={demoCurrentTimeMs}
                  onTimeUpdate={(ms) => setDemoCurrentTimeMs(ms)}
                />
              </div>

              {/* Right Col: Analysis Panel */}
              <div className="lg:col-span-1">
                <AnalysisPanel
                  appState={demoAppState}
                  stages={mockStages}
                  activeStageIndex={demoActiveStage}
                  events={mockEvents}
                />
              </div>
            </div>

            {/* Timeline & QA Search */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
              <EventTimeline
                events={mockEvents}
                segments={mockSegments}
                onEventClick={handleDemoEventClick}
                videoDurationMs={mockVideo.durationMs}
              />
              <SearchPanel onSeek={handleDemoEventClick} />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
