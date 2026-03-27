# Changelog

This file tracks implemented work in `ozryn-app` only.
It excludes broader OZRYN platform items from `docs/roadmap.md` unless they are visibly implemented in this app repository.

## Roadmap alignment as of 2026-03-26

Completed or substantially completed:

- Phase 3 app shell baseline in Next.js: dashboard layout, sidebar, top navigation, and staff-facing navigation structure.
- Local app to Medplum integration: tenant-aware Medplum client bootstrap, app-wide provider wiring, and tenant-scoped browser storage.
- Core read-only clinical views backed by FHIR queries: patient list search, recent observations, and care plan summaries.
- Auth baseline for the app: Medplum-backed sign-in screen, tenant selection for local shared-app development, and unauthenticated redirect handling.
- Local tenant registry-backed runtime resolution for the shared OZRYN app instance.

Partially completed:

- Patient detail UI now reads the selected `Patient` resource for core demographics, but richer longitudinal detail and editing flows are still incomplete.
- Session/profile helper utilities exist for Medplum profile binding and organization lookup, but server-managed app sessions are not implemented end-to-end.
- Runtime auth remains browser-direct through the Medplum SDK; tenant-aware server-side auth is still a target architecture, not current implementation.
- Hostname-based production tenant routing is still incomplete beyond the local selector/cookie fallback path.

Not counted as done for `ozryn-app`:

- External IdP integration and deterministic identity linking
- Encounter timeline
- DocumentReference/Binary upload flows
- AWS/S3 production deployment work
- Inference, extraction, and review workflows

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
