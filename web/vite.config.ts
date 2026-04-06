import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** GitHub 프로젝트 페이지: https://<user>.github.io/<repo>/ → base `/<repo>/` */
function resolveBase(): string {
  const override = process.env.GITHUB_PAGES_BASE?.trim()
  if (override) {
    return override.endsWith('/') ? override : `${override}/`
  }
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
    return `/${repo}/`
  }
  return '/'
}

const base = resolveBase()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'github-pages-spa-404',
      closeBundle() {
        if (base !== '/') {
          const dist = resolve(__dirname, 'dist')
          copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
        }
      },
    },
  ],
  base,
})
