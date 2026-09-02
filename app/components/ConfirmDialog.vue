<script setup>
import { AlertTriangle, Info } from '@lucide/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  confirmLabel: { type: String, default: '確認' },
  busy: { type: Boolean, default: false },
  tone: { type: String, default: 'danger' }
})

const emit = defineEmits(['close', 'confirm'])
const dialog = ref(null)
const titleId = 'confirm-dialog-title'
const iconComponent = computed(() => props.tone === 'info' ? Info : AlertTriangle)
const confirmButtonClass = computed(() => props.tone === 'danger' ? 'btn-danger' : 'btn-primary')

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  dialog.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" ref="dialog" class="confirm-dialog-backdrop" tabindex="-1" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId">
        <div class="confirm-dialog__icon" :class="`confirm-dialog__icon--${tone}`"><component :is="iconComponent" :size="21" aria-hidden="true" /></div>
        <div class="confirm-dialog__content">
          <h2 :id="titleId">{{ title }}</h2>
          <slot />
        </div>
        <div class="confirm-dialog__actions">
          <button class="btn btn-ghost" type="button" :disabled="busy" @click="emit('close')">取消</button>
          <button class="btn" :class="confirmButtonClass" type="button" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-dialog-backdrop { position: fixed; z-index: 140; inset: 0; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, .32); backdrop-filter: blur(3px); }
.confirm-dialog-backdrop:focus { outline: none; }
.confirm-dialog { width: min(430px, 100%); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 20px; border: 1px solid var(--danger-border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-md); }
.confirm-dialog__icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--danger-soft); color: var(--danger); }
.confirm-dialog__icon--info { background: var(--primary-soft); color: var(--primary); }
.confirm-dialog__icon--warning { background: var(--warning-soft); color: var(--warning); }
.confirm-dialog__content { min-width: 0; }
.confirm-dialog h2 { margin: 1px 0 8px; font-size: 1.02rem; }
.confirm-dialog :deep(p) { margin: 4px 0 0; color: var(--muted); font-size: .8rem; line-height: 1.55; overflow-wrap: anywhere; }
.confirm-dialog :deep(p strong) { color: var(--text); }
.confirm-dialog__actions { display: flex; grid-column: 1 / -1; justify-content: flex-end; gap: 8px; padding-top: 4px; }
@media (max-width: 620px) {
  .confirm-dialog__actions { flex-direction: column; }
  .confirm-dialog__actions .btn { width: 100%; }
}
</style>
