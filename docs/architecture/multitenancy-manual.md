# OZRYN Multitenancy Manual

## Short Version

OZRYN uses **one Medplum project per customer tenant**.

The Medplum `Project` is the hard isolation boundary for clinical data.
OZRYN now keeps only a small tenant registry in Postgres so it can:

- resolve a tenant from a slug-derived host
- bootstrap the correct Medplum `ClientApplication`
- show tenant state in the admin control plane

Everything else stays in Medplum.

## Ownership Split

### OZRYN Postgres owns

- tenant slug
- tenant display name
- tenant status
- tenant bootstrap status
- Medplum project id
- Medplum root organization id
- Medplum tenant client id
- last provisioning error
- timestamps

### Medplum owns

- users
- `ProjectMembership` records
- `AccessPolicy` records
- `Practitioner`, `Organization`, `Patient`, `Observation`, `CarePlan`, and other FHIR resources
- the actual authorization boundary

## Runtime Resolution

Tenant resolution now works like this:

1. Admin host short-circuit: `admin.localhost:<PORT>` or `OZRYN_ADMIN_HOST`
2. Host-derived slug lookup:
   - `tenant.localhost:<PORT>`
   - `tenant.<OZRYN_PUBLIC_BASE_DOMAIN>`
3. Tenant cookie override on shared/local flows
4. No match -> no tenant

There is no flat-file registry fallback anymore.

## Why There Is No Domain Table Yet

OZRYN's own slug-derived hosts are supported without a domain table. The Vercel
project receives `*.ozryn.app`, and runtime code resolves the first hostname
label against the Postgres tenant registry. `admin.ozryn.app` is reserved before
tenant lookup.

Custom customer-owned domains are out of scope for the current implementation.

Because every tenant host is derived from `slug`, OZRYN does not need to persist:

- `domains`
- `canonicalDomain`
- domain verification state

If custom domains return later, that can be added as a separate concern without changing the tenant-to-Medplum binding model.

The wildcard is not a trust boundary. It only sends requests to the deployment;
the application still rejects unknown, disabled, and reserved tenant slugs.

## Login Model

Runtime auth is still browser-direct through Medplum:

- OZRYN resolves the tenant first
- OZRYN sends the tenant-specific `medplumClientId` to the browser
- the browser uses that client to start the Medplum login flow

Browser Medplum storage is still namespaced by tenant slug so local sessions do not overwrite one another.

## Migration Note

The old `data/tenants.local.json` registry is no longer used at runtime.
If local data exists there, it can be imported with the dedicated legacy import script before the file is discarded.

That importer is a local compatibility tool. It is not part of production
bootstrap and must not be used to copy local tenants into production.
