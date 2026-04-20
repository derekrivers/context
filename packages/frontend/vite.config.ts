import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(here, '../..'), '')
  const backendUrl = env.CONTEXT_BACKEND_URL ?? 'http://127.0.0.1:8180'
  const frontendPort = Number(env.CONTEXT_FRONTEND_PORT ?? '5174')

  return {
    plugins: [
      TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
      react(),
    ],
    resolve: {
      alias: {
        '@': resolve(here, 'src'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    define: {
      'import.meta.env.VITE_CONTEXT_BACKEND_URL': JSON.stringify(
        env.VITE_CONTEXT_BACKEND_URL ?? '/api',
      ),
    },
  }
})
