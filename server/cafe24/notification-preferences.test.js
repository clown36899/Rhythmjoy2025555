import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: mocks.execute }) }));

describe('user-scoped notification preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('preserves each selected delivery route instead of replacing it with device defaults', async () => {
    const { normalizeNotificationPreferences } = await import('./notification-preferences.js');
    expect(normalizeNotificationPreferences({
      enabled: true,
      pref_today_digest: true,
      pref_new_event_alerts: true,
      pref_new_event_social: true,
      pref_new_event_class: true,
      pref_new_event_clubs: true,
      pref_events: false,
      pref_class: true,
      pref_clubs: false,
      pref_digest_days_json: '[1,3,5]',
    })).toEqual(expect.objectContaining({
      enabled: true,
      pref_today_digest: true,
      pref_new_event_alerts: true,
      pref_new_event_social: true,
      pref_new_event_class: true,
      pref_new_event_clubs: true,
      pref_events: false,
      pref_class: true,
      pref_clubs: false,
      pref_digest_days: [1, 3, 5],
    }));
  });

  it('stores one canonical preference row per user', async () => {
    const { saveUserNotificationPreferences } = await import('./notification-preferences.js');
    await saveUserNotificationPreferences('user-a', {
      enabled: true,
      pref_today_digest: true,
      pref_new_event_alerts: true,
    });

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('ON DUPLICATE KEY UPDATE'),
      expect.arrayContaining(['user-a', 1, 1, 1]),
    );
    expect(mocks.execute.mock.calls[0][0]).toContain('pref_only_with_events, created_at');
    expect(mocks.execute.mock.calls[0][0]).toContain('CURRENT_TIMESTAMP');
  });
});
