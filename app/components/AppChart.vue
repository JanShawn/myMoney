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

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { position: 'bottom', labels: { color: '#496864', usePointStyle: true, boxWidth: 8, padding: 18 } },
    tooltip: {
      enabled: !props.privacy,
      callbacks: { label: (ctx) => `${ctx.dataset.label || ''} ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(ctx.parsed.y ?? ctx.parsed)}` }
    }
  },
  scales: props.type === 'line' ? {
    x: { grid: { display: false }, ticks: { color: '#758c89', maxTicksLimit: 7 } },
    y: { grid: { color: '#edf3f2' }, ticks: { color: '#758c89', callback: props.privacy ? () => '***' : undefined } }
  } : undefined
}))
</script>

<template>
  <div class="chart-wrap" role="img" :aria-label="label">
    <Doughnut v-if="type === 'doughnut'" :data="data" :options="options" />
    <Line v-else :data="data" :options="options" />
  </div>
</template>
