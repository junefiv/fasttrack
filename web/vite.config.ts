import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 등 서브경로 배포 시 Actions에서 GITHUB_PAGES_BASE 설정
  base: process.env.GITHUB_PAGES_BASE || '/',
})
