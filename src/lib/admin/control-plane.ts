import { getLocalAppPort, normalizeDomain } from '@/lib/tenants/slug'

export const ADMIN_SESSION_COOKIE_NAME = 'ozryn-admin'
export const ADMIN_ROUTE_PREFIX = '/admin'
export const ADMIN_LOGIN_PATH = '/admin/login'
export const ADMIN_HOME_PATH = '/admin'
export const ADMIN_MEDPLUM_STORAGE_NAMESPACE = 'ozryn-medplum:admin'

export interface AdminLoginConfig {
  baseUrl: string
  clientId: string
}

function stripDefaultPort(host: string): string {
  if (host.endsWith(':80')) {
    return host.slice(0, -3)
  }

  if (host.endsWith(':443')) {
    return host.slice(0, -4)
  }

  return host
}

export function normalizeHost(value: string | null | undefined): string {
  return stripDefaultPort(normalizeDomain(value ?? ''))
}

export function getLocalAdminHost(): string {
  return `admin.localhost:${getLocalAppPort()}`
}

export function getProductionAdminHost(): string {
  return 'admin.ozryn.app'
}

export function isAdminHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) {
    return false
  }

  const withoutPort = normalized.split(':')[0]
  return (
    normalized === getLocalAdminHost() ||
    normalized === getProductionAdminHost() ||
    withoutPort === 'admin.localhost' ||
    withoutPort === 'admin.ozryn.app'
  )
}
