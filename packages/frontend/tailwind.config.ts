import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        'bg-subtle': 'rgb(var(--color-bg-subtle) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--color-fg-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'status-draft': 'rgb(var(--color-status-draft) / <alpha-value>)',
        'status-ready': 'rgb(var(--color-status-ready) / <alpha-value>)',
        'status-sent': 'rgb(var(--color-status-sent) / <alpha-value>)',
        'status-archived': 'rgb(var(--color-status-archived) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}

export default config
