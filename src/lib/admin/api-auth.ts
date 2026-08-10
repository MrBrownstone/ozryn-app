import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { isAdminHost } from '@/lib/admin/control-plane'
import { getAdminSessionFromRequest } from '@/lib/admin/session.server'

function hasProvisioningKey(request: NextRequest): boolean {
  const configuredKey = process.env.OZRYN_PROVISIONING_API_KEY?.trim()
  if (!configuredKey) {
    return false
  }

  const incomingKey = request.headers.get('x-ozryn-provisioning-key')?.trim()
  return Boolean(incomingKey && incomingKey === configuredKey)
}

export function getRequestHost(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  )
}

export function requireProvisioningAccess(
  request: NextRequest,
): NextResponse | null {
  if (hasProvisioningKey(request)) {
    return null
  }

  if (!isAdminHost(getRequestHost(request))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const session = getAdminSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return null
}
