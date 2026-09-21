import { describe, expect, it } from 'vitest'
import {
  configFingerprint, createSyncFileDocument, decideSyncDirection, hasSyncConflict, inspectSyncFileText, resolveSyncVersionAt
} from '../app/services/local-json-storage'
import { createDefaultConfig } from '../app/services/money-domain'

describe('固定同步檔案', () => {
  it('將同步資訊放在根層，但不混入實際 money config', () => {
    const config = createDefaultConfig()
    config.items[0].amount = 1200
    const document = createSyncFileDocument(config, {
      revision: 3,
      updatedAt: '2026-09-18T01:00:00.000Z',
      deviceId: 'desktop-a'
    })

    const inspected = inspectSyncFileText(JSON.stringify(document), 'myMoney-sync.json')

    expect(document._sync).toEqual({
      schemaVersion: 1,
      revision: 3,
      updatedAt: '2026-09-18T01:00:00.000Z',
      deviceId: 'desktop-a'
    })
    expect(inspected.data._sync).toBeUndefined()
    expect(inspected.data.items[0].amount).toBe(1200)
    expect(inspected.fingerprint).toBe(configFingerprint(config))
  })

  it('仍可讀取沒有同步 metadata 的既有 JSON 備份', () => {
    const config = createDefaultConfig()
    const inspected = inspectSyncFileText(JSON.stringify(config), 'myMoney-backup.json')

    expect(inspected.metadata).toEqual({ schemaVersion: 1, revision: 0, updatedAt: null, deviceId: '' })
    expect(inspected.fingerprint).toBe(configFingerprint(config))
  })

  it('以資料最後修改時間當作檔案版本', () => {
    expect(resolveSyncVersionAt({
      summary: { lastSavedAt: '2026-09-21T13:12:34.000Z' },
      metadata: { updatedAt: '2026-09-21T14:30:00.000Z' }
    })).toBe('2026-09-21T13:12:34.000Z')
    expect(resolveSyncVersionAt({
      summary: { lastSavedAt: null },
      metadata: { updatedAt: '2026-09-21T14:30:00.000Z' }
    })).toBe('2026-09-21T14:30:00.000Z')
  })

  it('拒絕無效同步內容', () => {
    expect(() => inspectSyncFileText('{"hello":"world"}', 'other.json')).toThrow('不是 myMoney 完整備份')
    expect(() => inspectSyncFileText('{broken', 'broken.json')).toThrow('不是有效的 JSON')
  })

  it('只有遠端在基準版本後改變時才視為衝突', () => {
    expect(hasSyncConflict({
      lastRemoteFingerprint: 'remote-v1', remoteFingerprint: 'remote-v2', localFingerprint: 'local-v2'
    })).toBe(true)
    expect(hasSyncConflict({
      lastRemoteFingerprint: 'remote-v1', remoteFingerprint: 'remote-v1', localFingerprint: 'local-v2'
    })).toBe(false)
    expect(hasSyncConflict({
      lastRemoteFingerprint: 'remote-v1', remoteFingerprint: 'same', localFingerprint: 'same'
    })).toBe(false)
  })

  it('先讀取後分辨拉取、推送與雙向衝突', () => {
    expect(decideSyncDirection({
      lastRemoteFingerprint: 'base', lastLocalFingerprint: 'base',
      remoteFingerprint: 'remote-new', localFingerprint: 'base'
    })).toBe('pull')
    expect(decideSyncDirection({
      lastRemoteFingerprint: 'base', lastLocalFingerprint: 'base',
      remoteFingerprint: 'base', localFingerprint: 'local-new'
    })).toBe('push')
    expect(decideSyncDirection({
      lastRemoteFingerprint: 'base', lastLocalFingerprint: 'base',
      remoteFingerprint: 'remote-new', localFingerprint: 'local-new'
    })).toBe('conflict')
    expect(decideSyncDirection({
      lastRemoteFingerprint: 'base', lastLocalFingerprint: 'base',
      remoteFingerprint: 'same', localFingerprint: 'same'
    })).toBe('current')
  })
})
