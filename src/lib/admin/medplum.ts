import { MedplumClient } from '@medplum/core'
import type { IClientStorage } from '@medplum/core'

import {
  ADMIN_LOGIN_PATH,
  ADMIN_MEDPLUM_STORAGE_NAMESPACE,
  type AdminLoginConfig,
} from '@/lib/admin/control-plane'

class AdminBrowserStorage implements IClientStorage {
  private get storage(): Storage | undefined {
    if (typeof window === 'undefined') {
      return undefined
    }

    return window.localStorage
  }

  private getKey(key: string): string {
    return `${ADMIN_MEDPLUM_STORAGE_NAMESPACE}:${key}`
  }

  clear(): void {
    const storage = this.storage
    if (!storage) {
      return
    }

    const prefix = `${ADMIN_MEDPLUM_STORAGE_NAMESPACE}:`
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
    return this.storage?.getItem(this.getKey(key)) ?? undefined
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

let configuredAdminMedplum: MedplumClient | null = null
let configuredAdminMedplumKey: string | null = null

function getConfigKey(config: AdminLoginConfig): string {
  return `${config.baseUrl}|${config.clientId}`
}

function createAdminMedplumClient(config: AdminLoginConfig): MedplumClient {
  return new MedplumClient({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    storage:
      typeof window === 'undefined' ? undefined : new AdminBrowserStorage(),
    onUnauthenticated: () => {
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith(ADMIN_LOGIN_PATH)
      ) {
        window.location.href = ADMIN_LOGIN_PATH
      }
    },
  })
}

export function configureAdminMedplum(config: AdminLoginConfig): MedplumClient {
  const nextKey = getConfigKey(config)

  if (!configuredAdminMedplum || configuredAdminMedplumKey !== nextKey) {
    configuredAdminMedplum = createAdminMedplumClient(config)
    configuredAdminMedplumKey = nextKey
  }

  return configuredAdminMedplum
}

export function clearAdminMedplum(): void {
  configuredAdminMedplum?.clear()
  configuredAdminMedplum = null
  configuredAdminMedplumKey = null
}
