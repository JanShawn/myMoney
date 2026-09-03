import { describe, expect, it } from 'vitest'
import { createDefaultConfig, normalizeConfig, SYSTEM_CASH_GROUP_ID, SYSTEM_CASH_ITEM_ID, upsertSnapshot } from '../app/services/money-domain.js'

describe('snapshot storage', () => {
  it('同一天更新原紀錄，不建立重複日期', () => {
    const first = { date: '2026-08-28', netWorth: 90000, note: '第一筆' }
    const updated = { date: '2026-08-28', netWorth: 95000, note: '同日更新' }
    const snapshots = upsertSnapshot(upsertSnapshot([], first), updated)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].netWorth).toBe(95000)
    expect(snapshots[0].note).toBe('同日更新')
  })

  it('舊版資料會補上靜態架構需要的 snapshots', () => {
    const config = normalizeConfig({ version: 1, groups: [], items: [], holdings: [] })
    expect(config.version).toBe(7)
    expect(config.snapshots).toEqual([])
    expect(config.cashDrafts).toEqual({})
    expect(config.settings.snapshotDisplayLimit).toBe(30)
    expect(config.settings.cashReconciliationEnabled).toBe(true)
    expect(config.groups).toContainEqual(expect.objectContaining({ id: 'group-cash', name: '現金', system: true, archived: false }))
    expect(config.items).toContainEqual(expect.objectContaining({ id: 'item-cash', groupId: 'group-cash', behavior: 'cash', system: true, archived: false }))
  })

  it('新資料使用現金、銀行、投資、貸款、其他的預設群組順序', () => {
    const groupIds = createDefaultConfig().groups
      .sort((left, right) => left.order - right.order)
      .map((group) => group.id)

    expect(groupIds).toEqual(['group-cash', 'group-bank', 'group-invest', 'group-debt', 'group-other'])
  })

  it('舊版預設順序會遷移，但保留使用者自訂順序', () => {
    const legacyGroups = [
      { id: 'group-bank', order: 0 },
      { id: 'group-invest', order: 1 },
      { id: 'group-cash', order: 2 },
      { id: 'group-other', order: 3 },
      { id: 'group-debt', order: 4 }
    ]
    const migratedIds = normalizeConfig({ version: 2, groups: legacyGroups }).groups
      .sort((left, right) => left.order - right.order)
      .map((group) => group.id)
    const customIds = normalizeConfig({ version: 2, groups: [
      { id: 'group-other', order: 0 },
      { id: 'group-bank', order: 1 },
      { id: 'group-invest', order: 2 },
      { id: 'group-cash', order: 3 },
      { id: 'group-debt', order: 4 }
    ] }).groups
      .sort((left, right) => left.order - right.order)
      .map((group) => group.id)

    expect(migratedIds).toEqual(['group-cash', 'group-bank', 'group-invest', 'group-debt', 'group-other'])
    expect(customIds).toEqual(['group-other', 'group-bank', 'group-invest', 'group-cash', 'group-debt'])
  })

  it('舊資料中的預設現金帳戶會移到受保護的現金群組', () => {
    const config = normalizeConfig({
      groups: [{ id: 'group-other', name: '其他項目', order: 2, archived: false }],
      items: [{ id: 'item-cash', groupId: 'group-other', name: '錢包', behavior: 'cash', amount: 50, archived: true }]
    })
    expect(config.items.find((item) => item.id === 'item-cash')).toMatchObject({
      groupId: 'group-cash', name: '錢包', amount: 50, behavior: 'cash', archived: false, system: true
    })
  })

  it('保留每個現金帳戶的驗算草稿，並正規化為 expectedAmount', () => {
    const config = normalizeConfig({
      cashDrafts: { cash: { baseAmount: 100, rows: [{ label: '零錢', operation: 'add', amount: 25 }] } }
    })
    expect(config.cashDrafts).toEqual({
      cash: { expectedAmount: 100, rows: [{ label: '零錢', operation: 'add', amount: 25 }] }
    })
  })

  it('丟棄未知頂層欄位與持倉 yahooUrl', () => {
    const config = normalizeConfig({
      evil: { nested: true },
      groups: [],
      items: [],
      holdings: [{ id: 'h1', ticker: '2330', yahooUrl: 'javascript:alert(1)', name: '台積電' }],
      snapshots: [{ date: '2026-01-01', note: '=cmd|"/c calc"', netWorth: 1, unexpected: 99 }]
    })
    expect(config).not.toHaveProperty('evil')
    expect(config.holdings[0]).not.toHaveProperty('yahooUrl')
    expect(config.snapshots[0]).toMatchObject({ date: '2026-01-01', note: '=cmd|"/c calc"', netWorth: 1 })
    expect(config.snapshots[0]).not.toHaveProperty('unexpected')
  })

  it('關閉現金驗算後，把系統現金轉回可自由管理的台幣帳戶', () => {
    const config = normalizeConfig({
      settings: { cashReconciliationEnabled: false },
      groups: [{ id: SYSTEM_CASH_GROUP_ID, name: '零用金', order: 2, archived: false, system: true }],
      items: [{
        id: SYSTEM_CASH_ITEM_ID,
        groupId: SYSTEM_CASH_GROUP_ID,
        name: '隨身錢包',
        behavior: 'cash',
        amount: 800,
        archived: false,
        system: true
      }]
    })

    expect(config.groups[0]).toMatchObject({ id: SYSTEM_CASH_GROUP_ID, name: '零用金', system: false })
    expect(config.items[0]).toMatchObject({
      id: SYSTEM_CASH_ITEM_ID,
      name: '隨身錢包',
      behavior: 'manual',
      amount: 800,
      system: false
    })
  })

  it('關閉時不強制補回已刪除的現金結構，重新啟用時才補回', () => {
    const disabled = normalizeConfig({
      settings: { cashReconciliationEnabled: false },
      groups: [],
      items: []
    })
    expect(disabled.groups).toEqual([])
    expect(disabled.items).toEqual([])

    const enabled = normalizeConfig({
      ...disabled,
      settings: { ...disabled.settings, cashReconciliationEnabled: true }
    })
    expect(enabled.groups).toContainEqual(expect.objectContaining({ id: SYSTEM_CASH_GROUP_ID, system: true }))
    expect(enabled.items).toContainEqual(expect.objectContaining({ id: SYSTEM_CASH_ITEM_ID, behavior: 'cash', system: true }))
  })

  it('舊外幣帳戶會自動歸到外幣統計類別', () => {
    const config = normalizeConfig({
      items: [{ id: 'usd', behavior: 'foreign', assetClass: 'other', currency: 'USD', exchangeRate: 32 }]
    })
    expect(config.items[0].assetClass).toBe('foreign')
    expect(config.items[0].exchangeRate).toBe(32)
    expect(config.market.fxRates.TWD).toBe(1)
  })

  it('舊帳戶資料會依原始順序補上可拖曳排序欄位', () => {
    const config = normalizeConfig({
      version: 6,
      groups: [{ id: 'group-bank', name: '銀行', order: 0 }],
      items: [
        { id: 'bank-a', groupId: 'group-bank', name: 'A', amount: 1 },
        { id: 'bank-b', groupId: 'group-bank', name: 'B', amount: 2 }
      ]
    })
    const bankItems = config.items.filter((item) => item.groupId === 'group-bank')
    expect(bankItems.map((item) => [item.id, item.order])).toEqual([['bank-a', 0], ['bank-b', 1]])
  })

  it('舊帳戶會依類型自動歸類，且流動性只保留立即可用與受限制', () => {
    const config = normalizeConfig({
      items: [
        { id: 'legacy-other', behavior: 'manual', assetClass: 'other', assetClassDetail: '保單', liquidity: 'convertible', includeInAssets: false },
        { id: 'debt', behavior: 'liability', assetClass: 'cash', liquidity: 'available', includeInAssets: true }
      ]
    })

    expect(config.items[0]).toMatchObject({ assetClass: 'cash', liquidity: 'available', includeInAssets: true })
    expect(config.items[0]).not.toHaveProperty('assetClassDetail')
    expect(config.items[1]).toMatchObject({ assetClass: 'liability', liquidity: 'locked', includeInAssets: false })
  })
})
