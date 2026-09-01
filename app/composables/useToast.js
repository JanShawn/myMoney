let toastTimer

export function useToast() {
  const toast = useState('app-toast', () => ({
    visible: false,
    tone: 'info',
    title: '',
    message: '',
    details: []
  }))

  function hideToast() {
    clearTimeout(toastTimer)
    toast.value.visible = false
  }

  function showToast({ tone = 'info', title = '', message = '', details = [], duration } = {}) {
    clearTimeout(toastTimer)
    toast.value = {
      visible: true,
      tone,
      title,
      message,
      details: Array.isArray(details) ? details.filter(Boolean) : []
    }
    if (!import.meta.client) return
    const timeout = duration ?? ({ success: 4000, info: 4500, warning: 7000, error: 8000 }[tone] || 4500)
    if (timeout > 0) toastTimer = setTimeout(hideToast, timeout)
  }

  return { toast, showToast, hideToast }
}
