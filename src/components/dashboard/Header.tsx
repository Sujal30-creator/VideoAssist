<<<<<<< HEAD
import React from 'react';
import { Activity } from 'lucide-react';
=======
'use client';

import React, { useState } from 'react';
import { Activity, LogOut, ShieldCheck } from 'lucide-react';
>>>>>>> feature/new-Workflow
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Header() {
  return (
<<<<<<< HEAD
    <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 transition-theme">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 text-primary">
          <Activity className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
            VideoAssist
            <span className="text-text-muted font-normal text-sm hidden md:inline-block ml-2 border-l border-border pl-2">
              Multimodal Temporal Event Retrieval & Evidence-Grounded QA
            </span>
          </h1>
=======
    <>
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 transition-theme">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 text-primary">
            <Activity className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              VideoAssist
              <span className="text-text-muted font-normal text-sm hidden md:inline-block ml-2 border-l border-border pl-2">
                Multimodal Temporal Event Retrieval & Evidence Grounding
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                {/* Authenticated user indicator badge */}
                <button
                  onClick={() => setShowProfileModal(true)}
                  title="View User Profile & Session Information"
                  className="flex items-center gap-2.5 bg-surface hover:bg-surface-secondary px-3 py-1.5 rounded-full border border-border text-xs transition-all cursor-pointer group shadow-sm"
                >
                  <div className="w-6 h-6 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-text-primary leading-tight group-hover:text-primary transition-colors text-[11px]">
                      {user.email}
                    </span>
                    <span className="text-[9px] text-text-muted capitalize flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />
                      {user.role} • {user.organization || 'Field Ops'}
                    </span>
                  </div>
                </button>

                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-2 text-text-muted hover:text-error hover:bg-surface rounded-lg transition-colors border border-transparent hover:border-border cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span className="text-primary font-medium text-xs px-2.5 py-1 rounded-full bg-primary-soft border border-primary/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                Demo / Unauthenticated
              </span>
            )}

            <ThemeToggle />
          </div>
>>>>>>> feature/new-Workflow
        </div>
        <div className="flex items-center gap-4">
          <span className="text-primary font-medium text-xs px-2.5 py-1 rounded-full bg-primary-soft border border-primary/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Demo Mode
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
