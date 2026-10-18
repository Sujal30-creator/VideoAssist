"use server";

import { cookies } from "next/headers";
import { User } from "@/types/auth";
import { AUTH_COOKIE_NAME, parseSessionToken, createSessionToken, DEMO_USERS } from "@/lib/auth-utils";
import { tenantDb } from "@/lib/tenant-db";

/**
 * Vertical B2B Authentication:
 * Handles Profile, Member Since tracking, and Activity History
 */

export async function getSession(): Promise<{ user: User | null; token: string | null }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return { user: null, token: null };
  }

  const parsed = parseSessionToken(token);
  if (!parsed) {
    return { user: null, token: null };
  }

  // Fetch full user profile including activity history from in-memory/DB store
  const existingUser = DEMO_USERS.find((u) => u.id === parsed.id);
  const fullUser: User = existingUser || {
    id: parsed.id,
    name: parsed.name,
    email: parsed.email,
    role: parsed.role,
    organization: parsed.organization,
    workspaceType: parsed.workspaceType,
    createdAt: parsed.createdAt,
    activityHistory: [
      {
        id: `act_${Date.now()}`,
        action: 'LOGIN',
        description: 'Active session resumed',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return { user: fullUser, token };
}

export async function requireAuth(): Promise<User> {
  const { user } = await getSession();
  if (!user) {
    throw new Error("UNAUTHORIZED: Active session required to access this workspace.");
  }
  return user;
}

export async function loginAction(formData: FormData): Promise<{ success: boolean; error?: string; user?: User }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const nameInput = (formData.get("name") as string)?.trim();
  const role = (formData.get("role") as string) || "technician";
  const organizationInput = (formData.get("organization") as string)?.trim();

  if (!email || !email.includes("@")) {
    return { success: false, error: "Please enter a valid business or personal email address." };
  }

  // Check if existing user in demo set
  const existing = DEMO_USERS.find((u) => u.email.toLowerCase() === email);

  let targetUser: User;
  if (existing) {
    targetUser = {
      ...existing,
      activityHistory: [
        {
          id: `act_${Date.now()}`,
          action: 'LOGIN',
          description: `Logged in as ${existing.role}`,
          timestamp: new Date().toISOString(),
        },
        ...(existing.activityHistory || []),
      ],
    };
  } else {
    // New User registration
    const isPublicEmail = email.endsWith("@gmail.com") || email.endsWith("@yahoo.com") || email.endsWith("@outlook.com");
    const domainName = email.split("@")[1].split(".")[0];
    const derivedOrg = organizationInput || (isPublicEmail ? "Personal Workspace" : `${domainName.toUpperCase()} Team`);
    const displayName = nameInput || email.split("@")[0].replace(/[._-]/g, " ");

    targetUser = {
      id: `usr_${Buffer.from(email).toString("hex").slice(0, 12)}`,
      name: displayName,
      email: email,
      role: (role as "technician" | "supervisor") || "technician",
      organization: derivedOrg,
      workspaceType: isPublicEmail && !organizationInput ? 'PERSONAL' : 'COMPANY',
      createdAt: new Date().toISOString(), // Member since timestamp
      activityHistory: [
        {
          id: `act_${Date.now()}`,
          action: 'LOGIN',
          description: 'Account created & workspace initialized',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Pre-populate with initial project for smooth onboarding
    tenantDb.createProject(
      targetUser.id,
      `${derivedOrg} - Site Diagnostic #1`,
      "router_troubleshoot_site42.mp4"
    );
  }

  const token = createSessionToken(targetUser);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return { success: true, user: targetUser };
}

export async function logoutAction(): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  return { success: true };
}
