import { describe, expect, it } from 'vitest';
import {
  EVENT_UPDATE_PROTECTED_FIELDS,
  preserveProtectedEventMetadata,
  protectedEventMetadataValue,
  stripProtectedEventUpdateFields,
} from './event-mutation-policy.js';

describe('Cafe24 event mutation policy', () => {
  it('defines metadata that normal event updates must not overwrite', () => {
    expect(EVENT_UPDATE_PROTECTED_FIELDS).toEqual([
      'id',
      'user_id',
      'created_at',
      'organizer_name',
      'organizer_phone',
      'board_users',
      'password',
    ]);
  });

  it('strips protected metadata while keeping editable content fields', () => {
    const next = stripProtectedEventUpdateFields({
      id: 'attacker-id',
      user_id: 'admin-user-id',
      created_at: '2026-07-08T00:00:00.000Z',
      organizer_name: '관리자',
      organizer_phone: '010-0000-0000',
      title: 'Edited title',
      location: 'Edited location',
    }, '2026-07-08T01:00:00.000Z');

    expect(next).toEqual({
      title: 'Edited title',
      location: 'Edited location',
      updated_at: '2026-07-08T01:00:00.000Z',
    });
  });

  it('preserves protected metadata from the existing row', () => {
    const next = preserveProtectedEventMetadata({
      id: 'attacker-id',
      user_id: 'admin-user-id',
      created_at: '2026-07-08T00:00:00.000Z',
      organizer_name: '관리자',
      organizer_phone: '010-0000-0000',
      title: 'Edited title',
    }, {
      id: 'event-id',
      user_id: 'owner-user-id',
      created_at: '2026-06-29T02:21:34.434Z',
      organizer_name: 'original internal contact',
      organizer_phone: '010-1111-1111',
    });

    expect(next).toMatchObject({
      id: 'event-id',
      user_id: 'owner-user-id',
      created_at: '2026-06-29T02:21:34.434Z',
      organizer_name: 'original internal contact',
      organizer_phone: '010-1111-1111',
      title: 'Edited title',
    });
  });

  it('reads protected metadata from existing rows before incoming values', () => {
    expect(protectedEventMetadataValue(
      { user_id: 'admin-user-id' },
      { user_id: 'owner-user-id' },
      'user_id',
      null,
    )).toBe('owner-user-id');
  });
});
