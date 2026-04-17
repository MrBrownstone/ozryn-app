# OZRYN Admin Control Plane

## Purpose

Define the operator-only surface used to provision tenants and inspect the Postgres-backed tenant registry without treating the operator as a customer tenant.

## Current Shape

- local admin host: `admin.localhost:<PORT>`
- production admin host: `OZRYN_ADMIN_HOST`
- tenant hosts are derived from tenant slug
- tenant provisioning persists tenant bindings in Postgres
- Medplum remains the owner of invited users and project memberships

## Auth Model

For the current phase:

- the operator signs into the OZRYN admin UI using the Medplum admin client
- OZRYN creates its own signed admin session cookie
- privileged Medplum writes use the server-only provisioning client

Current env vars:

- `MEDPLUM_BASE_URL`
- `MEDPLUM_ADMIN_CLIENT_ID`
- `OZRYN_ADMIN_ALLOWED_EMAILS`
- `OZRYN_ADMIN_SESSION_SECRET`
- `MEDPLUM_PROVISIONING_CLIENT_ID`
- `MEDPLUM_PROVISIONING_CLIENT_SECRET`
- `DATABASE_URL`
- `OZRYN_ADMIN_HOST`
- `OZRYN_PUBLIC_BASE_DOMAIN`

## Provisioning Contract

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

No custom-domain input is part of the current control-plane contract.

## Persisted Admin Outcome

The admin UI lists tenants from Postgres and shows the Medplum binding OZRYN needs to preserve:

- tenant slug
- display name
- bootstrap status
- Medplum project id
- Medplum client id
- last provisioning error, when present
