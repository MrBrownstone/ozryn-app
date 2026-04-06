export type TenantStatus = 'active' | 'disabled'

export type TenantBootstrapStatus = 'ready' | 'pending-manual'

export type TenantBootstrapUserRole = 'TenantAdmin' | 'Staff'

export interface TenantRecord {
  slug: string
  displayName: string
  status: TenantStatus
  bootstrapStatus: TenantBootstrapStatus
  domains: string[]
  canonicalDomain: string
  medplumBaseUrl: string
  medplumProjectId: string
  medplumOrganizationId: string | null
  medplumClientId: string
  createdAt: string
  updatedAt: string
  manualSteps: string[]
}

export interface TenantRuntimeConfig {
  slug: string
  displayName: string
  canonicalDomain: string
  domains: string[]
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
  primaryAdmin: TenantPrimaryAdminInput
  initialUsers?: TenantBootstrapUserInput[]
  customDomains?: string[]
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

export interface CreateTenantResult {
  tenant: TenantRecord
  createdProjectId: string
  createdClientId: string
  createdOrganizationId: string | null
  invitedUsers: TenantProvisionedUserSummary[]
  manualSteps: string[]
}
