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

  it('優先使用證交所最新交易日大盤，240MA 沿用可用歷史資料', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('market-summary.json')) {
        return { ok: true, json: async () => ({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' }) }
      }
      if (value.includes('www.twse.com.tw/exchangeReport/FMTQIK')) {
        return { ok: true, json: async () => ({ data: [['115/09/01', '', '', '', '46,948.72'], ['115/09/02', '', '', '', '46,164.72']] }) }
      }
      if (value.includes('MI_INDEX')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => [] }
    }))

    await expect(fetchMarketPreview(['0050'])).resolves.toMatchObject({
      prices: { '0050': 199 },
      priceDates: { '0050': '2026-08-28' },
      taiex: 46164.72,
      ma240: 35042.84,
      asOfDate: '2026-09-02',
      warnings: []
    })
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('MI_INDEX'), expect.anything())
  })

  it('證交所最新資料受阻時才回退到本機快取並清楚提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('market-summary.json')) {
        return { ok: true, json: async () => ({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' }) }
      }
      if (value.includes('FMTQIK') || value.includes('MI_INDEX')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => [] }
    }))

    const result = await fetchMarketPreview([])
    expect(result).toMatchObject({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' })
    expect(result.warnings).toContain('無法取得證交所最新大盤資料，暫時使用 2026-08-28 快取。')
  })
})

afterAll(() => vi.unstubAllGlobals())
