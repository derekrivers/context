import { defineConfig } from 'drizzle-kit'

const host = process.env.CONTEXT_PG_HOST ?? 'localhost'
const port = process.env.CONTEXT_PG_PORT ?? '5432'
const user = process.env.CONTEXT_PG_USER ?? 'context'
const password = process.env.CONTEXT_PG_PASSWORD ?? 'context'
const database = process.env.CONTEXT_PG_DATABASE ?? 'context'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['context'],
  dbCredentials: {
    url: `postgresql://${user}:${password}@${host}:${port}/${database}`,
  },
})
