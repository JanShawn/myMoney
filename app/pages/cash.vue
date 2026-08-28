<script setup>
import { Minus, Plus, Save, Trash2 } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const selectedId = ref('')
const baseAmount = ref(0)
const rows = ref([{ id: crypto.randomUUID(), label: '', amount: 0 }])
const cashItems = computed(() => store.activeItems.filter((item) => item.behavior === 'cash'))
const selected = computed(() => cashItems.value.find((item) => item.id === selectedId.value))
const adjustments = computed(() => rows.value.reduce((sum, row) => sum + Number(row.amount || 0), 0))
const result = computed(() => Number(baseAmount.value || 0) + adjustments.value)

watch(cashItems, (items) => {
  if (!selectedId.value && items[0]) selectedId.value = items[0].id
}, { immediate: true })
watch(selected, (item) => { if (item) baseAmount.value = Number(item.amount || 0) }, { immediate: true })

function addRow(sign = 1) { rows.value.push({ id: crypto.randomUUID(), label: '', amount: sign }) }
async function applyResult() {
  if (!selected.value) return
  await store.updateItem(selected.value.id, { amount: result.value })
  baseAmount.value = result.value
  rows.value = [{ id: crypto.randomUUID(), label: '', amount: 0 }]
}
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
</script>

<template>
  <div>
    <header class="page-header"><div><div class="eyebrow">Cash reconciliation</div><h1 class="page-title">現金驗算</h1><p class="page-subtitle">把複雜的現金來源暫時拆開加減，最後只保存驗算結果。</p></div></header>
    <div class="grid-2" style="align-items: start">
      <section class="card card-body">
        <h2 class="section-title">驗算明細</h2>
        <div v-if="cashItems.length" class="stack" style="margin-top: 16px">
          <div class="form-grid">
            <div class="field"><label for="cash-account">現金帳戶</label><select id="cash-account" v-model="selectedId" class="select"><option v-for="item in cashItems" :key="item.id" :value="item.id">{{ item.name }}</option></select></div>
            <div class="field"><label for="cash-base">開始金額</label><input id="cash-base" v-model.number="baseAmount" class="input amount" type="number" step="1" /></div>
          </div>
          <div class="divider" />
          <div v-for="(row, index) in rows" :key="row.id" class="form-grid" style="grid-template-columns: 1.4fr 1fr auto">
            <div class="field"><label :for="`cash-label-${row.id}`">項目 {{ index + 1 }}</label><input :id="`cash-label-${row.id}`" v-model="row.label" class="input" placeholder="例如：錢包零錢、代墊款" /></div>
            <div class="field"><label :for="`cash-value-${row.id}`">加減金額</label><input :id="`cash-value-${row.id}`" v-model.number="row.amount" class="input amount" type="number" step="1" placeholder="支出填負數" /></div>
            <button class="btn btn-ghost" type="button" aria-label="移除此列" style="align-self: end" :disabled="rows.length === 1" @click="rows.splice(index, 1)"><Trash2 :size="18" /></button>
          </div>
          <div class="toolbar">
            <div style="display:flex; gap:8px"><button class="btn btn-secondary" type="button" @click="addRow(1)"><Plus :size="17" />新增加項</button><button class="btn btn-secondary" type="button" @click="addRow(-1)"><Minus :size="17" />新增減項</button></div>
          </div>
          <div class="notice">這些明細只存在目前畫面。套用結果或離開頁面後不會保存，JSON 快照也只會記錄最後金額。</div>
        </div>
        <div v-else class="empty"><div><strong>還沒有現金驗算帳戶</strong><NuxtLink to="/accounts">建立輸入方式為「現金驗算」的項目</NuxtLink></div></div>
      </section>
      <aside class="card card-body">
        <div class="eyebrow">Reconciled result</div><h2 class="section-title" style="margin-top: 5px">驗算結果</h2>
        <div style="margin: 36px 0; text-align: center"><div class="muted">{{ selected?.name || '尚未選擇帳戶' }}</div><div class="metric-value" style="font-size: 2.4rem">{{ money(result) }}</div><div class="row-meta">開始 {{ money(baseAmount) }} ＋ 調整 {{ money(adjustments) }}</div></div>
        <button class="btn btn-primary" style="width:100%" :disabled="!selected || store.saving" @click="applyResult"><Save :size="18" />套用到現金帳戶</button>
      </aside>
    </div>
  </div>
</template>
