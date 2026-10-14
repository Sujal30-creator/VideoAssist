"use server";

import { requireAuth } from "./auth";
import { tenantDb, UserProject } from "@/lib/tenant-db";

/**
 * Hardcore Security & Multi-tenancy:
 * All database operations are strictly scoped to the authenticated user ID.
 * One user cannot see, modify, or query another user's projects or memory.
 */

export async function getUserProjectsAction(): Promise<UserProject[]> {
  const user = await requireAuth();
  return tenantDb.getProjectsForUser(user.id);
}

export async function getProjectByIdAction(projectId: string): Promise<UserProject | null> {
  const user = await requireAuth();
  return tenantDb.getProjectById(user.id, projectId);
}

export async function createProjectAction(title: string, videoFileName: string, videoKey?: string): Promise<UserProject> {
  const user = await requireAuth();
  return tenantDb.createProject(user.id, title, videoFileName, videoKey);
}

export async function updateProjectStatusAction(projectId: string, status: 'idle' | 'processing' | 'ready'): Promise<UserProject | null> {
  const user = await requireAuth();
  return tenantDb.updateProjectStatus(user.id, projectId, status);
}
