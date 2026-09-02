<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: { type: [Number, String], default: '' },
  allowDecimal: { type: Boolean, default: true },
  allowNegative: { type: Boolean, default: false },
  maxFractionDigits: { type: Number, default: 2 },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined }
})
const emit = defineEmits(['update:modelValue', 'change', 'blur', 'focus'])
const focused = ref(false)
const displayValue = ref('')
const inputElement = ref(null)

defineExpose({ focus: () => inputElement.value?.focus() })

function groupDigits(value) {
  const [integer = '', decimal] = String(value).split('.')
  const sign = integer.startsWith('-') ? '-' : ''
  const digits = integer.replace('-', '') || '0'
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimal === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${decimal}`
}

function sanitize(value) {
  let raw = String(value ?? '').replace(/,/g, '').replace(/\s/g, '')
  const negative = props.allowNegative && raw.startsWith('-')
  raw = raw.replace(/[^\d.]/g, '')
  const [integerPart = '', ...decimalParts] = raw.split('.')
  let integer = integerPart.replace(/^0+(?=\d)/, '')
  if (!integer && (raw.includes('.') || decimalParts.length)) integer = '0'
  if (!props.allowDecimal || props.maxFractionDigits <= 0) return `${negative ? '-' : ''}${integer}`
  const hasDecimal = raw.includes('.')
  const decimal = decimalParts.join('').slice(0, props.maxFractionDigits)
  return `${negative ? '-' : ''}${integer}${hasDecimal ? `.${decimal}` : ''}`
}

function formatValue(value) {
  if (value === '' || value == null || !Number.isFinite(Number(value))) return ''
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: props.allowDecimal ? props.maxFractionDigits : 0
  }).format(Number(value))
}

function update(event) {
  const raw = sanitize(event.target.value)
  const nextDisplayValue = raw === '' || raw === '-' ? raw : groupDigits(raw)
  displayValue.value = nextDisplayValue
  // 直接同步原生輸入框，避免快速輸入 0 時，瀏覽器值在 Vue 更新前暫時累加成「00」。
  if (event.target.value !== nextDisplayValue) event.target.value = nextDisplayValue
  const numeric = Number(raw)
  emit('update:modelValue', raw === '' || raw === '-' || raw.endsWith('.') || !Number.isFinite(numeric) ? '' : numeric)
}

function commit(event) {
  focused.value = false
  const raw = sanitize(event.target.value)
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
    displayValue.value = ''
    emit('update:modelValue', '')
    emit('change', '')
    emit('blur', event)
    return
  }
  let numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    displayValue.value = ''
    emit('update:modelValue', '')
    emit('change', '')
    emit('blur', event)
    return
  }
  if (props.min !== undefined) numeric = Math.max(props.min, numeric)
  if (props.max !== undefined) numeric = Math.min(props.max, numeric)
  displayValue.value = formatValue(numeric)
  emit('update:modelValue', numeric)
  emit('change', numeric)
  emit('blur', event)
}

function handleFocus(event) {
  focused.value = true
  emit('focus', event)
}

watch(() => props.modelValue, (value) => {
  if (!focused.value) displayValue.value = formatValue(value)
}, { immediate: true })
</script>

<template>
  <input
    ref="inputElement"
    v-bind="$attrs"
    :value="displayValue"
    type="text"
    :inputmode="allowDecimal ? 'decimal' : 'numeric'"
    @input="update"
    @focus="handleFocus"
    @blur="commit"
  />
</template>
