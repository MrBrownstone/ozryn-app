import { randomUUID } from 'node:crypto'

import { and, asc, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { getDb } from '@/db'
import { tenants } from '@/db/schema'
import type {
  TenantBootstrapStatus,
  TenantRecord,
  TenantStatus,
} from '@/lib/tenants/types'

type TenantRow = InferSelectModel<typeof tenants>

export interface UpsertTenantRecordInput {
  id?: string
  slug: string
  displayName: string
  status: TenantStatus
  bootstrapStatus: TenantBootstrapStatus
  medplumProjectId: string
  medplumOrganizationId: string | null
  medplumClientId: string
  lastProvisioningError?: string | null
  createdAt?: string
  updatedAt?: string
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapTenantRow(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    status: row.status,
    bootstrapStatus: row.bootstrapStatus,
    medplumProjectId: row.medplumProjectId,
    medplumOrganizationId: row.medplumOrganizationId,
    medplumClientId: row.medplumClientId,
    lastProvisioningError: row.lastProvisioningError,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function listTenantRecords(): Promise<TenantRecord[]> {
  const rows = await getDb().select().from(tenants).orderBy(asc(tenants.displayName))
  return rows.map(mapTenantRow)
}

export async function listActiveTenantRecords(): Promise<TenantRecord[]> {
  const rows = await getDb()
    .select()
    .from(tenants)
    .where(eq(tenants.status, 'active'))
    .orderBy(asc(tenants.displayName))

  return rows.map(mapTenantRow)
}

export async function findTenantRecordBySlug(
  slug: string,
): Promise<TenantRecord | null> {
  const [row] = await getDb()
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  return row ? mapTenantRow(row) : null
}

export async function findActiveTenantRecordBySlug(
  slug: string,
): Promise<TenantRecord | null> {
  const [row] = await getDb()
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, 'active')))
    .limit(1)

  return row ? mapTenantRow(row) : null
}

export async function upsertTenantRecord(
  input: UpsertTenantRecordInput,
): Promise<TenantRecord> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date()

  const [row] = await getDb()
    .insert(tenants)
    .values({
      id: input.id ?? randomUUID(),
      slug: input.slug,
      displayName: input.displayName,
      status: input.status,
      bootstrapStatus: input.bootstrapStatus,
      medplumProjectId: input.medplumProjectId,
      medplumOrganizationId: input.medplumOrganizationId,
      medplumClientId: input.medplumClientId,
      lastProvisioningError: input.lastProvisioningError ?? null,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        displayName: input.displayName,
        status: input.status,
        bootstrapStatus: input.bootstrapStatus,
        medplumProjectId: input.medplumProjectId,
        medplumOrganizationId: input.medplumOrganizationId,
        medplumClientId: input.medplumClientId,
        lastProvisioningError: input.lastProvisioningError ?? null,
        updatedAt,
      },
    })
    .returning()

  return mapTenantRow(row)
}
