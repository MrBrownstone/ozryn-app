# OZRYN Medplum Provisioning Flow

## Purpose

Define how OZRYN provisions a new tenant, creates the Medplum resources it needs, and persists the durable tenant binding in Postgres.

## Inputs

```ts
type CreateTenantInput = {
  slug: string
  displayName: string
  organizationProfile: {
    contactEmail: string
    legalName?: string
    contactPhone?: string
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }
    timezone?: string
  }
  primaryAdmin: {
    firstName: string
    lastName: string
    email: string
    password?: string
    sendEmail?: boolean
  }
  initialUsers?: Array<{
    firstName: string
    lastName: string
    email: string
    role: 'TenantAdmin' | 'Staff'
    password?: string
    sendEmail?: boolean
  }>
}
```

Required bootstrap information:

- tenant `slug`
- tenant `displayName`
- `organizationProfile.contactEmail`
- primary admin first name
- primary admin last name
- primary admin email

Optional bootstrap information:

- organization legal name
- organization phone
- organization address
- organization timezone
- bootstrap user passwords
- bootstrap invite email delivery
- initial bootstrap users

## Provisioning Sequence

1. Validate slug, display name, and bootstrap users.
2. Validate and normalize the clinic organization profile.
3. Verify that the server-only provisioning client is an admin member of the
   Medplum `Super Admin` project. Stop before creating resources if it is not.
4. Create a Medplum `Project` with `Project/$init`.
5. Create the tenant Medplum `ClientApplication`.
6. Create the root `Organization` when the bootstrap client secret is available.
   - `name = legalName ?? displayName`
   - `alias` stores the display name when legal name differs
   - `telecom` stores clinic email/phone
   - `address` stores clinic location
   - timezone is stored as an OZRYN organization extension when supplied
7. Create default `TenantAdmin`, `Staff`, and `ServiceBot` access policies in the
   new project through the privileged provisioning client.
8. Invite the primary admin and optional initial users as project-scoped `Practitioner` users.
9. Create `PractitionerRole` links to the tenant `Organization` when possible.
10. Persist the tenant row in Postgres.

## Persisted Tenant Binding

After Medplum provisioning, OZRYN stores:

- `slug`
- `displayName`
- `status`
- `bootstrapStatus`
- `medplumProjectId`
- `medplumOrganizationId`
- `medplumClientId`
- `lastProvisioningError`
- timestamps

OZRYN does not store:

- Medplum client secrets
- bootstrap passwords beyond the invite request
- custom domains
- `domains` arrays or canonical-domain metadata
- Medplum users or memberships
- clinic profile copies in Postgres

## Failure Handling

Provisioning is not atomic, so partial failures are captured as:

- `bootstrapStatus = 'pending-manual'`
- `lastProvisioningError` populated with the latest durable manual follow-up summary
- `manualSteps` returned in the API response for immediate operator visibility

Provisioning is intentionally best-effort. If the tenant `Organization`, default policies, or `PractitionerRole` links cannot be completed, OZRYN records the durable tenant binding it does have and surfaces the remaining repair steps.

## Post-Bootstrap Lifecycle

After bootstrap:

- operator support flows may edit tenant metadata and update existing memberships
- tenant admins manage day-to-day invites and membership lifecycle inside OZRYN at `/settings/users`
- deactivation is soft-delete through `ProjectMembership.active = false`
- OZRYN should preserve at least one active tenant admin per tenant project

## Environment Boundary

- `MEDPLUM_BASE_URL` is deployment-wide
- `MEDPLUM_PROVISIONING_CLIENT_ID` and `MEDPLUM_PROVISIONING_CLIENT_SECRET` stay server-only
- the provisioning client's Medplum membership must have `admin = true` in the
  `Super Admin` project
- `MEDPLUM_ADMIN_CLIENT_ID` is used for admin login only
- Tenant rows live in Postgres, not in env vars or repo files

## Production Database Initialization

Production starts with a fresh OZRYN Postgres database. Set the production
`DATABASE_URL` and run `pnpm db:migrate` to create or update the OZRYN schema.
This applies schema migrations only; it does not copy local rows.

Do not import local tenants, users, memberships, or clinical data into
production. New production tenant bindings are created through the operator
control plane and Medplum-backed provisioning flow. Any future migration of
configuration or system data is a separate, explicit migration with its own
scope and validation.

The OZRYN database is separate from Medplum's Postgres database. OZRYN schema
migrations must never target Medplum's database.
