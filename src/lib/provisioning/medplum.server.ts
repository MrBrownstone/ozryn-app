import 'server-only'

import { MedplumClient } from '@medplum/core'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getMedplumBaseUrl(): string {
  return (
    process.env.MEDPLUM_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL?.trim() ||
    ''
  )
}

export async function createProvisioningMedplumClient(): Promise<MedplumClient> {
  const baseUrl = getMedplumBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Missing MEDPLUM_BASE_URL or NEXT_PUBLIC_MEDPLUM_BASE_URL for provisioning.',
    )
  }

  const medplum = new MedplumClient({
    baseUrl,
  })

  await medplum.startClientLogin(
    requireEnv('MEDPLUM_PROVISIONING_CLIENT_ID'),
    requireEnv('MEDPLUM_PROVISIONING_CLIENT_SECRET'),
  )

  return medplum
}

export async function createProjectScopedMedplumClient(
  clientId: string,
  clientSecret: string,
): Promise<MedplumClient> {
  const baseUrl = getMedplumBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Missing MEDPLUM_BASE_URL or NEXT_PUBLIC_MEDPLUM_BASE_URL for project login.',
    )
  }

  const medplum = new MedplumClient({
    baseUrl,
  })

  await medplum.startClientLogin(clientId, clientSecret)
  return medplum
}
