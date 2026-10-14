"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/dashboard/Header";
import VideoPlayer from "@/components/video/VideoPlayer";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import EventTimeline from "@/components/timeline/EventTimeline";
import SearchPanel from "@/components/query/SearchPanel";
import UploadArea from "@/components/dashboard/UploadArea";
import { useAuth } from "@/components/AuthProvider";
import {
  getUserProjectsAction,
  createProjectAction,
  updateProjectStatusAction,
} from "@/app/actions/projects";
import { UserProject } from "@/lib/tenant-db";
import {
  FolderKanban,
  PlayCircle,
  ShieldCheck,
  Calendar,
  Layers,
  Plus,
  X,
} from "lucide-react";

export default function WorkspaceDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [activeProject, setActiveProject] = useState<UserProject | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [activeStage, setActiveStage] = useState(-1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Load user-specific projects from database
  const loadProjects = async (selectNewest = false) => {
    if (!user) return;
    setLoadingProjects(true);
    try {
      const data = await getUserProjectsAction();
      setProjects(data);
      if (data.length > 0) {
        if (selectNewest || !activeProject) {
          setActiveProject(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  // Handle pipeline execution
  const handleStartAnalysis = async () => {
    if (!activeProject || !user) return;

    await updateProjectStatusAction(activeProject.id, "processing");
    setActiveProject((prev) => (prev ? { ...prev, status: "processing" } : null));
    setActiveStage(0);

    let stageIdx = 0;
    const interval = setInterval(async () => {
      stageIdx++;
      if (stageIdx >= (activeProject.stages?.length || 8)) {
        clearInterval(interval);
        await updateProjectStatusAction(activeProject.id, "ready");
        setActiveProject((prev) => (prev ? { ...prev, status: "ready" } : null));
        await loadProjects();
      } else {
        setActiveStage(stageIdx);
      }
    }, 1100);
  };

  // Handle new local video added
  const handleNewVideoUploaded = async (videoUrl?: string, fileName?: string) => {
    if (!user) return;
    const title = fileName ? `Field Run: ${fileName.replace(/\.[^/.]+$/, "")}` : "New Inspection Video";
    const newProj = await createProjectAction(title, fileName || "video.mp4", videoUrl);
    setShowUploadModal(false);
    await loadProjects(true);
    setActiveProject(newProj);
  };

  const handleEventClick = (startTimeMs: number) => {
    setCurrentTimeMs(startTimeMs);
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  if (authLoading || (loadingProjects && projects.length === 0)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-xs text-text-muted font-mono">Loading operator workspace...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary-soft transition-theme">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        
        {/* User Identity & Isolated Scope Header */}
        <div className="bg-surface border border-border rounded-2xl p-6 transition-theme shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary capitalize">
                {user?.role} Workspace
              </span>
              <span className="text-xs text-text-muted flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                PostgreSQL Isolated Schema for {user?.email}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Welcome back, {user?.name}
            </h1>
            <p className="text-xs text-text-secondary">
              Field-service operations, temporal event retrieval, and evidence grounding
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-surface-secondary px-3 py-1.5 rounded-xl border border-border text-xs text-text-muted">
              <Layers className="w-4 h-4 text-primary" />
              <span>Storage: Local Offline</span>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Upload Local Video
            </button>
          </div>
        </div>

        {/* Upload Modal Drawer */}
        {showUploadModal && (
          <div className="p-6 bg-surface border border-primary/40 rounded-2xl animate-in slide-in-from-top-3 duration-300 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                Add Offline Field-Service Video
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <UploadArea onAnalyze={handleNewVideoUploaded} />
          </div>
        )}

        {/* Assigned Projects / Work History Tabs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted">
              <FolderKanban className="w-4 h-4 text-primary" />
              <span>Assigned Field Records in PostgreSQL ({projects.length})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((proj) => {
              const isSelected = activeProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => setActiveProject(proj)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary-soft/30 shadow-md ring-1 ring-primary/30"
                      : "border-border bg-surface hover:border-border/80 hover:bg-surface-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        proj.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : proj.status === "processing"
                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          : "bg-surface-secondary text-text-muted border border-border"
                      }`}
                    >
                      {proj.status === "ready" && "Ready for QA"}
                      {proj.status === "processing" && "Processing..."}
                      {proj.status === "idle" && "Pending Analysis"}
                    </span>
                    <span className="text-[11px] text-text-muted flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(proj.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-text-primary mb-1 line-clamp-1">
                    {proj.title}
                  </h3>
                  <p className="text-xs text-text-muted line-clamp-1 mb-3">
                    Video: {proj.video.title}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-text-secondary pt-2 border-t border-border/50">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="w-3.5 h-3.5 text-primary" />
                      {Math.round(proj.video.durationMs / 1000)}s clip
                    </span>
                    <span>{proj.events?.length || 0} events indexed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Project Workspace View */}
        {activeProject && (
          <div className="space-y-6 pt-2">
            
            {/* If Project is Idle (needs analysis started) */}
            {activeProject.status === "idle" && (
              <div className="p-10 border-2 border-border rounded-2xl bg-surface text-center">
                <PlayCircle className="w-12 h-12 text-primary mx-auto mb-3" />
                <h3 className="text-lg font-bold text-text-primary mb-1">
                  Ready to Process &quot;{activeProject.title}&quot;
                </h3>
                <p className="text-xs text-text-muted max-w-md mx-auto mb-6">
                  Extract audio track, scan frames for error codes, and index into the user-isolated database.
                </p>
                <button
                  onClick={handleStartAnalysis}
                  className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  Start Event Analysis
                </button>
              </div>
            )}

            {/* If Processing or Ready */}
            {activeProject.status !== "idle" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
                <div className="lg:col-span-2">
                  <VideoPlayer video={activeProject.video} currentTimeMs={currentTimeMs} />
                </div>
                <div className="lg:col-span-1">
                  <AnalysisPanel
                    appState={activeProject.status}
                    stages={activeProject.stages}
                    activeStageIndex={activeStage}
                    events={activeProject.events}
                  />
                </div>
              </div>
            )}

            {/* Timeline and QA Search when Ready */}
            {activeProject.status === "ready" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <EventTimeline
                  events={activeProject.events}
                  segments={activeProject.segments}
                  onEventClick={handleEventClick}
                  videoDurationMs={activeProject.video.durationMs}
                />
                <SearchPanel onSeek={handleEventClick} />
              </div>
            )}

          </div>
        )}

      </main>
    </div>
  );
}
