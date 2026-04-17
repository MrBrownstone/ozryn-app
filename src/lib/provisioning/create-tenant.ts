import 'server-only'

import type {
  AccessPolicy,
  ClientApplication,
  Organization,
  PractitionerRole,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes'

import { upsertTenantRecord } from '@/db/tenant-repository'
import {
  createProjectScopedMedplumClient,
  createProvisioningMedplumClient,
} from '@/lib/provisioning/medplum.server'
import {
  getTenantLoginRedirectUri,
  normalizeSlug,
  validateSlug,
} from '@/lib/tenants/slug'
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantBootstrapUserInput,
  TenantBootstrapUserRole,
  TenantProvisionedUserSummary,
  TenantRecord,
} from '@/lib/tenants/types'

type BootstrapUser = TenantBootstrapUserInput & {
  sendEmail: boolean
  email: string
  isPrimaryAdmin: boolean
}

type PolicyReferences = Partial<
  Record<TenantBootstrapUserRole | 'ServiceBot', Reference<AccessPolicy>>
>

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function addManualStep(steps: string[], step: string): void {
  if (!steps.includes(step)) {
    steps.push(step)
  }
}

function assertHumanUser(
  user: {
    firstName?: string
    lastName?: string
    email?: string
  },
  label: string,
): void {
  if (!user.firstName?.trim() || !user.lastName?.trim()) {
    throw new Error(`${label} first and last name are required.`)
  }

  if (!user.email?.trim()) {
    throw new Error(`${label} email is required.`)
  }
}

function toBootstrapUsers(input: CreateTenantInput): BootstrapUser[] {
  const primaryAdmin: BootstrapUser = {
    firstName: input.primaryAdmin.firstName.trim(),
    lastName: input.primaryAdmin.lastName.trim(),
    email: normalizeEmail(input.primaryAdmin.email),
    password: input.primaryAdmin.password?.trim() || undefined,
    sendEmail: Boolean(input.primaryAdmin.sendEmail),
    role: 'TenantAdmin',
    isPrimaryAdmin: true,
  }

  const initialUsers = (input.initialUsers ?? []).map((user) => ({
    firstName: user.firstName.trim(),
    lastName: user.lastName.trim(),
    email: normalizeEmail(user.email),
    password: user.password?.trim() || undefined,
    sendEmail: Boolean(user.sendEmail),
    role: user.role,
    isPrimaryAdmin: false,
  }))

  return [primaryAdmin, ...initialUsers]
}

function assertInput(input: CreateTenantInput): BootstrapUser[] {
  const slugError = validateSlug(input.slug)
  if (slugError) {
    throw new Error(slugError)
  }

  if (!input.displayName.trim()) {
    throw new Error('Display name is required.')
  }

  assertHumanUser(input.primaryAdmin, 'Primary admin')

  const bootstrapUsers = toBootstrapUsers(input)
  for (const user of bootstrapUsers) {
    assertHumanUser(
      user,
      user.isPrimaryAdmin ? 'Primary admin' : `Initial ${user.role}`,
    )
  }

  const emails = bootstrapUsers.map((user) => user.email)
  if (new Set(emails).size !== emails.length) {
    throw new Error('Every bootstrap user must have a unique email address.')
  }

  return bootstrapUsers
}

async function createProject(name: string): Promise<Project> {
  const medplum = await createProvisioningMedplumClient()

  return medplum.post(
    medplum.fhirUrl('Project', '$init').toString(),
    {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'name',
          valueString: name,
        },
      ],
    },
    'application/fhir+json',
  ) as Promise<Project>
}

async function createTenantWebClient(
  projectId: string,
  displayName: string,
  redirectUri: string,
): Promise<ClientApplication> {
  const medplum = await createProvisioningMedplumClient()
  return medplum.post(`admin/projects/${projectId}/client`, {
    name: `${displayName} OZRYN Web`,
    description: 'Tenant web client for OZRYN tenant runtime',
    redirectUri,
  }) as Promise<ClientApplication>
}

async function createRootOrganization(
  tenantClientId: string,
  tenantClientSecret: string,
  input: CreateTenantInput,
): Promise<Organization> {
  const medplum = await createProjectScopedMedplumClient(
    tenantClientId,
    tenantClientSecret,
  )

  return medplum.createResource({
    resourceType: 'Organization',
    name: input.displayName.trim(),
    identifier: [
      {
        system: 'https://ozryn.app/tenant-slug',
        value: normalizeSlug(input.slug),
      },
    ],
  }) as Promise<Organization>
}

async function createTenantAccessPolicies(
  tenantClientId: string,
  tenantClientSecret: string,
): Promise<PolicyReferences> {
  const medplum = await createProjectScopedMedplumClient(
    tenantClientId,
    tenantClientSecret,
  )

  const [tenantAdminPolicy, staffPolicy, serviceBotPolicy] = await Promise.all([
    medplum.createResource({
      resourceType: 'AccessPolicy',
      name: 'TenantAdmin',
      description: 'Full project access for tenant administrators.',
      resource: [
        {
          resourceType: '*',
        },
      ],
    } as AccessPolicy),
    medplum.createResource({
      resourceType: 'AccessPolicy',
      name: 'Staff',
      description: 'Read-only project access for tenant staff in local MVP.',
      resource: [
        {
          resourceType: '*',
          readonly: true,
        },
      ],
    } as AccessPolicy),
    medplum.createResource({
      resourceType: 'AccessPolicy',
      name: 'ServiceBot',
      description: 'Programmatic read/write access for tenant automation.',
      resource: [
        {
          resourceType: '*',
          interaction: ['create', 'read', 'update', 'search', 'history', 'vread'],
        },
      ],
    } as AccessPolicy),
  ])

  return {
    TenantAdmin: tenantAdminPolicy.id
      ? { reference: `AccessPolicy/${tenantAdminPolicy.id}` }
      : undefined,
    Staff: staffPolicy.id ? { reference: `AccessPolicy/${staffPolicy.id}` } : undefined,
    ServiceBot: serviceBotPolicy.id
      ? { reference: `AccessPolicy/${serviceBotPolicy.id}` }
      : undefined,
  }
}

async function inviteBootstrapUser(
  projectId: string,
  user: BootstrapUser,
  accessPolicy: Reference<AccessPolicy> | undefined,
): Promise<ProjectMembership> {
  const medplum = await createProvisioningMedplumClient()
  const membership: Partial<ProjectMembership> = {
    admin: user.role === 'TenantAdmin',
    ...(accessPolicy
      ? {
          access: [
            {
              policy: accessPolicy,
            },
          ],
        }
      : undefined),
  }

  return medplum.post(`admin/projects/${projectId}/invite`, {
    resourceType: 'Practitioner',
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    scope: 'project',
    sendEmail: user.sendEmail,
    upsert: true,
    ...(user.password
      ? {
          password: user.password,
        }
      : undefined),
    membership,
  }) as Promise<ProjectMembership>
}

async function createPractitionerRole(
  tenantClientId: string,
  tenantClientSecret: string,
  practitionerReference: string,
  organizationId: string,
  role: TenantBootstrapUserRole,
): Promise<PractitionerRole> {
  const medplum = await createProjectScopedMedplumClient(
    tenantClientId,
    tenantClientSecret,
  )

  return medplum.createResource({
    resourceType: 'PractitionerRole',
    active: true,
    practitioner: {
      reference: practitionerReference,
    },
    organization: {
      reference: `Organization/${organizationId}`,
    },
    code: [
      {
        text: role,
      },
    ],
  }) as Promise<PractitionerRole>
}

function makePendingUserSummary(
  user: BootstrapUser,
  note: string,
): TenantProvisionedUserSummary {
  return {
    email: user.email,
    role: user.role,
    status: 'pending-manual',
    sendEmail: user.sendEmail,
    admin: user.role === 'TenantAdmin',
    membershipId: null,
    profileReference: null,
    practitionerRoleId: null,
    note,
  }
}

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const bootstrapUsers = assertInput(input)

  const slug = normalizeSlug(input.slug)
  const displayName = input.displayName.trim()

  const project = await createProject(displayName)
  if (!project.id) {
    throw new Error('Medplum project creation did not return an id.')
  }

  const webClient = await createTenantWebClient(
    project.id,
    displayName,
    getTenantLoginRedirectUri(slug),
  )
  if (!webClient.id) {
    throw new Error('Medplum tenant client creation did not return an id.')
  }

  const manualSteps: string[] = []
  let organizationId: string | null = null
  let accessPolicies: PolicyReferences = {}

  if (!webClient.secret) {
    addManualStep(
      manualSteps,
      'Create the root Organization, AccessPolicies, and PractitionerRole records manually in the tenant project because Medplum did not return a bootstrap client secret.',
    )
  } else {
    try {
      const organization = await createRootOrganization(
        webClient.id,
        webClient.secret,
        input,
      )
      organizationId = organization.id ?? null
    } catch {
      addManualStep(
        manualSteps,
        'Create the root Organization manually in the tenant project. The automated project-scoped bootstrap client could not create it.',
      )
    }

    try {
      accessPolicies = await createTenantAccessPolicies(webClient.id, webClient.secret)
    } catch {
      addManualStep(
        manualSteps,
        'Create and attach the tenant AccessPolicies manually. The automated bootstrap client could not create the default TenantAdmin, Staff, and ServiceBot policies.',
      )
    }
  }

  const invitedUsers: TenantProvisionedUserSummary[] = []

  for (const user of bootstrapUsers) {
    if (user.role === 'Staff' && !accessPolicies.Staff) {
      invitedUsers.push(
        makePendingUserSummary(
          user,
          'Staff invite was skipped because the Staff access policy is not available yet.',
        ),
      )
      addManualStep(
        manualSteps,
        'Invite non-admin staff manually after the Staff access policy exists, to avoid over-granting access.',
      )
      continue
    }

    try {
      const membership = await inviteBootstrapUser(
        project.id,
        user,
        user.role === 'TenantAdmin' ? accessPolicies.TenantAdmin : accessPolicies.Staff,
      )

      invitedUsers.push({
        email: user.email,
        role: user.role,
        status: 'invited',
        sendEmail: user.sendEmail,
        admin: user.role === 'TenantAdmin',
        membershipId: membership.id ?? null,
        profileReference: membership.profile?.reference ?? null,
        practitionerRoleId: null,
      })
    } catch {
      invitedUsers.push(
        makePendingUserSummary(
          user,
          `${user.role} invite failed and needs manual follow-up in Medplum.`,
        ),
      )
      addManualStep(
        manualSteps,
        `Invite ${user.email} manually in Medplum and attach the correct ${user.role} project membership.`,
      )
    }
  }

  if (webClient.secret && organizationId) {
    for (const user of invitedUsers) {
      if (
        user.status !== 'invited' ||
        !user.profileReference?.startsWith('Practitioner/')
      ) {
        continue
      }

      try {
        const practitionerRole = await createPractitionerRole(
          webClient.id,
          webClient.secret,
          user.profileReference,
          organizationId,
          user.role,
        )
        user.practitionerRoleId = practitionerRole.id ?? null
      } catch {
        user.status = 'pending-manual'
        user.note =
          'PractitionerRole creation failed and needs manual follow-up in the tenant project.'
        addManualStep(
          manualSteps,
          `Create a PractitionerRole for ${user.email} linking ${user.profileReference} to Organization/${organizationId}.`,
        )
      }
    }
  } else if (invitedUsers.some((user) => user.status === 'invited')) {
    addManualStep(
      manualSteps,
      'Create PractitionerRole records manually for invited users once the tenant Organization exists.',
    )
  }

  if (bootstrapUsers.some((user) => !user.password && !user.sendEmail)) {
    addManualStep(
      manualSteps,
      'Set or reset passwords manually for any invited users created without a password and without invite email delivery.',
    )
  }

  if (bootstrapUsers.some((user) => user.sendEmail)) {
    addManualStep(
      manualSteps,
      'If invite emails are enabled in self-hosted Medplum, verify outbound email infrastructure is configured before relying on sendEmail=true.',
    )
  }

  const tenant: TenantRecord = await upsertTenantRecord({
    slug,
    displayName,
    status: 'active',
    bootstrapStatus: manualSteps.length > 0 ? 'pending-manual' : 'ready',
    medplumProjectId: project.id,
    medplumOrganizationId: organizationId,
    medplumClientId: webClient.id,
    lastProvisioningError:
      manualSteps.length > 0 ? manualSteps.join('\n') : null,
  })

  return {
    tenant,
    createdProjectId: project.id,
    createdClientId: webClient.id,
    createdOrganizationId: organizationId,
    invitedUsers,
    manualSteps,
  }
}
