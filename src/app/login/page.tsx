"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Activity,
  ShieldCheck,
  Wrench,
  HardHat,
  ArrowRight,
  Lock,
  Mail,
  User as UserIcon,
  Building2,
  Sparkles,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const { refreshSession } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<"technician" | "supervisor">("technician");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("name", name);
    formData.append("organization", organization);
    formData.append("role", role);

    const res = await loginAction(formData);
    if (!res.success) {
      setError(res.error || "Authentication failed. Please verify your credentials.");
      setLoading(false);
      return;
    }

    await refreshSession();
    // Use direct location navigation so Next.js server components re-evaluate instantly
    window.location.href = callbackUrl || "/";
  };

  const loadSampleAccount = (
    sampleEmail: string,
    sampleName: string,
    sampleOrg: string,
    sampleRole: "technician" | "supervisor"
  ) => {
    setEmail(sampleEmail);
    setName(sampleName);
    setOrganization(sampleOrg);
    setRole(sampleRole);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary-soft transition-colors duration-300">
      {/* Top Navbar */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 text-primary">
          <Activity className="w-6 h-6" />
          <span className="font-bold text-lg text-text-primary tracking-tight">VideoAssist</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-soft text-primary font-medium hidden sm:inline-block">
            Vertical B2B Portal
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Login / Register Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
          
          {/* Subtle glowing accent background */}
          <div className="absolute -top-24 -right-24 w-52 h-52 bg-primary/20 rounded-full blur-3xl pointer-events-none transition-all duration-500" />
          <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-accent/20 rounded-full blur-3xl pointer-events-none transition-all duration-500" />

          <div className="relative">
            
            {/* Header Badge & Title with Smooth Transitions */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary transition-transform duration-300">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="transition-all duration-300">
                  <h1 className="text-xl font-bold tracking-tight text-text-primary transition-opacity duration-300">
                    {mode === "signin" ? "Technician Portal Sign In" : "Register Contractor Account"}
                  </h1>
                  <p className="text-text-muted text-xs">
                    Multi-Tenant Multimodal Temporal Video Search
                  </p>
                </div>
              </div>

              {/* Mode Toggle with Smooth Sliding Indicator */}
              <div className="relative flex bg-surface-secondary p-1 rounded-xl border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`relative z-10 px-3.5 py-1.5 rounded-lg transition-colors duration-300 cursor-pointer font-medium ${
                    mode === "signin"
                      ? "text-primary-foreground font-semibold"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`relative z-10 px-3.5 py-1.5 rounded-lg transition-colors duration-300 cursor-pointer font-medium ${
                    mode === "signup"
                      ? "text-primary-foreground font-semibold"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Sign Up
                </button>

                {/* Animated Background Pill */}
                <div
                  className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-lg shadow-sm transition-transform duration-300 ease-out ${
                    mode === "signin" ? "left-1 translate-x-0" : "left-1 translate-x-full"
                  }`}
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl animate-in fade-in duration-200">
                {error}
              </div>
            )}

            {/* Quick Demo Contractor Accounts */}
            <div className="mb-5 p-3 rounded-xl bg-surface-secondary/70 border border-border transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Quick Load Test Profiles
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    loadSampleAccount("alex.rivera@fieldops.io", "Alex Rivera", "Apex Telecom", "technician")
                  }
                  className="p-2 rounded-lg border border-border bg-surface hover:border-primary/50 text-left transition-all duration-200 group cursor-pointer"
                >
                  <div className="font-semibold text-text-primary flex items-center gap-1 group-hover:text-primary transition-colors">
                    <Wrench className="w-3 h-3" />
                    Alex (Technician)
                  </div>
                  <div className="text-[10px] text-text-muted truncate">Apex Telecom (Site 42)</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    loadSampleAccount("sarah.chen@opticalaudits.com", "Sarah Chen", "Metro Optical", "supervisor")
                  }
                  className="p-2 rounded-lg border border-border bg-surface hover:border-primary/50 text-left transition-all duration-200 group cursor-pointer"
                >
                  <div className="font-semibold text-text-primary flex items-center gap-1 group-hover:text-primary transition-colors">
                    <HardHat className="w-3 h-3" />
                    Sarah (Supervisor)
                  </div>
                  <div className="text-[10px] text-text-muted truncate">Metro Optical Audits</div>
                </button>
              </div>
            </div>

            {/* Form with Smooth Transitioning Inputs */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              
              {/* Full Name field (Smooth Accordion Expand/Collapse) */}
              <div 
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  mode === "signup" ? "max-h-24 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                }`}
              >
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Your Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all duration-200"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Business or Personal Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="technician@your-company.com"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all duration-200"
                  />
                </div>
              </div>

              {/* Organization Field (Smooth Accordion Expand/Collapse) */}
              <div 
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  mode === "signup" ? "max-h-24 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                }`}
              >
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Company / Contracting Agency Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. Delhi Fiber Solutions"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all duration-200"
                  />
                </div>
              </div>

              {/* Operational Role Select */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Operational Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "technician" | "supervisor")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-elevated text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-xs transition-all duration-200"
                >
                  <option value="technician">Independent Field Technician / Engineer</option>
                  <option value="supervisor">Operations Supervisor / Quality Auditor</option>
                </select>
              </div>

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
                      <span className="transition-opacity duration-200">
                        {mode === "signin" ? "Enter Dedicated Workspace" : "Create Tenant Account"}
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
                Isolated PostgreSQL Tenant
              </span>
              <span>Zero Cross-Client Sharing</span>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-text-muted">
        VideoAssist — Vertical B2B AI Platform for Field-Service Operations
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
