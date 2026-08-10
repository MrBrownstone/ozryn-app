import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'

loadEnv({ path: '.env.local' })
loadEnv()

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL.')
  }

  const pool = new Pool({ connectionString })

  try {
    const db = drizzle(pool)
    await migrate(db, {
      migrationsFolder: './drizzle',
    })
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
