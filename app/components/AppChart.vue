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
  ? { text: '#b8ceca', muted: '#829b97', grid: '#263a38', tooltip: '#132120' }
  : { text: '#496864', muted: '#758c89', grid: '#edf3f2', tooltip: '#ffffff' })

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { position: 'bottom', labels: { color: chartTheme.value.text, usePointStyle: true, boxWidth: 8, padding: 18 } },
    tooltip: {
      enabled: !props.privacy,
      backgroundColor: chartTheme.value.tooltip,
      titleColor: chartTheme.value.text,
      bodyColor: chartTheme.value.text,
      borderColor: chartTheme.value.grid,
      borderWidth: 1,
      callbacks: { label: (ctx) => `${ctx.dataset.label || ''} ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(ctx.parsed.y ?? ctx.parsed)}` }
    }
  },
  scales: props.type === 'line' ? {
    x: { grid: { display: false }, ticks: { color: chartTheme.value.muted, maxTicksLimit: 7 } },
    y: { grid: { color: chartTheme.value.grid }, ticks: { color: chartTheme.value.muted, callback: props.privacy ? () => '***' : undefined } }
  } : undefined
}))
</script>

<template>
  <div class="chart-wrap" role="img" :aria-label="label">
    <Doughnut v-if="type === 'doughnut'" :data="data" :options="options" />
    <Line v-else :data="data" :options="options" />
  </div>
</template>
