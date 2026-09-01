<script setup>
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const groupName = ref('')
const editing = ref(null)
const defaultForm = () => ({ groupId: '', name: '', behavior: 'manual', assetClass: 'cash', assetClassDetail: '', liquidity: 'available', amount: '', currency: 'TWD', exchangeRate: 1, includeInAssets: true })
const form = reactive(defaultForm())
const pendingDeleteGroupId = ref('')
const pendingDeleteItemId = ref('')
const fx = reactive({ loading: false, message: '', error: '' })
const behaviorLabels = { manual: '台幣帳戶', foreign: '外幣帳戶', cash: '系統現金', liability: '負債' }
const classLabels = { cash: '現金', foreign: '外幣', equity: '股票', bond: '債券', other: '其他資產', liability: '負債' }
const liquidityLabels = { available: '立即可用', convertible: '可變現', locked: '受限制' }
const behaviorOptions = Object.entries(behaviorLabels).filter(([value]) => value !== 'cash').map(([value, label]) => ({ value, label }))
const editBehaviorOptions = computed(() => editing.value?.behavior === 'cash' && !editing.value?.system
  ? [{ value: 'cash', label: '舊版現金驗算帳戶' }, ...behaviorOptions]
  : behaviorOptions)
const classOptions = Object.entries(classLabels).map(([value, label]) => ({ value, label }))
const liquidityOptions = [
  { value: 'available', label: '立即可用' },
  { value: 'convertible', label: '可變現' },
  { value: 'locked', label: '受限制' }
]
const liquidityHelp = (value) => ({
  available: '現金或外幣會計入首頁的「可動用現金」；勾選納入資產後，也會計入總資產與淨資產。',
  convertible: '現金或外幣仍會計入「可動用現金」，代表需要兌換或變現後才能使用；也會依設定計入總資產。',
  locked: '仍可計入總資產與淨資產，但不會計入「可動用現金」，適合暫時不能使用的資產。'
}[value] || '')
const currencyOptions = [{ value: 'USD', label: 'USD · 美金' }, { value: 'JPY', label: 'JPY · 日幣' }]
const groups = computed(() => [...(store.config?.groups || [])].filter((g) => !g.archived).sort((a, b) => a.order - b.order))
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const pendingDeleteItem = computed(() => store.config?.items?.find((item) => item.id === pendingDeleteItemId.value) || null)
const convertedAmount = (target) => Number(target?.amount || 0) * Number(target?.exchangeRate || 0)
const twdMoney = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const foreignMoney = (value, currency) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(value || 0)
const fxUpdatedText = computed(() => store.config?.market?.fxUpdatedAt
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(store.config.market.fxUpdatedAt))
  : '尚未取得')
const itemClassLabel = (item) => item.assetClass === 'other' && item.assetClassDetail
  ? `其他 · ${item.assetClassDetail}`
  : classLabels[item.assetClass]

watch(groups, (value) => {
  if (!value.some((group) => group.id === form.groupId)) form.groupId = value[0]?.id || ''
}, { immediate: true })

async function applyExchangeRate(target, force = false) {
  if (!target || target.behavior !== 'foreign') return
  fx.loading = true
  fx.error = ''
  try {
    const result = await store.refreshExchangeRates(force)
    const rate = Number(result.rates?.[target.currency])
    if (!(rate > 0)) throw new Error(`匯率資料中沒有 ${target.currency}。`)
    target.exchangeRate = rate
    fx.message = `已使用 ${target.currency} 最新每日參考匯率。`
    if (force) {
      showToast({
        tone: 'success',
        title: '匯率已更新',
        message: `1 ${target.currency} = NT$ ${rate.toLocaleString('zh-TW', { maximumFractionDigits: 6 })}。`
      })
    }
  } catch (error) {
    const cachedRate = Number(store.config?.market?.fxRates?.[target.currency])
    if (cachedRate > 0) {
      target.exchangeRate = cachedRate
      fx.error = `無法更新匯率：${error?.message || '網路連線失敗'}；目前使用上次成功取得的匯率（${fxUpdatedText.value}）。`
    } else {
      target.exchangeRate = 0
      fx.error = `無法換算 ${target.currency}：${error?.message || '匯率服務連線失敗'}。請稍後重試。`
    }
    if (force) {
      store.error = ''
      showToast({ tone: 'warning', title: '匯率更新未完成', message: fx.error })
    }
  } finally {
    fx.loading = false
  }
}

function applyBehavior(target, behavior) {
  if (!target) return
  if (behavior === 'liability') {
    Object.assign(target, { assetClass: 'liability', includeInAssets: false, liquidity: 'locked', currency: 'TWD', exchangeRate: 1 })
  } else if (behavior === 'cash') {
    Object.assign(target, { assetClass: 'cash', includeInAssets: true, liquidity: 'available', currency: 'TWD', exchangeRate: 1 })
  } else if (behavior === 'foreign') {
    target.assetClass = 'foreign'
    target.includeInAssets = true
    target.liquidity = 'available'
    if (!['USD', 'JPY'].includes(target.currency)) target.currency = 'USD'
    applyExchangeRate(target)
  } else {
    if (target.assetClass === 'foreign' || target.assetClass === 'liability') target.assetClass = 'cash'
    Object.assign(target, { includeInAssets: true, currency: 'TWD', exchangeRate: 1 })
  }
}

watch(() => form.behavior, (behavior) => applyBehavior(form, behavior))
watch(() => form.currency, () => { if (form.behavior === 'foreign') applyExchangeRate(form) })
watch(() => editing.value?.behavior, (behavior) => { if (behavior) applyBehavior(editing.value, behavior) })
watch(() => editing.value?.currency, () => { if (editing.value?.behavior === 'foreign') applyExchangeRate(editing.value) })
watch(() => store.loading, async (loading) => {
  if (loading || !store.activeItems.some((item) => item.behavior === 'foreign')) return
  try {
    await store.refreshExchangeRates()
  } catch (error) {
    fx.error = `既有外幣帳戶匯率更新失敗：${error?.message || '網路連線失敗'}。目前保留上次成功匯率。`
  }
}, { immediate: true })

async function submitGroup() {
  if (!groupName.value.trim()) return
  const name = groupName.value.trim()
  try {
    await store.addGroup({ name, order: groups.value.length })
    groupName.value = ''
    showToast({ tone: 'success', title: '群組已新增', message: `已建立「${name}」。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '無法新增群組', message: error?.message || '無法儲存資料。' })
  }
}
async function submitItem() {
  if (!form.groupId) { showToast({ tone: 'error', title: '無法新增帳戶', message: '請先建立並選擇一個群組。' }); return }
  if (!form.name.trim()) { showToast({ tone: 'error', title: '無法新增帳戶', message: '請輸入帳戶名稱。' }); return }
  if (Number(form.amount) < 0) { showToast({ tone: 'error', title: '無法新增帳戶', message: '帳戶金額不能小於 0；負債也請輸入正數。' }); return }
  if (form.assetClass === 'other' && !form.assetClassDetail.trim()) { showToast({ tone: 'error', title: '無法新增帳戶', message: '選擇「其他資產」時，請填寫實際項目類型。' }); return }
  if (form.behavior === 'foreign' && !(Number(form.exchangeRate) > 0)) { showToast({ tone: 'error', title: '無法新增帳戶', message: '目前沒有可用匯率，請更新成功後再新增外幣帳戶。' }); return }
  const itemName = form.name.trim()
  try {
    await store.addItem({ ...form, name: itemName, assetClassDetail: form.assetClass === 'other' ? form.assetClassDetail.trim() : '', amount: Number(form.amount || 0), exchangeRate: Number(form.exchangeRate) })
    Object.assign(form, defaultForm(), { groupId: groups.value[0]?.id || '' })
    showToast({ tone: 'success', title: '帳戶已新增', message: `已建立「${itemName}」。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '無法新增帳戶', message: error?.message || '無法儲存資料。' })
  }
}
async function renameGroup(group, event) {
  const name = event.target.value.trim()
  if (!name || name === group.name) return
  try {
    await store.updateGroup(group.id, { name })
    showToast({ tone: 'success', title: '群組名稱已更新', message: `已將「${group.name}」改為「${name}」。`, duration: 3000 })
  } catch (error) {
    store.error = ''
    event.target.value = group.name
    showToast({ tone: 'error', title: '群組名稱沒有保存', message: error?.message || '無法儲存資料。' })
  }
}
async function moveGroup(group, direction) {
  const index = groups.value.findIndex((entry) => entry.id === group.id)
  const target = groups.value[index + direction]
  if (!target) return
  const originalOrder = group.order
  try {
    await store.updateGroup(group.id, { order: target.order })
    await store.updateGroup(target.id, { order: originalOrder })
    showToast({ tone: 'success', title: '群組順序已更新', message: `「${group.name}」已${direction < 0 ? '上移' : '下移'}。`, duration: 2500 })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '群組順序沒有保存', message: error?.message || '無法儲存資料。' })
  }
}
function editItem(item) {
  editing.value = { ...item }
  if (item.behavior === 'foreign') applyExchangeRate(editing.value)
}
async function saveEdit() {
  if (editing.value.assetClass === 'other' && !String(editing.value.assetClassDetail || '').trim()) {
    showToast({ tone: 'error', title: '無法儲存帳戶', message: '選擇「其他資產」時，請填寫實際項目類型。' })
    return
  }
  if (editing.value.behavior === 'foreign' && !(Number(editing.value.exchangeRate) > 0)) {
    showToast({ tone: 'error', title: '無法儲存帳戶', message: '目前沒有可用匯率，請更新成功後再儲存。' })
    return
  }
  const { id, ...input } = editing.value
  try {
    await store.updateItem(id, { ...input, assetClassDetail: input.assetClass === 'other' ? String(input.assetClassDetail || '').trim() : '', amount: Number(input.amount || 0), exchangeRate: Number(input.exchangeRate || 1) })
    editing.value = null
    showToast({ tone: 'success', title: '帳戶已更新', message: `「${input.name}」的變更已保存。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '無法儲存帳戶', message: error?.message || '無法儲存資料。' })
  }
}
async function confirmDeleteGroup(group) {
  try {
    await store.deleteGroup(group.id)
    if (editing.value?.groupId === group.id) editing.value = null
    pendingDeleteGroupId.value = ''
    showToast({ tone: 'success', title: '群組已刪除', message: `「${group.name}」及群組內項目已永久刪除。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '刪除沒有完成', message: `「${group.name}」：${error?.message || '無法儲存資料。'}` })
  }
}
async function confirmDeleteItem(item) {
  try {
    await store.deleteItem(item.id)
    if (editing.value?.id === item.id) editing.value = null
    pendingDeleteItemId.value = ''
    showToast({ tone: 'success', title: '帳戶已刪除', message: `「${item.name}」已永久刪除。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '刪除沒有完成', message: `「${item.name}」：${error?.message || '無法儲存資料。'}` })
  }
}
const itemsFor = (groupId) => store.config?.items?.filter((item) => item.groupId === groupId && !item.archived) || []
const allItemsFor = (groupId) => store.config?.items?.filter((item) => item.groupId === groupId) || []
</script>

<template>
  <div>
    <PageHeader eyebrow="Account architecture" title="帳戶結構" description="先用群組整理帳戶；台幣、美元與日圓都會統一換算成台幣後統計。" />

    <div class="page-grid page-grid--form-list">
      <div class="stack">
        <UiPanel title="新增群組" description="群組只負責整理，不影響資產計算。" compact>
          <form class="group-form" @submit.prevent="submitGroup">
            <div class="field"><label for="group-name">群組名稱</label><input id="group-name" v-model="groupName" class="input" placeholder="例如：銀行帳戶" required /></div>
            <button class="btn btn-secondary" :disabled="store.saving" type="submit"><Plus :size="18" />新增</button>
          </form>
        </UiPanel>

        <UiPanel title="新增帳戶或項目" description="帳戶類型決定更新方式；外幣帳戶會自動取得匯率。">
          <form class="form-grid" @submit.prevent="submitItem">
          <div class="field"><label for="item-group">所屬群組</label><UiSelect id="item-group" v-model="form.groupId" :options="groupOptions" /></div>
          <div class="field"><label for="item-name">名稱</label><input id="item-name" v-model="form.name" class="input" placeholder="例如：中信活存" required /></div>
          <div class="field"><label for="behavior">帳戶類型</label><UiSelect id="behavior" v-model="form.behavior" :options="behaviorOptions" /><span class="field-help">台幣帳戶直接輸入台幣餘額；外幣帳戶會自動換算，負債則從淨資產扣除。</span></div>
          <div class="field"><label for="asset-class">統計類別</label><UiSelect id="asset-class" v-model="form.assetClass" :options="classOptions" :disabled="['foreign', 'liability'].includes(form.behavior)" /></div>
          <div v-if="form.assetClass === 'other'" class="field"><label for="asset-class-detail">實際項目類型</label><input id="asset-class-detail" v-model="form.assetClassDetail" class="input" placeholder="例如：保單價值、黃金、收藏品" required /></div>
          <div class="field full"><label for="liquidity">流動性</label><UiSelect id="liquidity" v-model="form.liquidity" :options="liquidityOptions" /><span class="field-help">{{ liquidityHelp(form.liquidity) }}</span></div>
          <div class="field"><label for="amount">目前金額{{ form.behavior === 'foreign' ? `（${form.currency}）` : '' }}</label><FormattedNumberInput id="amount" v-model="form.amount" class="input input--amount" :min="0" :max-fraction-digits="2" placeholder="0" /></div>
          <template v-if="form.behavior === 'foreign'">
            <div class="field"><label for="currency">幣別</label><UiSelect id="currency" v-model="form.currency" :options="currencyOptions" /></div>
            <div class="exchange-preview full">
              <div><span>系統換算</span><strong>{{ foreignMoney(form.amount, form.currency) }} ≈ {{ twdMoney(convertedAmount(form)) }}</strong><small>1 {{ form.currency }} = NT$ {{ Number(form.exchangeRate || 0).toLocaleString('zh-TW', { maximumFractionDigits: 6 }) }} · 更新：{{ fxUpdatedText }}</small></div>
              <button class="btn btn-secondary" type="button" :disabled="fx.loading" @click="applyExchangeRate(form, true)"><RefreshCw :class="{ spin: fx.loading }" :size="17" />{{ fx.loading ? '更新中' : '更新匯率' }}</button>
            </div>
          </template>
          <AppNotice v-if="fx.error && form.behavior === 'foreign'" class="full" tone="warning" title="匯率更新未完成">{{ fx.error }}</AppNotice>
          <label class="checkbox full"><input v-model="form.includeInAssets" type="checkbox" :disabled="form.behavior === 'liability'" /><span>納入總資產計算；負債會獨立計算並從淨資產扣除。</span></label>
          <div class="form-actions full"><button class="btn btn-primary" :disabled="store.saving || !groups.length"><Plus :size="18" />新增項目</button></div>
          <p class="fx-attribution full">每日參考匯率由 <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a> 提供；不是銀行實際成交價。</p>
        </form>
        </UiPanel>
      </div>

      <div class="stack">
        <UiPanel v-if="editing" eyebrow="Edit item" :title="`編輯 ${editing.name}`" description="變更會直接更新目前連結的資料。">
          <template #action><button class="btn btn-ghost" type="button" @click="editing = null">取消</button></template>
          <form class="form-grid" @submit.prevent="saveEdit">
            <div class="field"><label for="edit-group">所屬群組</label><UiSelect id="edit-group" v-model="editing.groupId" :options="groupOptions" :disabled="editing.system" /></div>
            <div class="field"><label for="edit-name">名稱</label><input id="edit-name" v-model="editing.name" class="input" required /></div>
            <div class="field"><label for="edit-behavior">帳戶類型</label><div v-if="editing.system" class="locked-field">系統現金（固定）</div><UiSelect v-else id="edit-behavior" v-model="editing.behavior" :options="editBehaviorOptions" /></div>
            <div class="field"><label for="edit-class">統計類別</label><UiSelect id="edit-class" v-model="editing.assetClass" :options="classOptions" :disabled="editing.system || ['foreign', 'liability'].includes(editing.behavior)" /></div>
            <div v-if="editing.assetClass === 'other'" class="field"><label for="edit-class-detail">實際項目類型</label><input id="edit-class-detail" v-model="editing.assetClassDetail" class="input" placeholder="例如：保單價值、黃金、收藏品" required /></div>
            <div class="field full"><label for="edit-liquidity">流動性</label><UiSelect id="edit-liquidity" v-model="editing.liquidity" :options="liquidityOptions" :disabled="editing.system" /><span class="field-help">{{ liquidityHelp(editing.liquidity) }}</span></div>
            <div class="field"><label for="edit-amount">目前金額{{ editing.behavior === 'foreign' ? `（${editing.currency}）` : '' }}</label><FormattedNumberInput id="edit-amount" v-model="editing.amount" class="input input--amount" :min="0" :max-fraction-digits="2" /></div>
            <template v-if="editing.behavior === 'foreign'">
              <div class="field"><label for="edit-currency">幣別</label><UiSelect id="edit-currency" v-model="editing.currency" :options="currencyOptions" /></div>
              <div class="exchange-preview full">
                <div><span>系統換算</span><strong>{{ foreignMoney(editing.amount, editing.currency) }} ≈ {{ twdMoney(convertedAmount(editing)) }}</strong><small>1 {{ editing.currency }} = NT$ {{ Number(editing.exchangeRate || 0).toLocaleString('zh-TW', { maximumFractionDigits: 6 }) }} · 更新：{{ fxUpdatedText }}</small></div>
                <button class="btn btn-secondary" type="button" :disabled="fx.loading" @click="applyExchangeRate(editing, true)"><RefreshCw :class="{ spin: fx.loading }" :size="17" />更新匯率</button>
              </div>
            </template>
            <AppNotice v-if="fx.error && editing.behavior === 'foreign'" class="full" tone="warning" title="匯率更新未完成">{{ fx.error }}</AppNotice>
            <AppNotice v-if="editing.system" class="full" title="系統連動帳戶">這個帳戶固定提供給現金驗算；可以調整名稱與金額，但不能移動、改變類型或刪除。</AppNotice>
            <label class="checkbox full"><input v-model="editing.includeInAssets" type="checkbox" :disabled="editing.system" /><span>納入總資產計算</span></label>
            <div class="form-actions full"><button class="btn btn-primary" :disabled="store.saving">儲存項目變更</button></div>
          </form>
        </UiPanel>

        <UiPanel v-for="group in groups" :key="group.id" flush>
          <template #default>
            <div class="group-header">
              <div class="group-header__copy">
                <template v-if="group.system"><div class="system-group-name"><Lock :size="16" />{{ group.name }}</div></template>
                <template v-else><label class="sr-only" :for="'group-' + group.id">群組名稱</label><input :id="'group-' + group.id" class="group-name" :value="group.name" @change="renameGroup(group, $event)" /></template>
                <span>{{ itemsFor(group.id).length }} 個使用中項目<template v-if="group.system"> · 現金驗算固定群組</template></span>
              </div>
              <div class="data-row__actions">
                <button class="btn btn-ghost btn-icon" type="button" title="上移群組" @click="moveGroup(group, -1)"><ArrowUp :size="17" /></button>
                <button class="btn btn-ghost btn-icon" type="button" title="下移群組" @click="moveGroup(group, 1)"><ArrowDown :size="17" /></button>
                <button v-if="!group.system" class="btn btn-ghost danger-action" type="button" title="刪除群組" @click="pendingDeleteGroupId = group.id"><Trash2 :size="17" />刪除</button>
              </div>
            </div>
            <AppNotice v-if="pendingDeleteGroupId === group.id" class="group-delete-notice" tone="error" :title="`永久刪除「${group.name}」？`">
              這會同時永久刪除群組內 {{ allItemsFor(group.id).length }} 個帳戶／項目（包含已封存資料）及其現金驗算草稿；介面內無法復原。
              <template #action>
                <div class="confirm-actions"><button class="btn btn-ghost" type="button" @click="pendingDeleteGroupId = ''">取消</button><button class="btn btn-danger" type="button" :disabled="store.saving" @click="confirmDeleteGroup(group)">確認刪除</button></div>
              </template>
            </AppNotice>
            <AppNotice v-if="pendingDeleteItem?.groupId === group.id" class="group-delete-notice" tone="error" :title="`永久刪除「${pendingDeleteItem.name}」？`">
              這會從目前帳戶結構與資產計算中永久移除這個項目，並清除它的現金草稿；已保存的歷史資產盤點不會改變。介面內無法復原。
              <template #action>
                <div class="confirm-actions"><button class="btn btn-ghost" type="button" @click="pendingDeleteItemId = ''">取消</button><button class="btn btn-danger" type="button" :disabled="store.saving" @click="confirmDeleteItem(pendingDeleteItem)">確認刪除</button></div>
              </template>
            </AppNotice>
            <div v-if="itemsFor(group.id).length" class="data-list">
              <div v-for="item in itemsFor(group.id)" :key="item.id" class="data-row account-row">
                <div class="data-row__main"><div class="data-row__title">{{ item.name }}</div><div class="data-row__meta">{{ behaviorLabels[item.behavior] }} · {{ item.currency }} · {{ liquidityLabels[item.liquidity] }}<template v-if="item.currency !== 'TWD'"> · {{ foreignMoney(item.amount, item.currency) }}</template></div></div>
                <div class="account-label-cell"><span class="pill">{{ itemClassLabel(item) }}<template v-if="item.system"> · 系統連動</template></span></div>
                <div class="data-row__value">{{ twdMoney(convertedAmount(item)) }}</div>
                <div class="data-row__actions">
                  <button class="btn btn-ghost btn-icon" type="button" title="編輯項目" @click="editItem(item)"><Pencil :size="17" /></button>
                  <button v-if="!item.system" class="btn btn-ghost btn-icon danger-action" type="button" :aria-label="`刪除 ${item.name}`" @click="pendingDeleteItemId = item.id"><Trash2 :size="17" /></button>
                </div>
              </div>
            </div>
            <EmptyState v-else title="這個群組還沒有項目" description="從左側表單建立第一個帳戶。" />
          </template>
        </UiPanel>
        <UiPanel v-if="!groups.length && !store.loading"><EmptyState title="還沒有群組" description="先建立群組，再加入帳戶項目。" /></UiPanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; }
.group-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 24px; }
.group-header__copy { min-width: 0; }
.group-header__copy span { display: block; margin-top: 3px; color: var(--muted); font-size: .73rem; }
.group-name { width: 100%; padding: 0; border: 0; background: transparent; color: var(--text); font-size: 1rem; font-weight: 760; }
.group-name:focus { outline: 0; box-shadow: 0 2px 0 var(--primary); }
.system-group-name { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 1rem; font-weight: 760; }
.locked-field { min-height: 46px; display: flex; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-muted); color: var(--muted); font-size: .84rem; font-weight: 700; }
.account-row { grid-template-columns: minmax(0, 1.5fr) minmax(90px, .55fr) minmax(130px, .7fr) 80px; }
.account-label-cell { min-height: 40px; display: flex; align-items: center; justify-content: flex-start; }
.exchange-preview { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.exchange-preview > div { display: grid; gap: 3px; min-width: 0; }
.exchange-preview span, .exchange-preview small { color: var(--muted); font-size: .74rem; }
.exchange-preview strong { color: var(--text); font-size: .95rem; }
.exchange-preview .btn { flex: 0 0 auto; }
.fx-attribution { margin: 0; color: var(--muted); font-size: .7rem; line-height: 1.5; }
.fx-attribution a { color: var(--primary); }
.danger-action { color: var(--danger); }
.group-delete-notice { margin: 0 24px 16px; }
.confirm-actions { display: flex; gap: 8px; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 620px) {
  .group-form { grid-template-columns: 1fr; }
  .group-form .btn { width: 100%; }
  .account-row { grid-template-columns: minmax(0, 1fr) 80px; }
  .group-header { align-items: flex-start; padding: 16px 18px; }
  .group-header .btn:not(.btn-icon) { font-size: 0; }
  .group-delete-notice { margin-inline: 18px; }
  .exchange-preview { align-items: stretch; flex-direction: column; }
  .exchange-preview .btn { width: 100%; }
  .confirm-actions { flex-direction: column; }
}
</style>
