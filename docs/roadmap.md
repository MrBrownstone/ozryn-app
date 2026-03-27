# OZRYN Roadmap v2

A cleaner roadmap, because the previous one had the usual startup disease: important architecture decisions postponed to “later” as if reality were going to politely wait.

---

## 1. Purpose

Build OZRYN as a **FHIR-first, multi-tenant health platform** with:

- **Medplum as the clinical backend and source of truth**
- **Next.js on Vercel as the tenant-facing web app**
- **AWS as the production infrastructure for Medplum and supporting backend services**
- **ANTON + Google medical models** as the initial inference layer for medical reasoning

The goal is not to “eventually” become multi-tenant, compliant, and production-shaped.
The goal is to start that way.

---

## 2. What changed from the previous roadmap

### Removed or corrected assumptions

1. **Multi-tenancy is not a late phase**
   - Old roadmap placed multi-tenancy in a late production phase.
   - New roadmap treats multi-tenancy as a **day-0 architectural invariant**.

2. **Production cloud is AWS**
   - Old roadmap mentioned Railway, Fly.io, GCP, Azure as staged recommendations.
   - New roadmap sets **AWS as the production target** for backend workloads.
   - Vercel remains the frontend hosting layer.

3. **Inference starts now, not after “waiting for data”**
   - Old roadmap deferred ML/analysis until later.
   - New roadmap uses **ANTON + Google medical models** early for:
     - summarization
     - extraction
     - coding assistance
     - medical inference prototypes
     - clinician support workflows

4. **Roadmap now reflects actual progress**
   - Medplum has already been **deployed locally with Docker Compose**.
   - That work is no longer a future task.

5. **This roadmap is implementation-facing**
   - Written so Codex can act on it.
   - Each phase has explicit outcomes, deliverables, and boundaries.

---

## 3. Current status

### Already done

- [x] Medplum full stack deployed locally with Docker Compose
- [x] Local Medplum app accessible for development/testing
- [x] Initial architectural direction chosen: FHIR-first with Medplum as core backend
- [x] Strategic tenancy decision made: **one Medplum Project per customer / organization**
- [x] Strategic auth direction chosen: **external IdP + Medplum project-scoped token bridging**
- [x] Strategic RBAC direction chosen: minimal roles for MVP
- [x] Strategic provisioning direction chosen: no direct SQL hacks, use Medplum Admin/FHIR APIs only
- [x] Manual two-tenant local bootstrap validated with separate Medplum projects, separate OZRYN `ClientApplication` records, and distinct imported FHIR bundles
- [x] Local tenant registry and tenant-aware Medplum runtime bootstrap implemented for the shared OZRYN app instance

### Local runtime milestone as of 2026-03-26

The current local runtime can now authenticate different tenant admins against different tenant-specific Medplum `ClientApplication` ids without editing `.env.local` between logins.

What is implemented now:

- OZRYN resolves tenant runtime config from the local tenant registry before Medplum client bootstrap
- local development supports explicit tenant selection on the login screen for a shared `localhost` app instance
- browser Medplum session state is namespaced per tenant to avoid one tenant login overwriting another tenant's saved Medplum session
- the app shell surfaces the active tenant name in the runtime UI

What this milestone does not change:

- runtime auth is still browser-direct through Medplum for local MVP
- external IdP and deterministic cross-tenant identity linking are still future-phase work
- production-grade hostname/domain routing still needs to be completed beyond the local selector/cookie path

### Assumed current state

These are treated as design constraints unless explicitly revised:

- Tenant isolation model = **one Medplum Project per customer/org**
- Runtime super-admin pattern = **avoid**
- Shared PHI across tenants = **forbidden**
- App architecture must support **tenant-aware routing and deployment from the start**
- Backend production home = **AWS**
- Frontend production home = **Vercel**

---

## 4. Architecture principles

### 4.1 Non-negotiables

1. **FHIR is the canonical clinical model**
   - Default to standard FHIR R4 resources.
   - Add OZRYN-specific extensions only when truly necessary.

2. **Multi-tenancy is foundational**
   - Medplum tenant boundary = **Project**
   - OZRYN app tenant boundary = **tenant-aware app surface and deployment model on Vercel**

3. **Production is AWS-first**
   - No pretending Railway or Fly.io are the long-term answer for regulated health infrastructure.
   - Useful for demos maybe, not the backbone.

4. **External identity, internal authorization**
   - Use external IdP for global authentication.
   - Use Medplum for project-scoped authorization and resource access.

5. **No direct database mutation of Medplum internals**
   - Provisioning and membership changes only through supported APIs.

6. **Inference is a service layer, not the data layer**
   - ANTON and Google medical models consume curated FHIR/context data.
   - They do not become the system of record.

---

## 5. Target architecture

## 5.1 Core components

### Clinical system of record
- **Medplum self-hosted**
- Environment progression:
  - local Docker Compose for development
  - AWS for staging/production

### Frontend
- **Next.js app on Vercel**
- Tenant-aware app
- Supports custom domains or tenant resolution strategy

### Identity
- **External IdP** for primary login
- Medplum token bridging for project-scoped access
- Deterministic user linking via:
  - `externalId`
  - email

### Storage
- Clinical documents and attachments in **AWS S3**
- Referenced from FHIR resources such as `DocumentReference` / `Binary`

### Inference layer
- **ANTON** for local/private orchestration and execution
- **Google medical models** for early medical inference workflows
- Used initially for:
  - summarization
  - extraction from clinical text/documents
  - coding/classification support
  - risk flagging and clinician copilots

### Backend automation
- Medplum Bots/Subcriptions where they fit
- External backend workers when logic should not live inside Medplum runtime

---

## 6. Tenancy model

### 6.1 Medplum tenancy

Each paying customer organization gets:

- **one Medplum Project**
- **one Organization resource** inside that project
- isolated users, policies, and data

Implications:

- no PHI mixing across customers
- simpler audit boundaries
- simpler offboarding/export story
- cleaner compliance posture

### 6.2 OZRYN app tenancy

The app must be tenant-aware from phase 0.

Expected capabilities:

- tenant resolution by hostname/subdomain/custom domain
- tenant configuration lookup
- tenant-specific branding/configuration if needed later
- secure mapping from app tenant to Medplum project

### 6.3 Shared resources

If needed later:

- use a **separate shared Medplum project** for read-only catalogs/terminologies/non-PHI templates
- never use shared projects for customer PHI

---

## 7. Auth and authorization model

### 7.1 Authentication

Use an **external IdP** for global identity.

Why:

- better login UX
- central user lifecycle
- easier future support for SSO/federation
- OZRYN should own the product identity layer, not outsource product shape to Medplum’s default login UX

### 7.2 Authorization

After external auth:

- resolve tenant
- map user to the correct Medplum project
- mint or obtain a **project-scoped Medplum token**
- authorize access through Medplum access policies

### 7.3 MVP roles

Minimal roles only:

- `TenantAdmin`
- `Staff` / `Clinician`
- `ServiceBot`
- `Patient` later, not required in the first operational cut

### 7.4 Runtime policy

- no universal runtime super-admin user for normal operations
- bootstrap/admin automation may exist outside normal runtime flows
- invites and role assignment should be tenant-scoped

---

## 8. Data model rules

### 8.1 MVP data model

Prefer vanilla FHIR R4 resources:

- `Patient`
- `Practitioner`
- `PractitionerRole`
- `Organization`
- `Encounter`
- `Condition`
- `Observation`
- `Procedure`
- `MedicationRequest`
- `DiagnosticReport`
- `DocumentReference`
- `Binary`
- `Questionnaire`
- `QuestionnaireResponse`
- `Task`
- `AuditEvent`

### 8.2 Extensions

Only create OZRYN extensions when:

- required data cannot be represented sanely with base FHIR
- the extension meaning is explicit and documented
- Codex can point to a concrete definition and usage rule

### 8.3 Identity linking

Use deterministic linking first:

- external IdP user id
- email
- explicit tenant membership

Patient dedup/EMPI logic is a later controlled capability, not phase-0 magic.
Humans love inventing duplicate people in systems and then acting surprised.

---

## 9. Deployment model

## 9.1 Local development

### Medplum
- Docker Compose full stack
- local admin/testing environment

### OZRYN app
- local Next.js app
- points to local or non-prod Medplum as configured

### ANTON
- local/private inference environment
- used for early inference and document workflows

## 9.2 Production

### Frontend
- Vercel

### Backend clinical platform
- AWS

### Expected AWS building blocks
- VPC
- ECS/EKS or equivalent runtime for Medplum stack
- RDS PostgreSQL
- ElastiCache/Redis if required by Medplum deployment profile
- S3 for clinical files/documents
- IAM/KMS/Secrets Manager
- CloudWatch for logs/metrics
- WAF / ALB / Route53 / ACM as needed

Do not waste time pretending the cloud choice is still philosophically open. It is not.

---

## 10. Inference strategy

## 10.1 Immediate approach

Use **ANTON + Google medical models** now.

Initial use cases:

1. clinical note summarization
2. structured extraction from uploaded documents
3. code/classification assistance
4. clinician-facing decision support drafts
5. longitudinal synthesis of patient history

## 10.2 Safety rule

Inference outputs are:

- advisory
- traceable
- reviewable
- never the system of record by themselves

## 10.3 Storage rule

- raw model outputs should be stored separately from validated clinical facts
- validated outputs can be written back into FHIR resources through controlled workflows

---

## 11. Phased roadmap

# Phase 0 - Foundation cleanup and architecture baseline

## Goal
Turn existing experimentation into a deliberate baseline that Codex can build on.

## Outcomes
- confirmed local dev baseline
- codified architecture decisions
- repository structure prepared
- tenant/auth/provisioning design frozen for MVP

## Tasks
- [x] Run Medplum locally with Docker Compose
- [ ] Create/update canonical docs folder for OZRYN architecture
- [ ] Define repository structure
- [ ] Define environment strategy: local / staging / prod
- [x] Define tenant resolution approach in app
- [ ] Document external IdP + Medplum token bridging flow
- [ ] Document onboarding flow for new customer org
- [ ] Document minimum RBAC matrix
- [ ] Document AWS target architecture at a high level

## Deliverables
- `docs/roadmap/OZRYN_Roadmap_v2.md`
- `docs/architecture/tenant-model.md`
- `docs/architecture/auth-model.md`
- `docs/architecture/provisioning-flow.md`
- `docs/architecture/aws-target.md`

---

# Phase 1 - Multi-tenant foundations

## Goal
Make tenancy real before building business features.

## Outcomes
- tenant-aware OZRYN app foundation
- Medplum project-per-tenant model operationally defined
- onboarding flow specified
- local shared-app tenant switching works without env var swapping

## Tasks
- [x] Design tenant identification strategy:
  - subdomain
  - custom domain
  - fallback local dev tenant selector
- [x] Define tenant config source of truth
- [x] Define mapping from tenant to Medplum project credentials/config
- [ ] Design automated customer provisioning flow:
  - create Medplum project
  - create Organization
  - create first TenantAdmin invite
  - register tenant metadata in OZRYN app layer
- [ ] Define tenant-aware Vercel deployment/runtime configuration approach
- [ ] Document isolation guarantees and non-goals

## Deliverables
- tenant resolution module spec
- tenant provisioning spec
- tenant metadata schema
- onboarding sequence diagram

---

# Phase 2 - Authentication and authorization

## Goal
Implement secure login and tenant-scoped authorization.

## Outcomes
- external identity integrated
- user to tenant mapping defined
- Medplum project-scoped access working

## Tasks
- [ ] Select/confirm external IdP implementation
- [ ] Define login flow:
  - user authenticates with IdP
  - app resolves tenant membership
  - app exchanges or provisions Medplum access
- [ ] Implement deterministic identity linking via externalId + email
- [ ] Define invite and membership flows
- [ ] Create MVP access policies for:
  - TenantAdmin
  - Staff/Clinician
  - ServiceBot
- [ ] Decide how service-to-service auth works for backend workers

## Deliverables
- auth sequence diagram
- RBAC matrix
- Medplum AccessPolicy definitions for MVP
- invite/provisioning flow spec

---

# Phase 3 - Clinical backbone MVP

## Goal
Stand up the first usable clinical OZRYN slice on top of Medplum.

## Outcomes
- working tenant-aware app shell
- core FHIR entities usable
- basic clinical workflows visible in UI

## Tasks
- [ ] Build app shell in Next.js on Vercel
- [x] Implement tenant-aware session bootstrapping
- [ ] Implement core screens for MVP:
  - patient list
  - patient detail
  - encounters/observations timeline
  - document list/upload
- [ ] Support core resources:
  - Patient
  - Practitioner
  - Organization
  - Encounter
  - Observation
  - DocumentReference
- [ ] Define minimal navigation and UX for staff
- [ ] Ensure every mutation is tenant-scoped and policy-safe

## Deliverables
- MVP UI shell
- patient list/detail flows
- file upload flow
- basic longitudinal record view

---

# Phase 4 - Document ingestion and structured extraction

## Goal
Turn messy real-world documents into usable clinical context.

## Outcomes
- document upload pipeline
- extraction pipeline
- human review loop

## Tasks
- [ ] Implement upload to S3 with FHIR linkage via DocumentReference/Binary
- [ ] Define ingestion states:
  - uploaded
  - queued
  - extracted
  - reviewed
  - accepted
  - rejected
- [ ] Use ANTON + Google medical models for:
  - summarization
  - extraction of structured fields
  - candidate coding/classification
- [ ] Store raw extraction output separately from validated facts
- [ ] Build clinician review UI for extracted data
- [ ] Write validated facts back into FHIR resources through controlled flows

## Deliverables
- ingestion pipeline spec
- extraction result schema
- review/approval workflow
- first document-to-FHIR path

---

# Phase 5 - Automations and operational workflows

## Goal
Use Medplum Bots and backend workers where automation actually helps.

## Outcomes
- automated workflows for core operations
- clear boundary between in-Medplum logic and external services

## Tasks
- [ ] Define when to use Medplum Bots vs external workers
- [ ] Implement initial automations:
  - onboarding helpers
  - document ingestion triggers
  - alert/task creation rules
  - inference job dispatch
- [ ] Ensure automation outputs are auditable
- [ ] Add failure handling and retries

## Deliverables
- automation decision matrix
- initial bot catalog
- worker catalog
- auditability rules

---

# Phase 6 - AWS production platform

## Goal
Move from local/dev experimentation to a production-grade backend footprint.

## Outcomes
- Medplum deployed on AWS
- production networking/security baseline
- non-prod and prod separation

## Tasks
- [ ] Design AWS deployment topology
- [ ] Provision networking/security baseline
- [ ] Deploy Medplum on AWS
- [ ] Configure RDS/Postgres
- [ ] Configure S3 storage
- [ ] Configure secrets and key management
- [ ] Configure logging/monitoring/alerting
- [ ] Configure backup and restore process
- [ ] Validate upgrade path and operational runbooks

## Deliverables
- infrastructure diagram
- deployment runbook
- backup/restore runbook
- observability baseline
- security baseline checklist

---

# Phase 7 - Interoperability and external integrations

## Goal
Make OZRYN useful in the real healthcare ecosystem instead of just being a beautifully isolated toy.

## Outcomes
- external data exchange path defined
- integration strategy prioritized by realism

## Tasks
- [ ] Prioritize FHIR-native integrations first
- [ ] Define HL7 v2 ingestion path only where needed
- [ ] Evaluate Medplum Agent usage for legacy environments
- [ ] Define import/export patterns for:
  - FHIR bundles
  - document imports
  - CSV migrations where unavoidable
- [ ] Define patient identity and import matching strategy per tenant

## Deliverables
- interoperability strategy doc
- import/export matrix
- HL7/FHIR integration playbook

---

# Phase 8 - Clinical intelligence layer v1

## Goal
Operationalize inference in ways clinicians can actually use.

## Outcomes
- clinician support workflows with traceability
- early longitudinal synthesis capabilities

## Tasks
- [ ] Build patient longitudinal summary generation
- [ ] Build document-level summarization workflows
- [ ] Build risk flag prototypes with human review
- [ ] Expose rationale/provenance for generated suggestions
- [ ] Define acceptance rules for model-assisted outputs

## Deliverables
- inference use case catalog
- model orchestration flow
- provenance/audit rules for model outputs
- clinician review UX spec

---

# Phase 9 - Hardening, compliance, and scale-up

## Goal
Prepare for real institutional operation.

## Outcomes
- stronger operational posture
- audit/compliance maturity
- repeatable onboarding for multiple institutions

## Tasks
- [ ] Strengthen audit and access review processes
- [ ] Add consent and traceability workflows
- [ ] Add tenant operational dashboards
- [ ] Formalize incident response and support procedures
- [ ] Review HIPAA / ISO / local regulatory readiness gaps
- [ ] Define export/offboarding procedures per tenant

## Deliverables
- compliance gap checklist
- tenant ops runbook
- incident response runbook
- offboarding/export procedure

---

## 12. Codex implementation rules

These rules exist to prevent “creative” engineering detours.

1. **Do not redesign tenancy away from Medplum Projects**
2. **Do not introduce direct SQL mutations into Medplum internals**
3. **Do not build a custom clinical data model when FHIR already covers it**
4. **Do not postpone tenant isolation to a later phase**
5. **Do not treat inference output as authoritative clinical truth**
6. **Do not optimize for generic cloud portability at the expense of AWS production clarity**
7. **Do not build a super-admin-centric runtime unless explicitly approved**

---

## 13. Immediate next actions

1. Freeze this roadmap as the canonical implementation roadmap.
2. Create supporting architecture docs for tenancy, auth, provisioning, and AWS.
3. Start with **Phase 1 and Phase 2**, not with random UI work.
4. Keep local Medplum as the dev baseline until AWS staging is ready.
5. Treat document ingestion + inference as an early product capability, not a distant research fantasy.

---

## 14. References and rationale

- Medplum is a FHIR-native, headless EHR backend with auth, audit logging, APIs, and extensibility, which matches OZRYN’s need for a custom app on top of a standards-based clinical core. fileciteturn0file0
- Medplum supports local full-stack Docker Compose development and AWS self-hosting paths, which aligns with the current dev setup and target production direction. fileciteturn0file1
- FHIR is designed as a resource-oriented interoperability standard with profiles/extensions for custom needs, which supports the decision to keep OZRYN FHIR-first and extension-light. fileciteturn0file2
- The local OAuth demo reinforces that Medplum auth flows are practical building blocks, but OZRYN should still keep product-level identity and tenant mapping explicit. fileciteturn0file3
