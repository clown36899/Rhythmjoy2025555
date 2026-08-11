import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  notificationMatchesNewEventPreference,
  reconcileNotificationInboxPreferences,
} from './reconcile-notification-inbox-preferences.mjs';

describe('notification inbox preference reconciliation', () => {
  it('keeps only new-event rows created after activation and matching the selected category', () => {
    const preference = {
      enabled: 1,
      pref_new_event_alerts: 1,
      pref_new_event_social: 1,
      pref_new_event_class: 0,
      pref_new_event_clubs: 0,
      new_event_enabled_at: '2026-08-11T00:00:00.000Z',
    };

    expect(notificationMatchesNewEventPreference({
      created_at: '2026-08-11T00:00:01.000Z',
      data_json: JSON.stringify({ category: 'social' }),
    }, preference)).toBe(true);
    expect(notificationMatchesNewEventPreference({
      created_at: '2026-08-10T23:59:59.000Z',
      data_json: JSON.stringify({ category: 'social' }),
    }, preference)).toBe(false);
    expect(notificationMatchesNewEventPreference({
      created_at: '2026-08-11T00:00:01.000Z',
      data_json: JSON.stringify({ category: 'class' }),
    }, preference)).toBe(false);
  });

  it('marks previously restored rows read when the account never opted into that route', async () => {
    const execute = vi.fn(async (sql, values) => {
      const statement = String(sql);
      if (statement.includes('CREATE TABLE')) return [{ affectedRows: 0 }];
      if (statement.includes('INSERT IGNORE INTO notification_data_migrations')) return [{ affectedRows: 1 }];
      if (statement.includes('SELECT * FROM user_notification_preferences')) {
        return [[
          {
            user_id: 'enabled-user',
            enabled: 1,
            pref_new_event_alerts: 1,
            pref_new_event_social: 1,
            pref_new_event_class: 0,
            pref_new_event_clubs: 0,
            new_event_enabled_at: '2026-08-11T00:00:00.000Z',
          },
          {
            user_id: 'disabled-user',
            enabled: 1,
            pref_new_event_alerts: 0,
            new_event_enabled_at: null,
          },
        ]];
      }
      if (statement.includes("WHERE kind = 'new_event'")) {
        return [[
          {
            id: 1,
            user_id: 'enabled-user',
            created_at: '2026-08-11T00:00:01.000Z',
            data_json: JSON.stringify({ category: 'social' }),
          },
          {
            id: 2,
            user_id: 'enabled-user',
            created_at: '2026-08-10T23:59:59.000Z',
            data_json: JSON.stringify({ category: 'social' }),
          },
          {
            id: 3,
            user_id: 'enabled-user',
            created_at: '2026-08-11T00:00:01.000Z',
            data_json: JSON.stringify({ category: 'class' }),
          },
          {
            id: 4,
            user_id: 'disabled-user',
            created_at: '2026-08-11T00:00:01.000Z',
            data_json: JSON.stringify({ category: 'social' }),
          },
        ]];
      }
      if (statement.includes('UPDATE user_notifications')) {
        expect(values).toEqual([2, 3, 4]);
        return [{ affectedRows: 3 }];
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const connection = {
      execute,
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(reconcileNotificationInboxPreferences(pool)).resolves.toEqual({
      status: 'applied',
      scanned: 4,
      markedRead: 3,
      preservedUnread: 1,
    });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('runs the boundary migration and cleanup after the one-time unread recovery', () => {
    const deploy = readFileSync(resolve(process.cwd(), 'scripts/deploy-cafe24.sh'), 'utf8');
    const boundaryMigration = deploy.indexOf('2026-08-11-notification-route-boundaries.sql');
    const unreadRecovery = deploy.indexOf('2026-08-11-notification-explicit-read-recovery.sql');
    const cleanup = deploy.lastIndexOf("scripts/reconcile-notification-inbox-preferences.mjs'");

    expect(boundaryMigration).toBeGreaterThan(-1);
    expect(unreadRecovery).toBeGreaterThan(boundaryMigration);
    expect(cleanup).toBeGreaterThan(unreadRecovery);
  });
});
