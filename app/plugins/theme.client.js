import { THEME_STORAGE_KEY } from '~/composables/useTheme'

export default defineNuxtPlugin(() => {
  const theme = useState('color-theme', () => 'light')
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let savedTheme = null
  try {
    savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // 無法讀取 localStorage 時改為跟隨系統主題。
  }

  theme.value = ['light', 'dark'].includes(savedTheme) ? savedTheme : media.matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme.value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#0b1414' : '#0f766e')

  media.addEventListener('change', (event) => {
    try {
      if (window.localStorage.getItem(THEME_STORAGE_KEY)) return
    } catch {
      // 無法讀取設定時繼續跟隨系統主題。
    }
    theme.value = event.matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme.value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#0b1414' : '#0f766e')
  })
})
