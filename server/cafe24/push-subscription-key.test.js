import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPushSubscriptionRecordId } from './push-subscription-key.js';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('./mysql-pool.js', () => ({
  getMysqlPool: () => ({ query: mocks.query }),
}));

describe('push subscription record keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('converts long FCM endpoints into a stable record_id below the database limit', () => {
    const endpointPrefix = 'https://fcm.googleapis.com/fcm/send/';
    const endpoint = `${endpointPrefix}${'x'.repeat(188 - endpointPrefix.length)}`;
    expect(endpoint).toHaveLength(188);
    const recordId = getPushSubscriptionRecordId(endpoint);
    expect(recordId).toMatch(/^push:[a-f0-9]{64}$/);
    expect(recordId).toHaveLength(69);
    expect(getPushSubscriptionRecordId(endpoint)).toBe(recordId);
  });

  it('deletes by the same hashed key and reports the actual affected row count', async () => {
    const endpointPrefix = 'https://fcm.googleapis.com/fcm/send/';
    const endpoint = `${endpointPrefix}${'y'.repeat(188 - endpointPrefix.length)}`;
    const { deleteCafe24TableRows } = await import('./generic-data-api.js');
    const result = await deleteCafe24TableRows('user_push_subscriptions', [{
      id: 'device-1',
      endpoint,
    }]);

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM generic_records'),
      ['user_push_subscriptions', getPushSubscriptionRecordId(endpoint)],
    );
    expect(result).toEqual({ requested: 1, deleted: 1 });
  });

  it('ships an idempotent migration from raw endpoint keys to SHA-256 keys', async () => {
    const sql = await fs.readFile(path.join(
      process.cwd(),
      'server/cafe24/migrations/2026-08-11-push-subscription-record-keys.sql',
    ), 'utf8');
    expect(sql).toContain("CONCAT('push:', SHA2(");
    expect(sql).toContain("WHERE table_name = 'user_push_subscriptions'");
    expect(sql).toContain("record_id NOT LIKE 'push:%'");
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
  });
});
