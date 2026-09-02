<script setup>
import { Chart as ChartJS, ArcElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Doughnut, Line } from 'vue-chartjs'

ChartJS.register(ArcElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const props = defineProps({
  type: { type: String, default: 'line' },
  data: { type: Object, required: true },
  label: { type: String, required: true },
  privacy: { type: Boolean, default: false }
})
const { isDark } = useTheme()
const chartTheme = computed(() => isDark.value
  ? { text: '#c2d6d2', muted: '#9bb2ae', grid: '#314542', tooltip: '#132120' }
  : { text: '#496864', muted: '#758c89', grid: '#edf3f2', tooltip: '#ffffff' })

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { position: 'bottom', labels: { color: chartTheme.value.text, usePointStyle: true, boxWidth: 8, padding: 18, font: { size: 13, weight: 600 } } },
    tooltip: {
      enabled: !props.privacy,
      backgroundColor: chartTheme.value.tooltip,
      titleColor: chartTheme.value.text,
      bodyColor: chartTheme.value.text,
      borderColor: chartTheme.value.grid,
      borderWidth: 1,
      titleFont: { size: 13, weight: 700 },
      bodyFont: { size: 13, weight: 500 },
      callbacks: { label: (ctx) => `${ctx.dataset.label || ''} ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(ctx.parsed.y ?? ctx.parsed)}` }
    }
  },
  scales: props.type === 'line' ? {
    x: { grid: { display: false }, ticks: { color: chartTheme.value.muted, maxTicksLimit: 7, font: { size: 12, weight: 500 } } },
    y: { grid: { color: chartTheme.value.grid }, ticks: { color: chartTheme.value.muted, font: { size: 12, weight: 500 }, callback: props.privacy ? () => '***' : undefined } }
  } : undefined
}))
</script>

<template>
  <div class="chart-wrap" role="img" :aria-label="label">
    <Doughnut v-if="type === 'doughnut'" :data="data" :options="options" />
    <Line v-else :data="data" :options="options" />
  </div>
</template>
