# Changelog

This file tracks implemented work in `ozryn-app` only.
It excludes broader OZRYN platform items from `docs/roadmap.md` unless they are visibly implemented in this app repository.

## Roadmap alignment as of 2026-08-10

Completed or substantially completed:

- Phase 3 app shell baseline in Next.js: dashboard layout, sidebar, top navigation, and staff-facing navigation structure.
- Local app to Medplum integration: tenant-aware Medplum client bootstrap, app-wide provider wiring, and tenant-scoped browser storage.
- Core clinical views backed by FHIR queries: patient list search, patient detail, recent observations, care plan summaries, follow-ups, and lightweight document references.
- Clinical Record MVP write flows backed by Medplum/FHIR: create/edit `Patient`, create `Observation`, create/update follow-up `Task`, and create lightweight `DocumentReference` metadata.
- Auth baseline for the app: Medplum-backed sign-in screen, tenant selection for local shared-app development, and unauthenticated redirect handling.
- Local tenant registry-backed runtime resolution for the shared OZRYN app instance.

Partially completed:

- Patient workspace now includes overview, data, follow-ups, and documents tabs; richer longitudinal timelines and inference summaries are still incomplete.
- Session/profile helper utilities exist for Medplum profile binding and organization lookup, but server-managed app sessions are not implemented end-to-end.
- Runtime auth remains browser-direct through the Medplum SDK; tenant-aware server-side auth is still a target architecture, not current implementation.
- Hostname-based tenant resolution is implemented; the production Vercel project still needs `*.ozryn.app` attached and verified.
- Document support is metadata/link based only; S3-backed `Binary` upload and extraction/review workflows are still future work.

Not counted as done for `ozryn-app`:

- External IdP integration and deterministic identity linking
- Encounter timeline
- Binary upload and document ingestion pipeline
- AWS/S3 production deployment work
- Inference, extraction, and review workflows

## 2026-08-10

### Added

- Operator tenant provisioning with clinic `Organization` profile data, a required primary admin, and optional initial users.
- Operator tenant metadata editing and support-only membership role/status updates.
- Tenant-admin user management at `/settings/users`, including invite, role change, deactivation, and last-admin protection.
- Server-only Medplum provisioning-client preflight that requires an admin membership in the `Super Admin` project before creating tenant resources.
- Regression coverage for tenant policies, membership constraints, and clinical FHIR mapping.

### Changed

- Moved tenant bindings from the legacy local registry to the OZRYN Postgres tenant table.
- Documented a single Vercel deployment with `admin.ozryn.app` reserved for operators and `*.ozryn.app` routing slug-derived tenant hosts.
- Documented fresh production database initialization: apply OZRYN schema migrations without copying local data.
- Kept production provisioning credentials separate from the browser admin-login client.

### Fixed

- Replaced the unsupported Medplum `project` search parameter with project-scoped membership queries.
- Removed the invalid `AccessPolicy.description` property that caused default tenant policy creation to fail.
- Prevented non-admin Super Admin clients from starting a bootstrap that would leave avoidable partial tenant data.

### Verification

- `node --test --experimental-transform-types --loader ./scripts/ts-test-loader.mjs src/lib/tenants/management.test.ts src/lib/patient-service.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/next build --turbopack`

## 2026-05-07

### Added

- Staff-facing Clinical Record workspace with patient overview, data, follow-up, and document tabs.
- OZRYN-native patient create/edit dialog backed by Medplum `Patient` resources for demographics, MRN, contact, address, and active status.
- Basic observation entry backed by Medplum `Observation` resources.
- Follow-up tracking backed by Medplum `Task` resources, including mark-completed workflow.
- Lightweight document reference entry backed by Medplum `DocumentReference` metadata and optional external URLs.
- Pure FHIR mapping tests for `Patient`, `Observation`, `Task`, and `DocumentReference`.
- Staff access-policy test coverage to confirm clinical write access does not grant tenant/user administration resources.
- Clinical Record MVP architecture note in `docs/architecture/clinical-record-mvp.md`.

### Changed

- Updated Phase 3 in `docs/roadmap.md` from a broad clinical backbone placeholder to the immediate Clinical Record MVP.
- Clarified the current auth phase as Medplum-backed/browser-direct, with external IdP token bridging deferred.
- Changed the default `Staff` Medplum access policy from read-only project access to scoped clinical read/write access for ficha clinica resources.
- Extended `pnpm test:unit` to include tenant policy tests and clinical FHIR mapping tests.

### Verification

- `pnpm test:unit`
- `pnpm build`

### Notes

- Build verification required reinstalling already-declared lockfile dependencies that were missing from `node_modules`: `drizzle-orm`, `pg`, `dotenv`, `drizzle-kit`, `tsx`, and `@types/pg`.

## 2026-03-26

### Added

- Tenant runtime resolution from the local tenant registry, including public tenant runtime APIs for login/bootstrap flows.
- Tenant-scoped Medplum browser storage so separate tenant sessions do not overwrite each other on the shared local OZRYN app origin.
- Tenant selection on the login page for local multi-tenant development without swapping `NEXT_PUBLIC_MEDPLUM_CLIENT_ID` between users.
- Active tenant context surfaced in the UI shell.
- A populated `data/tenants.local.example.json` example showing the expected registry shape.

### Changed

- Replaced the global single-tenant Medplum runtime bootstrap with tenant-aware bootstrap resolved before app provider initialization.
- Updated the root layout/provider flow to resolve tenant config first and then attach the matching Medplum client.
- Converted Medplum-backed service helpers to read the currently configured tenant client instead of importing a fixed singleton.

### Docs

- Recorded the manual two-tenant local validation milestone and the new shared-app multitenant runtime in `docs/roadmap.md`.

## 2026-03-03

### Added

- Medplum client setup with environment-based `baseUrl` and `clientId`, plus centralized unauthenticated redirect behavior.
- App-wide `MedplumProvider` integration in the root layout.
- Medplum-backed login page using `startLogin()` and `processCode()` for session establishment.
- Session helper route at `src/app/api/session/sync/route.ts` for setting the `ozryn-auth` cookie.
- FHIR service layer for searching `Patient` resources for the left-hand patient list.
- FHIR service layer for reading recent `Observation` resources for the clinical summary panel.
- FHIR service layer for reading `CarePlan` resources for active care tasks.
- Dashboard panels wired to live Medplum searches for patient list, observations, and care plan content.
- Session helper utilities for resolving the current Medplum profile and inferring the active organization from `PractitionerRole`.

### Changed

- Replaced the raster OZRYN logo asset with an SVG version.
- Shifted key dashboard panels from static placeholder collections toward Medplum-backed data loading and error states.

### Fixed

- Tightened `CarePlan` status handling to avoid invalid TypeScript comparisons when mapping Medplum data into UI state.

## 2026-03-12

### Added

- Patient detail mapping helpers for live FHIR-backed demographic summary fields including MRN, DOB, age, gender, address, and last-updated display.

### Changed

- Replaced the placeholder patient detail header card with live reads from the selected Medplum `Patient` resource.
- Updated the patient list to auto-select the first returned patient on initial dashboard load, reducing the empty-state friction when sample data is present.

### Docs

- Captured local Medplum bootstrap and auth troubleshooting notes, including browser cache and `NEXT_PUBLIC_MEDPLUM_*` refresh gotchas, in the architecture docs.

## 2026-02-11

### Security

- Updated the Next.js and React dependency set to patched versions to address React Server Components CVE fixes.

## 2025-10-22

### Added

- Initial clinical dashboard scaffold in Next.js, including sidebar navigation, top navigation, patient list panel, patient detail card, observations panel, and care plan panel.
- Reusable UI component layer for cards, buttons, inputs, alerts, tabs, dialog, dropdowns, scroll areas, and related primitives.
- Tailwind-based design tokens and global styling for the OZRYN app shell.

## 2025-10-21

### Added

- Initial `ozryn-app` repository bootstrap from Create Next App with TypeScript and Next.js foundations.
