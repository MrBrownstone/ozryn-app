import { NextRequest, NextResponse } from 'next/server'

import { requireProvisioningAccess } from '@/lib/admin/api-auth'
import { listTenantMemberships } from '@/lib/admin/tenant-management.server'

function getErrorStatus(message: string): number {
  return message.includes('not found') ? 404 : 500
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  const { slug } = await context.params

  try {
    const memberships = await listTenantMemberships(slug)
    return NextResponse.json({ memberships })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown tenant membership error.'
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}
