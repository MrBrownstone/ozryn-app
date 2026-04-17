import { config as loadEnv } from 'dotenv'

import { defineConfig } from 'drizzle-kit'

loadEnv()
loadEnv({ path: '.env.local', override: true })

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL?.trim() ||
      'postgres://postgres:postgres@localhost:5432/ozryn',
  },
})
