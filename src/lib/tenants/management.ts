import type {
  AccessPolicy,
  AccessPolicyResource,
  Address,
  Extension,
  Organization,
  Practitioner,
  ProjectMembership,
  ProjectMembershipAccess,
  Reference,
} from '@medplum/fhirtypes'

import {
  TENANT_STATUS_VALUES,
  type CreateTenantInput,
  type TenantBootstrapUserInput,
  type TenantBootstrapUserRole,
  type TenantMembershipSummary,
  type TenantOrganizationAddress,
  type TenantOrganizationProfile,
  type UpdateTenantInput,
  type UpdateTenantMembershipInput,
} from '@/lib/tenants/types'
import { validateSlug } from '@/lib/tenants/slug'

export const OZRYN_ORGANIZATION_TIMEZONE_EXTENSION_URL =
  'https://ozryn.app/fhir/StructureDefinition/organization-timezone'

export const STAFF_CLINICAL_WRITE_RESOURCE_TYPES = [
  'Patient',
  'Observation',
  'Task',
  'DocumentReference',
] as const

export const STAFF_CLINICAL_READ_RESOURCE_TYPES = [
  'CarePlan',
  'Condition',
  'DiagnosticReport',
  'Encounter',
  'MedicationRequest',
  'Organization',
  'Practitioner',
  'PractitionerRole',
  'Procedure',
] as const

export function buildProjectScopeSearchParams(projectId: string): {
  _project: string
} {
  return {
    _project: requireText(projectId, 'Medplum project id'),
  }
}

export interface NormalizedBootstrapUser extends TenantBootstrapUserInput {
  email: string
  sendEmail: boolean
  isPrimaryAdmin: boolean
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function requireText(value: string | undefined, label: string): string {
  const normalized = normalizeText(value)
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }

  return normalized
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', {
      timeZone: value,
    }).format(new Date())
    return true
  } catch {
    return false
  }
}

function normalizeAddress(
  address: TenantOrganizationAddress | undefined,
): TenantOrganizationAddress | undefined {
  if (!address) {
    return undefined
  }

  const normalized = {
    line1: normalizeText(address.line1),
    line2: normalizeText(address.line2),
    city: normalizeText(address.city),
    state: normalizeText(address.state),
    postalCode: normalizeText(address.postalCode),
    country: normalizeText(address.country),
  }

  return Object.values(normalized).some(Boolean) ? normalized : undefined
}

export function normalizeOrganizationProfile(
  profile: TenantOrganizationProfile,
): TenantOrganizationProfile {
  return {
    legalName: normalizeText(profile.legalName),
    contactEmail: normalizeEmail(profile.contactEmail),
    contactPhone: normalizeText(profile.contactPhone),
    address: normalizeAddress(profile.address),
    timezone: normalizeText(profile.timezone),
  }
}

export function assertOrganizationProfile(
  profile: TenantOrganizationProfile | undefined,
  label = 'Organization profile',
): TenantOrganizationProfile {
  if (!profile) {
    throw new Error(`${label} is required.`)
  }

  const normalized = normalizeOrganizationProfile(profile)
  requireText(normalized.contactEmail, `${label} contact email`)

  if (normalized.timezone && !isValidTimezone(normalized.timezone)) {
    throw new Error(`${label} timezone must be a valid IANA timezone.`)
  }

  return normalized
}

function assertHumanUser(
  user: {
    firstName?: string
    lastName?: string
    email?: string
  },
  label: string,
): void {
  requireText(user.firstName, `${label} first name`)
  requireText(user.lastName, `${label} last name`)
  requireText(user.email, `${label} email`)
}

function normalizeBootstrapUser(
  user: TenantBootstrapUserInput,
  isPrimaryAdmin = false,
): NormalizedBootstrapUser {
  return {
    firstName: requireText(user.firstName, 'User first name'),
    lastName: requireText(user.lastName, 'User last name'),
    email: normalizeEmail(requireText(user.email, 'User email')),
    password: normalizeText(user.password),
    sendEmail: Boolean(user.sendEmail),
    role: user.role,
    isPrimaryAdmin,
  }
}

export function normalizeBootstrapUsers(
  input: CreateTenantInput,
): NormalizedBootstrapUser[] {
  const primaryAdmin = normalizeBootstrapUser(
    {
      ...input.primaryAdmin,
      role: 'TenantAdmin',
    },
    true,
  )

  const initialUsers = (input.initialUsers ?? []).map((user) =>
    normalizeBootstrapUser(user),
  )

  return [primaryAdmin, ...initialUsers]
}

export function assertCreateTenantInput(
  input: CreateTenantInput,
): NormalizedBootstrapUser[] {
  const slugError = validateSlug(input.slug)
  if (slugError) {
    throw new Error(slugError)
  }

  requireText(input.displayName, 'Display name')
  assertOrganizationProfile(input.organizationProfile)
  assertHumanUser(input.primaryAdmin, 'Primary admin')

  const bootstrapUsers = normalizeBootstrapUsers(input)
  for (const user of bootstrapUsers) {
    assertHumanUser(
      user,
      user.isPrimaryAdmin ? 'Primary admin' : `Initial ${user.role}`,
    )

    if (user.role !== 'TenantAdmin' && user.role !== 'Staff') {
      throw new Error(`Unsupported bootstrap role "${user.role}".`)
    }
  }

  const uniqueEmails = new Set(bootstrapUsers.map((user) => user.email))
  if (uniqueEmails.size !== bootstrapUsers.length) {
    throw new Error('Every bootstrap user must have a unique email address.')
  }

  return bootstrapUsers
}

export function normalizeUpdateTenantInput(
  input: UpdateTenantInput,
): UpdateTenantInput {
  const displayName = input.displayName ? requireText(input.displayName, 'Display name') : undefined
  const status = input.status?.trim() as UpdateTenantInput['status']

  if (status && !TENANT_STATUS_VALUES.includes(status)) {
    throw new Error(`Unsupported tenant status "${status}".`)
  }

  const organizationProfile = input.organizationProfile
    ? assertOrganizationProfile(input.organizationProfile)
    : undefined

  if (!displayName && !status && !organizationProfile) {
    throw new Error('At least one tenant field must be provided.')
  }

  return {
    ...(displayName ? { displayName } : undefined),
    ...(status ? { status } : undefined),
    ...(organizationProfile ? { organizationProfile } : undefined),
  }
}

function toAddress(address: TenantOrganizationAddress | undefined): Address[] | undefined {
  if (!address) {
    return undefined
  }

  return [
    {
      line: [address.line1, address.line2].filter(Boolean) as string[],
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    },
  ]
}

function mergeTimezoneExtension(
  existing: Extension[] | undefined,
  timezone: string | undefined,
): Extension[] | undefined {
  const retained = (existing ?? []).filter(
    (extension) => extension.url !== OZRYN_ORGANIZATION_TIMEZONE_EXTENSION_URL,
  )

  if (!timezone) {
    return retained.length > 0 ? retained : undefined
  }

  return [
    ...retained,
    {
      url: OZRYN_ORGANIZATION_TIMEZONE_EXTENSION_URL,
      valueString: timezone,
    },
  ]
}

export function buildOrganizationProfileFields(
  displayName: string,
  profile: TenantOrganizationProfile,
  existingExtensions?: Extension[],
): Pick<Organization, 'name' | 'alias' | 'telecom' | 'address' | 'extension'> {
  const normalizedDisplayName = requireText(displayName, 'Display name')
  const normalizedProfile = assertOrganizationProfile(profile)
  const legalName = normalizedProfile.legalName
  const organizationName = legalName ?? normalizedDisplayName
  const alias =
    legalName && legalName !== normalizedDisplayName
      ? [normalizedDisplayName]
      : undefined

  return {
    name: organizationName,
    alias,
    telecom: [
      {
        system: 'email',
        value: normalizedProfile.contactEmail,
      },
      ...(normalizedProfile.contactPhone
        ? [
            {
              system: 'phone',
              value: normalizedProfile.contactPhone,
            } as const,
          ]
        : []),
    ],
    address: toAddress(normalizedProfile.address),
    extension: mergeTimezoneExtension(
      existingExtensions,
      normalizedProfile.timezone,
    ),
  }
}

export function applyOrganizationProfile(
  organization: Organization,
  displayName: string,
  profile: TenantOrganizationProfile,
): Organization {
  return {
    ...organization,
    ...buildOrganizationProfileFields(displayName, profile, organization.extension),
  }
}

export function applyOrganizationDisplayName(
  organization: Organization,
  displayName: string,
): Organization {
  const normalizedDisplayName = requireText(displayName, 'Display name')
  const currentAlias = organization.alias?.[0]
  const hasSeparateLegalName =
    Boolean(currentAlias) &&
    Boolean(organization.name) &&
    organization.name !== currentAlias

  return {
    ...organization,
    ...(hasSeparateLegalName
      ? {
          alias: [normalizedDisplayName],
        }
      : {
          name: normalizedDisplayName,
          alias: undefined,
        }),
  }
}

export function extractOrganizationProfile(
  organization: Organization,
): TenantOrganizationProfile {
  const address = organization.address?.[0]
  const [line1, line2] = address?.line ?? []
  const timezone = organization.extension?.find(
    (extension) => extension.url === OZRYN_ORGANIZATION_TIMEZONE_EXTENSION_URL,
  )?.valueString
  const contactEmail =
    organization.telecom?.find((entry) => entry.system === 'email')?.value ?? ''
  const contactPhone =
    organization.telecom?.find((entry) => entry.system === 'phone')?.value
  const aliasDisplayName = organization.alias?.[0]

  return {
    legalName:
      aliasDisplayName && organization.name && organization.name !== aliasDisplayName
        ? organization.name
        : undefined,
    contactEmail,
    contactPhone,
    address:
      line1 || line2 || address?.city || address?.state || address?.postalCode || address?.country
        ? {
            line1,
            line2,
            city: address?.city,
            state: address?.state,
            postalCode: address?.postalCode,
            country: address?.country,
          }
        : undefined,
    timezone,
  }
}

export function getMembershipAccessPolicyReference(
  membership: ProjectMembership,
): string | null {
  return (
    membership.access?.[0]?.policy?.reference ??
    membership.accessPolicy?.reference ??
    null
  )
}

export function getMembershipRole(
  membership: Pick<ProjectMembership, 'admin'>,
): TenantBootstrapUserRole {
  return membership.admin ? 'TenantAdmin' : 'Staff'
}

export function buildMembershipAccess(
  role: TenantBootstrapUserRole,
  policyReference: Reference<AccessPolicy>,
): ProjectMembershipAccess[] {
  return [
    {
      policy: policyReference,
    },
  ]
}

export function buildTenantAccessPolicyDefinitions(): Record<
  TenantBootstrapUserRole | 'ServiceBot',
  AccessPolicy
> {
  const clinicalWriteInteractions: NonNullable<
    AccessPolicyResource['interaction']
  > = [
    'create',
    'read',
    'update',
    'search',
    'history',
    'vread',
  ]

  return {
    TenantAdmin: {
      resourceType: 'AccessPolicy',
      name: 'TenantAdmin',
      resource: [
        {
          resourceType: '*',
        },
      ],
    },
    Staff: {
      resourceType: 'AccessPolicy',
      name: 'Staff',
      resource: [
        ...STAFF_CLINICAL_WRITE_RESOURCE_TYPES.map((resourceType) => ({
          resourceType,
          interaction: clinicalWriteInteractions,
        })),
        ...STAFF_CLINICAL_READ_RESOURCE_TYPES.map((resourceType) => ({
          resourceType,
          readonly: true,
        })),
      ],
    },
    ServiceBot: {
      resourceType: 'AccessPolicy',
      name: 'ServiceBot',
      resource: [
        {
          resourceType: '*',
          interaction: ['create', 'read', 'update', 'search', 'history', 'vread'],
        },
      ],
    },
  }
}

export function normalizeUpdateTenantMembershipInput(
  input: UpdateTenantMembershipInput,
): UpdateTenantMembershipInput {
  const role = input.role
  const active =
    typeof input.active === 'boolean' ? input.active : undefined

  if (role && role !== 'TenantAdmin' && role !== 'Staff') {
    throw new Error(`Unsupported tenant membership role "${role}".`)
  }

  if (role === undefined && active === undefined) {
    throw new Error('At least one membership field must be provided.')
  }

  return {
    ...(role ? { role } : undefined),
    ...(active !== undefined ? { active } : undefined),
  }
}

export function assertMembershipUpdateAllowed(
  memberships: Array<Pick<ProjectMembership, 'id' | 'active' | 'admin'>>,
  membershipId: string,
  nextInput: UpdateTenantMembershipInput,
): void {
  const target = memberships.find((membership) => membership.id === membershipId)
  if (!target) {
    throw new Error('Membership not found.')
  }

  const currentRole = getMembershipRole(target)
  const nextRole = nextInput.role ?? currentRole
  const currentActive = target.active !== false
  const nextActive = nextInput.active ?? currentActive
  const removesAdminPrivileges =
    currentRole === 'TenantAdmin' && (nextRole !== 'TenantAdmin' || !nextActive)

  if (!removesAdminPrivileges) {
    return
  }

  const activeAdminCount = memberships.filter(
    (membership) => membership.active !== false && membership.admin,
  ).length

  if (activeAdminCount <= 1) {
    throw new Error('Each tenant must retain at least one active tenant admin.')
  }
}

function practitionerName(practitioner: Practitioner | undefined): {
  firstName: string
  lastName: string
  fullName: string
} {
  const primaryName = practitioner?.name?.[0]
  const firstName = primaryName?.given?.join(' ').trim() ?? ''
  const lastName = primaryName?.family?.trim() ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    firstName,
    lastName,
    fullName,
  }
}

export function summarizeTenantMembership(input: {
  membership: ProjectMembership
  practitioner?: Practitioner
  accessPolicyName?: string | null
  practitionerRoleId?: string | null
}): TenantMembershipSummary {
  const { membership, practitioner, accessPolicyName, practitionerRoleId } = input
  const name = practitionerName(practitioner)

  return {
    membershipId: membership.id ?? '',
    projectId: membership.project?.reference?.split('/')[1] ?? null,
    userReference: membership.user?.reference ?? null,
    profileReference: membership.profile?.reference ?? null,
    userName: membership.userName ?? null,
    firstName: name.firstName,
    lastName: name.lastName,
    fullName: name.fullName,
    email:
      membership.userName ??
      practitioner?.telecom?.find((entry) => entry.system === 'email')?.value ??
      null,
    role: getMembershipRole(membership),
    active: membership.active !== false,
    admin: Boolean(membership.admin),
    accessPolicyReference: getMembershipAccessPolicyReference(membership),
    accessPolicyName: accessPolicyName ?? null,
    practitionerRoleId: practitionerRoleId ?? null,
  }
}
