import 'server-only'

import type { MedplumClient } from '@medplum/core'
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
  createProvisioningAdminMedplumClient,
} from '@/lib/provisioning/medplum.server'
import {
  getTenantLoginRedirectUri,
  normalizeSlug,
} from '@/lib/tenants/slug'
import {
  assertCreateTenantInput,
  buildTenantAccessPolicyDefinitions,
  buildOrganizationProfileFields,
  type NormalizedBootstrapUser,
} from '@/lib/tenants/management'
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantBootstrapUserRole,
  TenantProvisionedUserSummary,
  TenantRecord,
} from '@/lib/tenants/types'

type PolicyReferences = Partial<
  Record<TenantBootstrapUserRole | 'ServiceBot', Reference<AccessPolicy>>
>

function addManualStep(steps: string[], step: string): void {
  if (!steps.includes(step)) {
    steps.push(step)
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Medplum error.'
}

async function createProject(medplum: MedplumClient, name: string): Promise<Project> {
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
  medplum: MedplumClient,
  projectId: string,
  displayName: string,
  redirectUri: string,
): Promise<ClientApplication> {
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
    ...buildOrganizationProfileFields(
      input.displayName,
      input.organizationProfile,
    ),
    identifier: [
      {
        system: 'https://ozryn.app/tenant-slug',
        value: normalizeSlug(input.slug),
      },
    ],
  }) as Promise<Organization>
}

async function createTenantAccessPolicies(
  medplum: MedplumClient,
  projectId: string,
): Promise<PolicyReferences> {
  const policies = buildTenantAccessPolicyDefinitions()

  const inTenantProject = (policy: AccessPolicy): AccessPolicy => ({
    ...policy,
    meta: {
      ...policy.meta,
      project: projectId,
    },
  })

  const [tenantAdminPolicy, staffPolicy, serviceBotPolicy] = await Promise.all([
    medplum.createResource(inTenantProject(policies.TenantAdmin)),
    medplum.createResource(inTenantProject(policies.Staff)),
    medplum.createResource(inTenantProject(policies.ServiceBot)),
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
  medplum: MedplumClient,
  projectId: string,
  user: NormalizedBootstrapUser,
  accessPolicy: Reference<AccessPolicy> | undefined,
): Promise<ProjectMembership> {
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
  user: NormalizedBootstrapUser,
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
  const bootstrapUsers = assertCreateTenantInput(input)
  const provisioningMedplum = await createProvisioningAdminMedplumClient()

  const slug = normalizeSlug(input.slug)
  const displayName = input.displayName.trim()

  const project = await createProject(provisioningMedplum, displayName)
  if (!project.id) {
    throw new Error('Medplum project creation did not return an id.')
  }

  const webClient = await createTenantWebClient(
    provisioningMedplum,
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
      'Create the root Organization and PractitionerRole records manually in the tenant project because Medplum did not return a bootstrap client secret.',
    )
  } else {
    try {
      const organization = await createRootOrganization(
        webClient.id,
        webClient.secret,
        input,
      )
      organizationId = organization.id ?? null
    } catch (error) {
      addManualStep(
        manualSteps,
        `Create the root Organization manually in the tenant project. Medplum reported: ${getErrorMessage(error)}`,
      )
    }
  }

  try {
    accessPolicies = await createTenantAccessPolicies(
      provisioningMedplum,
      project.id,
    )
  } catch (error) {
    addManualStep(
      manualSteps,
      `Create and attach the tenant AccessPolicies manually. Medplum reported: ${getErrorMessage(error)}`,
    )
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
        provisioningMedplum,
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
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      invitedUsers.push(
        makePendingUserSummary(
          user,
          `${user.role} invite failed. Medplum reported: ${errorMessage}`,
        ),
      )
      addManualStep(
        manualSteps,
        `Invite ${user.email} manually in Medplum and attach the correct ${user.role} project membership. Medplum reported: ${errorMessage}`,
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
      } catch (error) {
        user.status = 'pending-manual'
        user.note = `PractitionerRole creation failed. Medplum reported: ${getErrorMessage(error)}`
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
