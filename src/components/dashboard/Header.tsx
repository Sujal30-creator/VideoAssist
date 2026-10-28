'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, LogOut, ShieldCheck, LogIn } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/components/AuthProvider';
import UserProfileModal from '@/components/dashboard/UserProfileModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  return (
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
                  className="p-2 text-text-muted hover:text-red-500 hover:bg-surface rounded-lg transition-colors border border-transparent hover:border-border cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-3 py-1.5 bg-surface-secondary hover:bg-surface border border-border text-text-primary rounded-lg text-xs font-medium transition-colors hidden sm:inline-block"
                >
                  Sign Up
                </Link>
              </div>
            )}

            <ThemeToggle />
          </div>
        </div>
      </header>

      {user && (
        <UserProfileModal
          user={user}
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </>
  );
}
