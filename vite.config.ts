import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

// Zoom Apps refuse to load unless these OWASP security headers are present.
// The Zoom client also requires its own domain in the CSP/allow list.
const zoomSecurityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; frame-ancestors 'self' https://*.zoom.us",
}

// https://vite.dev/config/
export default defineConfig({
  // mkcert installs a locally-trusted CA and issues a cert for localhost,
  // so the Zoom client's embedded browser accepts https://localhost:5173.
  // Set MKCERT_PATH to use an installed mkcert instead of auto-downloading it.
  plugins: [
    react(),
    tailwindcss(),
    mkcert({ mkcertPath: process.env.MKCERT_PATH }),
  ],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    headers: zoomSecurityHeaders,
  },
  preview: {
    port: 5173,
    strictPort: true,
    headers: zoomSecurityHeaders,
  },
})
