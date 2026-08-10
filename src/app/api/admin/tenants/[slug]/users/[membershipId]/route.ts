import { NextRequest, NextResponse } from 'next/server'

import { requireProvisioningAccess } from '@/lib/admin/api-auth'
import { updateTenantMembership } from '@/lib/admin/tenant-management.server'
import type { UpdateTenantMembershipInput } from '@/lib/tenants/types'

function getErrorStatus(message: string): number {
  if (message.includes('not found')) {
    return 404
  }

  if (
    message.includes('required') ||
    message.includes('must') ||
    message.includes('At least') ||
    message.includes('Unsupported') ||
    message.includes('retain at least one active tenant admin')
  ) {
    return 400
  }

  return 500
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; membershipId: string }> },
) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  const { slug, membershipId } = await context.params

  let body: UpdateTenantMembershipInput
  try {
    body = (await request.json()) as UpdateTenantMembershipInput
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  try {
    const membership = await updateTenantMembership(slug, membershipId, body)
    return NextResponse.json({ membership })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown membership update error.'
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}
