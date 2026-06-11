import { describe, expect, it } from 'vitest';
import { canManageEvent, userMatchesId } from './event-security.js';

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
});
