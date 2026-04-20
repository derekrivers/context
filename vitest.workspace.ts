import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'node',
      environment: 'node',
      include: ['packages/{spec-schema,backend,reddwarf-adapter}/tests/**/*.test.ts'],
      fileParallelism: false,
    },
  },
  './packages/frontend/vitest.config.ts',
])
