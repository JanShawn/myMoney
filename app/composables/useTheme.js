const STORAGE_KEY = 'mymoney-color-theme'

export function useTheme() {
  const theme = useState('color-theme', () => 'light')
  const isDark = computed(() => theme.value === 'dark')

  function setTheme(value) {
    const nextTheme = value === 'dark' ? 'dark' : 'light'
    theme.value = nextTheme
    if (!import.meta.client) return
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'dark' ? '#0b1414' : '#0f766e')
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme: readonly(theme), isDark, setTheme, toggleTheme }
}
