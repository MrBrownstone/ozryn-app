# OZRYN Medplum Provisioning Flow

## Purpose

Define how OZRYN provisions a new tenant, creates the Medplum resources it needs, and persists the durable tenant binding in Postgres.

## Inputs

```ts
type CreateTenantInput = {
  slug: string
  displayName: string
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

## Provisioning Sequence

1. Validate slug, display name, and bootstrap users.
2. Create a Medplum `Project` with `Project/$init`.
3. Create the tenant Medplum `ClientApplication`.
4. Create the root `Organization` when the bootstrap client secret is available.
5. Create default `TenantAdmin`, `Staff`, and `ServiceBot` access policies when possible.
6. Invite the primary admin and optional initial users as project-scoped `Practitioner` users.
7. Create `PractitionerRole` links to the tenant `Organization` when possible.
8. Persist the tenant row in Postgres.

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

## Failure Handling

Provisioning is not atomic, so partial failures are captured as:

- `bootstrapStatus = 'pending-manual'`
- `lastProvisioningError` populated with the latest durable manual follow-up summary
- `manualSteps` returned in the API response for immediate operator visibility

## Environment Boundary

- `MEDPLUM_BASE_URL` is deployment-wide
- `MEDPLUM_PROVISIONING_CLIENT_ID` and `MEDPLUM_PROVISIONING_CLIENT_SECRET` stay server-only
- `MEDPLUM_ADMIN_CLIENT_ID` is used for admin login only
- Tenant rows live in Postgres, not in env vars or repo files
