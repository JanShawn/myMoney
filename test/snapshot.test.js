import { describe, expect, it } from 'vitest'
import { createDefaultConfig, normalizeConfig, upsertSnapshot } from '../app/services/money-domain.js'

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
    expect(config.version).toBe(3)
    expect(config.snapshots).toEqual([])
    expect(config.cashDrafts).toEqual({})
    expect(config.settings.snapshotDisplayLimit).toBe(30)
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

  it('保留每個現金帳戶的驗算草稿', () => {
    const cashDrafts = { cash: { baseAmount: 100, rows: [{ label: '零錢', operation: 'add', amount: 25 }] } }
    const config = normalizeConfig({ cashDrafts })
    expect(config.cashDrafts).toEqual(cashDrafts)
  })

  it('舊外幣帳戶會自動歸到外幣統計類別', () => {
    const config = normalizeConfig({
      items: [{ id: 'usd', behavior: 'foreign', assetClass: 'other', currency: 'USD', exchangeRate: 32 }]
    })
    expect(config.items[0].assetClass).toBe('foreign')
    expect(config.items[0].exchangeRate).toBe(32)
    expect(config.market.fxRates.TWD).toBe(1)
  })
})
