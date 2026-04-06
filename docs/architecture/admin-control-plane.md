# OZRYN Admin Control Plane

## Purpose

Define the operator-only control plane used to provision tenants and manage tenant bootstrap users without treating the system admin as a customer tenant.

## Core Decisions

- The platform operator is a Medplum **server-scoped** user, not a tenant user.
- The control plane lives on a dedicated non-tenant host:
  - local dev: `admin.localhost:3000`
  - later production target: `admin.ozryn.app`
- The control plane is separate from tenant runtime and must not resolve through the tenant registry.
- Human operator login and Medplum provisioning credentials are separate concerns:
  - the operator authenticates to the OZRYN admin UI
  - OZRYN server routes perform privileged Medplum writes using server-only provisioning client credentials
- Tenant bootstrap is invite-based and email-first for human users.

## Why The Admin Is Not A Tenant

The system admin is responsible for creating and managing tenant projects.
That is a cross-tenant platform responsibility, so representing the operator as a tenant would blur the tenant boundary and weaken the mental model.

The admin host exists above tenant routing and should never appear in `TenantRecord`.

## Host And Routing Model

### Admin host

- `admin.localhost:3000`
- `admin.ozryn.app`

### Tenant hosts

- `tenant.localhost:3000`
- `tenant.ozryn.app`
- verified custom domains later

### Rules

- admin routes are only valid on the admin host
- tenant hosts must never expose admin pages
- tenant slug `admin` remains reserved and cannot be assigned to a customer
- tenant runtime resolution must short-circuit on the admin host and return no tenant

## Auth Model For This Phase

For MVP/local dev:

- the operator signs into the OZRYN admin UI with a normal Medplum email/password login form
- the current local implementation uses:
  - `MEDPLUM_ADMIN_CLIENT_ID`
  - `OZRYN_ADMIN_ALLOWED_EMAILS`
  - `OZRYN_ADMIN_SESSION_SECRET`
- the Medplum admin client authenticates the operator
- OZRYN then creates its own signed control-plane session cookie
- this does not replace the Medplum provisioning client

For privileged Medplum work:

- OZRYN server uses:
  - `MEDPLUM_PROVISIONING_CLIENT_ID`
  - `MEDPLUM_PROVISIONING_CLIENT_SECRET`
- these credentials must stay server-only
- the browser must never receive them

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
  customDomains?: string[]
}
```

Rules:

- `primaryAdmin` is required
- all bootstrap users are human staff/admin users represented as `Practitioner`
- bootstrap users must have unique email addresses within the request
- bootstrap users are email-first for this phase even though Medplum can support `externalId`
- patients are out of scope for this bootstrap flow

## Bootstrap Sequence

1. Operator signs into the OZRYN admin host.
2. OZRYN server validates the operator session for control-plane routes.
3. OZRYN server uses the Medplum provisioning client to create a new `Project`.
4. OZRYN creates the tenant web `ClientApplication`.
5. OZRYN uses the project-scoped client secret, when available, to create:
   - root `Organization`
   - default `AccessPolicy` resources
6. OZRYN invites the primary admin as a project-scoped `Practitioner`.
7. OZRYN invites any optional initial staff/admin users.
8. OZRYN creates `PractitionerRole` resources linking invited practitioners to the tenant `Organization`.
9. OZRYN persists the tenant registry entry.
10. OZRYN returns unresolved manual steps when the flow is only partially complete.

## Access And Roles

Bootstrap roles for this phase:

- `TenantAdmin`
- `Staff`
- `ServiceBot`

Current local intent:

- `TenantAdmin`: broad project access
- `Staff`: read-only project access for the current app surface
- `ServiceBot`: programmatic read/write access without delete

These are project-local roles.
They are not the cross-customer security boundary.

## Operational Notes

- the admin browser login uses a dedicated Medplum `ClientApplication` in the super admin project
- If `sendEmail` is used in self-hosted Medplum, outbound email infrastructure must be configured.
- If a user is created without `password` and without invite email delivery, password/reset follow-up is manual.
- If tenant bootstrap client secret is unavailable, Organization, AccessPolicy, and PractitionerRole creation must be completed manually.
- Non-admin staff invites should stay manual if the intended `Staff` policy is missing, to avoid over-granting access.

## Out Of Scope

- external IdP for admin login
- self-service tenant signup
- patient bootstrap
- automated sample data import
- automated custom domain verification

## References

- `src/lib/admin/control-plane.ts`
- `src/lib/admin/session.server.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/api/admin/session/route.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/lib/provisioning/create-tenant.ts`
