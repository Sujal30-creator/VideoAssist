'use client';

import React, { useState } from 'react';
import { User, ActivityLog } from '@/types/auth';
import {
  X,
  Building2,
  Calendar,
  ShieldCheck,
  Clock,
  History,
  CheckCircle2,
  PlayCircle,
  Search,
  LogIn,
  // Filter,
  // Check,
  // Tag,
  // ArrowUpRight,
} from 'lucide-react';

interface UserProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ user, isOpen, onClose }: UserProfileModalProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'LOGIN' | 'QUERY_QA' | 'UPLOAD_VIDEO' | 'INSPECT_EVENT'>('ALL');

  if (!isOpen) return null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Active Operator';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatExactDateTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionBadge = (action: ActivityLog['action']) => {
    switch (action) {
      case 'LOGIN':
        return {
          icon: <LogIn className="w-3.5 h-3.5 text-blue-500" />,
          label: 'Auth Session',
          color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        };
      case 'UPLOAD_VIDEO':
        return {
          icon: <PlayCircle className="w-3.5 h-3.5 text-emerald-500" />,
          label: 'Video Ingest',
          color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        };
      case 'QUERY_QA':
        return {
          icon: <Search className="w-3.5 h-3.5 text-primary" />,
          label: 'AI Grounded QA',
          color: 'bg-primary-soft text-primary border-primary/20',
        };
      case 'INSPECT_EVENT':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />,
          label: 'Event Inspection',
          color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        };
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5 text-text-muted" />,
          label: 'System Log',
          color: 'bg-surface-secondary text-text-muted border-border',
        };
    }
  };

  const filteredHistory = (user.activityHistory || []).filter((act) => {
    if (filterType === 'ALL') return true;
    return act.action === filterType;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-surface-secondary px-6 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-primary-soft text-primary font-bold text-lg flex items-center justify-center border border-primary/20 shadow-xs">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary leading-tight">{user.name}</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary">
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-text-muted">{user.email}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Details & Metadata */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">

          {/* Quick Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-surface-secondary/60 border border-border">
              <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1.5 mb-1">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Workspace Organization
              </span>
              <p className="text-xs font-bold text-text-primary truncate">
                {user.organization || 'Independent Contractor'}
              </p>
              <span className="text-[10px] text-text-muted capitalize">
                {user.workspaceType === 'COMPANY' ? 'Team Workspace' : 'Personal Workspace'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-secondary/60 border border-border">
              <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                Member Since
              </span>
              <p className="text-xs font-bold text-text-primary">
                {formatDate(user.createdAt)}
              </p>
              <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3" /> Verified Operator Account
              </span>
            </div>
          </div>

          {/* Detailed Activity & Audit History */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-primary">
                <History className="w-4 h-4 text-primary" />
                <span>Operator Audit & Investigation Trail</span>
              </div>
              <span className="text-[11px] text-text-muted font-mono">
                {filteredHistory.length} of {user.activityHistory?.length || 0} events
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-[11px]">
              {(['ALL', 'LOGIN', 'QUERY_QA', 'UPLOAD_VIDEO', 'INSPECT_EVENT'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer font-medium whitespace-nowrap ${filterType === type
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-surface-secondary border-border text-text-secondary hover:text-text-primary hover:bg-surface'
                    }`}
                >
                  {type === 'ALL' && 'All Activity'}
                  {type === 'LOGIN' && 'Logins'}
                  {type === 'QUERY_QA' && 'AI Queries'}
                  {type === 'UPLOAD_VIDEO' && 'Videos'}
                  {type === 'INSPECT_EVENT' && 'Inspections'}
                </button>
              ))}
            </div>

            {/* Detailed Timeline List */}
            <div className="space-y-2 border border-border rounded-xl p-3 bg-surface-secondary/30">
              {filteredHistory.length === 0 && (
                <div className="text-center py-6 text-text-muted text-xs">
                  No activity found matching this filter.
                </div>
              )}

              {filteredHistory.map((act) => {
                const badge = getActionBadge(act.action);
                return (
                  <div
                    key={act.id}
                    className="p-3 rounded-xl bg-surface border border-border/80 hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-surface-secondary mt-0.5 group-hover:scale-105 transition-transform">
                        {badge.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="font-semibold text-text-primary leading-snug">
                          {act.description}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right text-[11px] text-text-muted font-mono flex items-center sm:flex-col justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                      <span>{formatExactDateTime(act.timestamp)}</span>
                      <span className="text-[10px] text-text-muted/80">Event: #{act.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Security Badge */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Isolated PostgreSQL Schema & RLS Guarded
            </span>
            <span className="font-mono text-[11px]">Tenant UID: {user.id}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
