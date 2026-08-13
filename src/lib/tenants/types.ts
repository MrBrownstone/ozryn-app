export const TENANT_STATUS_VALUES = ['active', 'disabled'] as const

export type TenantStatus = (typeof TENANT_STATUS_VALUES)[number]

export const TENANT_BOOTSTRAP_STATUS_VALUES = ['ready', 'pending-manual'] as const

export type TenantBootstrapStatus =
  (typeof TENANT_BOOTSTRAP_STATUS_VALUES)[number]

export type TenantBootstrapUserRole = 'TenantAdmin' | 'Staff'

export interface TenantOrganizationAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface TenantOrganizationProfile {
  legalName?: string
  contactEmail: string
  contactPhone?: string
  address?: TenantOrganizationAddress
  timezone?: string
}

export interface TenantRecord {
  id: string
  slug: string
  displayName: string
  status: TenantStatus
  bootstrapStatus: TenantBootstrapStatus
  medplumProjectId: string
  medplumOrganizationId: string | null
  medplumClientId: string
  lastProvisioningError: string | null
  createdAt: string
  updatedAt: string
}

export interface TenantRuntimeConfig {
  slug: string
  displayName: string
  tenantHost: string
  medplumBaseUrl: string
  medplumClientId: string
}

export interface TenantBootstrapUserInput {
  firstName: string
  lastName: string
  email: string
  role: TenantBootstrapUserRole
  password?: string
  sendEmail?: boolean
}

export interface TenantPrimaryAdminInput {
  firstName: string
  lastName: string
  email: string
  password?: string
  sendEmail?: boolean
}

export interface CreateTenantInput {
  slug: string
  displayName: string
  organizationProfile: TenantOrganizationProfile
  primaryAdmin: TenantPrimaryAdminInput
  initialUsers?: TenantBootstrapUserInput[]
}

export interface UpdateTenantInput {
  displayName?: string
  status?: TenantStatus
  organizationProfile?: TenantOrganizationProfile
}

export interface TenantProvisionedUserSummary {
  email: string
  role: TenantBootstrapUserRole
  status: 'invited' | 'pending-manual'
  sendEmail: boolean
  admin: boolean
  membershipId: string | null
  profileReference: string | null
  practitionerRoleId: string | null
  note?: string
}

export interface TenantMembershipSummary {
  membershipId: string
  projectId: string | null
  userReference: string | null
  profileReference: string | null
  userName: string | null
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  role: TenantBootstrapUserRole
  active: boolean
  admin: boolean
  accessPolicyReference: string | null
  accessPolicyName: string | null
  practitionerRoleId: string | null
}

export interface TenantMembershipDirectoryEntry
  extends TenantMembershipSummary {
  tenantSlug: string
  tenantDisplayName: string
}

export interface UpdateTenantMembershipInput {
  role?: TenantBootstrapUserRole
  active?: boolean
}

export interface TenantDetail {
  tenant: TenantRecord
  organizationProfile: TenantOrganizationProfile | null
}

export interface CreateTenantResult {
  tenant: TenantRecord
  createdProjectId: string
  createdClientId: string
  createdOrganizationId: string | null
  invitedUsers: TenantProvisionedUserSummary[]
  manualSteps: string[]
}
