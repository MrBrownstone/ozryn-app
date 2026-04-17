import 'server-only'

import { findActiveTenantRecordBySlug, listActiveTenantRecords } from '@/db/tenant-repository'
import { isAdminHost } from '@/lib/admin/control-plane'
import { getMedplumBaseUrl } from '@/lib/provisioning/medplum.server'
import {
  getLocalTenantHost,
  getProductionTenantHost,
  getPublicBaseDomain,
  normalizeDomain,
  normalizeSlug,
} from '@/lib/tenants/slug'
import type { TenantRecord, TenantRuntimeConfig } from '@/lib/tenants/types'

export const TENANT_COOKIE_NAME = 'ozryn-tenant'

function normalizeHost(value: string | null | undefined): string {
  const normalized = normalizeDomain(value ?? '')
  if (!normalized) {
    return ''
  }

  if (normalized.endsWith(':80')) {
    return normalized.slice(0, -3)
  }

  if (normalized.endsWith(':443')) {
    return normalized.slice(0, -4)
  }

  return normalized
}

function prefersLocalTenantHosts(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host)
  const withoutPort = normalized.split(':')[0]
  return withoutPort === 'localhost' || withoutPort.endsWith('.localhost')
}

function getTenantHost(slug: string, hostHint?: string | null): string {
  return prefersLocalTenantHosts(hostHint)
    ? getLocalTenantHost(slug)
    : getProductionTenantHost(slug)
}

function toRuntimeConfig(
  tenant: TenantRecord,
  hostHint?: string | null,
): TenantRuntimeConfig {
  return {
    slug: tenant.slug,
    displayName: tenant.displayName,
    tenantHost: getTenantHost(tenant.slug, hostHint),
    medplumBaseUrl: getMedplumBaseUrl(),
    medplumClientId: tenant.medplumClientId,
  }
}

function getHostSlug(host: string): string | null {
  const withoutPort = host.split(':')[0]
  const productionSuffix = `.${getPublicBaseDomain()}`

  if (withoutPort.endsWith('.localhost')) {
    return normalizeSlug(withoutPort.slice(0, -'.localhost'.length))
  }

  if (withoutPort.endsWith(productionSuffix)) {
    return normalizeSlug(withoutPort.slice(0, -productionSuffix.length))
  }

  return null
}

export async function listTenantRuntimeConfigs(input?: {
  host?: string | null
}): Promise<TenantRuntimeConfig[]> {
  const activeTenants = await listActiveTenantRecords()
  return activeTenants.map((tenant) => toRuntimeConfig(tenant, input?.host))
}

export async function findTenantRuntimeBySlug(
  slug: string,
  input?: {
    host?: string | null
  },
): Promise<TenantRuntimeConfig | null> {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug) {
    return null
  }

  const tenant = await findActiveTenantRecordBySlug(normalizedSlug)
  return tenant ? toRuntimeConfig(tenant, input?.host) : null
}

export async function resolveTenantRuntimeForRequest(input: {
  host?: string | null
  tenantSlugOverride?: string | null
}): Promise<TenantRuntimeConfig | null> {
  if (isAdminHost(input.host)) {
    return null
  }

  const normalizedHost = normalizeHost(input.host)

  if (normalizedHost) {
    const hostSlug = getHostSlug(normalizedHost)
    if (hostSlug) {
      const slugMatch = await findActiveTenantRecordBySlug(hostSlug)
      if (slugMatch) {
        return toRuntimeConfig(slugMatch, input.host)
      }
    }
  }

  const overrideSlug = normalizeSlug(input.tenantSlugOverride ?? '')
  if (overrideSlug) {
    const overrideMatch = await findActiveTenantRecordBySlug(overrideSlug)
    if (overrideMatch) {
      return toRuntimeConfig(overrideMatch, input.host)
    }
  }

  return null
}
