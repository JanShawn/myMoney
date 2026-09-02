<script setup>
import { BarChart3, CalendarRange, ClipboardCheck, Landmark, Moon, Settings, Sun, WalletCards, WalletMinimal } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { isDark, toggleTheme } = useTheme()
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
    <button class="theme-toggle" type="button" :aria-pressed="isDark" :aria-label="isDark ? '切換為亮色模式' : '切換為暗黑模式'" @click="toggleTheme">
      <span class="theme-toggle__icon"><Sun v-if="isDark" :size="18" aria-hidden="true" /><Moon v-else :size="18" aria-hidden="true" /></span>
      <span><strong>{{ isDark ? '亮色模式' : '暗黑模式' }}</strong><small>{{ isDark ? '切換為明亮介面' : '降低夜間亮度' }}</small></span>
    </button>
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
    <button class="bottom-link bottom-theme-toggle" type="button" :aria-pressed="isDark" :aria-label="isDark ? '切換為亮色模式' : '切換為暗黑模式'" @click="toggleTheme">
      <Sun v-if="isDark" :size="19" aria-hidden="true" /><Moon v-else :size="19" aria-hidden="true" />
      <span>{{ isDark ? '亮色' : '暗黑' }}</span>
    </button>
  </nav>
</template>

<style scoped>
.sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; width: 256px; display: flex; flex-direction: column; padding: 26px 18px 20px; background: var(--surface-glass); border-right: 1px solid var(--border); backdrop-filter: blur(18px); }
.brand { display: flex; align-items: center; gap: 12px; padding: 0 10px 30px; color: var(--text); text-decoration: none; }
.brand-mark { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(145deg, var(--metric-start), var(--metric-end)); color: white; font-size: 1.3rem; font-weight: 820; box-shadow: var(--shadow-sm); }
.brand-copy strong, .brand-copy small { display: block; }
.brand-copy strong { font-size: 1rem; letter-spacing: -.02em; }
.brand-copy small { margin-top: 2px; color: var(--muted); font-size: .7rem; }
.nav-label { padding: 0 12px 9px; color: var(--muted); font-size: .62rem; font-weight: 780; letter-spacing: .13em; text-transform: uppercase; }
.nav-list { display: grid; gap: 5px; }
.nav-link { min-height: 46px; display: flex; align-items: center; gap: 11px; padding: 7px 10px; border-radius: 12px; color: var(--text-soft); font-size: .86rem; font-weight: 680; text-decoration: none; transition: background-color .18s, color .18s, transform .18s; }
.nav-link__icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 9px; color: var(--muted); }
.nav-link:hover { background: var(--primary-soft); color: var(--primary); transform: translateX(2px); }
.nav-link.router-link-exact-active { background: var(--primary-soft); color: var(--primary); }
.nav-link.router-link-exact-active .nav-link__icon { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-sm); }
.theme-toggle { width: 100%; min-height: 54px; display: flex; align-items: center; gap: 10px; margin-top: auto; padding: 9px 11px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text); cursor: pointer; text-align: left; transition: background .18s, border-color .18s, transform .18s; }
.theme-toggle:hover { border-color: var(--control-hover-border); background: var(--surface-hover); transform: translateY(-1px); }
.theme-toggle__icon { width: 32px; height: 32px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 10px; background: var(--primary-soft); color: var(--primary); }
.theme-toggle strong, .theme-toggle small { display: block; }
.theme-toggle strong { font-size: .76rem; }
.theme-toggle small { margin-top: 2px; color: var(--muted); font-size: .65rem; }
.storage-card { display: flex; align-items: flex-start; gap: 10px; margin-top: 10px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.storage-card__dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 4px var(--neutral-soft); }
.storage-card__dot--file { background: var(--success); box-shadow: 0 0 0 4px var(--success-soft); }
.storage-card__dot--paused { background: var(--warning); box-shadow: 0 0 0 4px var(--warning-soft); }
.storage-card strong, .storage-card small { display: block; }
.storage-card strong { font-size: .75rem; }
.storage-card small { overflow: hidden; max-width: 165px; margin-top: 3px; color: var(--muted); font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
.bottom-nav { display: none; }
@media (max-width: 880px) {
  .sidebar { display: none; }
  .bottom-nav { position: fixed; z-index: 30; inset: auto 0 0; display: grid; grid-template-columns: repeat(8, 1fr); padding: 7px max(5px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(5px, env(safe-area-inset-left)); background: var(--surface-glass); border-top: 1px solid var(--border); box-shadow: var(--shadow-sm); backdrop-filter: blur(16px); }
  .bottom-link { min-width: 0; min-height: 55px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font: inherit; font-size: .6rem; font-weight: 720; text-decoration: none; cursor: pointer; }
  .bottom-link.router-link-exact-active { color: var(--primary); background: var(--primary-soft); }
}
</style>
