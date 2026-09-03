import tailwindcss from '@tailwindcss/vite'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.finmindtrade.com https://open.er-api.com https://openapi.twse.com.tw https://www.twse.com.tw https://www.tpex.org.tw",
  "worker-src 'self' blob:"
].join('; ')

export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  ssr: false,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  devServer: { host: '127.0.0.1', port: 3000 },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()], server: { strictPort: true } },
  nitro: {
    preset: 'static',
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': contentSecurityPolicy,
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
        }
      }
    }
  },
  app: {
    head: {
      title: 'myMoney 資產盤點',
      meta: [
        { name: 'description', content: '本地優先的個人資產盤點與趨勢工具' },
        { name: 'theme-color', content: '#0f766e' },
        { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
        { name: 'referrer', content: 'strict-origin-when-cross-origin' }
      ],
      script: [{
        key: 'theme-init',
        innerHTML: "(()=>{try{const saved=localStorage.getItem('mymoney-color-theme');const theme=saved==='dark'||saved==='light'?saved:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme}catch{}})()"
      }]
    }
  }
})
