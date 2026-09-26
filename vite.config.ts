import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发态：前端 5173 端口，/api 代理到 Node 服务 3001 端口
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'dist'
  }
});
