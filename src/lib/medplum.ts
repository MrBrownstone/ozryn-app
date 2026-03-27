import { MedplumClient } from '@medplum/core'
import type { IClientStorage } from '@medplum/core'

import type { TenantRuntimeConfig } from '@/lib/tenants/types'

type MedplumTenantConfig = Pick<
  TenantRuntimeConfig,
  'slug' | 'displayName' | 'medplumBaseUrl' | 'medplumClientId'
>

const STORAGE_NAMESPACE = 'ozryn-medplum'

class TenantScopedBrowserStorage implements IClientStorage {
  constructor(private readonly namespace: string) {}

  private get storage(): Storage | undefined {
    if (typeof window === 'undefined') {
      return undefined
    }

    return window.localStorage
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  clear(): void {
    const storage = this.storage
    if (!storage) {
      return
    }

    const prefix = `${this.namespace}:`
    const keys: string[] = []

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) {
        keys.push(key)
      }
    }

    for (const key of keys) {
      storage.removeItem(key)
    }
  }

  getString(key: string): string | undefined {
    const storage = this.storage
    return storage?.getItem(this.getKey(key)) ?? undefined
  }

  setString(key: string, value: string | undefined): void {
    const storage = this.storage
    if (!storage) {
      return
    }

    const namespacedKey = this.getKey(key)
    if (value === undefined) {
      storage.removeItem(namespacedKey)
      return
    }

    storage.setItem(namespacedKey, value)
  }

  getObject<T>(key: string): T | undefined {
    const value = this.getString(key)
    if (value === undefined) {
      return undefined
    }

    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }

  setObject<T>(key: string, value: T): void {
    this.setString(key, JSON.stringify(value))
  }
}

let configuredMedplum: MedplumClient | null = null
let configuredMedplumKey: string | null = null

function getStorageNamespace(slug: string): string {
  return `${STORAGE_NAMESPACE}:${slug}`
}

function getConfigKey(config: MedplumTenantConfig): string {
  return `${config.slug}|${config.medplumBaseUrl}|${config.medplumClientId}`
}

function createMedplumClient(config: MedplumTenantConfig): MedplumClient {
  return new MedplumClient({
    baseUrl: config.medplumBaseUrl,
    clientId: config.medplumClientId,
    storage:
      typeof window === 'undefined'
        ? undefined
        : new TenantScopedBrowserStorage(getStorageNamespace(config.slug)),
    onUnauthenticated: () => {
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login')
      ) {
        window.location.href = `/login?tenant=${encodeURIComponent(config.slug)}`
      }
    },
  })
}

export function createTenantMedplum(config: MedplumTenantConfig): MedplumClient {
  configuredMedplum = createMedplumClient(config)
  configuredMedplumKey = getConfigKey(config)
  return configuredMedplum
}

export function configureTenantMedplum(
  config: MedplumTenantConfig,
): MedplumClient {
  const nextKey = getConfigKey(config)

  if (!configuredMedplum || configuredMedplumKey !== nextKey) {
    configuredMedplum = createMedplumClient(config)
    configuredMedplumKey = nextKey
  }

  return configuredMedplum
}

export function getOptionalMedplum(): MedplumClient | null {
  return configuredMedplum
}

export function getMedplum(): MedplumClient {
  const medplum = getOptionalMedplum()

  if (!medplum) {
    throw new Error('Medplum client is not configured. Resolve a tenant first.')
  }

  return medplum
}
