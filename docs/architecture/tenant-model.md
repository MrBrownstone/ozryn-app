# OZRYN Tenant Model

## Purpose

Define the tenant record OZRYN must persist in its own platform database and the parts that remain owned by Medplum.

## Core Rules

1. One OZRYN tenant maps to one Medplum `Project`.
2. The Medplum `Project` is the real cross-tenant PHI boundary.
3. OZRYN stores only the durable binding needed to resolve a tenant and bootstrap the correct Medplum client.
4. OZRYN does not store Medplum users, memberships, access policies, or clinical data.
5. The admin control plane is not a tenant and must never resolve through the tenant table.
6. No custom domains are in scope yet.
7. The tenant host is derived from the tenant `slug`, not stored as primary data.

## Tenant Table

The platform source of truth is now a Postgres `tenant` table with the following shape:

```ts
type TenantRecord = {
  id: string
  slug: string
  displayName: string
  status: 'active' | 'disabled'
  bootstrapStatus: 'ready' | 'pending-manual'
  medplumProjectId: string
  medplumOrganizationId: string | null
  medplumClientId: string
  lastProvisioningError: string | null
  createdAt: string
  updatedAt: string
}
```

## What OZRYN Persists

- `slug`: stable internal tenant key and routing prefix
- `displayName`: UI label for the tenant
- `status`: soft-disable switch for tenant resolution
- `bootstrapStatus`: whether provisioning completed cleanly
- `medplumProjectId`: Medplum isolation boundary
- `medplumOrganizationId`: root tenant business identity inside that project
- `medplumClientId`: Medplum `ClientApplication` used by OZRYN runtime login
- `lastProvisioningError`: latest durable summary of partial bootstrap/manual follow-up
- timestamps

## What OZRYN Does Not Persist

- Custom domains
- Canonical domain flags
- Medplum client secrets
- Medplum users and `ProjectMembership` records
- Medplum `AccessPolicy` resources
- PHI-bearing FHIR resources

Those remain in Medplum or, for secrets, in environment variables or a future secret manager.

## Host Derivation

The tenant hostname is derived from `slug`:

- local development: `slug.localhost:<PORT>`
- production: `slug.<OZRYN_PUBLIC_BASE_DOMAIN>`

The admin control-plane host is configured separately with `OZRYN_ADMIN_HOST`.

Because the host is derived, OZRYN does not need a tenant-domain table yet.

## Runtime Config

The browser receives a runtime-safe config derived from the database row plus deployment config:

```ts
type TenantRuntimeConfig = {
  slug: string
  displayName: string
  tenantHost: string
  medplumBaseUrl: string
  medplumClientId: string
}
```

`medplumBaseUrl` comes from `MEDPLUM_BASE_URL`, not from tenant-specific storage.
