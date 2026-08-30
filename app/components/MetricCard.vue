<script setup>
defineProps({ label: String, value: String, note: String, tone: { type: String, default: '' } })
</script>

<template>
  <article class="panel metric-card">
    <div class="metric-label"><slot name="icon" />{{ label }}</div>
    <div class="metric-value" :class="tone">{{ value }}</div>
    <div v-if="note" class="metric-note">{{ note }}</div>
  </article>
</template>
