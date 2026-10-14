import { User } from '@/types/auth';
import { Video, Event, TemporalSegment, ProcessingStage } from '@/types';
import { mockVideo, mockStages, mockEvents, mockSegments } from '@/data/mockData';

export interface UserProject {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  status: 'idle' | 'processing' | 'ready';
  video: Video;
  stages: ProcessingStage[];
  events: Event[];
  segments: TemporalSegment[];
  queryHistory: Array<{
    query: string;
    answer: string;
    confidence: number;
    timestamp: string;
  }>;
}

// In-memory tenant/user isolated store simulating Postgres records
class TenantDatabaseStore {
  private projects: Map<string, UserProject[]> = new Map();

  constructor() {
    this.seedDemoTenants();
  }

  private seedDemoTenants() {
    // 1. Alex Rivera's workspace (Technician - Router Troubleshooting)
    this.projects.set('usr_tech_01', [
      {
        id: 'proj_router_site42',
        userId: 'usr_tech_01',
        title: 'Router Hardware Diagnostic - Site 42',
        createdAt: '2026-10-14T10:15:00Z',
        status: 'ready',
        video: mockVideo,
        stages: mockStages.map((s) => ({ ...s, status: 'completed' })),
        events: mockEvents,
        segments: mockSegments,
        queryHistory: [
          {
            query: 'What was the error code before reboot?',
            answer: 'The technician observed error code ERR: 0x8F flashing on the router screen at 00:58 prior to cable reseat and restart.',
            confidence: 0.96,
            timestamp: '2026-10-14T10:22:00Z',
          },
        ],
      },
      {
        id: 'proj_switch_mdf',
        userId: 'usr_tech_01',
        title: 'Cisco Catalyst 3850 Replacement - MDF Room',
        createdAt: '2026-10-14T14:30:00Z',
        status: 'idle',
        video: {
          id: 'vid_cisco_02',
          title: 'Catalyst 3850 SFP Module Swap',
          url: '/mock-videos/switch_replace.mp4',
          durationMs: 240000,
        },
        stages: mockStages.map((s) => ({ ...s, status: 'pending' })),
        events: [],
        segments: [],
        queryHistory: [],
      },
    ]);

    // 2. Sarah Chen's workspace (Supervisor - Quality & Compliance audits)
    this.projects.set('usr_sup_02', [
      {
        id: 'proj_sup_audit_09',
        userId: 'usr_sup_02',
        title: 'Compliance Audit: Data Center Optical Cabling',
        createdAt: '2026-10-13T16:45:00Z',
        status: 'ready',
        video: {
          id: 'vid_audit_09',
          title: 'Fiber Patch Panel Termination Inspection',
          url: '/mock-videos/fiber_audit.mp4',
          durationMs: 310000,
        },
        stages: mockStages.map((s) => ({ ...s, status: 'completed' })),
        events: [
          {
            id: 'evt_sup_1',
            segmentId: 'seg_sup_1',
            eventType: 'Safety Protocol Inspection',
            description: 'Technician attached ESD wristband and safety glasses.',
            confidence: 0.98,
            temporalRelations: [],
            evidence: {
              transcripts: [{ timestampMs: 5000, speaker: 'Auditor', text: 'PPE and ESD check verified.' }],
              ocr: [{ timestampMs: 5200, boundingBox: [10, 10, 200, 40], text: 'ESD SAFE AREA', confidence: 0.99 }],
              visuals: [{ timestampMs: 5000, frameUrl: '/mock-frames/frame_01.jpg', description: 'ESD wrist grounding verified' }],
            },
          },
        ],
        segments: [
          { id: 'seg_sup_1', startTimeMs: 0, endTimeMs: 45000, description: 'PPE & Grounding Safety Protocol' },
        ],
        queryHistory: [
          {
            query: 'Did the technician follow ESD grounding precautions?',
            answer: 'Yes, ESD grounding band verified attached at 00:05 before touching optical transceiver module.',
            confidence: 0.98,
            timestamp: '2026-10-13T17:00:00Z',
          },
        ],
      },
    ]);
  }

  public getProjectsForUser(userId: string): UserProject[] {
    return this.projects.get(userId) || [];
  }

  public getProjectById(userId: string, projectId: string): UserProject | null {
    const list = this.getProjectsForUser(userId);
    return list.find((p) => p.id === projectId) || null;
  }

  public createProject(userId: string, title: string, videoFileName: string, videoKey?: string): UserProject {
    const list = this.getProjectsForUser(userId);
    const newProject: UserProject = {
      id: `proj_${Date.now().toString(36)}`,
      userId,
      title: title || videoFileName,
      createdAt: new Date().toISOString(),
      status: 'idle',
      video: {
        id: `vid_${Date.now().toString(36)}`,
        title: videoFileName,
        url: videoKey || '/mock-videos/router_troubleshoot.mp4',
        durationMs: 180000,
      },
      stages: mockStages.map((s) => ({ ...s, status: 'pending' })),
      events: mockEvents,
      segments: mockSegments,
      queryHistory: [],
    };

    list.unshift(newProject);
    this.projects.set(userId, list);
    return newProject;
  }

  public updateProjectStatus(userId: string, projectId: string, status: 'idle' | 'processing' | 'ready') {
    const project = this.getProjectById(userId, projectId);
    if (project) {
      project.status = status;
      if (status === 'ready') {
        project.stages = mockStages.map((s) => ({ ...s, status: 'completed' }));
      }
    }
    return project;
  }
}

// Global singleton to persist state in Node process across requests
const globalForTenantDb = globalThis as unknown as { tenantDb: TenantDatabaseStore | undefined };
export const tenantDb = globalForTenantDb.tenantDb ?? new TenantDatabaseStore();
if (process.env.NODE_ENV !== 'production') globalForTenantDb.tenantDb = tenantDb;
