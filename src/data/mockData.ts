import { 
  Video, 
  TemporalSegment, 
  TranscriptEvidence, 
  OCREvidence, 
  VisualEvidence, 
  Event,
  QueryResult,
  ProcessingStage
} from '../types';

export const mockVideo: Video = {
  id: 'vid_001',
  title: 'Router Troubleshooting & Replacement',
  url: '/mock-videos/router_troubleshoot.mp4',
  durationMs: 180000 // 3 minutes
};

export const mockStages: ProcessingStage[] = [
  { id: 'prep', name: 'Video Preprocessing', description: 'Extracting metadata and audio track.', status: 'pending' },
  { id: 'frames', name: 'Frame Extraction', description: 'Sampling frames at 1 fps.', status: 'pending' },
  { id: 'visual', name: 'Visual Analysis', description: 'Detecting devices, tools, and actions.', status: 'pending' },
  { id: 'speech', name: 'Speech Transcription', description: 'Transcribing technician audio log.', status: 'pending' },
  { id: 'ocr', name: 'OCR Analysis', description: 'Reading text from equipment labels and screens.', status: 'pending' },
  { id: 'temporal', name: 'Temporal Event Segmentation', description: 'Segmenting into logical operational windows.', status: 'pending' },
  { id: 'index', name: 'Multimodal Indexing', description: 'Creating searchable vector index.', status: 'pending' },
  { id: 'complete', name: 'Analysis Completed', description: 'Pipeline finished successfully.', status: 'pending' },
];

export const mockSegments: TemporalSegment[] = [
  { id: 'seg_1', startTimeMs: 0, endTimeMs: 25000, description: 'Technician inspects router' },
  { id: 'seg_2', startTimeMs: 25000, endTimeMs: 55000, description: 'Technician checks network cable' },
  { id: 'seg_3', startTimeMs: 55000, endTimeMs: 80000, description: 'Error code is visible' },
  { id: 'seg_4', startTimeMs: 80000, endTimeMs: 105000, description: 'Technician reconnects cable' },
  { id: 'seg_5', startTimeMs: 105000, endTimeMs: 125000, description: 'Technician restarts router' },
  { id: 'seg_6', startTimeMs: 125000, endTimeMs: 150000, description: 'Router indicators turn back on' },
  { id: 'seg_7', startTimeMs: 150000, endTimeMs: 180000, description: 'Technician verifies connectivity' },
];

export const mockTranscripts: TranscriptEvidence[] = [
  { timestampMs: 10000, speaker: 'Tech', text: 'Alright, I am on site looking at the core router.' },
  { timestampMs: 30000, speaker: 'Tech', text: 'I am going to check the WAN cable connection. It seems a bit loose.' },
  { timestampMs: 60000, speaker: 'Tech', text: 'Ah, there it is. The screen is flashing error 0x8F.' },
  { timestampMs: 90000, speaker: 'Tech', text: 'I am unplugging and reseating the cable now.' },
  { timestampMs: 110000, speaker: 'Tech', text: 'Let me do a hard restart.' },
  { timestampMs: 160000, speaker: 'Tech', text: 'Looks good. I have a solid green link light.' },
];

export const mockOCR: OCREvidence[] = [
  { timestampMs: 58000, boundingBox: [100, 200, 300, 50], text: 'ERR: 0x8F', confidence: 0.95 },
  { timestampMs: 128000, boundingBox: [50, 50, 100, 20], text: 'SYSTEM BOOTING', confidence: 0.88 },
];

export const mockVisuals: VisualEvidence[] = [
  { timestampMs: 20000, frameUrl: '/mock-frames/frame_01.jpg', description: 'Router front panel' },
  { timestampMs: 60000, frameUrl: '/mock-frames/frame_02.jpg', description: 'Close up on error screen' },
  { timestampMs: 165000, frameUrl: '/mock-frames/frame_03.jpg', description: 'Green LED active on port 1' },
];

export const mockEvents: Event[] = [
  { 
    id: 'evt_1', segmentId: 'seg_1', eventType: 'INSPECTION', description: 'Router Inspection', confidence: 0.95,
    temporalRelations: [{ relatedEventId: 'evt_2', relationType: 'BEFORE' }],
    evidence: { transcripts: [mockTranscripts[0]], ocr: [], visuals: [mockVisuals[0]] }
  },
  { 
    id: 'evt_2', segmentId: 'seg_2', eventType: 'CABLE_CHECK', description: 'Cable Inspection', confidence: 0.92,
    temporalRelations: [{ relatedEventId: 'evt_1', relationType: 'AFTER' }, { relatedEventId: 'evt_3', relationType: 'BEFORE' }],
    evidence: { transcripts: [mockTranscripts[1]], ocr: [], visuals: [] }
  },
  { 
    id: 'evt_3', segmentId: 'seg_3', eventType: 'ERROR_STATE', description: 'Error Detected', confidence: 0.99,
    temporalRelations: [{ relatedEventId: 'evt_2', relationType: 'AFTER' }, { relatedEventId: 'evt_4', relationType: 'BEFORE' }],
    evidence: { transcripts: [mockTranscripts[2]], ocr: [mockOCR[0]], visuals: [mockVisuals[1]] }
  },
  { 
    id: 'evt_4', segmentId: 'seg_4', eventType: 'RECONNECTION', description: 'Cable Reconnection', confidence: 0.91,
    temporalRelations: [{ relatedEventId: 'evt_3', relationType: 'AFTER' }, { relatedEventId: 'evt_5', relationType: 'BEFORE' }],
    evidence: { transcripts: [mockTranscripts[3]], ocr: [], visuals: [] }
  },
  { 
    id: 'evt_5', segmentId: 'seg_5', eventType: 'REBOOT', description: 'Router Restart', confidence: 0.96,
    temporalRelations: [{ relatedEventId: 'evt_4', relationType: 'AFTER' }, { relatedEventId: 'evt_6', relationType: 'BEFORE' }],
    evidence: { transcripts: [mockTranscripts[4]], ocr: [mockOCR[1]], visuals: [] }
  },
  { 
    id: 'evt_6', segmentId: 'seg_6', eventType: 'BOOT_SEQUENCE', description: 'Boot Sequence', confidence: 0.88,
    temporalRelations: [{ relatedEventId: 'evt_5', relationType: 'AFTER' }, { relatedEventId: 'evt_7', relationType: 'BEFORE' }],
    evidence: { transcripts: [], ocr: [], visuals: [mockVisuals[2]] }
  },
  { 
    id: 'evt_7', segmentId: 'seg_7', eventType: 'VERIFICATION', description: 'Connectivity Verification', confidence: 0.97,
    temporalRelations: [{ relatedEventId: 'evt_6', relationType: 'AFTER' }],
    evidence: { transcripts: [mockTranscripts[5]], ocr: [], visuals: [] }
  },
];

export const mockQueries: QueryResult[] = [
  {
    query: 'What error code was visible on the router?',
    answer: 'The router displayed the error code "ERR: 0x8F".',
    confidence: 0.98,
    abstention: false,
    temporalRelation: 'BEFORE',
    relevantSegment: mockSegments[2],
    evidence: {
      transcripts: [mockTranscripts[2]],
      ocr: [mockOCR[0]],
      visuals: [mockVisuals[1]]
    }
  },
  {
    query: 'Did the technician restart the router?',
    answer: 'Yes, the technician performed a hard restart after reconnecting the cable.',
    confidence: 0.96,
    abstention: false,
    temporalRelation: 'AFTER',
    relevantSegment: mockSegments[4],
    evidence: {
      transcripts: [mockTranscripts[4]],
      ocr: [],
      visuals: []
    }
  }
];
