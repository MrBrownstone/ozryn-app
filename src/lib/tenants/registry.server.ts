import 'server-only'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { TenantRecord } from '@/lib/tenants/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const REGISTRY_PATH = path.join(DATA_DIR, 'tenants.local.json')

async function ensureRegistryFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })

  try {
    await readFile(REGISTRY_PATH, 'utf8')
  } catch {
    await writeFile(REGISTRY_PATH, '[]\n', 'utf8')
  }
}

export async function readTenantRegistry(): Promise<TenantRecord[]> {
  await ensureRegistryFile()
  const raw = await readFile(REGISTRY_PATH, 'utf8')
  const data = JSON.parse(raw) as TenantRecord[]
  return Array.isArray(data) ? data : []
}

export async function writeTenantRegistry(tenants: TenantRecord[]): Promise<void> {
  await ensureRegistryFile()
  await writeFile(REGISTRY_PATH, `${JSON.stringify(tenants, null, 2)}\n`, 'utf8')
}

export async function findTenantBySlug(slug: string): Promise<TenantRecord | undefined> {
  const tenants = await readTenantRegistry()
  return tenants.find((tenant) => tenant.slug === slug)
}

export async function saveTenantRecord(tenant: TenantRecord): Promise<void> {
  const tenants = await readTenantRegistry()
  const next = tenants.filter((entry) => entry.slug !== tenant.slug)
  next.push(tenant)
  next.sort((a, b) => a.slug.localeCompare(b.slug))
  await writeTenantRegistry(next)
}

export function getTenantRegistryPath(): string {
  return REGISTRY_PATH
}
