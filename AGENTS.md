# AI Team Guide for RKJ One

Last updated: 2026-07-08

This file is the working contract for AI agents helping with RKJ One. Follow it before changing code, docs, database migrations, or deployment settings.

## Project Goal

Sistem ini sedang dibangunkan untuk disiapkan secara berperingkat. Semua AI agent mesti faham sistem dahulu sebelum membuat perubahan.

## Product Context

RKJ One is the internal operating system for Roti Kaya Junus / RKJ Distributor. It covers HQ operations, factory production, kiosk POS, stock movement, fleet delivery, HR, payroll, finance, reports, approvals, maintenance, sales agents, and AI-assisted management.

Production URL: https://rkj-one.vercel.app

Primary stack:

- Next.js App Router, TypeScript, React, Tailwind, shadcn-style components.
- Supabase PostgreSQL, Auth, Storage, RLS, RPC functions.
- Vercel production deployment.
- Mobile shell through Capacitor for Android/iOS.

## Main Rules

- Jangan hard-code API key, token, password, atau secret.
- Jangan sentuh production database tanpa arahan jelas.
- Jangan delete fungsi lama tanpa semak dependency.
- Buat perubahan kecil dan mudah review.
- Selepas edit code, cuba run lint/build/test jika command tersedia.
- Jelaskan semua file yang diubah.
- Jika tidak pasti, buat assumption yang selamat dan tulis assumption tersebut.
- Read existing code before editing.
- Keep changes scoped to the task.
- Do not revert user or other-agent changes unless explicitly asked.
- Use `apply_patch` for manual file edits.
- Use `rg` or `rg --files` for search.
- Prefer existing helpers and module patterns over new abstractions.

## Branching

Target branch convention:

- `main`: stable/production
- `dev`: development
- `feature/*`: task kecil

Current repo note: this repository is currently using `master` as the tracked production branch. Until the repo is migrated to `main`, agents must check the current branch and follow the owner's explicit branch instruction.

## Definition of Done

Sesuatu task dikira siap bila:

1. Code sudah dibuat.
2. Tiada secret dimasukkan ke repo.
3. Build/lint/test sudah dicuba jika boleh.
4. Perubahan dijelaskan.
5. Risiko dan next step ditulis.

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Agent Leadership Structure

Owner:

- Final decision maker.
- Defines business priority, rollout timing, and acceptance criteria.

Project Manager AI:

- Converts business goals into milestones and small tasks.
- Maintains `docs/TASK_BOARD.md`.
- Does not edit product code unless explicitly asked.

Architect AI:

- Semak struktur sistem.
- Cadang architecture.
- Kenal pasti risiko teknikal.

Backend AI:

- Owns API routes, Supabase migrations, RLS, RPCs, service-layer logic, and data integrity.
- Must avoid UI edits unless the task explicitly includes UI.
- Must validate database scope, organization boundaries, role permissions, and edge cases.

Frontend AI:

- Owns pages, components, UX states, responsive layout, and client API integration.
- Must follow existing RKJ One visual patterns and avoid landing-page style unless explicitly requested.

QA AI:

- Reviews diffs for bugs, regressions, security, RLS gaps, missing validation, and missing tests.
- Cari bug, senaraikan test case, dan semak edge case.
- Findings first, ordered by severity, with file and line references.

Code Reviewer AI:

- Reviews maintainability, code style, naming, duplication, type safety, and integration risk.
- Does not rewrite unless requested.

DevOps AI:

- Owns Vercel, Supabase deployment, environment variables, build checks, and post-deploy monitoring.
- Must never expose secrets.

Database AI:

- Cadang schema/migration.
- Jangan run migration production tanpa arahan jelas.
- Pastikan relation dan access control jelas.

Data AI:

- Owns reports, KPI logic, reconciliation, finance/stock/payroll analytics, and dashboard data quality.

Security AI:

- Owns RLS audits, auth/session behavior, secret handling, privacy, and sensitive staff/customer data.
- Semak auth, role permission, API exposure, dan secret leakage.
- Cadangkan fix yang selamat.

Documentation AI:

- Update README dan docs.
- Keep `AGENTS.md`, `docs/TASK_BOARD.md`, `docs/API_SPEC.md`, and `docs/QA_CHECKLIST.md` aligned with delivered work.

## Standard Workflow

Use this delivery path unless the owner says otherwise:

1. Owner request.
2. PM AI breaks work into milestone and task.
3. Role-specific AI implements only its scope.
4. Local validation: TypeScript, lint, build, targeted scripts, or SQL checks.
5. QA AI review.
6. Code Reviewer AI review.
7. Fix accepted issues.
8. Commit and push.
9. Apply Supabase migrations when needed.
10. Verify Vercel deployment and production logs.

## Engineering Details

- Never commit `.env.local`, service role keys, passwords, tokens, private customer data, or generated secrets.
- Prefer existing helpers:
  - Auth/session: `lib/auth/session.ts`
  - Branch scope: `lib/auth/branch-scope.ts`
  - Supabase server clients: `lib/supabase/server.ts`
  - Module API clients under `lib/<module>/api.ts`
- Use Supabase RLS and API validation together. Do not rely on only one layer.
- If adding a table, add RLS, grants, indexes, and API validation.
- If adding an API, update `docs/API_SPEC.md`.
- If adding a workflow or known issue, update `docs/TASK_BOARD.md` and `docs/QA_CHECKLIST.md`.

## Validation Commands

Run the narrowest useful checks, then broaden when risk is high:

```powershell
npx tsc --noEmit --pretty false
npx eslint <changed-files>
npm run build
```

Database:

```powershell
npx supabase migration new <name>
npx supabase db push --yes
```

Deployment:

```powershell
npx vercel ls --yes
npx vercel inspect https://rkj-one.vercel.app
npx vercel logs https://rkj-one.vercel.app --since 1h --level error
```

## Current High-Priority Guardrails

- Booking API currently exists but needs follow-up hardening listed in `docs/TASK_BOARD.md`.
- Global middleware redirects unauthenticated API calls to `/login`; external API consumers may need JSON `401` behavior later.
- HQ branch scope must be validated against organization when a request supplies `branch_id`.
- Any user/profile assignment field must be validated against organization and allowed role.
