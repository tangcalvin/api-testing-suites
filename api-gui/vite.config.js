import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileApiPlugin } from './server/plugin.js'

const proxy = {
  '/backend': {
    target: 'http://localhost:8088',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/backend/, ''),
  },
}

export default defineConfig({
  plugins: [react(), fileApiPlugin()],
  server: {
    port: 3000,
    strictPort: true,
    proxy,
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy,
  },
})
