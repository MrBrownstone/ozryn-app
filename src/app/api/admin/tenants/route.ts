import { NextRequest, NextResponse } from 'next/server'

import { isAdminHost } from '@/lib/admin/control-plane'
import { getAdminSessionFromRequest } from '@/lib/admin/session.server'
import { createTenant } from '@/lib/provisioning/create-tenant'
import { findTenantBySlug, readTenantRegistry } from '@/lib/tenants/registry.server'
import { normalizeSlug } from '@/lib/tenants/slug'
import type { CreateTenantInput } from '@/lib/tenants/types'

function hasProvisioningKey(request: NextRequest): boolean {
  const configuredKey = process.env.OZRYN_PROVISIONING_API_KEY?.trim()
  if (!configuredKey) {
    return false
  }

  const incomingKey = request.headers.get('x-ozryn-provisioning-key')?.trim()
  return Boolean(incomingKey && incomingKey === configuredKey)
}

function requireProvisioningAccess(request: NextRequest): NextResponse | null {
  if (hasProvisioningKey(request)) {
    return null
  }

  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host

  if (!isAdminHost(host)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const session = getAdminSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return null
}

export async function GET(request: NextRequest) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  const tenants = await readTenantRegistry()
  return NextResponse.json({ tenants })
}

export async function POST(request: NextRequest) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  let body: CreateTenantInput
  try {
    body = (await request.json()) as CreateTenantInput
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const slug = normalizeSlug(body.slug ?? '')
  const existing = slug ? await findTenantBySlug(slug) : undefined
  if (existing) {
    return NextResponse.json(
      { error: `Tenant "${slug}" already exists in the local registry.` },
      { status: 409 },
    )
  }

  try {
    const result = await createTenant(body)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown provisioning error.'

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    )
  }
}
