import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { config as loadEnv } from 'dotenv'

import { upsertTenantRecord } from '@/db/tenant-repository'
import type { TenantBootstrapStatus, TenantStatus } from '@/lib/tenants/types'

loadEnv()
loadEnv({ path: '.env.local', override: true })

interface LegacyTenantRecord {
  slug: string
  displayName: string
  status: TenantStatus
  bootstrapStatus: TenantBootstrapStatus
  medplumProjectId: string
  medplumOrganizationId: string | null
  medplumClientId: string
  createdAt: string
  updatedAt: string
  manualSteps?: string[]
}

async function main(): Promise<void> {
  const legacyPath = path.join(process.cwd(), 'data', 'tenants.local.json')
  const raw = await readFile(legacyPath, 'utf8')
  const parsed = JSON.parse(raw) as LegacyTenantRecord[]

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.log('No legacy tenants found to import.')
    return
  }

  for (const tenant of parsed) {
    await upsertTenantRecord({
      slug: tenant.slug,
      displayName: tenant.displayName,
      status: tenant.status,
      bootstrapStatus: tenant.bootstrapStatus,
      medplumProjectId: tenant.medplumProjectId,
      medplumOrganizationId: tenant.medplumOrganizationId,
      medplumClientId: tenant.medplumClientId,
      lastProvisioningError:
        tenant.manualSteps && tenant.manualSteps.length > 0
          ? tenant.manualSteps.join('\n')
          : null,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    })
  }

  console.log(`Imported ${parsed.length} tenant record(s) from ${legacyPath}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
