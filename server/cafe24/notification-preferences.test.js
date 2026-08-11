import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: mocks.execute }) }));

describe('user-scoped notification preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockImplementation(async (sql) => (
      String(sql).includes('SELECT enabled, pref_new_event_alerts, new_event_enabled_at')
        ? [[]]
        : [{ affectedRows: 1 }]
    ));
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

    const insertCall = mocks.execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_notification_preferences'));
    expect(insertCall).toEqual([
      expect.stringContaining('ON DUPLICATE KEY UPDATE'),
      expect.arrayContaining(['user-a', 1, 1, 1]),
    ]);
    expect(insertCall[0]).toContain('new_event_enabled_at');
    expect(insertCall[0]).toContain('pref_only_with_events, created_at');
    expect(insertCall[0]).toContain('CURRENT_TIMESTAMP');
    expect(insertCall[1][4]).toBeInstanceOf(Date);
  });

  it('preserves the original new-event activation boundary on later saves', async () => {
    const enabledAt = '2026-08-10T23:00:00.000Z';
    mocks.execute.mockImplementation(async (sql) => (
      String(sql).includes('SELECT enabled, pref_new_event_alerts, new_event_enabled_at')
        ? [[{ enabled: 1, pref_new_event_alerts: 1, new_event_enabled_at: enabledAt }]]
        : [{ affectedRows: 1 }]
    ));

    const { saveUserNotificationPreferences } = await import('./notification-preferences.js');
    const saved = await saveUserNotificationPreferences('user-a', {
      enabled: true,
      pref_today_digest: false,
      pref_new_event_alerts: true,
    });

    const insertCall = mocks.execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_notification_preferences'));
    expect(insertCall[1][4]).toBe(enabledAt);
    expect(saved.new_event_enabled_at).toBe(enabledAt);
  });

  it('clears the activation boundary when new-event alerts are disabled', async () => {
    mocks.execute.mockImplementation(async (sql) => (
      String(sql).includes('SELECT enabled, pref_new_event_alerts, new_event_enabled_at')
        ? [[{ enabled: 1, pref_new_event_alerts: 1, new_event_enabled_at: '2026-08-11 08:00:00' }]]
        : [{ affectedRows: 1 }]
    ));

    const { saveUserNotificationPreferences } = await import('./notification-preferences.js');
    const saved = await saveUserNotificationPreferences('user-a', {
      enabled: true,
      pref_today_digest: true,
      pref_new_event_alerts: false,
    });

    const insertCall = mocks.execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_notification_preferences'));
    expect(insertCall[1][4]).toBeNull();
    expect(saved.new_event_enabled_at).toBeNull();
  });
});
