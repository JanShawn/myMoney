<script setup>
import { X } from '@lucide/vue'

const { toast, hideToast } = useToast()
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <AppNotice
        v-if="toast.visible"
        class="app-toast"
        :tone="toast.tone"
        :title="toast.title"
        :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"
        aria-atomic="true"
      >
        <div v-if="toast.message">{{ toast.message }}</div>
        <div v-for="detail in toast.details" :key="detail">{{ detail }}</div>
        <template #action>
          <button class="btn btn-ghost btn-icon app-toast__close" type="button" aria-label="關閉通知" @click="hideToast">
            <X :size="16" />
          </button>
        </template>
      </AppNotice>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-toast { position: fixed; z-index: 160; top: 18px; right: 18px; width: min(430px, calc(100vw - 36px)); box-shadow: var(--shadow-md); }
.app-toast :deep(.notice__text) { display: grid; gap: 4px; }
.app-toast__close { width: 30px; min-height: 30px; }
.app-toast-enter-active, .app-toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.app-toast-enter-from, .app-toast-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 620px) {
  .app-toast { top: 10px; right: 10px; width: calc(100vw - 20px); }
}
@media (prefers-reduced-motion: reduce) {
  .app-toast-enter-active, .app-toast-leave-active { transition: none; }
}
</style>
