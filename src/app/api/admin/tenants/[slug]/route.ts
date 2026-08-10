import { NextRequest, NextResponse } from 'next/server'

import { requireProvisioningAccess } from '@/lib/admin/api-auth'
import {
  getTenantDetail,
  updateTenant,
} from '@/lib/admin/tenant-management.server'
import type { UpdateTenantInput } from '@/lib/tenants/types'

function getErrorStatus(message: string): number {
  if (message.includes('not found')) {
    return 404
  }

  if (
    message.includes('required') ||
    message.includes('must') ||
    message.includes('At least') ||
    message.includes('Unsupported')
  ) {
    return 400
  }

  return 500
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
    const detail = await getTenantDetail(slug)
    return NextResponse.json(detail)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown tenant detail error.'
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  const { slug } = await context.params

  let body: UpdateTenantInput
  try {
    body = (await request.json()) as UpdateTenantInput
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  try {
    const detail = await updateTenant(slug, body)
    return NextResponse.json(detail)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown tenant update error.'
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}
