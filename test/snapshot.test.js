import { describe, expect, it } from 'vitest'
import { normalizeConfig, upsertSnapshot } from '../app/services/money-domain.js'

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
    expect(config.version).toBe(2)
    expect(config.snapshots).toEqual([])
    expect(config.settings.snapshotDisplayLimit).toBe(30)
  })
})
