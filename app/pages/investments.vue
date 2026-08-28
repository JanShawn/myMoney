<script setup>
import { Archive, RefreshCw } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const form = reactive({ ticker: '', name: '', quantity: 0, assetClass: 'equity', direction: 'long', multiplier: 1, price: 0, priceSource: 'manual', liquidity: 'convertible', includeInAssets: true })
const marketResult = ref(null)
const classLabels = { equity: '股票', bond: '債券', other: '其他' }
const directionLabels = { long: '一般／做多', inverse: '反向商品' }
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)

async function submit() {
  await store.addHolding({ ...form, quantity: Number(form.quantity), multiplier: Number(form.multiplier), price: Number(form.price) })
  Object.assign(form, { ticker: '', name: '', quantity: 0, assetClass: 'equity', direction: 'long', multiplier: 1, price: 0, priceSource: 'manual', liquidity: 'convertible', includeInAssets: true })
}
async function refreshMarket() { marketResult.value = await store.marketPreview() }
async function savePrice(holding, event) { await store.updateHolding(holding.id, { price: Number(event.target.value), priceSource: 'manual' }) }
</script>

<template>
  <div>
    <header class="page-header">
      <div><div class="eyebrow">Holdings</div><h1 class="page-title">投資持倉</h1><p class="page-subtitle">只有這裡的股票與債券會進入投資分類；券商剩餘現金請建立成一般現金帳戶。</p></div>
      <button class="btn btn-secondary" :disabled="store.saving || !store.activeHoldings.length" @click="refreshMarket"><RefreshCw :size="18" />更新收盤價</button>
    </header>
    <div v-if="marketResult?.warnings?.length" class="notice notice-warning" style="margin-bottom: 16px"><div><strong>市場資料提醒</strong><div v-for="warning in marketResult.warnings" :key="warning">{{ warning }}</div></div></div>
    <div class="grid-2">
      <section class="card card-body">
        <h2 class="section-title">新增持倉</h2>
        <form class="form-grid" style="margin-top: 16px" @submit.prevent="submit">
          <div class="field"><label for="ticker">股票／商品代號</label><input id="ticker" v-model.trim="form.ticker" class="input" placeholder="例如：0050" required /></div>
          <div class="field"><label for="holding-name">名稱</label><input id="holding-name" v-model="form.name" class="input" placeholder="例如：元大台灣50" required /></div>
          <div class="field"><label for="quantity">持有數量</label><input id="quantity" v-model.number="form.quantity" class="input" type="number" min="0" step="0.0001" required /></div>
          <div class="field"><label for="price">目前價格</label><input id="price" v-model.number="form.price" class="input" type="number" min="0" step="0.01" required /></div>
          <div class="field"><label for="holding-class">資產類別</label><select id="holding-class" v-model="form.assetClass" class="select"><option v-for="(label, value) in classLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="direction">商品方向</label><select id="direction" v-model="form.direction" class="select"><option v-for="(label, value) in directionLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="multiplier">乘數</label><input id="multiplier" v-model.number="form.multiplier" class="input" type="number" min="0.0001" step="0.0001" /><span class="row-meta">一般股票填 1；特殊商品才調整。</span></div>
          <label class="checkbox"><input v-model="form.includeInAssets" type="checkbox" />納入總資產</label>
          <button class="btn btn-primary full" :disabled="store.saving">新增持倉</button>
        </form>
      </section>
      <section class="card card-body">
        <div class="toolbar"><div><h2 class="section-title">目前持倉</h2><p class="row-meta">{{ store.activeHoldings.length }} 筆</p></div><span class="pill pill-blue">市值 {{ money(store.summary?.totalStocks + store.summary?.totalBonds) }}</span></div>
        <div v-if="store.activeHoldings.length">
          <div v-for="holding in store.activeHoldings" :key="holding.id" class="list-row" style="grid-template-columns: 1.2fr .7fr 1fr auto">
            <div><div class="row-title">{{ holding.ticker }} · {{ holding.name }}</div><div class="row-meta">{{ classLabels[holding.assetClass] }} · {{ directionLabels[holding.direction] }} · {{ holding.quantity.toLocaleString('zh-TW') }} 單位</div></div>
            <span class="pill">{{ holding.priceSource === 'auto' ? '自動價格' : '手動價格' }}</span>
            <div class="field"><label class="sr-only" :for="`price-${holding.id}`">{{ holding.name }} 價格</label><input :id="`price-${holding.id}`" class="input amount" type="number" step="0.01" :value="holding.price" @change="savePrice(holding, $event)" /><span class="row-meta amount">{{ money(holding.quantity * holding.price * holding.multiplier) }}</span></div>
            <button class="btn btn-ghost" type="button" :aria-label="`封存 ${holding.name}`" @click="store.updateHolding(holding.id, { archived: true })"><Archive :size="17" /></button>
          </div>
        </div>
        <div v-else class="empty"><div><strong>還沒有投資持倉</strong>建立持倉後即可自動計算市值與類別占比。</div></div>
      </section>
    </div>
  </div>
</template>
