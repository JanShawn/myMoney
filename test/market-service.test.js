import { afterAll, describe, expect, it, vi } from 'vitest'
import { fetchMarketPreview, lookupMarketInstrument } from '../app/services/market-service.js'

describe('market instrument lookup', () => {
  it('用代號帶回官方名稱與收盤價', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('finmindtrade')) return { ok: true, json: async () => ({ status: 200, data: [{ date: '2026-08-28', stock_id: '0050', close: 199 }] }) }
      return { ok: true, json: async () => value.includes('twse') ? [{ Code: '0050', Name: '元大台灣50', ClosingPrice: '198.50' }] : [] }
    }))

    await expect(lookupMarketInstrument('0050')).resolves.toMatchObject({
      ticker: '0050',
      name: '元大台灣50',
      price: 199,
      market: 'TWSE',
      marketDate: '2026-08-28',
      fallback: false
    })
  })

  it('官方線上請求受阻時，使用本機官方快取帶回加權指數與 240MA', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('market-summary.json')) {
        return { ok: true, json: async () => ({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' }) }
      }
      if (value.includes('MI_INDEX')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => [] }
    }))

    await expect(fetchMarketPreview(['0050'])).resolves.toMatchObject({
      prices: { '0050': 199 },
      priceDates: { '0050': '2026-08-28' },
      taiex: 46331.45,
      ma240: 35042.84,
      asOfDate: '2026-08-28',
      warnings: []
    })
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('MI_INDEX'), expect.anything())
  })
})

afterAll(() => vi.unstubAllGlobals())
