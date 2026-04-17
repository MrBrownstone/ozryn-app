const RESERVED_SLUGS = new Set(['www', 'app', 'admin', 'api', 'docs'])

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function validateSlug(value: string): string | null {
  const slug = normalizeSlug(value)

  if (!slug) {
    return 'Slug is required.'
  }

  if (!SLUG_REGEX.test(slug)) {
    return 'Slug must be lowercase, URL-safe, and use hyphens only.'
  }

  if (RESERVED_SLUGS.has(slug)) {
    return `Slug "${slug}" is reserved.`
  }

  return null
}

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase()
}

export function getPublicBaseDomain(): string {
  return normalizeDomain(process.env.OZRYN_PUBLIC_BASE_DOMAIN?.trim() || 'ozryn.app')
}

export function getLocalAppPort(): string {
  return (
    process.env.OZRYN_LOCAL_PORT?.trim() ||
    process.env.PORT?.trim() ||
    '3000'
  )
}

export function getLocalTenantHost(slug: string): string {
  return `${slug}.localhost:${getLocalAppPort()}`
}

export function getProductionTenantHost(slug: string): string {
  return `${slug}.${getPublicBaseDomain()}`
}

export function getTenantLoginRedirectUri(slug: string): string {
  if (process.env.NODE_ENV === 'production') {
    return `https://${getProductionTenantHost(slug)}/login`
  }

  return `http://${getLocalTenantHost(slug)}/login`
}
