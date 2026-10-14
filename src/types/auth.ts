export interface ActivityLog {
  id: string;
  action: 'LOGIN' | 'UPLOAD_VIDEO' | 'INSPECT_EVENT' | 'QUERY_QA';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'technician' | 'supervisor' | 'admin';
  organization?: string;
  workspaceType: 'PERSONAL' | 'COMPANY';
  createdAt: string; // "Member since" timestamp
  activityHistory?: ActivityLog[];
}

export interface Session {
  user: User;
  token: string;
  expiresAt: string;
}
