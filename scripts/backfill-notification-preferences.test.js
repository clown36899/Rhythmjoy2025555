import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCafe24TableRows: vi.fn(),
  deleteCafe24TableRows: vi.fn(),
  getUserNotificationPreferences: vi.fn(),
  saveUserNotificationPreferences: vi.fn(),
}));

vi.mock('../server/cafe24/generic-data-api.js', () => ({
  loadCafe24TableRows: mocks.loadCafe24TableRows,
  deleteCafe24TableRows: mocks.deleteCafe24TableRows,
}));
vi.mock('../server/cafe24/notification-preferences.js', () => ({
  getUserNotificationPreferences: mocks.getUserNotificationPreferences,
  saveUserNotificationPreferences: mocks.saveUserNotificationPreferences,
}));

describe('notification preference backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCafe24TableRows.mockResolvedValue([
      { user_id: 'disabled-user', updated_at: '2026-08-03T00:00:00Z', pref_new_event_alerts: true },
      { user_id: 'new-user', updated_at: '2026-08-03T00:01:00Z', pref_new_event_alerts: true },
      { user_id: 'legacy-user', updated_at: '2026-08-03T00:02:00Z', subscription: {} },
    ]);
    mocks.getUserNotificationPreferences.mockImplementation(async (userId) => (
      userId === 'disabled-user' ? { user_id: userId, enabled: false } : null
    ));
    mocks.saveUserNotificationPreferences.mockResolvedValue({});
    mocks.deleteCafe24TableRows.mockResolvedValue(undefined);
  });

  it('preserves existing preferences and disables every missing legacy user', async () => {
    const { backfillNotificationPreferences } = await import('./backfill-notification-preferences.mjs');

    const result = await backfillNotificationPreferences();

    expect(result).toEqual({
      migratedUsers: 2,
      preservedUsers: 1,
      subscriptionUsers: 3,
      deletedSubscriptions: 0,
    });
    expect(mocks.saveUserNotificationPreferences).toHaveBeenCalledTimes(2);
    expect(mocks.saveUserNotificationPreferences).toHaveBeenCalledWith(
      'new-user',
      expect.objectContaining({
        enabled: false,
        pref_today_digest: false,
        pref_new_event_alerts: false,
      }),
    );
    expect(mocks.saveUserNotificationPreferences).toHaveBeenCalledWith(
      'legacy-user',
      expect.objectContaining({
        enabled: false,
        pref_today_digest: false,
        pref_new_event_alerts: false,
      }),
    );
    expect(mocks.deleteCafe24TableRows).not.toHaveBeenCalled();
  });

  it('disables every existing subscriber and removes every server subscription during rollout reset', async () => {
    const { backfillNotificationPreferences } = await import('./backfill-notification-preferences.mjs');

    const result = await backfillNotificationPreferences({ resetExistingSubscriptions: true });

    expect(result).toEqual({
      migratedUsers: 3,
      preservedUsers: 0,
      subscriptionUsers: 3,
      deletedSubscriptions: 3,
    });
    expect(mocks.saveUserNotificationPreferences).toHaveBeenCalledTimes(3);
    for (const [, preferences] of mocks.saveUserNotificationPreferences.mock.calls) {
      expect(preferences).toEqual(expect.objectContaining({
        enabled: false,
        pref_today_digest: false,
        pref_new_event_alerts: false,
      }));
    }
    expect(mocks.deleteCafe24TableRows).toHaveBeenCalledWith(
      'user_push_subscriptions',
      expect.arrayContaining([
        expect.objectContaining({ user_id: 'disabled-user' }),
        expect.objectContaining({ user_id: 'new-user' }),
        expect.objectContaining({ user_id: 'legacy-user' }),
      ]),
    );
  });
});
