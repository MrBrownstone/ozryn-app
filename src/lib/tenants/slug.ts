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

export function getLocalTenantHost(slug: string): string {
  return `${slug}.localhost:3000`
}

export function getProductionTenantHost(slug: string): string {
  return `${slug}.ozryn.app`
}
