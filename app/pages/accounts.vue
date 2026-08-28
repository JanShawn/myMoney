<script setup>
import { Archive, ArrowDown, ArrowUp, Pencil, Plus } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const groupName = ref('')
const editing = ref(null)
const form = reactive({ groupId: '', name: '', behavior: 'manual', assetClass: 'cash', liquidity: 'available', amount: 0, currency: 'TWD', exchangeRate: 1, includeInAssets: true })
const behaviorLabels = { manual: '手動餘額', foreign: '外幣', cash: '現金驗算', liability: '負債' }
const classLabels = { cash: '現金', equity: '股票', bond: '債券', other: '其他資產', liability: '負債' }
const liquidityLabels = { available: '立即可用', convertible: '可變現', locked: '受限制' }
const groups = computed(() => [...(store.config?.groups || [])].filter((g) => !g.archived).sort((a, b) => a.order - b.order))

watch(groups, (value) => { if (!form.groupId && value[0]) form.groupId = value[0].id }, { immediate: true })
watch(() => form.behavior, (behavior) => {
  if (behavior === 'liability') { form.assetClass = 'liability'; form.includeInAssets = false; form.liquidity = 'locked' }
  if (behavior === 'cash') { form.assetClass = 'cash'; form.liquidity = 'available'; form.currency = 'TWD' }
  if (behavior === 'foreign' && form.currency === 'TWD') form.currency = 'USD'
})

async function submitGroup() {
  if (!groupName.value.trim()) return
  await store.addGroup({ name: groupName.value, order: groups.value.length })
  groupName.value = ''
}
async function submitItem() {
  await store.addItem({ ...form, amount: Number(form.amount), exchangeRate: Number(form.exchangeRate) })
  Object.assign(form, { groupId: groups.value[0]?.id || '', name: '', behavior: 'manual', assetClass: 'cash', liquidity: 'available', amount: 0, currency: 'TWD', exchangeRate: 1, includeInAssets: true })
}
async function renameGroup(group, event) {
  const name = event.target.value.trim()
  if (name && name !== group.name) await store.updateGroup(group.id, { name })
}
async function moveGroup(group, direction) {
  const index = groups.value.findIndex((entry) => entry.id === group.id)
  const target = groups.value[index + direction]
  if (!target) return
  const originalOrder = group.order
  await store.updateGroup(group.id, { order: target.order })
  await store.updateGroup(target.id, { order: originalOrder })
}
function editItem(item) {
  editing.value = { ...item }
}
async function saveEdit() {
  const { id, ...input } = editing.value
  await store.updateItem(id, input)
  editing.value = null
}
const itemsFor = (groupId) => store.config?.items?.filter((item) => item.groupId === groupId && !item.archived) || []
</script>

<template>
  <div>
    <header class="page-header">
      <div><div class="eyebrow">Flexible structure</div><h1 class="page-title">帳戶結構</h1><p class="page-subtitle">外層群組只負責整理；真正的統計規則放在每個內層項目。</p></div>
    </header>
    <div class="grid-2">
      <section class="card card-body">
        <h2 class="section-title">新增群組</h2>
        <form class="toolbar" style="margin-top: 16px" @submit.prevent="submitGroup">
          <div class="field" style="flex: 1; min-width: 180px"><label for="group-name">群組名稱</label><input id="group-name" v-model="groupName" class="input" placeholder="例如：銀行帳戶" required /></div>
          <button class="btn btn-secondary" :disabled="store.saving" type="submit"><Plus :size="18" />新增群組</button>
        </form>
      </section>
      <section class="card card-body">
        <h2 class="section-title">新增帳戶或項目</h2>
        <form class="form-grid" style="margin-top: 16px" @submit.prevent="submitItem">
          <div class="field"><label for="item-group">所屬群組</label><select id="item-group" v-model="form.groupId" class="select" required><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></div>
          <div class="field"><label for="item-name">名稱</label><input id="item-name" v-model="form.name" class="input" placeholder="例如：中信活存" required /></div>
          <div class="field"><label for="behavior">輸入方式</label><select id="behavior" v-model="form.behavior" class="select"><option v-for="(label, value) in behaviorLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="asset-class">統計類別</label><select id="asset-class" v-model="form.assetClass" class="select" :disabled="form.behavior === 'liability'"><option v-for="(label, value) in classLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="liquidity">流動性</label><select id="liquidity" v-model="form.liquidity" class="select"><option v-for="(label, value) in liquidityLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="amount">目前金額</label><input id="amount" v-model.number="form.amount" class="input" type="number" step="0.01" inputmode="decimal" /></div>
          <template v-if="form.behavior === 'foreign'">
            <div class="field"><label for="currency">幣別</label><input id="currency" v-model.uppercase="form.currency" class="input" maxlength="3" /></div>
            <div class="field"><label for="rate">換算 TWD 匯率</label><input id="rate" v-model.number="form.exchangeRate" class="input" type="number" min="0.0001" step="0.0001" /></div>
          </template>
          <label class="checkbox full"><input v-model="form.includeInAssets" type="checkbox" :disabled="form.behavior === 'liability'" /><span>納入總資產計算（負債會獨立計算）</span></label>
          <button class="btn btn-primary full" :disabled="store.saving || !groups.length">新增項目</button>
        </form>
      </section>
    </div>

    <section v-if="editing" class="card card-body" style="margin-top: 16px">
      <div class="toolbar"><div><div class="eyebrow">Edit item</div><h2 class="section-title">編輯 {{ editing.name }}</h2></div><button class="btn btn-ghost" type="button" @click="editing = null">取消</button></div>
      <form class="form-grid" style="margin-top: 16px" @submit.prevent="saveEdit">
        <div class="field"><label for="edit-group">所屬群組</label><select id="edit-group" v-model="editing.groupId" class="select"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></div>
        <div class="field"><label for="edit-name">名稱</label><input id="edit-name" v-model="editing.name" class="input" required /></div>
        <div class="field"><label for="edit-behavior">輸入方式</label><select id="edit-behavior" v-model="editing.behavior" class="select"><option v-for="(label, value) in behaviorLabels" :key="value" :value="value">{{ label }}</option></select></div>
        <div class="field"><label for="edit-class">統計類別</label><select id="edit-class" v-model="editing.assetClass" class="select"><option v-for="(label, value) in classLabels" :key="value" :value="value">{{ label }}</option></select></div>
        <div class="field"><label for="edit-liquidity">流動性</label><select id="edit-liquidity" v-model="editing.liquidity" class="select"><option v-for="(label, value) in liquidityLabels" :key="value" :value="value">{{ label }}</option></select></div>
        <div class="field"><label for="edit-amount">目前金額</label><input id="edit-amount" v-model.number="editing.amount" class="input" type="number" step="0.01" /></div>
        <label class="checkbox full"><input v-model="editing.includeInAssets" type="checkbox" /><span>納入總資產計算</span></label>
        <button class="btn btn-primary full" :disabled="store.saving">儲存項目變更</button>
      </form>
    </section>

    <section class="stack" style="margin-top: 16px">
      <article v-for="group in groups" :key="group.id" class="card card-body">
        <div class="toolbar">
          <div>
            <label class="sr-only" :for="'group-' + group.id">群組名稱</label>
            <input :id="'group-' + group.id" class="input section-title" style="padding-left: 9px" :value="group.name" @change="renameGroup(group, $event)" />
            <p class="row-meta">{{ itemsFor(group.id).length }} 個使用中項目</p>
          </div>
          <div style="display:flex; gap:4px">
            <button class="btn btn-ghost" type="button" title="上移群組" @click="moveGroup(group, -1)"><ArrowUp :size="17" /></button>
            <button class="btn btn-ghost" type="button" title="下移群組" @click="moveGroup(group, 1)"><ArrowDown :size="17" /></button>
            <button class="btn btn-ghost" type="button" title="封存群組與其中項目" @click="store.updateGroup(group.id, { archived: true })"><Archive :size="17" />封存</button>
          </div>
        </div>
        <div v-if="itemsFor(group.id).length">
          <div v-for="item in itemsFor(group.id)" :key="item.id" class="list-row account-row">
            <div><div class="row-title">{{ item.name }}</div><div class="row-meta">{{ behaviorLabels[item.behavior] }} · {{ item.currency }}</div></div>
            <div><span class="pill">{{ classLabels[item.assetClass] }}</span></div>
            <div class="amount">NT$ {{ Number(item.amount * (item.exchangeRate || 1)).toLocaleString('zh-TW') }}</div>
            <button class="btn btn-ghost" type="button" title="編輯項目" @click="editItem(item)"><Pencil :size="17" /></button>
            <button class="btn btn-ghost" type="button" :aria-label="`封存 ${item.name}`" @click="store.updateItem(item.id, { archived: true })"><Archive :size="17" /></button>
          </div>
        </div>
        <div v-else class="empty"><div><strong>這個群組還沒有項目</strong>從上方表單建立第一個帳戶。</div></div>
      </article>
      <div v-if="!groups.length && !store.loading" class="card empty"><div><strong>還沒有群組</strong>先建立一個群組，再加入帳戶。</div></div>
    </section>
  </div>
</template>

<style scoped>
.account-row { grid-template-columns: 1.5fr 1fr 1fr auto auto; }
@media (max-width: 560px) {
  .account-row { grid-template-columns: 1fr auto auto; }
  .account-row > :nth-child(2), .account-row > :nth-child(3) { display: none; }
}
</style>
