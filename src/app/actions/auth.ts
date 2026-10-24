"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("va_demo_mode")?.value === "true";

  if (isDemo) {
    return {
      id: "usr_demo_technician",
      email: "demo.technician@fieldops.io",
      name: "Alex Rivera (Demo)",
      role: "technician",
      isDemo: true,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Technician",
    role: user.user_metadata?.role || "technician",
    isDemo: false,
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED: Active Supabase session required.");
  }
  return user;
}

export async function signInAction(formData: FormData): Promise<AuthResponse> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.delete("va_demo_mode");
  revalidatePath("/", "layout");

  return {
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email || "",
      name: data.user.user_metadata?.name,
      role: data.user.user_metadata?.role,
    },
  };
}

export async function signUpAction(formData: FormData): Promise<AuthResponse> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const name = (formData.get("name") as string)?.trim() || email.split("@")[0];
  const role = (formData.get("role") as string) || "technician";

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  if (password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.delete("va_demo_mode");
  revalidatePath("/", "layout");

  return {
    success: true,
    user: data.user
      ? {
        id: data.user.id,
        email: data.user.email || "",
        name,
        role,
      }
      : undefined,
  };
}

export async function signOutAction(): Promise<{ success: boolean }> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("va_demo_mode");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function activateDemoSessionAction(): Promise<AuthResponse> {
  const cookieStore = await cookies();
  cookieStore.set("va_demo_mode", "true", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  revalidatePath("/", "layout");
  return {
    success: true,
    user: {
      id: "usr_demo_technician",
      email: "demo.technician@fieldops.io",
      name: "Alex Rivera (Demo)",
      role: "technician",
    },
  };
}