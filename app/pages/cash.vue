<script setup>
import { ArrowDown, ArrowUp, CalendarCheck, Minus, Plus, RotateCcw, Save, Trash2 } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'
import { SYSTEM_CASH_ITEM_ID } from '~/services/money-domain'

const store = useMoneyStore()
const { showToast } = useToast()
const expectedAmount = ref(0)
const createReservation = (label = '', amount = '') => ({ id: crypto.randomUUID(), label, amount })
const reservations = ref([createReservation()])
const createRow = (operation = 'add', amount = '') => ({ id: crypto.randomUUID(), label: '', operation, amount })
const rows = ref([createRow()])
const cashReconciliationEnabled = computed(() => store.config?.settings?.cashReconciliationEnabled !== false)
const selected = computed(() => store.activeItems.find((item) => item.id === SYSTEM_CASH_ITEM_ID))
const selectedId = computed(() => selected.value?.id || '')
const lastReconciledText = computed(() => selected.value?.lastReconciledAt
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(selected.value.lastReconciledAt))
  : '尚未完成現金驗算')
const signedAmount = (row) => (row.operation === 'subtract' ? -1 : 1) * Number(row.amount || 0)
const formatIntegerInput = (value) => value === '' || value == null
  ? ''
  : value === '-'
    ? '-'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)
const actualAmount = computed(() => rows.value.reduce((sum, row) => sum + signedAmount(row), 0))
const reservedAmount = computed(() => reservations.value.reduce((sum, reservation) => sum + Number(reservation.amount || 0), 0))
const difference = computed(() => actualAmount.value - Number(expectedAmount.value || 0))
const availableCashBeforeReserve = computed(() => store.activeItems
  .filter((item) => ['cash', 'foreign'].includes(item.assetClass) && item.liquidity !== 'locked')
  .reduce((sum, item) => sum + Number(item.amount || 0) * (item.currency === 'TWD' ? 1 : Number(item.exchangeRate || 0)), 0))
const availableCashAfterReserve = computed(() => Math.max(0, availableCashBeforeReserve.value - Number(reservedAmount.value || 0)))
const reserveExceedsAvailableCash = computed(() => Number(reservedAmount.value || 0) > availableCashBeforeReserve.value)
const hasDetails = computed(() => rows.value.some((row) => Number(row.amount) > 0))
const currentAmountChanged = computed(() => Number(expectedAmount.value || 0) !== Number(selected.value?.amount || 0))
const comparisonState = computed(() => {
  if (!hasDetails.value) return {
    tone: 'idle',
    value: money(expectedAmount.value),
    caption: currentAmountChanged.value
      ? '尚未填寫明細，儲存後會直接更新目前現金總額。'
      : '未使用明細驗算，目前以帳戶保存的現金總額為準。'
  }
  if (actualAmount.value < 0) return { tone: 'error', value: '明細有誤', caption: '扣除金額不能大於加入金額。' }
  if (difference.value === 0) return { tone: 'success', value: '金額已對齊', caption: '帳面金額與實際明細相同。' }
  if (difference.value > 0) return { tone: 'warning', value: `多 ${money(Math.abs(difference.value))}`, caption: '實際現金高於帳面金額。' }
  return { tone: 'error', value: `少 ${money(Math.abs(difference.value))}`, caption: '實際現金低於帳面金額。' }
})
const hydratingDraft = ref(false)
let draftTimer

watch(selectedId, (accountId, previousId) => {
  clearTimeout(draftTimer)
  if (previousId && !hydratingDraft.value) persistDraft(previousId)
  hydrateDraft(accountId)
}, { immediate: true })

watch(() => store.loading, (loading, wasLoading) => {
  if (wasLoading && !loading && selectedId.value) hydrateDraft(selectedId.value)
})

function hydrateDraft(accountId) {
  const item = selected.value?.id === accountId ? selected.value : null
  if (!item) return
  const draft = store.config.cashDrafts?.[accountId]
  hydratingDraft.value = true
  expectedAmount.value = Math.max(0, Number(draft?.expectedAmount ?? draft?.baseAmount ?? item.amount ?? 0))
  const legacyReservedAmount = Number(draft?.reservedAmount || 0)
  reservations.value = draft?.reservations?.length
    ? draft.reservations.map((reservation) => createReservation(reservation.label || '', Number(reservation.amount || 0) || ''))
    : legacyReservedAmount !== 0
      ? [createReservation('待扣款／保留款', legacyReservedAmount)]
      : [createReservation()]
  rows.value = draft?.rows?.length
    ? draft.rows.map((row) => ({
        id: crypto.randomUUID(),
        label: row.label || '',
        operation: row.operation || (Number(row.amount) < 0 ? 'subtract' : 'add'),
        amount: Math.abs(Number(row.amount || 0)) || ''
      }))
    : [createRow()]
  nextTick(() => { hydratingDraft.value = false })
}

watch([expectedAmount, reservations, rows], () => {
  if (hydratingDraft.value || !selectedId.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => persistDraft(), 350)
}, { deep: true })

function addRow(operation = 'add') { rows.value.push(createRow(operation)) }
function addReservation() {
  const reservation = createReservation()
  reservations.value.push(reservation)
  focusCashInput(`cash-reserved-label-${reservation.id}`)
}
function moveRow(index, direction) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= rows.value.length) return
  const reordered = [...rows.value]
  const [row] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, row)
  rows.value = reordered
}
function updateExpectedAmount(event) {
  const raw = event.target.value
  const sanitized = raw.includes('-') ? '0' : raw.split('.')[0].replace(/\D/g, '')
  expectedAmount.value = Number(sanitized || 0)
  event.target.value = formatIntegerInput(expectedAmount.value)
}
function updateReservedAmount(reservation, event) {
  const raw = event.target.value
  const negative = raw.trimStart().startsWith('-')
  const digits = raw.split('.')[0].replace(/\D/g, '')
  if (!digits) {
    reservation.amount = negative ? '-' : ''
    event.target.value = negative ? '-' : ''
    return
  }
  reservation.amount = Number(digits) * (negative ? -1 : 1)
  event.target.value = formatIntegerInput(reservation.amount)
}
function updateAdjustment(row, event) {
  const raw = event.target.value
  const sanitized = raw.split('.')[0].replace(/\D/g, '')
  row.amount = sanitized ? Number(sanitized) : ''
  event.target.value = formatIntegerInput(row.amount)
}
function focusCashInput(id) {
  nextTick(() => document.getElementById(id)?.focus())
}
function moveFromExpectedAmount(event) {
  if (event.shiftKey) return
  event.preventDefault()
  focusCashInput(`cash-reserved-label-${reservations.value[0]?.id}`)
}
function moveFromReservedAmount(index, event) {
  const targetReservation = reservations.value[index + (event.shiftKey ? -1 : 1)]
  if (targetReservation) {
    event.preventDefault()
    focusCashInput(`cash-reserved-label-${targetReservation.id}`)
    return
  }
  if (event.shiftKey || !rows.value.length) return
  event.preventDefault()
  focusCashInput(`cash-value-${rows.value[0].id}`)
}
function moveBetweenAdjustmentAmounts(index, event) {
  if (event.shiftKey && index === 0) {
    event.preventDefault()
    focusCashInput(`cash-reserved-${reservations.value.at(-1)?.id}`)
    return
  }
  const targetRow = rows.value[index + (event.shiftKey ? -1 : 1)]
  if (!targetRow) return
  event.preventDefault()
  focusCashInput(`cash-value-${targetRow.id}`)
}
function draftPayload() {
  return {
    expectedAmount: Number(expectedAmount.value || 0),
    reservations: reservations.value.map((reservation) => ({
      label: reservation.label,
      amount: Number(reservation.amount) || 0
    })),
    rows: rows.value.map((row) => ({
      label: row.label,
      operation: row.operation,
      amount: Math.abs(Number(row.amount || 0))
    }))
  }
}
async function persistDraft(accountId = selectedId.value) {
  if (!accountId) return
  const payload = draftPayload()
  try {
    await store.updateCashDraft(accountId, payload)
  } catch {
    // Store 已顯示具體的保存錯誤。
  }
}
async function clearDraft() {
  clearTimeout(draftTimer)
  hydratingDraft.value = true
  expectedAmount.value = Number(selected.value?.amount || 0)
  rows.value = rows.value.map((row) => ({ ...row, amount: '' }))
  await nextTick()
  hydratingDraft.value = false
  await persistDraft()
}
async function applyResult() {
  if (!selected.value || (hasDetails.value && actualAmount.value < 0)) return
  clearTimeout(draftTimer)

  if (!hasDetails.value) {
    const previousAmount = Number(selected.value.amount || 0)
    const nextAmount = Number(expectedAmount.value || 0)
    if (previousAmount === nextAmount) return
    await store.updateItem(selected.value.id, {
      amount: nextAmount,
      lastReconciledAt: null,
      lastReconciledAmount: null,
      lastReconciledDifference: null
    })
    await persistDraft()
    showToast({ tone: 'success', title: '現金總額已更新', message: `已將「${selected.value.name}」更新為 ${money(nextAmount)}；本次未使用明細驗算。` })
    return
  }

  const previousDifference = difference.value
  const reconciledAt = new Date().toISOString()
  await store.updateItem(selected.value.id, {
    amount: actualAmount.value,
    lastReconciledAt: reconciledAt,
    lastReconciledAmount: actualAmount.value,
    lastReconciledDifference: previousDifference
  })
  expectedAmount.value = actualAmount.value
  await persistDraft()
  showToast({
    tone: 'success',
    title: '現金驗算已完成',
    message: previousDifference === 0
      ? `「${selected.value.name}」原本就與明細合計相同，帳戶金額維持 ${money(actualAmount.value)}。`
      : `已將「${selected.value.name}」更新為 ${money(actualAmount.value)}，本次調整 ${previousDifference > 0 ? '增加' : '減少'} ${money(Math.abs(previousDifference))}。`
  })
}
onBeforeUnmount(() => {
  clearTimeout(draftTimer)
  if (selectedId.value && !hydratingDraft.value) persistDraft()
})
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
</script>

<template>
  <div>
    <PageHeader eyebrow="Cash reconciliation" title="現金驗算" :description="cashReconciliationEnabled ? '直接維護目前現金總額；需要核對時再新增實際明細，系統會自動驗算差額。' : '這項功能目前已關閉；現金金額改由帳戶結構直接管理。'" />
    <UiPanel v-if="!cashReconciliationEnabled">
      <EmptyState title="現金驗算尚未啟用" description="目前使用帳戶直接管理模式；現金帳戶可自由編輯、移動或刪除，既有驗算明細仍會保留。">
        <template #action><div class="inline-cluster"><NuxtLink to="/accounts" class="btn btn-primary">前往帳戶結構</NuxtLink><NuxtLink to="/settings" class="btn btn-secondary">調整功能偏好</NuxtLink></div></template>
      </EmptyState>
    </UiPanel>
    <div v-else class="page-grid page-grid--sidebar">
      <UiPanel title="現金總額與驗算明細" description="明細為選用；未填明細時，系統會直接使用目前現金總額。">
        <template #action><button v-if="selected" class="btn btn-ghost" type="button" :disabled="store.saving" @click="clearDraft"><RotateCcw :size="16" />清除明細金額</button></template>
        <div v-if="selected" class="stack">
          <div class="baseline-card">
            <div><span class="baseline-card__eyebrow">對帳基準</span><label for="cash-expected">目前現金總金額</label><small>預設帶入「身上現金」目前的帳面金額，可直接修改。</small></div>
            <input id="cash-expected" :value="formatIntegerInput(expectedAmount)" class="input input--amount baseline-card__input" type="text" inputmode="numeric" pattern="[0-9,]*" @input="updateExpectedAmount" @keydown.tab="moveFromExpectedAmount" />
          </div>
          <div class="reservation-card">
            <div class="reservation-heading"><div><span class="baseline-card__eyebrow">Available cash adjustment</span><h3>待扣款／保留款</h3><small>例如股票 T+2 交割款。正數會降低、負數會提高可動用現金；不參與下方驗算，也不改變總資產與淨資產。</small></div><strong>{{ money(reservedAmount) }}</strong></div>
            <div v-for="(reservation, index) in reservations" :key="reservation.id" class="reservation-row">
              <div class="field"><label :for="`cash-reserved-label-${reservation.id}`">保留款 {{ index + 1 }}</label><input :id="`cash-reserved-label-${reservation.id}`" v-model="reservation.label" class="input" placeholder="例如：2330 T+2 交割款" /></div>
              <div class="field"><label :for="`cash-reserved-${reservation.id}`">金額</label><input :id="`cash-reserved-${reservation.id}`" :value="formatIntegerInput(reservation.amount)" class="input input--amount" type="text" inputmode="decimal" pattern="-?[0-9,]*" placeholder="正數扣除，負數加回" @input="updateReservedAmount(reservation, $event)" @keydown.tab="moveFromReservedAmount(index, $event)" /></div>
              <div class="reservation-actions"><button class="btn btn-ghost" type="button" :disabled="!Number(reservation.amount)" @click="reservation.amount = 0"><RotateCcw :size="15" />清為 0</button><button class="btn btn-ghost btn-icon remove-row" type="button" :aria-label="`刪除保留款 ${index + 1}`" :disabled="reservations.length === 1" @click="reservations.splice(index, 1)"><Trash2 :size="16" /></button></div>
            </div>
            <button class="btn btn-secondary reservation-add" type="button" @click="addReservation"><Plus :size="17" />新增保留款</button>
          </div>
          <AppNotice v-if="reserveExceedsAvailableCash" tone="warning" title="待扣款超過目前可動用現金">扣除後可動用現金會以 0 顯示；請確認交割帳戶是否還有其他尚未登錄的餘額。</AppNotice>
          <div class="detail-heading"><div><h3>實際現金明細</h3><p>逐項加入實際持有的現金；需要扣除代墊或支出時切換為「扣除」。</p></div></div>
          <div v-for="(row, index) in rows" :key="row.id" class="adjustment-row" :class="`adjustment-row--${row.operation}`">
            <div class="field"><label :for="`cash-label-${row.id}`">項目 {{ index + 1 }}</label><input :id="`cash-label-${row.id}`" v-model="row.label" class="input" placeholder="例如：錢包零錢、代墊款" /></div>
            <div class="field">
              <span class="field-label">計算方式</span>
              <div class="operation-switch" role="group" :aria-label="`項目 ${index + 1} 計算方式`">
                <button class="operation-button operation-button--add" :class="{ active: row.operation === 'add' }" type="button" :aria-pressed="row.operation === 'add'" @click="row.operation = 'add'"><Plus :size="16" />加入</button>
                <button class="operation-button operation-button--subtract" :class="{ active: row.operation === 'subtract' }" type="button" :aria-pressed="row.operation === 'subtract'" @click="row.operation = 'subtract'"><Minus :size="16" />扣除</button>
              </div>
            </div>
            <div class="field"><label :for="`cash-value-${row.id}`">金額</label><input :id="`cash-value-${row.id}`" :value="formatIntegerInput(row.amount)" class="input input--amount" type="text" inputmode="numeric" pattern="[0-9,]*" placeholder="請輸入正整數" @input="updateAdjustment(row, $event)" @keydown.tab="moveBetweenAdjustmentAmounts(index, $event)" /></div>
            <div class="adjustment-actions">
              <button class="btn btn-ghost btn-icon" type="button" :aria-label="`上移項目 ${index + 1}`" :disabled="index === 0" @click="moveRow(index, -1)"><ArrowUp :size="16" /></button>
              <button class="btn btn-ghost btn-icon" type="button" :aria-label="`下移項目 ${index + 1}`" :disabled="index === rows.length - 1" @click="moveRow(index, 1)"><ArrowDown :size="16" /></button>
              <button class="btn btn-ghost btn-icon remove-row" type="button" :aria-label="`移除項目 ${index + 1}`" :disabled="rows.length === 1" @click="rows.splice(index, 1)"><Trash2 :size="16" /></button>
            </div>
          </div>
          <div class="inline-cluster">
            <button class="btn btn-secondary" type="button" @click="addRow('add')"><Plus :size="17" />新增加項</button>
            <button class="btn btn-secondary" type="button" @click="addRow('subtract')"><Minus :size="17" />新增減項</button>
          </div>
          <AppNotice title="明細是選用功能">沒有填寫明細時，直接儲存目前現金總額；填寫任一明細金額後，系統才會計算合計與驗算差額。</AppNotice>
        </div>
        <EmptyState v-else title="系統現金帳戶尚未載入" description="請重新整理頁面；系統會自動補回受保護的現金群組與帳戶。" />
      </UiPanel>
      <UiPanel as="aside" eyebrow="Reconciled result" title="驗算結果" class="result-panel">
        <div class="reconciled-time"><CalendarCheck :size="18" /><div><span>上次現金驗算</span><strong>{{ lastReconciledText }}</strong></div></div>
        <div class="comparison-summary">
          <div class="summary-item"><span class="summary-item__label">目前現金總額</span><strong class="summary-item__value">{{ money(expectedAmount) }}</strong></div>
          <div v-if="hasDetails" class="summary-item"><span class="summary-item__label">實際明細合計</span><strong class="summary-item__value">{{ money(actualAmount) }}</strong></div>
          <div class="summary-item"><span class="summary-item__label">待扣款／保留款</span><strong class="summary-item__value" :class="{ negative: reservedAmount > 0 }">{{ money(reservedAmount) }}</strong></div>
          <div class="summary-item summary-item--primary"><span class="summary-item__label">調整後可動用現金</span><strong class="summary-item__value">{{ money(availableCashAfterReserve) }}</strong></div>
        </div>
        <div class="comparison-result" :class="`comparison-result--${comparisonState.tone}`" role="status" aria-live="polite">
          <span>{{ hasDetails ? '驗算差額' : '目前採用金額' }}</span>
          <strong>{{ comparisonState.value }}</strong>
          <small>{{ comparisonState.caption }}</small>
        </div>
        <button class="btn btn-primary btn-block apply-button" :disabled="!selected || (hasDetails ? actualAmount < 0 : !currentAmountChanged) || store.saving" @click="applyResult"><Save :size="18" />{{ hasDetails ? '以明細合計更新現金帳戶' : '儲存目前現金總額' }}</button>
      </UiPanel>
    </div>
  </div>
</template>

<style scoped>
.adjustment-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, .72fr) minmax(105px, .55fr) auto; align-items: end; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.adjustment-row--add { border-left: 3px solid var(--success); }
.adjustment-row--subtract { border-left: 3px solid var(--danger); }
.operation-switch { min-height: 46px; display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); }
.operation-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: .78rem; font-weight: 720; cursor: pointer; }
.operation-button--add.active { background: var(--success-soft); color: var(--success); }
.operation-button--subtract.active { background: var(--danger-soft); color: var(--danger); }
.adjustment-actions { display: flex; align-items: center; gap: 1px; margin-bottom: 4px; }
.adjustment-actions .btn-icon { width: 30px; min-height: 34px; }
.adjustment-actions .remove-row { color: var(--danger); }
.result-panel { position: sticky; top: 24px; }
.reconciled-time { display: flex; align-items: center; gap: 10px; margin: 2px 0 16px; padding: 12px 13px; border-radius: 12px; background: var(--surface-muted); color: var(--primary); }
.reconciled-time > div { display: grid; gap: 2px; }
.reconciled-time span { color: var(--muted); font-size: .76rem; }
.reconciled-time strong { color: var(--text); font-size: .8rem; line-height: 1.4; }
.baseline-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, .52fr); align-items: center; gap: 22px; padding: 18px; border: 1px solid var(--notice-border); border-radius: var(--radius-md); background: linear-gradient(135deg, var(--notice-bg), var(--surface-hover)); }
.reservation-card { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.reservation-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.reservation-heading > div { display: grid; gap: 4px; }
.reservation-heading h3 { margin: 0; font-size: .94rem; }
.reservation-heading strong { flex: 0 0 auto; font-size: 1.2rem; font-variant-numeric: tabular-nums; }
.reservation-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(135px, .45fr) auto; align-items: end; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.reservation-actions { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.reservation-actions .remove-row { color: var(--danger); }
.reservation-add { justify-self: start; }
.reservation-card small { color: var(--muted); font-size: .78rem; line-height: 1.5; }
.baseline-card > div { display: grid; gap: 4px; }
.baseline-card__eyebrow { color: var(--primary); font-size: .75rem; font-weight: 780; letter-spacing: .09em; text-transform: uppercase; }
.baseline-card label { color: var(--text); font-size: .94rem; font-weight: 750; }
.baseline-card small { color: var(--muted); font-size: .78rem; line-height: 1.5; }
.baseline-card__input { min-height: 52px; font-size: 1.3rem; font-weight: 780; }
.detail-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.detail-heading h3 { margin: 0; font-size: 1rem; }
.detail-heading p { margin: 5px 0 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
.detail-heading strong { flex: 0 0 auto; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.comparison-summary { margin: 4px 0 18px; }
.comparison-result { display: grid; gap: 5px; padding: 18px; border: 1px solid var(--border); border-radius: 15px; background: var(--surface-muted); }
.comparison-result > span { color: var(--muted); font-size: .77rem; font-weight: 720; }
.comparison-result > strong { color: var(--text); font-size: 1.45rem; letter-spacing: -.025em; }
.comparison-result > small { color: var(--muted); font-size: .76rem; line-height: 1.45; }
.comparison-result--success { border-color: var(--success-border); background: var(--success-soft); }
.comparison-result--success > strong { color: var(--success); }
.comparison-result--warning { border-color: var(--warning-border); background: var(--warning-soft); }
.comparison-result--warning > strong { color: var(--warning); }
.comparison-result--error { border-color: var(--danger-border); background: var(--danger-soft); }
.comparison-result--error > strong { color: var(--danger); }
.apply-button { margin-top: 18px; }
@media (max-width: 880px) { .result-panel { position: static; } }
@media (max-width: 620px) {
  .baseline-card { grid-template-columns: 1fr; }
  .reservation-heading { align-items: flex-start; }
  .reservation-row { grid-template-columns: 1fr; }
  .reservation-actions { justify-content: flex-end; margin: 0; }
  .adjustment-row { grid-template-columns: minmax(0, 1fr); }
  .adjustment-row > .field { grid-column: 1 / -1; }
  .adjustment-actions { grid-column: 1 / -1; justify-content: flex-end; margin: 0; }
}
</style>
