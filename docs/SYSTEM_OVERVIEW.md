# RKJ One System Overview

Last updated: 2026-07-08

## System Shape

RKJ One is a Next.js App Router application backed by Supabase. It serves both the browser experience and backend API routes from the same codebase. Supabase holds the operational database, auth users, storage buckets, RLS policies, and RPC functions.

Production:

- App: https://rkj.one
- Hosting: Vercel
- Database/Auth/Storage: Supabase
- Main branch: `master`

## Runtime Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Pages and layouts | `app/(dashboard)` and `app/(auth)` | Server-rendered role pages and protected app shell. |
| API routes | `app/api/**/route.ts` | Backend endpoints for module actions and data. |
| Domain libraries | `lib/<module>` | Client helpers, server helpers, business logic, types. |
| Auth helpers | `lib/auth`, `lib/supabase` | Session, profile, branch scope, Supabase clients, middleware. |
| Database schema | `supabase/migrations` | Tables, enums, RLS, RPCs, seed data, indexes. |
| Shared types | `types` | Database and enum TypeScript types. |
| UI components | `components` | Reusable dashboard, POS, finance, HR, and module UI. |
| Mobile shell | `android`, `ios`, `capacitor.config.ts` | Capacitor packaging for app store builds. |

## Auth and Access

1. User signs in through Supabase Auth.
2. `proxy.ts` calls `lib/supabase/middleware.ts` to refresh session and protect routes.
3. `getCurrentProfile()` loads the matching row from `profiles`.
4. API routes check role and branch scope in TypeScript.
5. Supabase RLS enforces organization and row-level access.

Important access helpers:

- `getCurrentProfile()` in `lib/auth/session.ts`
- `resolveScopedBranches()` in `lib/auth/branch-scope.ts`
- `isAdminRole()` and module permissions in `lib/auth/permissions.ts`

## Data Scope Model

Primary scope fields:

- `organization_id`: tenant boundary.
- `region_id`: Area Manager region boundary.
- `branch_id`: kiosk/branch boundary.
- `profile.id`: authenticated user id matching `auth.users.id`.

General access pattern:

- HQ roles can usually see organization-wide data.
- Area Manager can see branches in their `region_id`.
- Staff can see own branch data.
- Driver can see assigned delivery data.
- Sales Agent can see own agent account/order/payment data.

## Current AI Management Model

Owner:

- Uses dashboard-level project memory and AI leadership data.

Project Manager AI:

- Maintains milestones and `docs/TASK_BOARD.md`.

Role agents:

- Backend AI, Frontend AI, QA AI, Code Reviewer AI, DevOps AI, Data AI, Security AI.

Delivery path:

Owner request -> PM breakdown -> role-specific implementation -> QA/review -> merge/push -> migrate/deploy -> observe.

## Current Known Risks

- Some generated TypeScript database types do not yet include the newest tables, so selected API code casts Supabase table names.
- Booking API needs RLS and validation hardening before UI or external integrations depend on it heavily.
- Global middleware redirects unauthenticated API requests to login HTML. This is fine for browser app flows but not ideal for external API clients.
- Docs and migration index were behind latest migrations before this documentation refresh.

