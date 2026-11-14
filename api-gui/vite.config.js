import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileApiPlugin } from './server/plugin.js'

export default defineConfig({
  plugins: [react(), fileApiPlugin()],
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
