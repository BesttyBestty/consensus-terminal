import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiPort = process.env.PORT || 3001

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 让同一局域网的手机能打开投票页
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` }
  },
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    include: ['*.test.js'],
    environment: 'node'
  }
})
