<script setup>
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()

watch(() => store.error, (message) => {
  if (!message) return
  showToast({ tone: 'error', title: '操作沒有完成', message })
  store.error = ''
})
onMounted(() => store.load())
</script>

<template>
  <div class="page-shell">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <AppNavigation />
    <AppToast />
    <main id="main-content" class="content" tabindex="-1">
      <slot />
    </main>
  </div>
</template>
