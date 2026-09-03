import { describe, expect, it } from 'vitest'
import { createResetConfig, inspectJsonImport, summarizeConfigChanges } from '../app/services/local-json-storage'
import { createDefaultConfig } from '../app/services/money-domain'

describe('IndexedDB 備份異動摘要', () => {
  it('列出帳戶金額、持倉與盤點異動', () => {
    const before = createDefaultConfig()
    before.items.push({
      id: 'bank-1', groupId: 'group-bank', name: '生活帳戶', amount: 1000,
      currency: 'TWD', exchangeRate: 1, assetClass: 'cash', liquidity: 'available',
      includeInAssets: true, archived: false
    })
    before.holdings.push({ id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100, order: 0 })

    const after = structuredClone(before)
    after.items.find((item) => item.id === 'bank-1').amount = 2500
    after.holdings.find((holding) => holding.id === 'holding-1').quantity = 20
    after.snapshots.push({ date: '2026-08-30', netWorth: 3000 })

    expect(summarizeConfigChanges(before, after)).toEqual([
      '帳戶「生活帳戶」：金額 1,000 → 2,500 TWD',
      '持倉「2330 台積電」：股數 10 → 20',
      '新增 2026-08-30 資產盤點'
    ])
  })

  it('不把單純的自動保存時間列為資料異動', () => {
    const before = createDefaultConfig()
    const after = structuredClone(before)
    after.settings.lastSavedAt = '2026-08-30T12:00:00.000Z'

    expect(summarizeConfigChanges(before, after)).toEqual([])
  })

  it('不把市場資料、自動匯率與自動股價列為異動', () => {
    const before = createDefaultConfig()
    before.items.push({
      id: 'usd-1', groupId: 'group-bank', name: '美元帳戶', amount: 100,
      currency: 'USD', exchangeRate: 30, behavior: 'foreign', assetClass: 'foreign',
      liquidity: 'available', includeInAssets: true, archived: false
    })
    before.holdings.push({
      id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100,
      priceSource: 'auto', priceAsOfDate: '2026-08-29', order: 0
    })

    const after = structuredClone(before)
    after.market.taiex = 25000
    after.market.fxRates.USD = 31
    after.items.find((item) => item.id === 'usd-1').exchangeRate = 31
    Object.assign(after.holdings[0], { price: 120, priceSource: 'auto', priceAsOfDate: '2026-08-30' })

    expect(summarizeConfigChanges(before, after)).toEqual([])
  })

  it('仍列出使用者手動修改的持倉價格', () => {
    const before = createDefaultConfig()
    before.holdings.push({ id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100, priceSource: 'auto', order: 0 })
    const after = structuredClone(before)
    Object.assign(after.holdings[0], { price: 125, priceSource: 'manual' })

    expect(summarizeConfigChanges(before, after)).toEqual(['持倉「2330 台積電」：價格 100 → 125'])
  })

  it('列出週期收支項目的文字與數字異動', () => {
    const before = createDefaultConfig()
    before.recurringCashflowItems.push({ id: 'rent', name: '房租', type: 'expense', amount: 18000, frequency: 'monthly' })
    const after = structuredClone(before)
    Object.assign(after.recurringCashflowItems[0], { amount: 20000, frequency: 'quarterly' })

    expect(summarizeConfigChanges(before, after)).toEqual([
      '週期收支「房租」：金額 18,000 → 20,000 TWD、週期改為每季'
    ])
  })

  it('復原 JSON 前先解析內容與列出差異，不直接修改目前資料', async () => {
    const current = createDefaultConfig()
    const imported = structuredClone(current)
    imported.items[0].amount = 3500
    const file = { name: 'myMoney-backup.json', text: async () => JSON.stringify(imported) }

    const preview = await inspectJsonImport(file, current)

    expect(preview.fileName).toBe('myMoney-backup.json')
    expect(preview.summary.accounts).toBe(1)
    expect(preview.changes).toEqual(['帳戶「身上現金」：金額 0 → 3,500 TWD'])
    expect(current.items[0].amount).toBe(0)
  })

  it('拒絕不是 myMoney 完整備份的 JSON', async () => {
    const file = { name: 'other.json', text: async () => JSON.stringify({ hello: 'world' }) }
    await expect(inspectJsonImport(file, createDefaultConfig())).rejects.toThrow('不是 myMoney 完整備份')
  })

  it('拒絕超過筆數上限的備份', async () => {
    const oversized = createDefaultConfig()
    oversized.holdings = Array.from({ length: 501 }, (_, index) => ({ id: `h-${index}`, ticker: '2330', name: '台積電' }))
    const file = { name: 'too-many.json', text: async () => JSON.stringify(oversized) }
    await expect(inspectJsonImport(file, createDefaultConfig())).rejects.toThrow('holdings 超過上限')
  })

  it('建立保留系統預設資料的重設版本', () => {
    const resetAt = new Date('2026-09-01T08:00:00.000Z')
    const data = createResetConfig(resetAt)

    expect(data.settings.lastSavedAt).toBe(resetAt.toISOString())
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({ id: 'item-cash', amount: 0, system: true })
    expect(data.holdings).toEqual([])
    expect(data.snapshots).toEqual([])
    expect(data.recurringCashflowItems).toEqual([])
  })
})
