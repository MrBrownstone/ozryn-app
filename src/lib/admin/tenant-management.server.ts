import 'server-only'

import type {
  AccessPolicy,
  Organization,
  Practitioner,
  PractitionerRole,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes'

import {
  findTenantRecordBySlug,
  upsertTenantRecord,
} from '@/db/tenant-repository'
import { createProvisioningMedplumClient } from '@/lib/provisioning/medplum.server'
import {
  applyOrganizationDisplayName,
  applyOrganizationProfile,
  assertMembershipUpdateAllowed,
  buildMembershipAccess,
  buildProjectScopeSearchParams,
  extractOrganizationProfile,
  getMembershipAccessPolicyReference,
  normalizeUpdateTenantInput,
  normalizeUpdateTenantMembershipInput,
  summarizeTenantMembership,
} from '@/lib/tenants/management'
import { normalizeSlug } from '@/lib/tenants/slug'
import type {
  TenantBootstrapUserRole,
  TenantDetail,
  TenantMembershipSummary,
  TenantRecord,
  UpdateTenantInput,
  UpdateTenantMembershipInput,
} from '@/lib/tenants/types'

function organizationReference(organizationId: string): string {
  return `Organization/${organizationId}`
}

async function getTenantOrThrow(slug: string): Promise<TenantRecord> {
  const tenant = await findTenantRecordBySlug(normalizeSlug(slug))
  if (!tenant) {
    throw new Error(`Tenant "${slug}" was not found.`)
  }

  return tenant
}

async function listProjectMembershipResources(
  projectId: string,
): Promise<ProjectMembership[]> {
  const medplum = await createProvisioningMedplumClient()
  return medplum.searchResources('ProjectMembership', {
    ...buildProjectScopeSearchParams(projectId),
    'profile-type': 'Practitioner',
    _count: '200',
  })
}

async function listProjectAccessPolicies(
  projectId: string,
): Promise<AccessPolicy[]> {
  const medplum = await createProvisioningMedplumClient()
  return medplum.searchResources('AccessPolicy', {
    ...buildProjectScopeSearchParams(projectId),
    _count: '50',
  })
}

async function readOrganization(
  tenant: TenantRecord,
): Promise<Organization | null> {
  if (!tenant.medplumOrganizationId) {
    return null
  }

  const medplum = await createProvisioningMedplumClient()
  return medplum.readResource('Organization', tenant.medplumOrganizationId)
}

async function readPractitionerMap(
  memberships: ProjectMembership[],
): Promise<Map<string, Practitioner>> {
  const medplum = await createProvisioningMedplumClient()
  const practitionerRefs = Array.from(
    new Set(
      memberships
        .map((membership) => membership.profile?.reference)
        .filter((reference): reference is string =>
          Boolean(reference?.startsWith('Practitioner/')),
        ),
    ),
  )

  const practitioners = await Promise.all(
    practitionerRefs.map(async (reference) => {
      const practitionerId = reference.split('/')[1]
      const practitioner = await medplum.readResource('Practitioner', practitionerId)
      return [reference, practitioner] as const
    }),
  )

  return new Map(practitioners)
}

async function readPractitionerRoleMap(
  organizationId: string | null,
): Promise<Map<string, string>> {
  if (!organizationId) {
    return new Map()
  }

  const medplum = await createProvisioningMedplumClient()
  const practitionerRoles = await medplum.searchResources('PractitionerRole', {
    organization: organizationReference(organizationId),
    _count: '200',
  })

  return new Map(
    practitionerRoles
      .map((role) => [role.practitioner?.reference, role.id] as const)
      .filter(
        (
          entry,
        ): entry is readonly [string, string] => Boolean(entry[0] && entry[1]),
      ),
  )
}

function getPolicyReferenceForRole(
  policies: AccessPolicy[],
  role: TenantBootstrapUserRole,
): Reference<AccessPolicy> {
  const policy = policies.find((candidate) => candidate.name === role)
  if (!policy?.id) {
    throw new Error(`Could not find the ${role} access policy for this tenant.`)
  }

  return {
    reference: `AccessPolicy/${policy.id}`,
  }
}

function getPolicyNameByReference(
  policies: AccessPolicy[],
  reference: string | null,
): string | null {
  if (!reference) {
    return null
  }

  const policyId = reference.split('/')[1]
  return policies.find((policy) => policy.id === policyId)?.name ?? null
}

export async function getTenantDetail(slug: string): Promise<TenantDetail> {
  const tenant = await getTenantOrThrow(slug)
  const organization = await readOrganization(tenant)

  return {
    tenant,
    organizationProfile: organization ? extractOrganizationProfile(organization) : null,
  }
}

export async function updateTenant(
  slug: string,
  input: UpdateTenantInput,
): Promise<TenantDetail> {
  const tenant = await getTenantOrThrow(slug)
  const normalized = normalizeUpdateTenantInput(input)
  const nextDisplayName = normalized.displayName ?? tenant.displayName

  let organization = await readOrganization(tenant)
  if (normalized.organizationProfile && !organization) {
    throw new Error(
      'This tenant does not have a Medplum Organization yet. Resolve the bootstrap issue before editing the clinic profile.',
    )
  }

  if (organization) {
    if (normalized.organizationProfile) {
      const updatedOrganization = applyOrganizationProfile(
        organization,
        nextDisplayName,
        normalized.organizationProfile,
      )
      const medplum = await createProvisioningMedplumClient()
      organization = await medplum.updateResource(updatedOrganization)
    } else if (normalized.displayName) {
      const updatedOrganization = applyOrganizationDisplayName(
        organization,
        normalized.displayName,
      )
      const medplum = await createProvisioningMedplumClient()
      organization = await medplum.updateResource(updatedOrganization)
    }
  }

  const updatedTenant = await upsertTenantRecord({
    ...tenant,
    displayName: nextDisplayName,
    status: normalized.status ?? tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: new Date().toISOString(),
  })

  return {
    tenant: updatedTenant,
    organizationProfile: organization ? extractOrganizationProfile(organization) : null,
  }
}

export async function listTenantMemberships(
  slug: string,
): Promise<TenantMembershipSummary[]> {
  const tenant = await getTenantOrThrow(slug)
  const memberships = await listProjectMembershipResources(tenant.medplumProjectId)
  const [practitioners, practitionerRoles, policies] = await Promise.all([
    readPractitionerMap(memberships),
    readPractitionerRoleMap(tenant.medplumOrganizationId),
    listProjectAccessPolicies(tenant.medplumProjectId),
  ])

  return memberships
    .filter((membership) => membership.id)
    .map((membership) =>
      summarizeTenantMembership({
        membership,
        practitioner: membership.profile?.reference
          ? practitioners.get(membership.profile.reference)
          : undefined,
        accessPolicyName: getPolicyNameByReference(
          policies,
          getMembershipAccessPolicyReference(membership),
        ),
        practitionerRoleId: membership.profile?.reference
          ? practitionerRoles.get(membership.profile.reference) ?? null
          : null,
      }),
    )
    .sort((left, right) => {
      const leftLabel = left.fullName || left.email || left.userName || left.membershipId
      const rightLabel =
        right.fullName || right.email || right.userName || right.membershipId
      return leftLabel.localeCompare(rightLabel)
    })
}

export async function updateTenantMembership(
  slug: string,
  membershipId: string,
  input: UpdateTenantMembershipInput,
): Promise<TenantMembershipSummary> {
  const tenant = await getTenantOrThrow(slug)
  const normalized = normalizeUpdateTenantMembershipInput(input)
  const memberships = await listProjectMembershipResources(tenant.medplumProjectId)
  const targetMembership = memberships.find(
    (membership) => membership.id === membershipId,
  )

  if (!targetMembership?.id) {
    throw new Error('Tenant membership not found.')
  }

  assertMembershipUpdateAllowed(memberships, membershipId, normalized)

  const medplum = await createProvisioningMedplumClient()
  const policies = await listProjectAccessPolicies(tenant.medplumProjectId)
  const nextRole =
    normalized.role ?? (targetMembership.admin ? 'TenantAdmin' : 'Staff')
  const updatedMembership: ProjectMembership = {
    ...targetMembership,
    admin: nextRole === 'TenantAdmin',
    active:
      normalized.active !== undefined
        ? normalized.active
        : targetMembership.active,
    access: buildMembershipAccess(
      nextRole,
      getPolicyReferenceForRole(policies, nextRole),
    ),
  }

  await medplum.updateResource(updatedMembership)

  const updatedMemberships = await listTenantMemberships(slug)
  const updatedSummary = updatedMemberships.find(
    (membership) => membership.membershipId === membershipId,
  )

  if (!updatedSummary) {
    throw new Error('Updated tenant membership could not be reloaded.')
  }

  return updatedSummary
}
