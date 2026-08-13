import { NextRequest, NextResponse } from 'next/server'

import { requireProvisioningAccess } from '@/lib/admin/api-auth'
import { listAllTenantMemberships } from '@/lib/admin/tenant-management.server'

export async function GET(request: NextRequest) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  try {
    return NextResponse.json(await listAllTenantMemberships())
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown membership directory error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
