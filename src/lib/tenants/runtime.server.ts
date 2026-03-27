import 'server-only'

import { normalizeDomain, normalizeSlug } from '@/lib/tenants/slug'
import { readTenantRegistry } from '@/lib/tenants/registry.server'
import type { TenantRecord, TenantRuntimeConfig } from '@/lib/tenants/types'

export const TENANT_COOKIE_NAME = 'ozryn-tenant'

function toRuntimeConfig(tenant: TenantRecord): TenantRuntimeConfig {
  return {
    slug: tenant.slug,
    displayName: tenant.displayName,
    canonicalDomain: tenant.canonicalDomain,
    domains: tenant.domains,
    medplumBaseUrl: tenant.medplumBaseUrl,
    medplumClientId: tenant.medplumClientId,
  }
}

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

function getHostSlug(host: string): string | null {
  const withoutPort = host.split(':')[0]

  if (withoutPort.endsWith('.localhost')) {
    return normalizeSlug(withoutPort.slice(0, -'.localhost'.length))
  }

  if (withoutPort.endsWith('.ozryn.app')) {
    return normalizeSlug(withoutPort.slice(0, -'.ozryn.app'.length))
  }

  return null
}

function getFallbackRuntimeConfig(): TenantRuntimeConfig | null {
  const medplumBaseUrl = process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL?.trim()
  const medplumClientId = process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID?.trim()

  if (!medplumBaseUrl || !medplumClientId) {
    return null
  }

  return {
    slug: 'default',
    displayName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'OZRYN',
    canonicalDomain: 'localhost',
    domains: ['localhost'],
    medplumBaseUrl,
    medplumClientId,
  }
}

async function readActiveTenants(): Promise<TenantRecord[]> {
  const tenants = await readTenantRegistry()
  return tenants
    .filter((tenant) => tenant.status === 'active')
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function listTenantRuntimeConfigs(): Promise<TenantRuntimeConfig[]> {
  const activeTenants = await readActiveTenants()

  if (activeTenants.length === 0) {
    const fallback = getFallbackRuntimeConfig()
    return fallback ? [fallback] : []
  }

  return activeTenants.map(toRuntimeConfig)
}

export async function findTenantRuntimeBySlug(
  slug: string,
): Promise<TenantRuntimeConfig | null> {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug) {
    return null
  }

  const activeTenants = await readActiveTenants()
  const tenant = activeTenants.find((entry) => entry.slug === normalizedSlug)
  return tenant ? toRuntimeConfig(tenant) : null
}

export async function resolveTenantRuntimeForRequest(input: {
  host?: string | null
  tenantSlugOverride?: string | null
}): Promise<TenantRuntimeConfig | null> {
  const activeTenants = await readActiveTenants()
  const normalizedHost = normalizeHost(input.host)

  if (normalizedHost && activeTenants.length > 0) {
    const hostMatch = activeTenants.find((tenant) =>
      tenant.domains.some((domain) => normalizeHost(domain) === normalizedHost),
    )

    if (hostMatch) {
      return toRuntimeConfig(hostMatch)
    }

    const hostSlug = getHostSlug(normalizedHost)
    if (hostSlug) {
      const slugMatch = activeTenants.find((tenant) => tenant.slug === hostSlug)
      if (slugMatch) {
        return toRuntimeConfig(slugMatch)
      }
    }
  }

  const overrideSlug = normalizeSlug(input.tenantSlugOverride ?? '')
  if (overrideSlug && activeTenants.length > 0) {
    const overrideMatch = activeTenants.find(
      (tenant) => tenant.slug === overrideSlug,
    )

    if (overrideMatch) {
      return toRuntimeConfig(overrideMatch)
    }
  }

  return activeTenants.length === 0 ? getFallbackRuntimeConfig() : null
}
