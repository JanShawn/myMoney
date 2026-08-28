import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  ssr: false,
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  nitro: { preset: 'static' },
  app: {
    head: {
      title: 'myMoney 資產盤點',
      meta: [
        { name: 'description', content: '本地優先的個人資產盤點與趨勢工具' },
        { name: 'theme-color', content: '#0f766e' }
      ]
    }
  }
})
