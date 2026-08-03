import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCafe24TableRows: vi.fn(),
  saveCafe24TableRow: vi.fn(),
}));

vi.mock('../server/cafe24/generic-data-api.js', () => ({
  loadCafe24TableRows: mocks.loadCafe24TableRows,
  saveCafe24TableRow: mocks.saveCafe24TableRow,
}));

describe('notification rollout queue baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveCafe24TableRow.mockResolvedValue({});
  });

  it('expires every pre-existing pending item without touching sent history', async () => {
    mocks.loadCafe24TableRows.mockResolvedValue([
      { id: 'pending-1', status: 'pending', title: '기존 대기 1' },
      { id: 'pending-2', title: '기존 대기 2' },
      { id: 'sent-1', status: 'sent', title: '기존 완료' },
    ]);
    const { baselineNotificationQueue } = await import('./baseline-notification-queue.mjs');

    const result = await baselineNotificationQueue('2026-08-03T10:00:00.000Z');

    expect(result).toEqual({
      status: 'ok',
      suppressedPendingItems: 2,
      processedAt: '2026-08-03T10:00:00.000Z',
    });
    expect(mocks.saveCafe24TableRow).toHaveBeenCalledTimes(2);
    for (const [table, row, keys] of mocks.saveCafe24TableRow.mock.calls) {
      expect(table).toBe('notification_queue');
      expect(keys).toEqual(['id']);
      expect(row).toEqual(expect.objectContaining({
        status: 'expired',
        next_attempt_at: null,
        processed_at: '2026-08-03T10:00:00.000Z',
        result: expect.objectContaining({
          reason: 'pre_delivery_rollout_baseline',
          push: { targets: 0, sent: 0 },
          inbox: { targets: 0, saved: 0 },
        }),
      }));
    }
  });
});
