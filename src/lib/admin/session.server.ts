import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import {
  ADMIN_SESSION_COOKIE_NAME,
  type AdminLoginConfig,
} from '@/lib/admin/control-plane'
import { getMedplumBaseUrl } from '@/lib/provisioning/medplum.server'

export interface AdminSession {
  email: string
  issuedAt: number
  expiresAt: number
}

interface MedplumAuthMeResponse {
  login?: string
  profile?: {
    resourceType?: string
    id?: string
    reference?: string
    telecom?: Array<{
      system?: string
      value?: string
    }>
  }
}

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function getAdminSessionSecret(): string {
  return requireEnv('OZRYN_ADMIN_SESSION_SECRET')
}

function getAdminClientId(): string {
  return process.env.MEDPLUM_ADMIN_CLIENT_ID?.trim() || ''
}

function getAllowedAdminEmails(): string[] {
  return (process.env.OZRYN_ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function sign(payload: string): string {
  return createHmac('sha256', getAdminSessionSecret())
    .update(payload)
    .digest('base64url')
}

function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function decodeSession(token: string | undefined): AdminSession | null {
  if (!token) {
    return null
  }

  const [payload, signature] = token.split('.')
  if (!payload || !signature) {
    return null
  }

  const expectedSignature = sign(payload)
  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as AdminSession

    if (
      !parsed.email ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }

    if (parsed.expiresAt <= Date.now()) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function getMedplumAuthMeUrl(): string {
  const baseUrl = getMedplumBaseUrl()
  if (!baseUrl) {
    return ''
  }

  return new URL('auth/me', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

function extractEmail(payload: MedplumAuthMeResponse): string | null {
  const login = payload.login?.trim().toLowerCase()
  if (login) {
    return login
  }

  const email = payload.profile?.telecom?.find(
    (telecom) => telecom.system === 'email' && telecom.value?.trim(),
  )?.value

  return email?.trim().toLowerCase() ?? null
}

async function fetchAdminIdentity(
  accessToken: string,
): Promise<MedplumAuthMeResponse | null> {
  const authMeUrl = getMedplumAuthMeUrl()
  if (!authMeUrl) {
    return null
  }

  const response = await fetch(authMeUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as MedplumAuthMeResponse
}

export function getAdminLoginConfig(): AdminLoginConfig | null {
  const baseUrl = getMedplumBaseUrl()
  const clientId = getAdminClientId()

  if (!baseUrl || !clientId) {
    return null
  }

  return {
    baseUrl,
    clientId,
  }
}

export function getMissingAdminLoginEnvVars(): string[] {
  const missing: string[] = []

  if (!getMedplumBaseUrl()) {
    missing.push('MEDPLUM_BASE_URL')
  }

  if (!getAdminClientId()) {
    missing.push('MEDPLUM_ADMIN_CLIENT_ID')
  }

  if (!process.env.OZRYN_ADMIN_ALLOWED_EMAILS?.trim()) {
    missing.push('OZRYN_ADMIN_ALLOWED_EMAILS')
  }

  if (!process.env.OZRYN_ADMIN_SESSION_SECRET?.trim()) {
    missing.push('OZRYN_ADMIN_SESSION_SECRET')
  }

  return missing
}

export function isAdminLoginConfigured(): boolean {
  return getMissingAdminLoginEnvVars().length === 0
}

export async function createAdminSessionFromAccessToken(
  accessToken: string,
): Promise<AdminSession | null> {
  if (!isAdminLoginConfigured()) {
    return null
  }

  const identity = await fetchAdminIdentity(accessToken)
  const email = identity ? extractEmail(identity) : null
  if (!email) {
    return null
  }

  if (!getAllowedAdminEmails().includes(email)) {
    return null
  }

  const issuedAt = Date.now()
  return {
    email,
    issuedAt,
    expiresAt: issuedAt + ADMIN_SESSION_TTL_SECONDS * 1000,
  }
}

export function getAdminSessionFromToken(token: string | undefined): AdminSession | null {
  return decodeSession(token)
}

export function getAdminSessionFromRequest(request: NextRequest): AdminSession | null {
  return getAdminSessionFromToken(
    request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value,
  )
}

export async function getAdminSessionFromCookies(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  return getAdminSessionFromToken(
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value,
  )
}

export function attachAdminSession(
  response: NextResponse,
  session: AdminSession,
): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  })

  return response
}

export function clearAdminSession(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
