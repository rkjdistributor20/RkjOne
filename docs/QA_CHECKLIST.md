# RKJ One QA Checklist

Last updated: 2026-07-08

Use this checklist for QA AI, Code Reviewer AI, and human review before merge/deploy.

## General Code Review

- [ ] Scope matches owner request.
- [ ] No unrelated UI/code changes.
- [ ] No secrets or personal credentials committed.
- [ ] TypeScript passes.
- [ ] ESLint passes for changed files.
- [ ] `npm run build` passes for production-impacting changes.
- [ ] Existing module patterns are followed.
- [ ] Errors are returned with appropriate status codes.
- [ ] Empty/loading/error states are handled if UI changed.

## API Review

- [ ] Route calls `getCurrentProfile()` or otherwise has explicit auth design.
- [ ] Role access is checked before writes.
- [ ] Organization boundary is validated.
- [ ] Branch/region scope is validated.
- [ ] Foreign keys supplied by client belong to the same organization.
- [ ] Enum values are rejected with `400` instead of silently changed.
- [ ] Date/time/number inputs are validated before DB write.
- [ ] Duplicate conflicts return `409` where appropriate.
- [ ] Response shape is documented in `docs/API_SPEC.md`.

## Supabase/RLS Review

- [ ] New table has `organization_id` unless there is a documented reason.
- [ ] New table has RLS enabled.
- [ ] Policies cover select/insert/update/delete as needed.
- [ ] RLS is not broader than API authorization.
- [ ] Branch access uses `public.has_branch_access()` or stronger validation.
- [ ] Service role use is justified and server-only.
- [ ] New indexes support common filters.
- [ ] `updated_at` trigger exists where needed.

## Frontend Review

- [ ] Layout matches existing RKJ One operational design.
- [ ] No decorative landing-page UI for internal tools.
- [ ] Mobile viewport is usable.
- [ ] Text does not overflow buttons/cards.
- [ ] Buttons use clear action labels/icons.
- [ ] Mutations show success/error feedback.
- [ ] Client API calls handle auth redirects and JSON errors.

## Deployment Review

- [ ] Migration applied to Supabase if schema changed.
- [ ] Vercel production deployment is Ready.
- [ ] Production alias points to expected deployment.
- [ ] Vercel error logs checked for the last hour.
- [ ] Smoke test performed for changed flow.
- [ ] Rollback path is known.

## M6 Release QA Notes

- [x] `npm run lint -- --quiet` passed.
- [x] `npm run build` passed locally.
- [x] `npm audit --omit=dev --audit-level=moderate` reported 0 vulnerabilities.
- [x] Secret scan found no committed real secrets.
- [x] Supabase migrations `harden_auth_role_and_booking_scope` and `m5_payment_lifecycle` applied and verified.
- [x] Vercel production deployment `dpl_55k1i1FNbsmaMnEHwfHkpj41yKQJ` is Ready.
- [x] Production smoke tests passed for `/login`, unauthenticated payment API access, and bad-signature webhook rejection.
- [ ] Run signed live-provider callback UAT with the selected payment provider before opening live customer payment volume.

## Booking API QA Notes

Current review findings to fix before UI/external integration:

- [ ] RLS update policy must not allow all branch-access users to update bookings.
- [ ] HQ role must not be able to use a `branch_id` from another organization.
- [ ] `assigned_to` must be validated against same organization and allowed role/scope.
- [ ] Invalid `status`, `priority`, date, and time must return explicit `400`.
- [ ] Creating `COMPLETED`, `CANCELLED`, or `CONFIRMED` bookings must follow a deliberate status lifecycle.
- [ ] Duplicate custom `booking_number` should return `409 Conflict`.
- [ ] Decide whether anonymous `/api/bookings` should redirect to login or return JSON `401`.
