<script setup>
import { BarChart3, ClipboardCheck, Landmark, Settings, WalletCards, WalletMinimal } from '@lucide/vue'

const links = [
  { to: '/', label: '總覽', icon: BarChart3 },
  { to: '/snapshot', label: '資產盤點', icon: ClipboardCheck },
  { to: '/accounts', label: '帳戶結構', icon: Landmark },
  { to: '/investments', label: '投資持倉', icon: WalletCards },
  { to: '/cash', label: '現金驗算', icon: WalletMinimal },
  { to: '/settings', label: '設定', icon: Settings }
]
</script>

<template>
  <aside class="sidebar" aria-label="主要導覽">
    <NuxtLink to="/" class="brand">
      <span class="brand-mark">m</span>
      <span><strong>myMoney</strong><small>資產盤點</small></span>
    </NuxtLink>
    <nav class="nav-list">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
        <component :is="link.icon" :size="19" aria-hidden="true" />
        {{ link.label }}
      </NuxtLink>
    </nav>
    <p class="sidebar-note">資料保存在你的瀏覽器或已連結的本機 JSON。</p>
  </aside>
  <nav class="bottom-nav" aria-label="行動版主要導覽">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="bottom-link">
      <component :is="link.icon" :size="20" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; width: 244px; display: flex; flex-direction: column; padding: 28px 18px; background: #f9fcfb; border-right: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 11px; padding: 0 10px 28px; color: var(--text); text-decoration: none; }
.brand-mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: var(--primary); color: white; font-size: 1.25rem; font-weight: 800; }
.brand strong, .brand small { display: block; }
.brand strong { letter-spacing: -.02em; }
.brand small { margin-top: 2px; color: var(--muted); font-size: .72rem; }
.nav-list { display: grid; gap: 5px; }
.nav-link { min-height: 46px; display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 12px; color: #55716e; font-weight: 650; text-decoration: none; transition: background-color .18s, color .18s; }
.nav-link:hover { background: #edf7f5; color: var(--primary); }
.nav-link.router-link-active { background: #e2f3ef; color: var(--primary-dark); }
.sidebar-note { margin: auto 9px 0; color: var(--muted); font-size: .75rem; line-height: 1.55; }
.bottom-nav { display: none; }
@media (max-width: 820px) {
  .sidebar { display: none; }
  .bottom-nav { position: fixed; z-index: 30; inset: auto 0 0; display: grid; grid-template-columns: repeat(6, 1fr); padding: 7px max(5px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(5px, env(safe-area-inset-left)); background: rgba(255,255,255,.96); border-top: 1px solid var(--border); backdrop-filter: blur(12px); }
  .bottom-link { min-height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-radius: 9px; color: var(--muted); font-size: .62rem; font-weight: 700; text-decoration: none; }
  .bottom-link.router-link-active { color: var(--primary); background: #ebf7f4; }
}
</style>
