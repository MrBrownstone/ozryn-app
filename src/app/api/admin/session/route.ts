import { NextRequest, NextResponse } from 'next/server'

import { isAdminHost } from '@/lib/admin/control-plane'
import {
  attachAdminSession,
  clearAdminSession,
  createAdminSessionFromAccessToken,
  getMissingAdminLoginEnvVars,
  getAdminSessionFromRequest,
  isAdminLoginConfigured,
} from '@/lib/admin/session.server'

function requireAdminHost(request: NextRequest): NextResponse | null {
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host

  if (!isAdminHost(host)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  return null
}

export async function GET(request: NextRequest) {
  const hostError = requireAdminHost(request)
  if (hostError) {
    return hostError
  }

  const session = getAdminSessionFromRequest(request)
  return NextResponse.json({
    authenticated: Boolean(session),
    email: session?.email ?? null,
    configured: isAdminLoginConfigured(),
  })
}

export async function POST(request: NextRequest) {
  const hostError = requireAdminHost(request)
  if (hostError) {
    return hostError
  }

  if (!isAdminLoginConfigured()) {
    return NextResponse.json(
      {
        error: `Missing ${getMissingAdminLoginEnvVars().join(', ')} in .env.local.`,
      },
      { status: 500 },
    )
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Missing Medplum access token.' },
      { status: 400 },
    )
  }

  const session = await createAdminSessionFromAccessToken(accessToken)
  if (!session) {
    return NextResponse.json(
      { error: 'This Medplum user is not allowed to access the OZRYN admin control plane.' },
      { status: 401 },
    )
  }

  return attachAdminSession(
    NextResponse.json({ authenticated: true, email: session.email }),
    session,
  )
}

export async function DELETE(request: NextRequest) {
  const hostError = requireAdminHost(request)
  if (hostError) {
    return hostError
  }

  return clearAdminSession(NextResponse.json({ ok: true }))
}
