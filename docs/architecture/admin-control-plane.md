# OZRYN Admin Control Plane

## Purpose

Define the operator-only surface used to provision tenants and inspect the Postgres-backed tenant registry without treating the operator as a customer tenant.

## Current Shape

- local admin host: `admin.localhost:<PORT>`
- production admin host: `OZRYN_ADMIN_HOST` (defaults to `admin.ozryn.app`)
- the production Vercel project owns `*.ozryn.app`, including the reserved admin host and slug-derived tenant hosts
- tenant hosts are derived from tenant slug
- tenant provisioning persists tenant bindings in Postgres
- Medplum remains the owner of invited users and project memberships
- operator tooling now supports tenant metadata edits and support-only membership updates
- day-to-day invite and membership management is intentionally delegated to tenant admins inside OZRYN

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

The provisioning credential has a stricter Medplum requirement than the browser
admin-login client:

- it must belong to Medplum's `Super Admin` project
- its `ProjectMembership.admin` field must be `true`
- it must remain server-only because it can create projects and invite users

Use a separate `ClientApplication` for provisioning in production. Reusing the
browser login client is acceptable only for disposable local development, and it
still requires the Super Admin project membership above. A non-admin Super Admin
client can create enough resources to leave a partial tenant, but it cannot
complete protected policy and user-administration operations.

## Provisioning Contract

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

No custom-domain input is part of the current control-plane contract.

Current operator edit scope:

- create/list tenants
- edit tenant `displayName`
- edit tenant `status`
- edit clinic profile fields stored on the Medplum `Organization`
- inspect memberships
- update existing membership role/active state

Out of scope for the operator control plane in this slice:

- creating day-to-day users after bootstrap
- hard delete/offboarding
- patient signup
- external IdP flows

## Persisted Admin Outcome

The admin UI lists tenants from Postgres and shows the Medplum binding OZRYN needs to preserve:

- tenant slug
- display name
- bootstrap status
- Medplum project id
- Medplum client id
- last provisioning error, when present

## Ownership Model

### Operator control plane

- bootstrap the customer tenant
- create the first tenant admin
- optionally add the initial bootstrap users
- repair or adjust existing memberships when support is needed

### Tenant admin in OZRYN runtime

- invite additional staff/admins after bootstrap
- change role between `TenantAdmin` and `Staff`
- deactivate/reactivate memberships

This split keeps platform-level provisioning separate from day-to-day tenant operations while still providing an operator break-glass path.
