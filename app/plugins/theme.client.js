const STORAGE_KEY = 'mymoney-color-theme'

export default defineNuxtPlugin(() => {
  const theme = useState('color-theme', () => 'light')
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const savedTheme = window.localStorage.getItem(STORAGE_KEY)

  theme.value = ['light', 'dark'].includes(savedTheme) ? savedTheme : media.matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme.value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#0b1414' : '#0f766e')

  media.addEventListener('change', (event) => {
    if (window.localStorage.getItem(STORAGE_KEY)) return
    theme.value = event.matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme.value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#0b1414' : '#0f766e')
  })
})
