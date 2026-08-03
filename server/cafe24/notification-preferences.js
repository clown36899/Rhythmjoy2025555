import { getMysqlPool } from './mysql-pool.js';

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  enabled: true,
  pref_today_digest: true,
  pref_new_event_alerts: false,
  pref_events: true,
  pref_class: true,
  pref_clubs: true,
  pref_new_event_social: true,
  pref_new_event_class: true,
  pref_new_event_clubs: true,
  pref_filter_tags: null,
  pref_filter_class_genres: null,
  pref_digest_time: '08:30',
  pref_digest_days: [0, 1, 2, 3, 4, 5, 6],
  pref_digest_timezone: 'Asia/Seoul',
  pref_only_with_events: true,
});

function asBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function parseArray(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function normalizeNotificationPreferences(value = {}) {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  const days = parseArray(value.pref_digest_days ?? value.pref_digest_days_json, defaults.pref_digest_days)
    .map(Number)
    .filter((day, index, values) => Number.isInteger(day) && day >= 0 && day <= 6 && values.indexOf(day) === index)
    .sort((a, b) => a - b);
  return {
    enabled: asBool(value.enabled, defaults.enabled),
    pref_today_digest: asBool(value.pref_today_digest, defaults.pref_today_digest),
    pref_new_event_alerts: asBool(value.pref_new_event_alerts, defaults.pref_new_event_alerts),
    pref_events: asBool(value.pref_events, defaults.pref_events),
    pref_class: asBool(value.pref_class, defaults.pref_class),
    pref_clubs: asBool(value.pref_clubs, defaults.pref_clubs),
    pref_new_event_social: asBool(value.pref_new_event_social, defaults.pref_new_event_social),
    pref_new_event_class: asBool(value.pref_new_event_class, defaults.pref_new_event_class),
    pref_new_event_clubs: asBool(value.pref_new_event_clubs, defaults.pref_new_event_clubs),
    pref_filter_tags: parseArray(value.pref_filter_tags ?? value.pref_filter_tags_json, defaults.pref_filter_tags),
    pref_filter_class_genres: parseArray(value.pref_filter_class_genres ?? value.pref_filter_class_genres_json, defaults.pref_filter_class_genres),
    pref_digest_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.pref_digest_time || ''))
      ? String(value.pref_digest_time)
      : defaults.pref_digest_time,
    pref_digest_days: days.length > 0 ? days : defaults.pref_digest_days,
    pref_digest_timezone: String(value.pref_digest_timezone || defaults.pref_digest_timezone),
    pref_only_with_events: asBool(value.pref_only_with_events, defaults.pref_only_with_events),
  };
}

export async function getUserNotificationPreferences(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const pool = getMysqlPool();
  const [rows] = await pool.execute(
    'SELECT * FROM user_notification_preferences WHERE user_id = ? LIMIT 1',
    [id],
  );
  return rows[0] ? { user_id: id, ...normalizeNotificationPreferences(rows[0]) } : null;
}

export async function loadEnabledNotificationPreferences() {
  const pool = getMysqlPool();
  const [rows] = await pool.execute('SELECT * FROM user_notification_preferences WHERE enabled = 1');
  return rows.map((row) => ({ user_id: String(row.user_id), ...normalizeNotificationPreferences(row) }));
}

export async function saveUserNotificationPreferences(userId, input = {}) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('user_id is required');
  const prefs = normalizeNotificationPreferences(input);
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO user_notification_preferences (
       user_id, enabled, pref_today_digest, pref_new_event_alerts,
       pref_events, pref_class, pref_clubs,
       pref_new_event_social, pref_new_event_class, pref_new_event_clubs,
       pref_filter_tags_json, pref_filter_class_genres_json,
       pref_digest_time, pref_digest_days_json, pref_digest_timezone,
       pref_only_with_events
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled), pref_today_digest = VALUES(pref_today_digest),
       pref_new_event_alerts = VALUES(pref_new_event_alerts), pref_events = VALUES(pref_events),
       pref_class = VALUES(pref_class), pref_clubs = VALUES(pref_clubs),
       pref_new_event_social = VALUES(pref_new_event_social),
       pref_new_event_class = VALUES(pref_new_event_class),
       pref_new_event_clubs = VALUES(pref_new_event_clubs),
       pref_filter_tags_json = VALUES(pref_filter_tags_json),
       pref_filter_class_genres_json = VALUES(pref_filter_class_genres_json),
       pref_digest_time = VALUES(pref_digest_time),
       pref_digest_days_json = VALUES(pref_digest_days_json),
       pref_digest_timezone = VALUES(pref_digest_timezone),
       pref_only_with_events = VALUES(pref_only_with_events),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id, prefs.enabled ? 1 : 0,
      prefs.pref_today_digest ? 1 : 0, prefs.pref_new_event_alerts ? 1 : 0,
      prefs.pref_events ? 1 : 0, prefs.pref_class ? 1 : 0, prefs.pref_clubs ? 1 : 0,
      prefs.pref_new_event_social ? 1 : 0,
      prefs.pref_new_event_class ? 1 : 0,
      prefs.pref_new_event_clubs ? 1 : 0,
      prefs.pref_filter_tags ? JSON.stringify(prefs.pref_filter_tags) : null,
      prefs.pref_filter_class_genres ? JSON.stringify(prefs.pref_filter_class_genres) : null,
      prefs.pref_digest_time, JSON.stringify(prefs.pref_digest_days), prefs.pref_digest_timezone,
      prefs.pref_only_with_events ? 1 : 0,
    ],
  );
  return { user_id: id, ...prefs };
}
