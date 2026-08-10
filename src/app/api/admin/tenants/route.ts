import { NextRequest, NextResponse } from 'next/server'

import { findTenantRecordBySlug, listTenantRecords } from '@/db/tenant-repository'
import { requireProvisioningAccess } from '@/lib/admin/api-auth'
import { createTenant } from '@/lib/provisioning/create-tenant'
import { normalizeSlug } from '@/lib/tenants/slug'
import type { CreateTenantInput } from '@/lib/tenants/types'

function getErrorStatus(message: string): number {
  if (
    message.includes('required') ||
    message.includes('must') ||
    message.includes('At least') ||
    message.includes('Unsupported') ||
    message.includes('already exists')
  ) {
    return 400
  }

  return 500
}

export async function GET(request: NextRequest) {
  const authError = requireProvisioningAccess(request)
  if (authError) {
    return authError
  }

  const tenants = await listTenantRecords()
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
  const existing = slug ? await findTenantRecordBySlug(slug) : null
  if (existing) {
    return NextResponse.json(
      { error: `Tenant "${slug}" already exists in the database.` },
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
      { status: getErrorStatus(message) },
    )
  }
}
