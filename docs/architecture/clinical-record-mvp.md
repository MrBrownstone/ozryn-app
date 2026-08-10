# OZRYN Clinical Record MVP

## Purpose

Define the first sellable staff-facing clinical workflow while the AWS Medplum staging environment is being prepared.

This slice turns the current read-only dashboard into a basic ficha clinica. It does not replace Medplum as the clinical source of truth and does not introduce a custom OZRYN clinical schema.

## Current Boundary

- Runtime auth remains Medplum-backed and browser-direct for this milestone.
- Each customer tenant remains isolated by one Medplum `Project`.
- OZRYN Postgres stores tenant bindings only.
- Clinical data is created and updated as FHIR R4 resources in Medplum.
- External IdP, patient portal, custom domains, EMPI/deduplication, inference, and full document ingestion are out of scope for this slice.

## FHIR Mapping

### Patient registry

Use `Patient` for the tenant patient record.

OZRYN edits:

- name
- `birthDate`
- `gender`
- MRN in `identifier`
- phone/email in `telecom`
- primary address in `address`
- active/inactive status in `active`

### Clinical data entry

Use `Observation` for basic vitals, lab values, and simple clinical measurements.

Minimum fields:

- `status = final`
- `subject = Patient/{id}`
- `code.text` and optional local coding
- `valueQuantity` when a numeric value/unit is provided
- `effectiveDateTime`
- optional clinician note

### Follow-up tracking

Use `Task` for follow-up actions tied to the patient.

Minimum fields:

- `status`
- `intent = order`
- `priority`
- `description`
- `for = Patient/{id}`
- `authoredOn`
- optional `executionPeriod.end` as due date
- optional `owner` when the active practitioner can be resolved

### Lightweight documents

Use `DocumentReference` for metadata and external references only.

Minimum fields:

- `status = current`
- `subject = Patient/{id}`
- `date`
- `description` / title
- optional `type.text`
- optional `content.attachment.url`

Full S3-backed `Binary` upload, ingestion states, extraction, and human review stay in Phase 4.

## Access Policy Intent

Tenant access policies should split operational authority from clinical work:

- `TenantAdmin`: full tenant administration and clinical access.
- `Staff` / `Clinician`: read/search plus create/update for `Patient`, `Observation`, `Task`, `DocumentReference`, and related clinical resources needed by the ficha clinica.
- `ServiceBot`: controlled automation access for future backend workers.

Staff must not get tenant/user administration privileges through the clinical MVP policy.

## AWS Staging Smoke Criteria

Before using AWS staging for serious demos:

- tenant provisioning creates the Medplum `Project`, root `Organization`, tenant client, policies, and first admin
- tenant admin login works from the tenant host
- staff login works after invite
- patient create/edit works in OZRYN and appears in the same Medplum project
- observation entry works and appears under the patient
- follow-up task create/update works and appears under the patient
- lightweight document references can be added and listed
- a second tenant cannot see the first tenant's test patient
- no real secrets, credentials, or PHI are written to tracked repo files or docs
