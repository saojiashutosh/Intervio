import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: the browser talks to Vite (5173); /api is proxied to Django (8000) so no CORS needed.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
