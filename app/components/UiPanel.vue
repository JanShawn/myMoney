<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  flush: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  as: { type: String, default: 'section' }
})
</script>

<template>
  <component :is="as" class="panel" :class="{ 'panel--flush': flush, 'panel--compact': compact }">
    <header v-if="title || eyebrow || description || $slots.action" class="panel__header">
      <div class="panel__heading">
        <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
        <h2 v-if="title" class="section-title">{{ title }}</h2>
        <p v-if="description" class="section-description">{{ description }}</p>
      </div>
      <div v-if="$slots.action" class="panel__action"><slot name="action" /></div>
    </header>
    <div class="panel__body"><slot /></div>
    <footer v-if="$slots.footer" class="panel__footer"><slot name="footer" /></footer>
  </component>
</template>
