# VideoAssist: Strategic Architecture Comparison & Decision Guide

This document outlines the two divergent architectural paths for **VideoAssist**:
- **Option A:** Closed Internal Enterprise IT Tool (Single-Tenant / Shared Knowledge)
- **Option B:** Vertical B2B / Prosumer SaaS for Independent IT Field Technicians (Multi-Tenant Open Registration)

---

## 1. Executive Comparison

| Dimension | Option A: Internal Enterprise IT Tool | Option B: Vertical B2B / Prosumer SaaS |
| :--- | :--- | :--- |
| **Target User** | Internal field engineers, network technicians, sysadmins belonging to one organization. | Independent IT contractors, freelance field technicians, multiple distinct MSP clients. |
| **Registration Model** | Closed / Gated. Admin invitation or company domain allowlist (`@company.com`). No public signup. | Open public registration (`/signup`) with email verification and self-onboarding. |
| **Data Scope & Sharing** | **Shared Knowledge Base**: Junior technicians can query videos recorded by Senior technicians. | **Strict Tenant Isolation**: Technician A must never see or search Technician B's video recordings. |
| **Database Model** | Standard PostgreSQL + `pgvector`. Queries search organizational library. | PostgreSQL + `pgvector` with strict Row-Level Security (RLS) and mandatory `user_id` on all tables. |
| **Abuse & Quotas** | Low risk (trusted internal team). No storage limits or payment gateways required. | High risk. Requires rate limiting (Better Auth plugin), storage limits (e.g. 2GB free tier), and Stripe/billing. |
| **Operational Overhead** | **Low**. Clean, direct implementation focused on core AI temporal grounding. | **High**. Needs public auth, email verification (Resend/SES), billing, RLS policies, tenant migration scripts. |

---

## 2. Deep Dive: Option A (Closed Internal Enterprise IT Tool)

### Core Philosophy
Think of this as **"Internal StackOverflow + Google Search for Company Field Operations Videos."**

### How It Works
1. **Access:** Only authenticated company staff can log in. There is no public `/signup` page.
2. **Knowledge Pooling:** When a senior engineer replaces a core router at Site 42 and logs the video, that knowledge benefits the entire company.
3. **Collaborative Search:** A junior technician troubleshooting an identical model at Site 79 asks:
   > *"What was the error code before rebooting the core router?"*
   The system searches the company-wide vector database and retrieves the senior technician's clip at `00:58` citing `ERR: 0x8F`.

### Pros
- Direct, focused development without SaaS overhead.
- Maximizes the value of field videos by enabling company-wide knowledge sharing.
- Simpler database queries and clean testing with local offline datasets.

### Cons
- Cannot be directly commercialized as a self-serve subscription product to external contractors without adding tenant walls.

---

## 3. Deep Dive: Option B (Vertical B2B / Prosumer SaaS)

### Core Philosophy
A cloud-native subscription platform where independent technicians and IT contractors pay a monthly fee to index and search their own client recordings.

### Key Architecture Requirements
1. **Public Authentication (Better Auth):**
   - Self-service `/signup` with Email/Password and OAuth.
   - Mandatory Email Verification via magic links or OTP (e.g., Resend) to block bot spam.
2. **Hard Row-Level Security (RLS):**
   - Every single table (`videos`, `segments`, `events`, `embeddings`) has a `user_id` foreign key.
   - Postgres RLS actively rejects any SQL query attempting to read rows belonging to another `user_id`.
3. **Usage Guardrails:**
   - Free tier storage quota (e.g., 2GB).
   - Rate limiting on API routes and auth endpoints.
   - Stripe customer subscription checkout and tier gating.

### Pros
- Commercial monetization potential (recurring subscription revenue).
- Scales horizontally across thousands of unrelated technicians and companies.

### Cons
- Significantly higher complexity before reaching core AI goals (billing, spam, RLS, transactional email setup).
- Prevents cross-technician knowledge sharing unless complex "team/organization sharing" permissions are built.

---

## 4. Current State of the Codebase

Our active branch (`feature/login-Workflow`) currently has:
1. **Session & Auth Management:** Complete session cookies (`va_session`), Next.js 16 `proxy.ts` edge protection, and login/logout handlers.
2. **Tenant Memory Separation:** `src/lib/tenant-db.ts` isolates projects and query history by `userId` (Technician Alex Rivera vs Supervisor Sarah Chen).
3. **Offline / Local Mode:** Zero cloud/S3 cost dependency; operates on local files and local PostgreSQL.

---

## 5. Strategic Recommendation & Next Steps

### Recommendation: **Hybrid Pragmatic Approach (Internal Tool First ➔ SaaS Ready)**
Build the **PostgreSQL + pgvector core with `user_id` columns present from Day 1**, but keep access **gated/controlled** initially:
- **Phase 1 (Immediate):** Wire up local PostgreSQL with schemas containing `user_id`. This gives you strict data separation without needing payment gateways or email verification right away.
- **Phase 2 (Core AI Milestone):** Integrate Whisper speech transcripts, OCR, and temporal event grounding. Verify research objectives (Ablations A–E).
- **Phase 3 (SaaS Expansion):** When you wish to commercialize, simply attach Better Auth open signup and Stripe billing onto the already tenant-aware PostgreSQL schema.

---

### Decision Matrix

Choose the path that aligns with your goal:

- **Pick Option A** if your primary goal is building the AI system, completing the academic/field-service research project, or deploying for a specific company/team.
- **Pick Option B** if your immediate goal is launching a public startup product for freelance technicians with credit card payments and self-registration.
