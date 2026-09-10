<script setup>
import {Copy, ListChecks, Plus, RefreshCw, RotateCcw, Trash2} from '@lucide/vue'
import {copyStockBuyListFormat} from '~/services/stock-buy-list-export'
import {useMoneyStore} from '~/stores/money'

const store = useMoneyStore()
const {showToast} = useToast()
const form = reactive({ticker: ''})
const tickerInput = ref(null)
const stockLookupLoading = ref(false)
const resetDialogOpen = ref(false)
const pendingDeleteId = ref('')
const priceDrafts = reactive({})
const quantityDrafts = reactive({})
const stockQuotes = reactive({})
const quoteLoading = ref(false)
const quoteError = ref('')
let quoteRequestId = 0
let quoteRefreshTimer = null

const pendingDeleteItem = computed(
  () =>
    store.stockBuyList.find((item) => item.id === pendingDeleteId.value) ||
    null,
)
const boughtCount = computed(
  () => store.stockBuyList.filter((item) => item.bought).length,
)
const hasDailyData = computed(() =>
  store.stockBuyList.some(
    (item) =>
      item.bought || Number(item.buyPrice) > 0 || Number(item.quantity) > 0,
  ),
)
const displayPrice = (item) => priceDrafts[item.id] ?? item.buyPrice
const displayQuantity = (item) => quantityDrafts[item.id] ?? item.quantity
const latestQuoteDate = computed(
  () =>
    Object.values(stockQuotes)
      .map((quote) => quote.marketDate)
      .filter(Boolean)
      .sort()
      .at(-1) || '',
)
const latestQuoteTime = computed(
  () =>
    Object.values(stockQuotes)
      .map((quote) => quote.quoteTime)
      .filter(Boolean)
      .sort()
      .at(-1) || '',
)
const todayTotal = computed(() =>
  store.stockBuyList.reduce((total, item) => {
    if (!item.bought) return total
    return (
      total +
      Number(displayPrice(item) || 0) * Number(displayQuantity(item) || 0)
    )
  }, 0),
)
const money = (value) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0)
const priceMoney = (value) => (Number(value) > 0 ? money(value) : '—')
const quoteFor = (item) => stockQuotes[item.ticker] || null
const quoteDate = (value) => String(value || '').replaceAll('-', '/')
const quoteTime = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
const priceChangePercent = (currentPrice, basePrice) => {
  const current = Number(currentPrice)
  const base = Number(basePrice)
  return current > 0 && base > 0 ? ((current - base) / base) * 100 : null
}
const percentText = (value) => {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.005) return '0.00%'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}
const changeTone = (value) =>
  Number(value) > 0
    ? 'quote-change--positive'
    : Number(value) < 0
      ? 'quote-change--negative'
      : 'quote-change--neutral'

async function refreshBuyListQuotes({force = false, notify = false} = {}) {
  const requestId = ++quoteRequestId
  if (!store.stockBuyList.length) {
    for (const ticker of Object.keys(stockQuotes)) delete stockQuotes[ticker]
    quoteError.value = ''
    quoteLoading.value = false
    return
  }

  quoteLoading.value = true
  quoteError.value = ''
  try {
    const result = await store.loadStockBuyListQuotes(force)
    if (requestId !== quoteRequestId) return
    for (const ticker of Object.keys(stockQuotes)) delete stockQuotes[ticker]
    Object.assign(stockQuotes, result.quotes)
    if (!Object.keys(result.quotes).length) {
      quoteError.value = result.warnings[0] || '暫時無法取得行情資料。'
    }
    if (notify) {
      showToast({
        tone: Object.keys(result.quotes).length ? 'success' : 'error',
        title: Object.keys(result.quotes).length
          ? '行情已更新'
          : '行情更新失敗',
        message: latestQuoteDate.value
          ? `最新行情日 ${quoteDate(latestQuoteDate.value)}。`
          : quoteError.value,
      })
    }
  } catch (error) {
    if (requestId !== quoteRequestId) return
    quoteError.value = error?.message || '暫時無法取得行情資料。'
    if (notify) {
      showToast({
        tone: 'error',
        title: '行情更新失敗',
        message: quoteError.value,
      })
    }
  } finally {
    if (requestId === quoteRequestId) quoteLoading.value = false
  }
}

async function addStock() {
  if (!String(form.ticker || '').trim()) {
    showToast({
      tone: 'error',
      title: '無法加入股票',
      message: '請輸入股票代號。',
    })
    tickerInput.value?.focus()
    return
  }
  stockLookupLoading.value = true
  try {
    const instrument = await store.lookupStockName(form.ticker)
    const item = await store.addStockBuyListItem({
      ticker: instrument.ticker,
      name: instrument.name,
    })
    form.ticker = ''
    showToast({
      tone: 'success',
      title: '已加入待買清單',
      message: `「${item.ticker} · ${item.name}」會持續保留，直到你刪除它。`,
    })
    await nextTick()
    tickerInput.value?.focus()
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '無法加入股票',
      message: error?.message || '無法儲存資料。',
    })
  } finally {
    stockLookupLoading.value = false
  }
}

let stockNameHydrationRunning = false
async function hydrateMissingStockNames() {
  if (stockNameHydrationRunning) return
  const missingItems = store.stockBuyList.filter((item) => !item.name)
  if (!missingItems.length) return
  stockNameHydrationRunning = true
  try {
    const resolvedNames = []
    for (const item of missingItems) {
      try {
        const instrument = await store.lookupStockName(item.ticker)
        resolvedNames.push({id: item.id, name: instrument.name})
      } catch {
        // 個別代號查不到時保留代號，不影響其他股票補上名稱。
      }
    }
    if (resolvedNames.length) await store.updateStockBuyListNames(resolvedNames)
  } catch {
    store.error = ''
  } finally {
    stockNameHydrationRunning = false
  }
}

watch(
  () =>
    store.stockBuyList
      .map((item) => `${item.id}:${item.ticker}:${item.name}`)
      .join('|'),
  () => hydrateMissingStockNames(),
  {immediate: true},
)

watch(
  () => store.stockBuyList.map((item) => item.ticker).join('|'),
  () => refreshBuyListQuotes(),
  {immediate: true},
)

onMounted(() => {
  quoteRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !quoteLoading.value) {
      refreshBuyListQuotes({force: true})
    }
  }, 60_000)
})

onBeforeUnmount(() => {
  if (quoteRefreshTimer != null) window.clearInterval(quoteRefreshTimer)
})

async function copyStockListFormat() {
  try {
    const result = await copyStockBuyListFormat(store.stockBuyList)
    showToast({
      tone: 'success',
      title: '完整股票資料已複製',
      message: `待買清單已放入 key 3，共 ${result.count} 筆（包含 ^TWII）。`,
    })
  } catch (error) {
    showToast({
      tone: 'error',
      title: '無法複製股票格式',
      message: error?.message || '瀏覽器無法寫入剪貼簿。',
    })
  }
}

async function saveNumber(item, key, value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number < 0) {
    showToast({
      tone: 'error',
      title: '數字沒有保存',
      message: key === 'buyPrice' ? '買進價格不能小於 0。' : '股數不能小於 0。',
    })
    if (key === 'buyPrice') delete priceDrafts[item.id]
    else delete quantityDrafts[item.id]
    return
  }
  try {
    await store.updateStockBuyListItem(item.id, {[key]: number})
    if (key === 'buyPrice') delete priceDrafts[item.id]
    else delete quantityDrafts[item.id]
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '數字沒有保存',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function focusNextStock(item) {
  const currentIndex = store.stockBuyList.findIndex(
    (entry) => entry.id === item.id,
  )
  const nextItem = store.stockBuyList[currentIndex + 1]
  if (!nextItem) return
  await nextTick()
  document.getElementById(`buy-price-${nextItem.id}`)?.focus()
}

async function toggleBought(item, event, focusNext = false) {
  const bought = event.target.checked
  const buyPrice = Number(displayPrice(item) || 0)
  const quantity = Number(displayQuantity(item) || 0)
  if (bought && (!(buyPrice > 0) || !(quantity > 0))) {
    event.target.checked = false
    showToast({
      tone: 'error',
      title: '還不能標記為已買進',
      message: '請先填寫大於 0 的買進價格與股數。',
    })
    const missingField = !(buyPrice > 0)
      ? `buy-price-${item.id}`
      : `buy-quantity-${item.id}`
    await nextTick()
    document.getElementById(missingField)?.focus()
    return
  }
  try {
    await store.updateStockBuyListItem(item.id, {buyPrice, quantity, bought})
    delete priceDrafts[item.id]
    delete quantityDrafts[item.id]
    if (bought && focusNext) await focusNextStock(item)
  } catch (error) {
    event.target.checked = item.bought
    store.error = ''
    showToast({
      tone: 'error',
      title: '狀態沒有保存',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function markBoughtWithEnter(item, event) {
  if (event.repeat) return
  if (item.bought) {
    await focusNextStock(item)
    return
  }
  event.target.checked = true
  await toggleBought(item, event, true)
}

async function confirmReset() {
  try {
    await store.resetStockBuyListDaily()
    for (const key of Object.keys(priceDrafts)) delete priceDrafts[key]
    for (const key of Object.keys(quantityDrafts)) delete quantityDrafts[key]
    resetDialogOpen.value = false
    showToast({
      tone: 'success',
      title: '今日紀錄已重設',
      message: '已清除買進價格、股數與 checkbox；股票仍保留在清單中。',
    })
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: 'Reset 沒有完成',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function confirmDelete() {
  const item = pendingDeleteItem.value
  if (!item) return
  try {
    await store.deleteStockBuyListItem(item.id)
    delete priceDrafts[item.id]
    delete quantityDrafts[item.id]
    pendingDeleteId.value = ''
    showToast({
      tone: 'success',
      title: '股票已刪除',
      message: `已從待買清單移除「${item.ticker}」。`,
    })
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '刪除沒有完成',
      message: error?.message || '無法儲存資料。',
    })
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Daily buy list"
      title="股票待買清單"
      description="每天填入實際買進價格與股數，完成後勾選；股票會持續保留到你主動刪除。"
    >
      <template #actions>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="quoteLoading || !store.stockBuyList.length"
          @click="refreshBuyListQuotes({force: true, notify: true})"
        >
          <RefreshCw
            :class="{spin: quoteLoading}"
            :size="18"
            aria-hidden="true"
          />
          {{ quoteLoading ? '更新行情中…' : '更新行情' }}
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="!store.stockBuyList.length"
          @click="copyStockListFormat"
        >
          <Copy :size="18" aria-hidden="true" />
          複製完整股票資料
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="store.saving || !hasDailyData"
          @click="resetDialogOpen = true"
        >
          <RotateCcw :size="18" aria-hidden="true" />
          Reset 今日紀錄
        </button>
      </template>
    </PageHeader>

    <div class="buy-list-workspace">
      <UiPanel
        class="add-stock-panel"
        title="加入待買股票"
        description="輸入股票代號即可；每天的價格與股數不會預設保留。"
      >
        <form class="add-stock-form" @submit.prevent="addStock">
          <div class="field">
            <label for="buy-list-ticker">股票代號</label>
            <input
              id="buy-list-ticker"
              ref="tickerInput"
              v-model.trim="form.ticker"
              class="input"
              type="text"
              maxlength="12"
              autocomplete="off"
              placeholder="例如：2330"
              required
              :disabled="stockLookupLoading"
            />
          </div>
          <button
            class="btn btn-primary btn-block"
            type="submit"
            :disabled="store.saving || stockLookupLoading"
          >
            <Plus :size="18" aria-hidden="true" />
            {{ stockLookupLoading ? '查詢名稱中…' : '加入清單' }}
          </button>
        </form>
      </UiPanel>

      <UiPanel
        class="today-buy-panel"
        flush
        title="今日買進"
        description="依股票代號排序；Yahoo Finance 行情每分鐘更新。輸入價格、股數後，Tab 到今日狀態按 Enter 即可完成。"
      >
        <template #action>
          <div class="buy-summary" aria-live="polite">
            <span v-if="latestQuoteDate" class="pill pill-neutral"
              >Yahoo {{ quoteDate(latestQuoteDate) }}
              {{ quoteTime(latestQuoteTime) }}</span
            >
            <span class="pill pill-neutral"
              >{{ boughtCount }} / {{ store.stockBuyList.length }} 已買進</span
            >
            <span class="pill">今日合計 {{ money(todayTotal) }}</span>
          </div>
        </template>

        <AppNotice
          v-if="quoteError"
          tone="warning"
          title="行情暫時無法更新"
          >{{ quoteError }}</AppNotice
        >

        <div v-if="store.stockBuyList.length" class="buy-list-table">
          <div class="buy-list-header" aria-hidden="true">
            <span>股票與行情</span>
            <span>當時買進價格</span>
            <span>系統計算股數</span>
            <span>今日狀態</span>
            <span />
          </div>
          <article
            v-for="item in store.stockBuyList"
            :key="item.id"
            class="buy-row"
            :class="{'buy-row--done': item.bought}"
          >
            <div class="buy-row__identity">
              <strong>{{ item.ticker }}</strong>
              <span v-if="item.name">{{ item.name }}</span>
              <div v-if="quoteFor(item)" class="buy-row__quote">
                <small
                  >開盤 {{ priceMoney(quoteFor(item).openPrice) }} · 最新
                  {{ priceMoney(quoteFor(item).currentPrice) }} ·
                  {{ quoteTime(quoteFor(item).quoteTime) }}</small
                >
                <div class="quote-comparisons">
                  <span
                    :class="
                      changeTone(
                        priceChangePercent(
                          quoteFor(item).currentPrice,
                          quoteFor(item).openPrice,
                        ),
                      )
                    "
                  >
                    較開盤
                    {{
                      percentText(
                        priceChangePercent(
                          quoteFor(item).currentPrice,
                          quoteFor(item).openPrice,
                        ),
                      )
                    }}
                  </span>
                  <span
                    :class="
                      changeTone(
                        priceChangePercent(
                          quoteFor(item).currentPrice,
                          displayPrice(item),
                        ),
                      )
                    "
                  >
                    較買進
                    {{
                      percentText(
                        priceChangePercent(
                          quoteFor(item).currentPrice,
                          displayPrice(item),
                        ),
                      )
                    }}
                  </span>
                </div>
              </div>
              <small v-else class="buy-row__quote-status">{{
                quoteLoading ? '行情載入中…' : '暫無行情'
              }}</small>
            </div>

            <div class="buy-field buy-field--price">
              <label class="buy-field__label" :for="`buy-price-${item.id}`"
                >買進價格</label
              >
              <div class="number-control">
                <span>NT$</span>
                <FormattedNumberInput
                  :id="`buy-price-${item.id}`"
                  class="input input--amount"
                  :model-value="displayPrice(item)"
                  :min="0"
                  :max-fraction-digits="4"
                  placeholder="0"
                  @update:model-value="priceDrafts[item.id] = $event"
                  @change="saveNumber(item, 'buyPrice', $event)"
                />
              </div>
            </div>

            <div class="buy-field buy-field--quantity">
              <label class="buy-field__label" :for="`buy-quantity-${item.id}`"
                >股數</label
              >
              <div class="number-control">
                <FormattedNumberInput
                  :id="`buy-quantity-${item.id}`"
                  class="input input--amount"
                  :model-value="displayQuantity(item)"
                  :min="0"
                  :max-fraction-digits="8"
                  placeholder="0"
                  @update:model-value="quantityDrafts[item.id] = $event"
                  @change="saveNumber(item, 'quantity', $event)"
                />
                <span>股</span>
              </div>
            </div>

            <label class="purchase-check">
              <input
                type="checkbox"
                :checked="item.bought"
                @change="toggleBought(item, $event)"
                @keydown.enter.prevent="markBoughtWithEnter(item, $event)"
              />
              <span>{{ item.bought ? '今日已買進' : '尚未買進' }}</span>
            </label>

            <button
              class="btn btn-ghost btn-icon buy-row__delete"
              type="button"
              :aria-label="`刪除 ${item.ticker}${item.name ? ` ${item.name}` : ''}`"
              @click="pendingDeleteId = item.id"
            >
              <Trash2 :size="17" aria-hidden="true" />
            </button>
          </article>
        </div>

        <EmptyState
          v-else
          title="還沒有待買股票"
          description="使用左側的加入區建立第一檔股票；之後每天只要填價格、股數並勾選即可。"
        >
          <template #icon
            ><ListChecks :size="22" aria-hidden="true"
          /></template>
          <template #action
            ><button
              class="btn btn-primary"
              type="button"
              @click="tickerInput?.focus()"
            >
              加入第一檔股票
            </button></template
          >
        </EmptyState>
      </UiPanel>
    </div>

    <ConfirmDialog
      :open="resetDialogOpen"
      title="Reset 今日買進紀錄？"
      confirm-label="確認 Reset"
      tone="info"
      :busy="store.saving"
      @close="resetDialogOpen = false"
      @confirm="confirmReset"
    >
      <p>
        將清除所有股票的<strong>買進價格、股數與已買進 checkbox</strong
        >；股票本身會保留在清單中。
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(pendingDeleteItem)"
      title="刪除這檔待買股票？"
      confirm-label="確認刪除"
      :busy="store.saving"
      @close="pendingDeleteId = ''"
      @confirm="confirmDelete"
    >
      <p v-if="pendingDeleteItem">
        「<strong
          >{{ pendingDeleteItem.ticker
          }}<template v-if="pendingDeleteItem.name">
            · {{ pendingDeleteItem.name }}</template
          ></strong
        >」會從清單永久移除。
      </p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.buy-list-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 310px) minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
.add-stock-panel {
  position: sticky;
  top: 12px;
}
.add-stock-form {
  display: grid;
  gap: 13px;
}
.today-buy-panel {
  min-width: 0;
}
.buy-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.buy-list-table {
  padding-top: 10px;
}
.buy-list-header,
.buy-row {
  display: grid;
  grid-template-columns:
    minmax(225px, 1.35fr) minmax(145px, 0.75fr) minmax(120px, 0.62fr)
    minmax(138px, 0.7fr) 38px;
  align-items: center;
  gap: 12px;
  padding-inline: 18px;
}
.buy-list-header {
  min-height: 34px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 760;
}
.buy-row {
  min-height: 76px;
  padding-block: 11px;
  border-top: 1px solid var(--border);
  transition:
    background-color 0.18s,
    border-color 0.18s;
}
.buy-row:hover {
  background: var(--surface-hover);
}
.buy-row--done {
  background: var(--success-soft);
}
.buy-row--done:hover {
  background: color-mix(in srgb, var(--success-soft) 84%, var(--surface));
}
.buy-row__identity {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.buy-row__identity strong {
  color: var(--primary);
  font-size: 0.9rem;
  letter-spacing: 0.025em;
}
.buy-row__identity span {
  overflow: hidden;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.buy-row__quote {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}
.buy-row__quote > small,
.buy-row__quote-status {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.quote-comparisons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.quote-comparisons span {
  padding: 3px 6px;
  border-radius: 7px;
  background: var(--surface-muted);
  font-size: 0.72rem;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}
.quote-comparisons .quote-change--positive {
  color: var(--success);
}
.quote-comparisons .quote-change--negative {
  color: var(--danger);
}
.quote-comparisons .quote-change--neutral {
  color: var(--muted);
}
.buy-field {
  min-width: 0;
}
.buy-field__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.number-control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 720;
}
.number-control .input {
  min-width: 0;
  min-height: 40px;
  padding-block: 7px;
}
.purchase-check {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 720;
  transition:
    border-color 0.18s,
    background-color 0.18s,
    color 0.18s;
}
.purchase-check:hover {
  border-color: var(--control-hover-border);
}
.purchase-check input {
  width: 19px;
  height: 19px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--success);
  cursor: pointer;
}
.buy-row--done .purchase-check {
  border-color: var(--success-border);
  color: var(--success);
}
.buy-row__delete {
  color: var(--danger);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .buy-list-workspace {
    grid-template-columns: 1fr;
  }
  .add-stock-panel {
    position: static;
  }
  .add-stock-form {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
  .add-stock-form .btn {
    min-width: 132px;
  }
}

@media (max-width: 760px) {
  .buy-summary {
    justify-content: flex-start;
  }
  .buy-list-header {
    display: none;
  }
  .buy-list-table {
    display: grid;
    gap: 10px;
    padding: 10px;
  }
  .buy-row {
    grid-template-columns: minmax(0, 1fr) 38px;
    grid-template-areas: 'identity delete' 'price price' 'quantity quantity' 'status status';
    gap: 10px;
    min-height: 0;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .buy-row--done {
    border-color: var(--success-border);
    background: var(--success-soft);
  }
  .buy-row__identity {
    grid-area: identity;
  }
  .buy-row__delete {
    grid-area: delete;
  }
  .buy-field--price {
    grid-area: price;
  }
  .buy-field--quantity {
    grid-area: quantity;
  }
  .buy-field__label {
    position: static;
    width: auto;
    height: auto;
    display: block;
    margin-bottom: 5px;
    overflow: visible;
    clip: auto;
    color: var(--text-soft);
    font-size: 0.76rem;
    font-weight: 720;
    white-space: normal;
  }
  .purchase-check {
    grid-area: status;
    justify-content: center;
  }
}

@media (max-width: 620px) {
  .add-stock-form {
    grid-template-columns: 1fr;
  }
  .add-stock-form .btn {
    width: 100%;
  }
}
</style>
