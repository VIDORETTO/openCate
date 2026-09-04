import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(process.cwd(), 'companion-web'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), 'dist/companion-web'),
    emptyOutDir: true,
  },
})
