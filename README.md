# OZRYN

OZRYN is a health-data platform built around one boring, brutal fact:

**health data is fragmented, messy, and locked inside systems that don’t want to talk to each other.**

So OZRYN’s job is to **ingest**, **normalize**, **securely store**, and **make useful** longitudinal health records using **HL7 FHIR** as the core interoperability model.

This is not a step-counter dashboard.  
This is infrastructure.

---

## What OZRYN is (current intent)

A **consent-aware health data platform** that can:

- Collect health records across sources (EHR exports, provider systems, labs; wearables later).
- Normalize everything into **FHIR R4 resources** (`Patient`, `Observation`, `Condition`, `Medication`, etc.).
- Store and query records via a FHIR server (Medplum initially).
- Expose developer-friendly APIs for apps and pipelines.
- Track **provenance, audit trails, and consent** by default.

---

## What OZRYN is NOT (yet)

- Not a diagnostics engine.
- Not a medical device.
- Not a recommendation system.
- Not a production HIPAA-compliant SaaS.
- Not a polished UI product.

Right now this is **infrastructure and integration work**, not a pitch deck.

---

## Core standards and why they matter

OZRYN is built on **FHIR** because:

- Data is modeled as modular **Resources**.
- APIs are REST-based and boring (good).
- Profiles and extensions let you handle real-world mess without forking the universe.

FHIR also brings the adult responsibilities:

- `Consent`, `AuditEvent`, `Provenance`
- Bulk Data patterns for later scale

---

## Architecture (current working model)

### Frontend
- Next.js (local dev first, Vercel later)

### Backend / Data Layer
- Medplum (self-hosted initially)
  - FHIR server
  - Auth
  - Project / Organization model

### Storage
- PostgreSQL (Medplum DB)
- Redis (cache / jobs depending on config)

### Auth
- OAuth2 / OIDC via Medplum
- PKCE flows
- There is a working OAuth demo (`medplum-oauth-demo.html`)

### Architecture docs
- Multitenancy manual: `docs/architecture/multitenancy-manual.md`
- Tenant model: `docs/architecture/tenant-model.md`
- Provisioning flow: `docs/architecture/provisioning-flow.md`
- Local Medplum runtime notes: `docs/architecture/local-medplum-dev-notes.md`

---

## Repository status (where we are)

### What works
- Local Medplum stack runs via Docker.
- Admin access issues were explored and understood.
- Direction is now **stability first**, cloud later.

### What is being stabilized
- Clean, repeatable local environment
- OAuth client setup and flow validation
- Defining the **minimal FHIR resource set** OZRYN actually needs

### Near-term roadmap

1. **Phase 0: Local stack**
   - One-command startup
   - Known credentials
   - Seed data
   - Smoke tests

2. **Minimal Patient Record Vault**
   - Create / read `Patient`
   - Attach `Observation` (labs, vitals)
   - Attach `Condition` / `Medication`
   - Basic timeline view (ugly but honest)

3. **Ingestion**
   - Import FHIR Bundles or NDJSON
   - Validate and normalize

4. **Consent + provenance**
   - Track data source
   - Track who imported what and under which permissions

---

## Local development

### Prerequisites
- Docker
- Docker Compose
- A tolerance for incomplete systems

### Run
- Start the stack using the repo’s Docker Compose files.
- Verify:
  - PostgreSQL is up
  - Redis is up
  - Medplum server is reachable
  - Medplum app loads

### OAuth demo (optional, but useful)
`medplum-oauth-demo.html` demonstrates:

- `/oauth2/authorize` with PKCE
- `/oauth2/token` exchange
- `/oauth2/userinfo`
- Basic FHIR API calls

You will need:
- A `ClientApplication` in Medplum
- Correct `clientId`
- Matching `redirectUri`

---

## Design principles

- **First principles over vibes**
- **FHIR is the canonical model**
- **Incremental scope**
- **Auditability is not optional**
- **Local-first until proven otherwise**

---

## Glossary

- **FHIR Resource**: Modular healthcare data object
- **Profile**: Constraints on a resource for a use case
- **Extension**: Safe way to add fields without breaking interoperability
- **SMART on FHIR**: OAuth2/OIDC conventions for healthcare apps

---

## Disclaimer

This repository contains **health data infrastructure code**.

It is **not medical advice**, not a clinical system, and not intended for production use without proper security, compliance, and regulatory controls.

---

If future-you is confused, that means present-you failed to write things down.
Fix it early.
