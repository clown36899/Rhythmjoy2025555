import crypto from 'node:crypto';
import { getMysqlPool } from './mysql-pool.js';

// Reuse the excluded candidate ledger; this module owns administrator deletion
// identity and serialization, not ordinary reconciler replacement/cleanup.
const PREFIX = 'admin-event-delete:';
const LOCK = 'swingenjoy:event-admin-deletion';
const text = (value) => String(value || '').trim();
const place = (value) => text(value).toLowerCase().replace(/[\s()[\]·._-]+/g, '');
const data = (row) => ({ ...row, ...(row?.structured_data || {}) });
const date = (row) => text(row?.date || row?.start_date).slice(0, 10);
const social = (row) => text(row?.activity_type || row?.category).toLowerCase() === 'social'
  && !/졸공|졸업|graduation/i.test(text(row?.genre));
const source = (row) => text(row?.source_url || row?.link1).split(/[?#]/)[0].replace(/\/$/, '');

export function buildAdminDeletedEventRow(event, user, now = new Date().toISOString()) {
  return {
    id: `${PREFIX}${crypto.createHash('sha256').update(String(event.id)).digest('hex')}`,
    title: event.title,
    date: date(event),
    source_url: source(event),
    status: 'excluded',
    is_collected: false,
    created_at: now,
    updated_at: now,
    structured_data: {
      title: event.title, date: date(event), location: event.location || event.venue_name,
      venue_id: event.venue_id, category: event.category, activity_type: event.activity_type,
      genre: event.genre, dance_scope: event.dance_scope,
      source_id: event.automation?.source_id,
      _exclusion: {
        stage: 'admin_event_delete', reason: '관리자가 삭제한 일정: 자동 복원 금지',
        event_id: String(event.id), actor_id: String(user.id),
        // A social deletion suppresses its date/venue slot, including the fallback
        // generated after deleting a collected DJ event. Other activities survive.
        social_slot: social(event),
      },
    },
  };
}

export function findAdminDeletedEvent(candidate, rows = []) {
  const item = data(candidate);
  return rows.find((row) => {
    const removed = data(row);
    const exclusion = removed._exclusion;
    if (row.status !== 'excluded' || exclusion?.stage !== 'admin_event_delete') return false;
    if (text(candidate?.id) === exclusion.event_id
      || text(candidate?.registered_event_id || item.registered_event_id) === exclusion.event_id) return true;
    if (!date(item) || date(item) !== date(removed)) return false;
    if (item.dance_scope && removed.dance_scope && item.dance_scope !== removed.dance_scope) return false;
    if (exclusion.social_slot && social(item)) {
      const sameVenue = (item.venue_id && removed.venue_id && item.venue_id === removed.venue_id)
        || (place(item.location || item.venue_name) && place(item.location || item.venue_name) === place(removed.location));
      if (sameVenue) return true;
    }
    // Account/board links are not unique event identities. Never suppress a
    // different activity such as a festival sharing that account and date.
    return text(item.activity_type || item.category) === text(removed.activity_type || removed.category)
      && source(item) && source(item) === source(row)
      && place(item.title) === place(removed.title);
  }) || null;
}

export async function acquireEventMutationLock(connection) {
  const [rows] = await connection.execute('SELECT GET_LOCK(?, 15) AS acquired', [LOCK]);
  if (Number(rows[0]?.acquired) !== 1) {
    const error = new Error('일정 변경 작업이 진행 중입니다. 다시 시도해주세요.');
    error.statusCode = 503;
    throw error;
  }
}

export async function releaseEventMutationLock(connection) {
  await connection.execute('SELECT RELEASE_LOCK(?)', [LOCK]);
}

export async function withEventMutationLock(operation) {
  const connection = await getMysqlPool().getConnection();
  let locked = false;
  try {
    await acquireEventMutationLock(connection);
    locked = true;
    return await operation(connection);
  } finally {
    try { if (locked) await releaseEventMutationLock(connection); }
    finally { connection.release(); }
  }
}

export async function assertEventNotAdminDeleted(event, executor) {
  const [records] = await executor.execute(
    'SELECT data_json FROM generic_records WHERE table_name = ? AND record_id LIKE ?',
    ['scraped_events', `${PREFIX}%`],
  );
  const rows = records.map((row) => typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json);
  if (findAdminDeletedEvent(event, rows)) {
    const error = new Error('관리자가 삭제한 일정입니다. 삭제 제외 기록을 해제하기 전에는 다시 등록할 수 없습니다.');
    error.statusCode = 409;
    error.code = 'ADMIN_DELETED_EVENT';
    throw error;
  }
}

export async function deleteEventsAsAdmin(events, user, table = 'events') {
  if (!user?.is_admin) throw new Error('Administrator required');
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error('Invalid events table');
  return withEventMutationLock(async (connection) => {
    await connection.beginTransaction();
    try {
      for (const event of events) {
        const marker = buildAdminDeletedEventRow(event, user);
        await connection.execute(
          `INSERT INTO generic_records (table_name, record_id, data_json, created_at, updated_at)
           VALUES ('scraped_events', ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = NOW()`,
          [marker.id, JSON.stringify(marker)],
        );
        await connection.execute(`DELETE FROM ${table} WHERE id = ?`, [String(event.id)]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    return { requested: events.length, deleted: events.length };
  });
}
