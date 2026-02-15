import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
