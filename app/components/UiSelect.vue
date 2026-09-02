<script setup>
import { Check, ChevronDown } from '@lucide/vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  id: { type: String, required: true },
  options: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '請選擇' }
})

const model = defineModel({ default: '' })
const root = ref(null)
const trigger = ref(null)
const menu = ref(null)
const open = ref(false)
const activeIndex = ref(0)
const menuStyle = ref({})

const selectedIndex = computed(() => props.options.findIndex((option) => option.value === model.value))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label || props.placeholder)

function close() {
  open.value = false
}

function updateMenuPosition() {
  if (!open.value || !trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const estimatedHeight = Math.min(320, props.options.length * 42 + 12)
  const spaceBelow = window.innerHeight - rect.bottom - 16
  const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow
  menuStyle.value = {
    left: `${Math.max(8, rect.left)}px`,
    top: `${openAbove ? Math.max(8, rect.top - estimatedHeight - 7) : rect.bottom + 7}px`,
    width: `${Math.min(rect.width, window.innerWidth - 16)}px`,
    maxHeight: `${Math.max(120, openAbove ? rect.top - 23 : spaceBelow)}px`
  }
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIndex.value = Math.max(0, selectedIndex.value)
    nextTick(updateMenuPosition)
  }
}

function choose(option) {
  model.value = option.value
  close()
  nextTick(() => trigger.value?.focus())
}

function onKeydown(event) {
  if (props.disabled) return
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) toggle()
    else choose(props.options[activeIndex.value])
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) open.value = true
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + direction + props.options.length) % props.options.length
  }
}

function handleOutside(event) {
  if (!root.value?.contains(event.target) && !menu.value?.contains(event.target)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>

<template>
  <div ref="root" class="ui-select" :class="{ 'ui-select--open': open, 'ui-select--disabled': disabled }">
    <button
      :id="id"
      ref="trigger"
      v-bind="$attrs"
      type="button"
      class="ui-select__trigger"
      role="combobox"
      :aria-controls="`${id}-options`"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="ui-select__value">{{ selectedLabel }}</span>
      <ChevronDown class="ui-select__chevron" :size="18" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <div v-if="open" :id="`${id}-options`" ref="menu" class="ui-select__menu" :style="menuStyle" role="listbox" :aria-labelledby="id">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        class="ui-select__option"
        :class="{ 'ui-select__option--active': index === activeIndex, 'ui-select__option--selected': option.value === model }"
        role="option"
        :aria-selected="option.value === model"
        @pointerenter="activeIndex = index"
        @click="choose(option)"
      >
        <span>{{ option.label }}</span>
        <Check v-if="option.value === model" :size="17" aria-hidden="true" />
      </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ui-select { position: relative; min-width: 0; }
.ui-select__trigger { width: 100%; min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px 8px 11px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); cursor: pointer; text-align: left; transition: border-color .18s, box-shadow .18s, background .18s; }
.ui-select__trigger:hover:not(:disabled) { border-color: var(--control-hover-border); background: var(--surface-hover); }
.ui-select__trigger:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--control-ring); }
.ui-select__value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-select__chevron { flex: 0 0 auto; color: var(--muted); transition: transform .18s, color .18s; }
.ui-select--open .ui-select__trigger { border-color: var(--primary); box-shadow: 0 0 0 3px var(--control-ring); }
.ui-select--open .ui-select__chevron { color: var(--primary); transform: rotate(180deg); }
.ui-select--disabled .ui-select__trigger { background: var(--surface-disabled); color: var(--muted); cursor: not-allowed; }
.ui-select__menu { position: fixed; z-index: 120; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 6px; border: 1px solid var(--border); border-radius: 13px; background: var(--surface-elevated); box-shadow: var(--shadow-md); backdrop-filter: blur(14px); }
.ui-select__menu::-webkit-scrollbar { width: 0; height: 0; }
.ui-select__option { width: 100%; min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--text-soft); cursor: pointer; text-align: left; font-size: .86rem; }
.ui-select__option--active { background: var(--surface-hover); color: var(--text); }
.ui-select__option--selected { background: var(--primary-soft); color: var(--primary); font-weight: 730; }
</style>
