import { config as loadEnv } from 'dotenv'

import { defineConfig } from 'drizzle-kit'

loadEnv({ path: '.env.local' })
loadEnv()

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      'postgres://postgres:postgres@localhost:5432/ozryn',
  },
})
