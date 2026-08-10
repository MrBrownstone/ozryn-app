# OZRYN Auth And User Management Model

## Current Phase Boundary

This document describes the implemented near-term model for tenants, users, and auth in `ozryn-app`.

Current phase decisions:

- authentication remains Medplum-backed
- tenant isolation remains one Medplum `Project` per customer tenant
- OZRYN Postgres stores tenant bindings only
- Medplum remains the source of truth for users, memberships, access policies, and clinical resources

Deferred to a later phase:

- external IdP login
- deterministic external identity linking
- Medplum token bridging from OZRYN-managed sessions
- patient self-service signup
- custom domains
- hard tenant offboarding

## Ownership Split

### OZRYN operator control plane owns

- creating a tenant
- creating the tenant Medplum `Project`
- creating the root tenant `Organization`
- creating the tenant web `ClientApplication`
- creating the first tenant admin
- optionally inviting the initial bootstrap users
- editing tenant display name and tenant status
- support-only updates to existing tenant memberships

### Tenant admin inside OZRYN owns

- day-to-day user invites
- role updates between `TenantAdmin` and `Staff`
- deactivating and reactivating memberships

### Medplum owns

- `User`
- `ProjectMembership`
- `Practitioner`
- `PractitionerRole`
- `AccessPolicy`
- `Organization`
- Medplum login/session behavior for this phase

## Runtime Auth Shape

The current runtime flow is still browser-direct:

1. OZRYN resolves the active tenant from host or cookie.
2. OZRYN boots the tenant-specific Medplum browser client.
3. The user signs in against the tenant Medplum `ClientApplication`.
4. OZRYN uses the Medplum browser session directly.
5. Tenant-admin features check the active `ProjectMembership.admin` flag before allowing membership management.

This is intentionally not the final auth architecture. It is the current implemented seam that the user-management MVP builds on.

## Membership Model

Human users in this phase are project-scoped `Practitioner` users only.

Roles:

- `TenantAdmin`
  - `ProjectMembership.admin = true`
  - `access` points at the tenant `TenantAdmin` `AccessPolicy`
- `Staff`
  - `ProjectMembership.admin = false`
  - `access` points at the tenant `Staff` `AccessPolicy`

Soft delete semantics:

- removing a user in OZRYN means `ProjectMembership.active = false`
- the membership record is preserved
- reactivation means setting `active = true`
- OZRYN should keep at least one active tenant admin on the project

## Tenant Admin Surface

Tenant admins manage users in OZRYN at `/settings/users`.

Current tenant-admin capabilities:

- list practitioner memberships for the current tenant project
- invite new `Staff` and `TenantAdmin` users
- update membership role
- deactivate/reactivate membership
- best-effort `PractitionerRole` synchronization to the tenant `Organization`

## Future Seam

When OZRYN moves to an external IdP:

- user identity should authenticate with the IdP first
- tenant resolution and membership lookup should happen in OZRYN server flows
- Medplum project-scoped access should be provisioned or exchanged after OZRYN resolves the tenant and user

That future change should replace the authentication entrypoint, not the current tenant-to-project model or the day-to-day membership ownership split.
