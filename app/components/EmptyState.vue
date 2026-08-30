<script setup>
import { Inbox } from '@lucide/vue'

defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' }
})
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon"><slot name="icon"><Inbox :size="22" /></slot></div>
    <strong class="empty-state__title">{{ title }}</strong>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action"><slot name="action" /></div>
  </div>
</template>
