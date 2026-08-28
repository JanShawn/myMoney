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
      <div v-if="store.error" class="notice notice-error" role="alert" aria-live="assertive" style="margin-bottom: 16px">
        <span>{{ store.error }}</span>
        <button class="btn btn-ghost" type="button" @click="store.error = ''">關閉</button>
      </div>
      <slot />
    </main>
  </div>
</template>
