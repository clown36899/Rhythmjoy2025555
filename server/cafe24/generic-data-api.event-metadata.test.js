import { describe, expect, it } from 'vitest';
import {
  normalizeEventUpdateValues,
  normalizeEventUpsertValue,
} from './generic-data-api.js';

describe('Cafe24 generic event metadata writes', () => {
  const admin = { id: 'admin-user-id', is_admin: true };
  const regularUser = { id: 'regular-user-id', is_admin: false };

  it('strips protected metadata from event updates even for admins', () => {
    const updates = normalizeEventUpdateValues({
      id: 'new-event-id',
      title: 'Edited title',
      user_id: 'admin-user-id',
      created_at: '2026-07-08T00:00:00.000Z',
      organizer_name: '관리자',
      organizer_phone: '010-0000-0000',
      board_users: { nickname: 'Admin' },
      password: 'secret',
    }, admin);

    expect(updates).toMatchObject({
      title: 'Edited title',
      updated_at: expect.any(String),
    });
    expect(updates).not.toHaveProperty('id');
    expect(updates).not.toHaveProperty('user_id');
    expect(updates).not.toHaveProperty('created_at');
    expect(updates).not.toHaveProperty('organizer_name');
    expect(updates).not.toHaveProperty('organizer_phone');
    expect(updates).not.toHaveProperty('board_users');
    expect(updates).not.toHaveProperty('password');
    expect(updates).not.toHaveProperty('activity_type');
  });

  it('keeps sale activity admin-only on event writes', () => {
    const adminInsert = normalizeEventUpsertValue({
      id: 'sale-event-id',
      title: '정기권 판매 이벤트',
      category: 'event',
      activity_type: 'sale',
    }, null, admin);

    const userInsert = normalizeEventUpsertValue({
      id: 'sale-event-id',
      title: '정기권 판매 이벤트',
      category: 'event',
      activity_type: 'sale',
    }, null, regularUser);

    expect(adminInsert.activity_type).toBe('sale');
    expect(userInsert.activity_type).toBe('event');
  });

  it('preserves existing metadata when an upsert updates an event', () => {
    const existing = {
      id: 'event-id',
      title: 'Original title',
      user_id: 'owner-user-id',
      created_at: '2026-06-29T02:21:34.434Z',
      organizer_name: 'original internal contact',
      organizer_phone: '010-1111-1111',
    };

    const next = normalizeEventUpsertValue({
      id: 'other-event-id',
      title: 'Edited title',
      user_id: 'admin-user-id',
      created_at: '2026-07-08T00:00:00.000Z',
      organizer_name: '관리자',
      organizer_phone: '010-0000-0000',
    }, existing, admin);

    expect(next).toMatchObject({
      id: 'event-id',
      title: 'Edited title',
      user_id: 'owner-user-id',
      created_at: '2026-06-29T02:21:34.434Z',
      organizer_name: 'original internal contact',
      organizer_phone: '010-1111-1111',
      updated_at: expect.any(String),
    });
  });
});
