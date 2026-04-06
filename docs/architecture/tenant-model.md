# OZRYN Tenant Model

## Purpose

Define the canonical tenant, domain, and Medplum mapping model for OZRYN MVP.

This document freezes the following decisions:

- One customer organization equals one Medplum `Project`
- Each Medplum `Project` contains one root `Organization`
- The OZRYN operator control plane is not a tenant
- Cross-tenant PHI isolation is enforced by Medplum `Project` boundaries
- All human users are project-scoped for MVP
- `ozryn.app` is the production wildcard base domain
- Local development uses `localhost`
- Custom domains are supported in MVP

## Core Rules

1. The primary tenant isolation boundary is the Medplum `Project`.
2. The `Organization` resource models the tenant inside that project; it is not the cross-tenant security boundary.
3. A tenant can have multiple domains, but exactly one tenant record.
4. A tenant slug is stable, unique, lowercase, and URL-safe.
5. Runtime application code must never use super-admin credentials.
6. Tenant lookup must happen before Medplum client bootstrap.
7. Admin/control-plane hosts must short-circuit tenant resolution and never resolve to a tenant record.

## Tenant Record

The app needs a source of truth that maps an incoming hostname to a tenant and then to the correct Medplum resources.

```ts
type TenantSlug = string;

type TenantRecord = {
  slug: TenantSlug;
  displayName: string;
  status: 'active' | 'disabled';
  domains: string[];
  canonicalDomain: string;
  medplumBaseUrl: string;
  medplumProjectId: string;
  medplumOrganizationId: string;
  medplumClientId: string;
};
```

## Field Definitions

- `slug`: Stable internal tenant key. Example: `princeton`
- `displayName`: Human-readable tenant name. Example: `Princeton Hospital`
- `status`: Used to disable tenant resolution without deleting records
- `domains`: All hostnames that resolve to the tenant
- `canonicalDomain`: Preferred public hostname for redirects and login UX
- `medplumBaseUrl`: Medplum server base URL for the tenant environment
- `medplumProjectId`: Isolated Medplum project for the tenant
- `medplumOrganizationId`: Root `Organization` for the tenant inside that project
- `medplumClientId`: Tenant-specific `ClientApplication` used by the OZRYN web app

## Slug Rules

A slug is the tenant's stable routing identifier.

Examples:

- `princeton.ozryn.app` -> slug `princeton`
- `jhopkins.ozryn.app` -> slug `jhopkins`

The slug is not the display name and should not depend on custom domains.

This is valid:

```ts
{
  slug: 'princeton',
  displayName: 'Princeton Hospital',
  domains: ['princeton.ozryn.app', 'ehr.princetonhospital.org'],
}
```

## Domain Model

### Production

Production supports both:

- one dedicated admin control-plane host: `admin.ozryn.app`
- Wildcard tenant subdomains under `ozryn.app`
- Exact-match custom domains owned by customers

Examples:

- `admin.ozryn.app`
- `princeton.ozryn.app`
- `jhopkins.ozryn.app`
- `ehr.princetonhospital.org`

### Local Development

Local development does not require `ozryn.app`.

Preferred local host patterns:

- `admin.localhost:3000`
- `princeton.localhost:3000`
- `jhopkins.localhost:3000`

Fallback local development mode:

- `localhost:3000?tenant=princeton`

The host-based path is preferred because it mirrors production tenant resolution more closely.

## Hostname Resolution Order

Incoming requests resolve tenants in this order:

1. Admin control-plane host such as `admin.localhost` or `admin.ozryn.app` -> no tenant resolution
2. Exact custom domain match
3. Exact local host match such as `tenant.localhost`
4. Production wildcard subdomain match under `*.ozryn.app`
5. Explicit local development override such as `?tenant=princeton`
6. No match -> show tenant-not-found or platform landing page

## Canonical Domain Policy

Each tenant has one canonical domain.

Rules:

- If a tenant has a verified custom domain, it becomes canonical
- Otherwise the canonical domain is `slug.ozryn.app`
- Non-canonical domains redirect to the canonical domain

This prevents duplicate routing behavior and keeps login/session behavior predictable.

## Reserved Hosts

These values must not be assignable as tenant slugs:

- `www`
- `app`
- `admin`
- `api`
- `docs`

The `admin` reservation is intentional because it belongs to the OZRYN control plane, not to a customer tenant.

## Medplum Mapping Rules

For each tenant:

- exactly one Medplum `Project`
- exactly one root `Organization`
- exactly one OZRYN web `ClientApplication` in that project
- zero shared PHI resources across projects

If OZRYN later needs shared catalogs or templates, they belong in a separate non-PHI shared project, not in customer projects.

## Local Registry for MVP

For MVP and local development, the tenant registry can live in a local app-managed file rather than a database.

Example shape:

```ts
export const tenants: TenantRecord[] = [
  {
    slug: 'princeton',
    displayName: 'Princeton Hospital',
    status: 'active',
    domains: ['princeton.localhost:3000', 'princeton.ozryn.app'],
    canonicalDomain: 'princeton.ozryn.app',
    medplumBaseUrl: 'http://localhost:8103',
    medplumProjectId: 'project-id',
    medplumOrganizationId: 'organization-id',
    medplumClientId: 'client-id',
  },
];
```

This is a development convenience only. The long-term production source of truth should be a dedicated platform store.

## Security Requirements

- Tenant resolution must happen on the server before privileged operations
- The tenant registry must not contain client secrets
- The browser receives only tenant-safe public values such as `clientId` and `baseUrl`
- Super-admin or provisioning credentials stay server-only
- A user authenticated for one tenant must never be silently rebound to another tenant

## Non-Goals for This Phase

- External IdP integration
- Cross-project user bridging
- Shared clinician identities across customer tenants
- Multi-organization compartments inside a single customer project

## References

- [Platforms Guide: Multi-Tenant Platforms Quickstart](https://platforms.guide/platforms/docs/multi-tenant-platforms/quickstart)
- [Vercel Platforms reference repository](https://github.com/vercel/platforms)
- [Medplum Projects](https://www.medplum.com/docs/access/projects)
- `docs/architecture/admin-control-plane.md`
