import 'server-only'

import type { ClientApplication, Organization, Project } from '@medplum/fhirtypes'

import { createProjectScopedMedplumClient, createProvisioningMedplumClient, getMedplumBaseUrl } from '@/lib/provisioning/medplum.server'
import { saveTenantRecord } from '@/lib/tenants/registry.server'
import { getLocalTenantHost, getProductionTenantHost, normalizeDomain, normalizeSlug, validateSlug } from '@/lib/tenants/slug'
import type { CreateTenantInput, CreateTenantResult, TenantRecord } from '@/lib/tenants/types'

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function assertInput(input: CreateTenantInput): void {
  const slugError = validateSlug(input.slug)
  if (slugError) {
    throw new Error(slugError)
  }

  if (!input.displayName.trim()) {
    throw new Error('Display name is required.')
  }

  if (!input.firstAdminFirstName.trim() || !input.firstAdminLastName.trim()) {
    throw new Error('First admin first and last name are required.')
  }

  if (!input.firstAdminEmail.trim()) {
    throw new Error('First admin email is required.')
  }
}

function getCanonicalDomain(slug: string, customDomains: string[]): string {
  return customDomains[0] ?? getProductionTenantHost(slug)
}

async function createProject(
  name: string,
): Promise<Project> {
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
): Promise<ClientApplication> {
  const medplum = await createProvisioningMedplumClient()
  return medplum.post(`admin/projects/${projectId}/client`, {
    name: `${displayName} OZRYN Web`,
    description: 'Tenant web client for OZRYN local provisioning',
  }) as Promise<ClientApplication>
}

async function inviteFirstAdmin(projectId: string, input: CreateTenantInput): Promise<void> {
  const medplum = await createProvisioningMedplumClient()

  await medplum.invite(projectId, {
    resourceType: 'Practitioner',
    firstName: input.firstAdminFirstName.trim(),
    lastName: input.firstAdminLastName.trim(),
    email: input.firstAdminEmail.trim().toLowerCase(),
    scope: 'project',
    sendEmail: false,
    ...(input.firstAdminPassword
      ? {
          password: input.firstAdminPassword,
        }
      : undefined),
    membership: {
      admin: true,
    },
  })
}

async function tryCreateRootOrganization(
  tenantClientId: string,
  tenantClientSecret: string,
  input: CreateTenantInput,
): Promise<Organization | null> {
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

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  assertInput(input)

  const slug = normalizeSlug(input.slug)
  const displayName = input.displayName.trim()
  const customDomains = unique(
    (input.customDomains ?? [])
      .map(normalizeDomain)
      .filter(Boolean),
  )

  const project = await createProject(displayName)
  if (!project.id) {
    throw new Error('Medplum project creation did not return an id.')
  }

  const webClient = await createTenantWebClient(project.id, displayName)
  if (!webClient.id) {
    throw new Error('Medplum tenant client creation did not return an id.')
  }

  const manualSteps: string[] = []
  let organizationId: string | null = null

  if (!webClient.secret) {
    manualSteps.push(
      'Create the root Organization manually in the tenant project because Medplum did not return a bootstrap client secret.',
    )
  } else {
    try {
      const organization = await tryCreateRootOrganization(
        webClient.id,
        webClient.secret,
        input,
      )
      organizationId = organization?.id ?? null
    } catch (error) {
      manualSteps.push(
        'Create the root Organization manually in the tenant project. The automated project-scoped bootstrap client could not create it.',
      )
    }
  }

  try {
    await inviteFirstAdmin(project.id, input)
  } catch (error) {
    manualSteps.push(
      'Invite the first tenant admin manually in Medplum. The automated invite step failed.',
    )
  }

  manualSteps.push(
    'Create and attach the tenant AccessPolicies manually. This step is intentionally deferred until the policy templates are implemented.',
  )

  if (!input.firstAdminPassword?.trim()) {
    manualSteps.push(
      'Set or reset the first tenant admin password manually, or configure an email invite flow, because no admin password was provided during provisioning.',
    )
  }

  if (customDomains.length > 0) {
    manualSteps.push(
      'Add and verify the tenant custom domains in Vercel manually. The local provisioning step stores the requested domains but does not call the Vercel Domains API yet.',
    )
  }

  const now = new Date().toISOString()
  const tenant: TenantRecord = {
    slug,
    displayName,
    status: 'active',
    bootstrapStatus: manualSteps.length > 0 ? 'pending-manual' : 'ready',
    domains: unique([
      getLocalTenantHost(slug),
      getProductionTenantHost(slug),
      ...customDomains,
    ]),
    canonicalDomain: getCanonicalDomain(slug, customDomains),
    medplumBaseUrl: getMedplumBaseUrl(),
    medplumProjectId: project.id,
    medplumOrganizationId: organizationId,
    medplumClientId: webClient.id,
    createdAt: now,
    updatedAt: now,
    manualSteps,
  }

  await saveTenantRecord(tenant)

  return {
    tenant,
    createdProjectId: project.id,
    createdClientId: webClient.id,
    createdOrganizationId: organizationId,
    manualSteps,
  }
}
