import { describe, expect, it } from 'vitest';
import { canManageEvent, sanitizeEventForViewer, userMatchesId } from './event-security.js';

describe('Cafe24 event security identity aliases', () => {
  it('treats migrated legacy user ids as the same author', () => {
    const user = {
      id: 'cafe24-user-id',
      legacy_user_ids: ['legacy-user-id'],
      is_admin: false,
    };

    expect(userMatchesId(user, 'legacy-user-id')).toBe(true);
    expect(canManageEvent(user, { user_id: 'legacy-user-id' })).toBe(true);
    expect(canManageEvent(user, { user_id: 'other-user-id' })).toBe(false);
  });

  it('does not expose admin-only event contact fields to the event owner', () => {
    const owner = {
      id: 'owner-user-id',
      is_admin: false,
    };
    const event = {
      id: 'event-id',
      title: 'Owner event',
      user_id: 'owner-user-id',
      organizer_name: 'internal contact',
      organizer_phone: '010-0000-0000',
      board_users: { nickname: 'Owner' },
    };

    expect(canManageEvent(owner, event)).toBe(true);
    expect(sanitizeEventForViewer(event, owner)).toEqual({
      id: 'event-id',
      title: 'Owner event',
      user_id: 'owner-user-id',
      board_users: { nickname: 'Owner' },
    });
  });

  it('exposes admin-only event contact fields to admins', () => {
    const admin = {
      id: 'admin-user-id',
      is_admin: true,
    };
    const event = {
      id: 'event-id',
      title: 'Admin event',
      user_id: 'owner-user-id',
      organizer_name: 'internal contact',
      organizer_phone: '010-0000-0000',
    };

    expect(sanitizeEventForViewer(event, admin)).toMatchObject({
      organizer_name: 'internal contact',
      organizer_phone: '010-0000-0000',
    });
  });
});
