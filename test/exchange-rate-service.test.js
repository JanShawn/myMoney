import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTwdExchangeRates } from '../app/services/exchange-rate-service.js'

describe('exchange rate service', () => {
  it('把 TWD 基準匯率換成一單位外幣的台幣價值', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: 'success',
        time_last_update_unix: 1787875351,
        rates: { TWD: 1, USD: 0.03125, JPY: 5 }
      })
    })))

    await expect(fetchTwdExchangeRates()).resolves.toMatchObject({
      rates: { TWD: 1, USD: 32, JPY: 0.2 }
    })
  })
})

afterEach(() => vi.unstubAllGlobals())
