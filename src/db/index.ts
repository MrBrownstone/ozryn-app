import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/db/schema'

const globalForDatabase = globalThis as typeof globalThis & {
  ozrynTenantPool?: Pool
  ozrynTenantDb?: NodePgDatabase<typeof schema>
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) {
    throw new Error('Missing DATABASE_URL.')
  }

  return value
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDatabase.ozrynTenantDb) {
    const pool = new Pool({
      connectionString: requireDatabaseUrl(),
    })

    globalForDatabase.ozrynTenantPool = pool
    globalForDatabase.ozrynTenantDb = drizzle(pool, { schema })
  }

  return globalForDatabase.ozrynTenantDb
}
