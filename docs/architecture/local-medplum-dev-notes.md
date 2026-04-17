# OZRYN Local Medplum Dev Notes

## Purpose

Capture the local Medplum runtime realities and debugging lessons that are easy to forget between sessions.

This document is intentionally pragmatic. It records what is currently true in this repo, not only the desired future architecture.

## Current Runtime Reality

- OZRYN currently authenticates to Medplum directly from the browser.
- The active runtime path is:
  - `src/lib/medplum.ts`
  - `src/app/login/page.tsx`
- This is not the final target architecture.
- The preferred long-term direction remains:
  - tenant resolution on the OZRYN server
  - server actions or other server-only Medplum calls
  - OZRYN-managed app session cookies

Future work should not assume server-side tenant auth is already implemented.

## Working Local Bootstrap Path

The pragmatic path that successfully produced a tenant-shaped local setup was:

1. Create a local Medplum user through the Medplum App registration flow.
2. Create the tenant `Project` in Medplum.
3. Create the tenant root `Organization` in that project.
4. Create a tenant `ClientApplication` in that same project for OZRYN.
5. Point OZRYN at the local Medplum base URL and that tenant client ID.
6. Import `docs/fhir-basics-bundle.json` into the tenant project.
7. Log into OZRYN and verify the patient dashboard against that tenant project.

This path is acceptable for local bootstrap even though it is not the final provisioning automation model.

## Current Local Operator Path

There is now a separate local operator control plane on `admin.localhost:3001`.

Current local expectations:

- tenant staff/admins still sign in on tenant hosts such as `rendal.localhost:3001`
- the OZRYN operator signs in on `admin.localhost:3001`
- local admin login uses a dedicated Medplum admin `ClientApplication`
- local admin setup uses `.env.local` values:
  - `MEDPLUM_ADMIN_CLIENT_ID`
  - `OZRYN_ADMIN_ALLOWED_EMAILS`
  - `OZRYN_ADMIN_SESSION_SECRET`
- privileged Medplum writes still use the server-only provisioning client credentials

The operator is not a tenant and is not stored in the tenant registry.

### Next.js local port configuration

The Next.js server port must be set at process start time, for example:

- `pnpm dev -- --port 3001`
- `PORT=3001 pnpm dev`

Do not rely on `.env.local` to set the Next.js listening port.

If OZRYN needs to derive local tenant/admin hosts while running behind a non-default local port, use:

- `OZRYN_LOCAL_PORT=3001`

That value is for OZRYN host derivation only. It does not make Next.js listen on that port.

## Known Local Auth and Config Gotchas

### Browser bundle staleness

When changing any `NEXT_PUBLIC_MEDPLUM_*` environment value:

- stop and restart `pnpm dev`
- hard refresh the browser before trusting the result

Without a full restart and hard refresh, OZRYN can keep using stale Medplum config in the browser bundle and produce misleading auth errors.

### Medplum server health vs auth payload problems

`POST /auth/login` failing in the browser does not automatically mean the Medplum server is down.

Useful local probes:

- `curl http://localhost:8103/` confirms the server is online
- `curl -X POST http://localhost:8103/auth/login ...` helps distinguish:
  - server offline
  - endpoint missing
  - invalid client
  - invalid user/password

### Invite UI limitations in local self-hosted Medplum

The local Medplum App invite flow may not expose password entry on the invite screen.

For local bootstrap, the practical options are:

- create the initial test user through registration
- invite via Medplum API with `password`
- use super-admin password override if available in the deployed build

Do not assume the App UI alone can always finish project-scoped clinician bootstrap.

## Sample Data Expectations

`docs/fhir-basics-bundle.json` is a transaction bundle intended for import into a tenant project.

Current contents:

- 2 `Patient` resources
- 1 `Observation`
- 0 `CarePlan` resources

Expected OZRYN behavior after import:

- patient list should populate
- patient detail header should show live demographics
- observations panel may show limited data
- care plan panel will likely be empty because the bundle currently contains no `CarePlan`

## References

- `src/lib/medplum.ts`
- `src/app/login/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/api/admin/session/route.ts`
- `docs/fhir-basics-bundle.json`
- `docs/architecture/admin-control-plane.md`
- `docs/architecture/provisioning-flow.md`
- `docs/architecture/tenant-model.md`
