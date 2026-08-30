<script setup>
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from '@lucide/vue'

const props = defineProps({
  tone: { type: String, default: 'info' },
  title: { type: String, default: '' }
})

const icon = computed(() => ({
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle
}[props.tone] || Info))
</script>

<template>
  <div class="notice" :class="`notice--${tone}`" :role="tone === 'error' ? 'alert' : 'status'">
    <component :is="icon" class="notice__icon" :size="19" aria-hidden="true" />
    <div class="notice__content">
      <strong v-if="title" class="notice__title">{{ title }}</strong>
      <div class="notice__text"><slot /></div>
    </div>
    <div v-if="$slots.action" class="notice__action"><slot name="action" /></div>
  </div>
</template>
