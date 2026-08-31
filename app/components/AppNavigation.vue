<script setup>
import { BarChart3, CalendarRange, ClipboardCheck, Landmark, Settings, WalletCards, WalletMinimal } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const navigationStorage = computed(() => {
  const backup = store.storageStatus.jsonBackup
  if (!backup.exists) return { detail: '尚未建立 JSON 備份', state: 'neutral' }
  if (backup.isCurrent) return { detail: 'JSON 備份已是最新版', state: 'current' }
  const count = backup.changes?.length || 0
  return { detail: count ? `${count} 項變更尚未備份` : '有變更尚未備份', state: 'pending' }
})
const links = [
  { to: '/', label: '總覽', icon: BarChart3 },
  { to: '/cash', label: '現金驗算', icon: WalletMinimal },
  { to: '/accounts', label: '帳戶結構', icon: Landmark },
  { to: '/investments', label: '投資持倉', icon: WalletCards },
  { to: '/snapshot', label: '資產盤點', icon: ClipboardCheck },
  { to: '/cashflow', label: '收支規劃', icon: CalendarRange },
  { to: '/settings', label: '設定', icon: Settings }
]
</script>

<template>
  <aside class="sidebar" aria-label="主要導覽">
    <NuxtLink to="/" class="brand">
      <span class="brand-mark">m</span>
      <span class="brand-copy"><strong>myMoney</strong><small>資產盤點</small></span>
    </NuxtLink>
    <div class="nav-label">Workspace</div>
    <nav class="nav-list">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
        <span class="nav-link__icon"><component :is="link.icon" :size="18" aria-hidden="true" /></span>
        <span>{{ link.label }}</span>
      </NuxtLink>
    </nav>
    <div class="storage-card">
      <span class="storage-card__dot" :class="{ 'storage-card__dot--file': navigationStorage.state === 'current', 'storage-card__dot--paused': navigationStorage.state === 'pending' }" />
      <div>
        <strong>瀏覽器自動保存</strong>
        <small>{{ navigationStorage.detail }}</small>
      </div>
    </div>
  </aside>
  <nav class="bottom-nav" aria-label="行動版主要導覽">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="bottom-link">
      <component :is="link.icon" :size="19" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; width: 256px; display: flex; flex-direction: column; padding: 26px 18px 20px; background: rgba(249,252,251,.96); border-right: 1px solid var(--border); backdrop-filter: blur(18px); }
.brand { display: flex; align-items: center; gap: 12px; padding: 0 10px 30px; color: var(--text); text-decoration: none; }
.brand-mark { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(145deg, var(--primary), #159486); color: white; font-size: 1.3rem; font-weight: 820; box-shadow: 0 8px 18px rgba(11,107,99,.18); }
.brand-copy strong, .brand-copy small { display: block; }
.brand-copy strong { font-size: 1rem; letter-spacing: -.02em; }
.brand-copy small { margin-top: 2px; color: var(--muted); font-size: .7rem; }
.nav-label { padding: 0 12px 9px; color: #8aa09c; font-size: .62rem; font-weight: 780; letter-spacing: .13em; text-transform: uppercase; }
.nav-list { display: grid; gap: 5px; }
.nav-link { min-height: 46px; display: flex; align-items: center; gap: 11px; padding: 7px 10px; border-radius: 12px; color: #56716d; font-size: .86rem; font-weight: 680; text-decoration: none; transition: background-color .18s, color .18s, transform .18s; }
.nav-link__icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 9px; color: #78908c; }
.nav-link:hover { background: #edf6f4; color: var(--primary); transform: translateX(2px); }
.nav-link.router-link-exact-active { background: var(--primary-soft); color: var(--primary); }
.nav-link.router-link-exact-active .nav-link__icon { background: white; color: var(--primary); box-shadow: 0 2px 8px rgba(11,107,99,.08); }
.storage-card { display: flex; align-items: flex-start; gap: 10px; margin-top: auto; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: white; }
.storage-card__dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: #9aa9a6; box-shadow: 0 0 0 4px #eff3f2; }
.storage-card__dot--file { background: #15916f; box-shadow: 0 0 0 4px #e4f5ef; }
.storage-card__dot--paused { background: #c88920; box-shadow: 0 0 0 4px #fff3d9; }
.storage-card strong, .storage-card small { display: block; }
.storage-card strong { font-size: .75rem; }
.storage-card small { overflow: hidden; max-width: 165px; margin-top: 3px; color: var(--muted); font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
.bottom-nav { display: none; }
@media (max-width: 880px) {
  .sidebar { display: none; }
  .bottom-nav { position: fixed; z-index: 30; inset: auto 0 0; display: grid; grid-template-columns: repeat(7, 1fr); padding: 7px max(5px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(5px, env(safe-area-inset-left)); background: rgba(255,255,255,.96); border-top: 1px solid var(--border); box-shadow: 0 -8px 28px rgba(21,61,57,.06); backdrop-filter: blur(16px); }
  .bottom-link { min-height: 55px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-radius: 10px; color: var(--muted); font-size: .6rem; font-weight: 720; text-decoration: none; }
  .bottom-link.router-link-exact-active { color: var(--primary); background: var(--primary-soft); }
}
</style>
