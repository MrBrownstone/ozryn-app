export type TenantStatus = 'active' | 'disabled'

export type TenantBootstrapStatus = 'ready' | 'pending-manual'

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

export interface CreateTenantInput {
  slug: string
  displayName: string
  firstAdminFirstName: string
  firstAdminLastName: string
  firstAdminEmail: string
  firstAdminPassword?: string
  customDomains?: string[]
}

export interface CreateTenantResult {
  tenant: TenantRecord
  createdProjectId: string
  createdClientId: string
  createdOrganizationId: string | null
  manualSteps: string[]
}
