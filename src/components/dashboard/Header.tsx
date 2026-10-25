import React from 'react';
import { Activity } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Header() {
  return (
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
