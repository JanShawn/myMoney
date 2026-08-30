<script setup>
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
onMounted(() => store.load())
</script>

<template>
  <div class="page-shell">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <AppNavigation />
    <main id="main-content" class="content" tabindex="-1">
      <AppNotice v-if="store.error" tone="error" title="操作沒有完成" class="space-after" aria-live="assertive">
        {{ store.error }}
        <template #action><button class="btn btn-ghost" type="button" @click="store.error = ''">關閉</button></template>
      </AppNotice>
      <slot />
    </main>
  </div>
</template>
