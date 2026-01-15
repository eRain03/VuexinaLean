/*
 * 文件名: vite.config.js
 * 作用: 配置反向代理，增加 secure: false 设置
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 代理配置
      '/api': {
        target: 'https://api.binance.com', // 目标地址
        changeOrigin: true,                // 允许跨域
        secure: false,                     // 关键：关闭 SSL 验证，防止 500 错误
        rewrite: (path) => path.replace(/^\/api/, '') // 去掉路径中的 /api
      }
    }
  }
})