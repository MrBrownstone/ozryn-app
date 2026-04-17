import { cookies, headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import {
  TENANT_COOKIE_NAME,
  listTenantRuntimeConfigs,
  resolveTenantRuntimeForRequest,
} from '@/lib/tenants/runtime.server'

export async function GET(request: NextRequest) {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const requestedSlug = request.nextUrl.searchParams.get('slug')
  const host =
    headerStore.get('x-forwarded-host') ??
    headerStore.get('host') ??
    request.nextUrl.host

  const currentTenant = await resolveTenantRuntimeForRequest({
    host,
    tenantSlugOverride:
      requestedSlug ?? cookieStore.get(TENANT_COOKIE_NAME)?.value ?? null,
  })

  const tenants = await listTenantRuntimeConfigs({ host })

  return NextResponse.json({
    currentTenant,
    tenants,
  })
}
