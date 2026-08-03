import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('../server/cafe24/mysql-pool.js', () => ({
  getMysqlPool: () => ({ execute: mocks.execute }),
}));

describe('notification reset notice rollout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([{ affectedRows: 37 }]);
  });

  it('adds one deduplicated unread bell notice per existing user without a push target', async () => {
    const { seedNotificationResetNotice } = await import('./seed-notification-reset-notice.mjs');

    const result = await seedNotificationResetNotice();

    expect(result).toEqual({
      status: 'ok',
      insertedNotices: 37,
      sourceId: 'notification-settings-reset-20260803',
      pushTargets: 0,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const [sql, values] = mocks.execute.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE INTO user_notifications');
    expect(sql).toContain('FROM users');
    expect(values).toEqual([
      '알림 기능 재설정 안내',
      '알람기능이 재설정되었습니다. 사용하기위해서는 재설정 저장해주세요',
      'notification-settings-reset-20260803',
      '{"action":"open-notification-settings"}',
    ]);
  });
});
