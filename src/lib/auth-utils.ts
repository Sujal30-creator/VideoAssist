import { User } from '@/types/auth';

export const AUTH_COOKIE_NAME = 'va_session';

export const DEMO_USERS: User[] = [
  {
    id: 'usr_tech_01',
    name: 'Alex Rivera',
    email: 'alex.rivera@fieldops.io',
    role: 'technician',
    organization: 'Apex Network Ops',
    workspaceType: 'COMPANY',
    createdAt: '2026-08-12T09:30:00Z',
    activityHistory: [
      {
        id: 'act_101',
        action: 'LOGIN',
        description: 'Signed in from Mumbai Field Operations Terminal',
        timestamp: '2026-10-15T02:10:00Z',
      },
      {
        id: 'act_102',
        action: 'QUERY_QA',
        description: 'Queried: "What was the error code before reboot?" on Site 42 Router',
        timestamp: '2026-10-14T11:45:00Z',
      },
      {
        id: 'act_103',
        action: 'UPLOAD_VIDEO',
        description: 'Uploaded field recording: router_troubleshoot_site42.mp4',
        timestamp: '2026-10-14T10:15:00Z',
      },
    ],
  },
  {
    id: 'usr_sup_02',
    name: 'Sarah Chen',
    email: 'sarah.chen@opticalaudits.com',
    role: 'supervisor',
    organization: 'Metro Optical Audits',
    workspaceType: 'COMPANY',
    createdAt: '2026-06-01T14:00:00Z',
    activityHistory: [
      {
        id: 'act_201',
        action: 'LOGIN',
        description: 'Supervisor session initialized',
        timestamp: '2026-10-15T01:30:00Z',
      },
      {
        id: 'act_202',
        action: 'INSPECT_EVENT',
        description: 'Audited PPE & ESD Grounding Protocol segment',
        timestamp: '2026-10-13T17:15:00Z',
      },
    ],
  },
];

// Helper to generate a verifiable token representation
export function createSessionToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    organization: user.organization || 'Personal Workspace',
    workspaceType: user.workspaceType || 'PERSONAL',
    createdAt: user.createdAt,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function parseSessionToken(token: string): (User & { exp: number }) | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const data = JSON.parse(raw);
    if (!data.userId || !data.exp) return null;
    if (Date.now() / 1000 > data.exp) return null; // expired
    return {
      id: data.userId,
      name: data.name,
      email: data.email,
      role: data.role,
      organization: data.organization,
      workspaceType: data.workspaceType || 'PERSONAL',
      createdAt: data.createdAt || new Date().toISOString(),
      exp: data.exp,
    };
  } catch {
    return null;
  }
}
