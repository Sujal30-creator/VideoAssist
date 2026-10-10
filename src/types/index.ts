export interface Video {
  id: string;
  title: string;
  url: string;
  durationMs: number;
}

export interface ProcessingStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
}

export interface TemporalSegment {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  description: string;
}

export interface EventRelation {
  relatedEventId: string;
  relationType: TemporalRelation;
}

export interface Event {
  id: string;
  segmentId: string;
  eventType: string;
  description: string;
  confidence: number;
  temporalRelations: EventRelation[];
  evidence: EvidenceBundle;
}

export interface TranscriptEvidence {
  timestampMs: number;
  speaker: string;
  text: string;
}

export interface OCREvidence {
  timestampMs: number;
  boundingBox: [number, number, number, number]; // x, y, width, height
  text: string;
  confidence: number;
}

export interface VisualEvidence {
  timestampMs: number;
  frameUrl: string;
  description: string;
}

export type TemporalRelation = 'BEFORE' | 'AFTER' | 'DURING' | 'OVERLAPS' | 'UNKNOWN';

export interface EvidenceBundle {
  transcripts: TranscriptEvidence[];
  ocr: OCREvidence[];
  visuals: VisualEvidence[];
}

export interface QueryResult {
  query: string;
  answer: string;
  confidence: number;
  abstention: boolean;
  temporalRelation?: TemporalRelation;
  relevantSegment?: TemporalSegment;
  evidence?: EvidenceBundle;
}
