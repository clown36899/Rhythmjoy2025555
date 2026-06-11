import { getMysqlPool } from './mysql-pool.js';

const NEVER_EXPOSE_EVENT_FIELDS = [
  'password',
];

const PRIVATE_EVENT_FIELDS = [
  'organizer_name',
  'organizer_phone',
  'user_id',
  'board_users',
];

export function canManageEvent(user, event) {
  return Boolean(
    user?.is_admin ||
    (user?.id && event?.user_id && String(event.user_id) === String(user.id))
  );
}

export function sanitizeEventForViewer(event, user = null) {
  if (!event) return event;
  const next = { ...event };

  for (const field of NEVER_EXPOSE_EVENT_FIELDS) {
    delete next[field];
  }

  if (canManageEvent(user, event)) return next;

  for (const field of PRIVATE_EVENT_FIELDS) {
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
