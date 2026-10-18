import React from 'react';
import { Upload, FileVideo } from 'lucide-react';

interface UploadAreaProps {
  onAnalyze: () => void;
  fileSelected: boolean;
  setFileSelected: (val: boolean) => void;
}

export default function UploadArea({ onAnalyze, fileSelected, setFileSelected }: UploadAreaProps) {
  if (fileSelected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border-2 border-border rounded-2xl bg-surface transition-theme">
        <div className="w-16 h-16 bg-primary-soft rounded-full flex items-center justify-center mb-4 transition-theme">
          <FileVideo className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-1 text-text-primary">router_troubleshoot_site42.mp4</h2>
        <p className="text-text-secondary mb-8 text-sm">Ready for multimodal analysis.</p>
        
        <button 
          onClick={onAnalyze}
          className="px-8 py-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg font-medium transition-colors shadow-sm text-lg"
        >
          Analyze Video
        </button>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl bg-surface/50 hover:bg-surface transition-theme group cursor-pointer"
      onClick={() => setFileSelected(true)}
    >
      <div className="w-20 h-20 bg-surface-elevated group-hover:bg-primary-soft rounded-full flex items-center justify-center mb-6 transition-colors">
        <Upload className="w-10 h-10 text-text-muted group-hover:text-primary transition-colors" />
      </div>
      <h2 className="text-2xl font-semibold mb-2 text-text-primary">Upload Service Video</h2>
      <p className="text-text-secondary max-w-md text-center mb-2">
        Drag and drop a local field-service video (MP4, MKV) to begin.
      </p>
      <p className="text-text-muted text-sm">
        Click here to simulate selecting a file for the demo.
      </p>
    </div>
  );
}
