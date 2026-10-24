"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
// import Link from "next/link";
import { signInAction, signUpAction, activateDemoSessionAction } from "@/app/actions/auth";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Activity,
  ShieldCheck,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  Play,
  CheckCircle2,
} from "lucide-react";

function LoginForm() {
  // const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const { refreshSession } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"technician" | "supervisor">("technician");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("name", name);
    formData.append("role", role);

    const res = mode === "signin" ? await signInAction(formData) : await signUpAction(formData);

    if (!res.success) {
      setError(res.error || "Authentication failed. Please verify your credentials.");
      setLoading(false);
      return;
    }

    if (mode === "signup" && !res.user) {
      setSuccessMsg("Account created! Please check your email inbox to verify your account or sign in.");
      setLoading(false);
      return;
    }

    await refreshSession();
    window.location.href = callbackUrl || "/";
  };

  const handleDemoAccess = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      await activateDemoSessionAction();
      await refreshSession();
      window.location.href = callbackUrl || "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to enter demo mode");
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary-soft transition-colors duration-300">
      {/* Top Navbar */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 text-primary">
          <Activity className="w-6 h-6" />
          <span className="font-bold text-lg text-text-primary tracking-tight">VideoAssist</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-soft text-primary font-medium hidden sm:inline-block">
            Field-Service Video Intelligence
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Login / Register Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300">

          {/* Subtle glowing accent background */}
          <div className="absolute -top-24 -right-24 w-52 h-52 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">

            {/* Header Badge & Title */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-text-primary">
                    {mode === "signin" ? "Technician Portal Sign In" : "Create Supabase Account"}
                  </h1>
                  <p className="text-text-muted text-xs">
                    Multimodal Temporal Event Retrieval & Evidence Grounding
                  </p>
                </div>
              </div>

              {/* Mode Toggle with Animated Pill */}
              <div className="relative flex bg-surface-secondary p-1 rounded-xl border border-border text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`relative z-10 px-3.5 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${mode === "signin"
                    ? "text-primary-foreground font-semibold"
                    : "text-text-muted hover:text-text-primary"
                    }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`relative z-10 px-3.5 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${mode === "signup"
                    ? "text-primary-foreground font-semibold"
                    : "text-text-muted hover:text-text-primary"
                    }`}
                >
                  Sign Up
                </button>
                <div
                  className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-lg shadow-sm transition-transform duration-300 ease-out ${mode === "signin" ? "left-1 translate-x-0" : "left-1 translate-x-full"
                    }`}
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl animate-in fade-in duration-200">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Quick Demo Bypass for Evaluators */}
            <div className="mb-5 p-3 rounded-xl bg-surface-secondary/70 border border-border flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Instant Evaluator Access
                </span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Explore the full interactive system & simulated pipeline with 1 click
                </p>
              </div>
              <button
                type="button"
                onClick={handleDemoAccess}
                disabled={demoLoading}
                className="px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border hover:border-primary/50 text-text-primary text-xs font-medium rounded-lg flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm"
              >
                {demoLoading ? (
                  <span className="inline-block animate-spin mr-1">⟳</span>
                ) : (
                  <Play className="w-3 h-3 text-primary fill-primary" />
                )}
                Launch Demo
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">

              {/* Full Name field (in signup mode) */}
              {mode === "signup" && (
                <div className="animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Technician Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="technician@fieldops.io"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Operational Role Select (in signup mode) */}
              {mode === "signup" && (
                <div className="animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Operational Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "technician" | "supervisor")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all"
                  >
                    <option value="technician">Field Service Technician</option>
                    <option value="supervisor">Operations Supervisor / Quality Auditor</option>
                  </select>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 text-xs cursor-pointer active:scale-[0.99]"
                >
                  {loading ? (
                    <span className="inline-block animate-spin mr-2">⟳</span>
                  ) : (
                    <>
                      <span>
                        {mode === "signin" ? "Sign In to Operations Workspace" : "Register with Supabase"}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Security Badge */}
            <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Supabase Auth & Storage
              </span>
              <span>Encrypted Private Buckets</span>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-text-muted">
        VideoAssist — Vertical Multimodal AI Platform for IT Field-Service Operations
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin text-primary text-2xl font-bold">⟳</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
