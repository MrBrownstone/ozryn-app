# OZRYN Multitenancy Manual

## Purpose

This document explains how multitenancy works in OZRYN today, how it maps onto Medplum's architecture, and which parts are current implementation versus target architecture.

Use this as the narrative companion to:

- `docs/architecture/tenant-model.md`
- `docs/architecture/provisioning-flow.md`
- `docs/architecture/local-medplum-dev-notes.md`

## The Short Version

The core OZRYN tenancy decision is:

- one customer workspace equals one OZRYN tenant
- one OZRYN tenant equals one Medplum `Project`

Inside that Medplum `Project`, OZRYN expects:

- one root `Organization`
- one OZRYN web `ClientApplication`
- tenant-scoped `ProjectMembership` records for users
- tenant-internal `AccessPolicy` records for role-based access
- tenant clinical data such as `Patient`, `Observation`, and `CarePlan`

The Medplum `Project` is the hard isolation boundary.
The `Organization` is the business/domain model for the customer inside that project.
Those are not the same thing.

## How OZRYN Maps To Medplum

| OZRYN concept | Medplum concept | What it means in practice |
| --- | --- | --- |
| Tenant | `Project` | The real customer isolation boundary. No PHI should cross this line. |
| Tenant business identity | `Organization` | The tenant's root organization inside its own project. Useful for roles, branding, and domain modeling. |
| Tenant web login app | `ClientApplication` | The OAuth client the OZRYN web app uses for that tenant's Medplum login flow. |
| Tenant admin or staff user | `User` + profile resource + `ProjectMembership` | Human access is bound to the tenant project through membership. |
| Tenant role model | `AccessPolicy` | Used for authorization within a tenant project, not for cross-customer isolation. |
| Provisioning plane | Super-admin or provisioning `ClientApplication` | Server-only client used to create projects, clients, invites, and bootstrap resources. |
| Shared non-PHI catalogs later | Linked project or separate shared project | Potential future pattern for terminology or templates, never for customer PHI. |

## The Important Medplum Distinction

Medplum supports two different tenancy shapes:

1. Project isolation
2. Multi-tenant access control inside a single project using compartments and parameterized access policies

OZRYN intentionally chooses the first model for customer isolation.

That matters because Medplum's own docs describe `Project` as the primary access-control mechanism and a hard boundary between FHIR resources. Medplum also documents a separate single-project multi-tenant pattern based on `meta.compartment` and parameterized `AccessPolicy` rules. OZRYN does not use that single-project pattern as its customer boundary.

For OZRYN:

- customer A data lives in project A
- customer B data lives in project B
- `AccessPolicy` mistakes inside one project should not expose another customer's PHI, because the other customer is in a different project

This is the cleanest match for OZRYN's current constraints:

- PHI mixing across customers is forbidden
- offboarding/export should be simpler
- audit boundaries should be obvious
- the app should not rely on subtle policy filtering for the top-level customer boundary

## What The Tenant Record Represents

For local MVP, OZRYN stores tenant metadata in `data/tenants.local.json`.

The source type is `TenantRecord` in `src/lib/tenants/types.ts`.

At a high level, each record contains:

- routing identity: `slug`, `domains`, `canonicalDomain`
- display metadata: `displayName`
- Medplum mapping: `medplumBaseUrl`, `medplumProjectId`, `medplumOrganizationId`, `medplumClientId`
- bootstrap state: `bootstrapStatus`, `manualSteps`
- lifecycle metadata: `status`, `createdAt`, `updatedAt`

Important boundary:

- the registry does store Medplum project and client ids
- the registry does not store client secrets or super-admin credentials

The browser only receives the safe runtime subset exposed as `TenantRuntimeConfig`:

- `slug`
- `displayName`
- `canonicalDomain`
- `domains`
- `medplumBaseUrl`
- `medplumClientId`

That split is intentional. The runtime app needs enough information to bootstrap the correct tenant login flow, but not enough to provision or administer Medplum globally.

## Current Runtime Flow

### 1. Tenant resolution happens before Medplum bootstrap

The root layout calls `resolveTenantRuntimeForRequest()` before creating the Medplum client.

Current implementation order in `src/lib/tenants/runtime.server.ts` is:

1. exact configured host/domain match
2. derived slug from `*.localhost` or `*.ozryn.app`
3. tenant cookie override (`ozryn-tenant`)
4. fallback single-tenant env config only when no registry tenants exist

This is important because the app chooses the Medplum client id and Medplum base URL from the resolved tenant before React providers are initialized.

In other words:

- request comes in
- OZRYN resolves tenant
- OZRYN boots the matching Medplum client
- only then does the app render

That keeps tenant selection ahead of auth/bootstrap instead of trying to swap tenants after a session is already active.

### 2. The provider tree is tenant-aware

`src/app/providers.tsx` receives `TenantRuntimeConfig | null`.

If a tenant exists, OZRYN:

- configures a tenant-specific `MedplumClient`
- wraps the app in `MedplumProvider`
- exposes the resolved tenant in `TenantRuntimeProvider`

This is why downstream features such as patient search do not import a single global Medplum singleton anymore. They read the currently configured tenant client.

### 3. Browser auth is still direct-to-Medplum

Current local runtime auth is browser-direct through the Medplum SDK.

On the login page:

- the app fetches current tenant context and the list of configured tenants from `/api/tenant-runtime`
- if the current host already maps to a tenant, that workspace is host-locked
- otherwise the shared login surface asks the user to pick a workspace first
- OZRYN persists the selected tenant slug with `/api/tenant-select`
- OZRYN creates a Medplum client for that tenant and calls `startLogin()`
- if Medplum returns an auth code, OZRYN calls `processCode()`

There is also a session-finalization helper in `src/app/login/util.ts` for explicit profile/project binding, but it is not yet wired into the active login page path end to end.

So the current runtime is tenant-aware, but it is not yet using OZRYN-managed server sessions.

### 4. Tenant login is tied to the tenant client

Each tenant has its own Medplum `ClientApplication`.

That means:

- Princeton users authenticate against Princeton's Medplum client id
- Rendal users authenticate against Rendal's Medplum client id
- switching tenants means switching which Medplum client the browser bootstraps

This is the key reason multitenant local development now works without editing `NEXT_PUBLIC_MEDPLUM_CLIENT_ID` between logins.

### 5. Session storage is namespaced per tenant

`src/lib/medplum.ts` uses a custom `TenantScopedBrowserStorage`.

The storage namespace is:

`ozryn-medplum:<tenant-slug>`

This prevents one tenant's saved Medplum session from overwriting another tenant's session when both are accessed from the same browser origin during local development.

That storage isolation is a convenience and correctness feature.
It is not the primary security boundary.
The primary security boundary is still the Medplum `Project`.

### 6. Unauthenticated redirects stay tenant-aware

If the current Medplum client becomes unauthenticated, the runtime redirect is:

`/login?tenant=<slug>`

That preserves tenant context during recovery and avoids dropping the user onto an unscoped global login screen.

### 7. User context is tenant-local

`src/lib/session.ts` resolves the current profile from the active Medplum session and tries to infer organization from `PractitionerRole`.

That helper is useful for application behavior, but it is not the real tenant guard.
The real guard is:

- which Medplum project the session belongs to
- which `ProjectMembership` and `AccessPolicy` Medplum applies

## What Is Actually Multitenant Today

Today, the following parts are already real:

- a shared OZRYN app instance can resolve different tenants at runtime
- each tenant can point to a different Medplum project/client pair
- the login screen can switch between tenants without env-var swapping
- tenant auth state in the browser is namespaced per tenant
- the UI shell can display the active tenant context
- provisioning can create tenant records and the matching Medplum project/client scaffolding

## What Is Not Done Yet

These are still future or partial:

- OZRYN-managed server session cookies for normal app auth
- external IdP as the primary identity layer
- deterministic user linking across tenants or across projects
- fully automated custom-domain verification and wiring
- production-grade hostname routing beyond the current local selector/cookie path
- automated creation and attachment of tenant `AccessPolicy` templates
- a persistent production-grade tenant registry store outside the local JSON file

There is also one practical nuance worth calling out:

- `docs/architecture/tenant-model.md` mentions a `?tenant=` override in the resolution order
- the current root-layout runtime path does not resolve tenants from the query string
- today the query parameter is mainly used by the login flow to preselect or preserve workspace context

So the architectural intent and the exact current runtime behavior are close, but not identical.

## Provisioning Flow

Provisioning lives on the server side and uses privileged Medplum credentials that must never reach the browser.

Current flow in `src/lib/provisioning/create-tenant.ts`:

1. validate slug, display name, admin data, and domains
2. log into Medplum with the provisioning client
3. create a new Medplum `Project` using `Project/$init`
4. create a tenant web `ClientApplication` in that project
5. try to create the root `Organization` using the project-scoped client
6. invite the first tenant admin with project scope
7. record manual follow-up steps that are still deferred
8. write the resulting `TenantRecord` to the local registry

The `/api/admin/tenants` route is protected by `OZRYN_PROVISIONING_API_KEY`, and the provisioning client uses:

- `MEDPLUM_PROVISIONING_CLIENT_ID`
- `MEDPLUM_PROVISIONING_CLIENT_SECRET`

Important limitation:

- the code intentionally does not yet create and attach final tenant `AccessPolicy` templates
- that work is still recorded as a manual step

So provisioning already creates the isolation boundary and the tenant-facing client, but the in-tenant RBAC layer is still partly manual.

## How To Think About The Security Boundary

There are several layers in play, and they are not equally important.

### Hard boundary

The hard cross-customer boundary is:

- one tenant per Medplum `Project`

That boundary is enforced by Medplum's project isolation model.

### Domain-model boundary

The domain-model anchor inside the tenant is:

- one root `Organization`

This is important for practitioner roles, future branding, and tenant metadata.
It is not the top-level security boundary by itself.

### Auth bootstrap boundary

The runtime auth bootstrap boundary is:

- one tenant-specific `ClientApplication` per tenant

This ensures OZRYN logs into the right Medplum project for the chosen tenant.

### Authorization boundary inside the tenant

The in-tenant authorization layer is:

- `ProjectMembership`
- `AccessPolicy`

This is where OZRYN will differentiate tenant admins, staff, service bots, and later other roles.

## How This Compares To Medplum's Single-Project Multi-Tenant Pattern

Medplum's multi-tenant access-control guide shows how to keep many tenants inside one Medplum project by:

- modeling tenants as FHIR resources such as `Organization`
- assigning tenant labels through compartments
- restricting access through parameterized `AccessPolicy` rules

That is a valid Medplum pattern.
It is just not OZRYN's customer-isolation pattern.

For OZRYN, that Medplum pattern is more relevant as a possible future tool inside a single customer environment, for example:

- multiple departments inside one customer
- internal sub-organizations inside one customer project
- controlled sharing patterns inside a single tenant

It is not the mechanism OZRYN relies on to separate one customer from another.

## Recommended Reading Order

If someone is onboarding to this part of the codebase, read in this order:

1. this document
2. `docs/architecture/tenant-model.md`
3. `docs/architecture/provisioning-flow.md`
4. `docs/architecture/local-medplum-dev-notes.md`
5. `src/lib/tenants/runtime.server.ts`
6. `src/lib/medplum.ts`
7. `src/app/login/page.tsx`
8. `src/lib/provisioning/create-tenant.ts`

## Practical Rules To Preserve

When changing this architecture, preserve these invariants unless there is an explicit redesign:

- do not collapse multiple customer tenants into one Medplum project
- do not treat `Organization` as the top-level cross-customer boundary
- do not expose provisioning credentials to the browser
- do not store client secrets in the tenant registry
- do not let tenant resolution happen after Medplum bootstrap
- do not assume local browser-direct auth means the target server-side auth architecture already exists
- do not use shared Medplum projects for customer PHI

## References

- `src/lib/tenants/types.ts`
- `src/lib/tenants/runtime.server.ts`
- `src/lib/tenants/registry.server.ts`
- `src/lib/medplum.ts`
- `src/app/layout.tsx`
- `src/app/providers.tsx`
- `src/app/login/page.tsx`
- `src/app/api/tenant-runtime/route.ts`
- `src/app/api/tenant-select/route.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/lib/provisioning/create-tenant.ts`
- `src/lib/provisioning/medplum.server.ts`
- `docs/architecture/tenant-model.md`
- `docs/architecture/provisioning-flow.md`
- `docs/architecture/local-medplum-dev-notes.md`
- Medplum Projects: https://www.medplum.com/docs/access/projects
- Medplum Multi-Tenant Access Control: https://www.medplum.com/docs/access/multi-tenant-access-policy
- Medplum Client Application Endpoint: https://www.medplum.com/docs/api/project-admin/client
- Medplum Invite User Endpoint: https://www.medplum.com/docs/api/project-admin/invite
