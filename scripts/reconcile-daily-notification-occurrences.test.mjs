import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyNotificationReconciliation,
  reconcileDailyNotificationOccurrences,
} from './reconcile-daily-notification-occurrences.mjs';

const preference = {
  user_id: 'admin-a',
  enabled: 1,
  pref_today_digest: 1,
  pref_events: 1,
  pref_class: 1,
  pref_clubs: 1,
  pref_only_with_events: 1,
};

const notification = {
  id: 17,
  user_id: 'admin-a',
  source_id: '2026-08-11',
  data_json: JSON.stringify({
    kind: 'daily_schedule_morning',
    date: '2026-08-11',
    count: 3,
    items: [{ eventId: 'wrong-old-item' }],
  }),
};

const events = [
  {
    id: 'weekly-class',
    title: '목요일 주간 수업',
    category: 'class',
    start_date: '2026-07-30',
    end_date: '2026-09-03',
    event_dates: ['2026-08-06', '2026-08-13'],
  },
  {
    id: 'festival-gap',
    title: '두 기간 축제',
    category: 'social',
    start_date: '2026-07-17',
    end_date: '2026-09-13',
    event_dates: ['2026-07-17', '2026-07-18', '2026-09-12', '2026-09-13'],
  },
  {
    id: 'explicit-today',
    title: '오늘 실제 수업',
    category: 'class',
    start_date: '2026-07-28',
    end_date: '2026-09-01',
    event_dates: ['2026-08-04', '2026-08-11'],
    location: '재즈랩',
  },
  {
    id: 'continuous-today',
    title: '연속 진행 행사',
    category: 'social',
    start_date: '2026-08-10',
    end_date: '2026-08-12',
  },
  {
    id: 'starts-today',
    title: '오늘 시작 행사',
    category: 'social',
    start_date: '2026-08-11',
    end_date: '2026-08-20',
  },
];

test('daily reconciliation keeps only schedules starting on the digest date', () => {
  const result = buildDailyNotificationReconciliation(notification, preference, events);

  assert.equal(result.action, 'update');
  assert.equal(result.eventCount, 1);
  assert.equal(result.title, '오늘 일정 1개');
  assert.deepEqual(result.data.items.map((item) => item.eventId), ['starts-today']);
  assert.ok(result.data.items.every((item) => item.date === '2026-08-11'));
  assert.ok(!JSON.stringify(result).includes('weekly-class'));
  assert.ok(!JSON.stringify(result).includes('festival-gap'));
  assert.ok(!JSON.stringify(result).includes('explicit-today'));
  assert.ok(!JSON.stringify(result).includes('continuous-today'));
});

test('the production-shaped August 11 digest excludes older multi-session classes', () => {
  const productionShape = [
    { id: 'ellastin', title: '엘라스틴 LINDINIT', category: 'class', start_date: '2026-07-07', end_date: '2026-08-11', event_dates: ['2026-08-11'] },
    { id: 'jazzbuzz', title: 'JAZZBUZZ', category: 'class', start_date: '2026-07-07', end_date: '2026-08-18', event_dates: ['2026-08-11'] },
    { id: 'hanbo', title: '한보 JazzLab', category: 'class', start_date: '2026-07-28', end_date: '2026-08-11', event_dates: ['2026-08-11'] },
    { id: 'juan', title: 'DJ 후안', category: 'social', start_date: '2026-08-11', end_date: '2026-08-11' },
    { id: 'balup', title: 'New Balup', category: 'class', start_date: '2026-08-11', end_date: '2026-08-11' },
    { id: 'kyungsung', title: '경성홀 화요 소셜', category: 'social', start_date: '2026-08-11', end_date: '2026-08-11', event_dates: ['2026-08-11'] },
  ];

  const result = buildDailyNotificationReconciliation(notification, preference, productionShape);
  assert.equal(result.eventCount, 3);
  assert.deepEqual(new Set(result.data.items.map((item) => item.eventId)), new Set(['juan', 'balup', 'kyungsung']));
});

test('daily reconciliation migration is idempotent and updates unread rows transactionally', async () => {
  const writes = [];
  const connection = {
    beginTransaction: async () => writes.push(['begin']),
    commit: async () => writes.push(['commit']),
    rollback: async () => writes.push(['rollback']),
    release: () => writes.push(['release']),
    execute: async (sql, params = []) => {
      writes.push([String(sql).replace(/\s+/g, ' ').trim(), params]);
      if (String(sql).includes('INSERT IGNORE INTO notification_data_migrations')) return [{ affectedRows: 1 }];
      if (String(sql).includes('SELECT * FROM user_notification_preferences')) return [[preference]];
      if (String(sql).includes('FROM user_notifications')) return [[notification]];
      if (String(sql).includes('UPDATE user_notifications')) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  const result = await reconcileDailyNotificationOccurrences({
    pool: { getConnection: async () => connection },
    allEvents: events,
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.scanned, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.markedRead, 0);
  const update = writes.find(([sql]) => sql.startsWith('UPDATE user_notifications'));
  assert.equal(JSON.parse(update[1][3]).count, 1);
  assert.deepEqual(writes.at(-2), ['commit']);
  assert.deepEqual(writes.at(-1), ['release']);
});
