import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPushSubscriptionRecordId,
  migratePushSubscriptionRecordKeys,
} from './push-subscription-key.js';

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

  it('ships a legacy-MySQL-compatible migration entrypoint', async () => {
    const sql = await fs.readFile(path.join(
      process.cwd(),
      'server/cafe24/migrations/2026-08-11-push-subscription-record-keys.sql',
    ), 'utf8');
    const deployScript = await fs.readFile(path.join(
      process.cwd(),
      'scripts/deploy-cafe24.sh',
    ), 'utf8');
    expect(sql).not.toContain('JSON_UNQUOTE(');
    expect(sql).not.toContain('JSON_EXTRACT(');
    expect(deployScript).toContain('migrate-push-subscription-record-keys.mjs');
  });

  it('writes canonical rows and deletes legacy keys in one transaction', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${'z'.repeat(150)}`;
    const canonicalId = getPushSubscriptionRecordId(endpoint);
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn()
        .mockResolvedValueOnce([[
          {
            record_id: endpoint.slice(0, 160),
            data_json: JSON.stringify({ endpoint, user_id: 'admin-1' }),
            created_at: new Date('2026-08-03T00:00:00Z'),
            updated_at: new Date('2026-08-10T00:00:00Z'),
            imported_at: new Date('2026-08-10T00:00:00Z'),
          },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const result = await migratePushSubscriptionRecordKeys({
      getConnection: vi.fn().mockResolvedValue(connection),
    });

    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO generic_records'),
      expect.arrayContaining(['user_push_subscriptions', canonicalId]),
    );
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM generic_records'),
      ['user_push_subscriptions', endpoint.slice(0, 160)],
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      scanned: 1,
      endpoints: 1,
      canonicalWritten: 1,
      legacyDeleted: 1,
      invalidRows: 0,
    });
  });
});
