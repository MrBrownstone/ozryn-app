import { NextRequest, NextResponse } from 'next/server'

import {
  TENANT_COOKIE_NAME,
  findTenantRuntimeBySlug,
} from '@/lib/tenants/runtime.server'

function buildCookieResponse(response: NextResponse, slug: string): NextResponse {
  response.cookies.set(TENANT_COOKIE_NAME, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return response
}

export async function POST(request: NextRequest) {
  let body: { slug?: string }

  try {
    body = (await request.json()) as { slug?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body.slug?.trim()) {
    return NextResponse.json({ error: 'Tenant slug is required.' }, { status: 400 })
  }

  const tenant = await findTenantRuntimeBySlug(body.slug, {
    host:
      request.headers.get('x-forwarded-host') ??
      request.headers.get('host') ??
      request.nextUrl.host,
  })
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  return buildCookieResponse(NextResponse.json({ tenant }), tenant.slug)
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(TENANT_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
