import { getMysqlPool } from './mysql-pool.js';

const NEVER_EXPOSE_EVENT_FIELDS = [
  'password',
];

const ADMIN_ONLY_EVENT_FIELDS = [
  'organizer_name',
  'organizer_phone',
];

const MANAGER_EVENT_FIELDS = [
  'user_id',
  'board_users',
];

export function canManageEvent(user, event) {
  return Boolean(
    user?.is_admin ||
    userMatchesId(user, event?.user_id)
  );
}

export function userIdentitySet(user) {
  return new Set([
    user?.id,
    ...(Array.isArray(user?.legacy_user_ids) ? user.legacy_user_ids : []),
  ].filter(Boolean).map(String));
}

export function userMatchesId(user, id) {
  return Boolean(id && userIdentitySet(user).has(String(id)));
}

export function sanitizeEventForViewer(event, user = null) {
  if (!event) return event;
  const next = { ...event };

  for (const field of NEVER_EXPOSE_EVENT_FIELDS) {
    delete next[field];
  }

  if (!user?.is_admin) {
    for (const field of ADMIN_ONLY_EVENT_FIELDS) {
      delete next[field];
    }
  }

  if (canManageEvent(user, event)) return next;

  for (const field of MANAGER_EVENT_FIELDS) {
    delete next[field];
  }
  return next;
}

export function sanitizeEventsForViewer(events, user = null) {
  return (events || []).map((event) => sanitizeEventForViewer(event, user));
}

export async function attachEventAuthors(events) {
  const items = events || [];
  const userIds = Array.from(new Set(
    items
      .map((event) => event?.user_id)
      .filter((userId) => userId !== undefined && userId !== null && userId !== '')
      .map((userId) => String(userId)),
  ));

  if (!userIds.length) return items;

  const pool = getMysqlPool();
  const [users] = await pool.execute(
    `SELECT id, nickname, profile_image
       FROM users
      WHERE id IN (${userIds.map(() => '?').join(',')})`,
    userIds,
  );

  const userMap = new Map(users.map((user) => [String(user.id), user]));

  const missingUserIds = userIds.filter((userId) => !userMap.has(String(userId)));
  if (missingUserIds.length) {
    const missingSet = new Set(missingUserIds.map(String));
    const [records] = await pool.execute(
      "SELECT data_json FROM generic_records WHERE table_name = 'board_users'",
    );

    for (const record of records) {
      try {
        const profile = JSON.parse(record.data_json || '{}');
        const userId = String(profile?.user_id || '');
        if (!missingSet.has(userId) || userMap.has(userId)) continue;
        userMap.set(userId, {
          id: userId,
          nickname: profile.nickname || null,
          profile_image: profile.profile_image || null,
        });
      } catch {
        // Ignore malformed migrated generic records.
      }
    }
  }

  return items.map((event) => {
    const author = userMap.get(String(event?.user_id || ''));
    if (!author) return event;
    return {
      ...event,
      board_users: {
        nickname: author.nickname,
        profile_image: author.profile_image,
      },
    };
  });
}
