'use client';

import React, { useState } from 'react';
import { Activity, LogOut, User as UserIcon } from 'lucide-react';
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
                Multimodal Temporal Event Retrieval & Evidence-Grounded QA
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowProfileModal(true)}
                  title="View User Profile & Activity History"
                  className="flex items-center gap-2 bg-surface hover:bg-surface-secondary px-3 py-1.5 rounded-full border border-border text-xs transition-all cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-text-primary leading-tight group-hover:text-primary transition-colors">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-text-muted capitalize">
                      {user.organization || user.role}
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
                Demo Mode
              </span>
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
