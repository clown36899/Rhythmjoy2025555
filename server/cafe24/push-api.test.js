import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCurrentUser: vi.fn(),
  loadCafe24TableRows: vi.fn(),
  saveCafe24TableRow: vi.fn(),
  deleteCafe24TableRows: vi.fn(),
  mysqlExecute: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  getUserNotificationPreferences: vi.fn(),
  loadEnabledNotificationPreferences: vi.fn(),
  saveUserNotificationPreferences: vi.fn(),
}));

vi.mock('./auth-api.js', () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('./generic-data-api.js', () => ({
  loadCafe24TableRows: mocks.loadCafe24TableRows,
  saveCafe24TableRow: mocks.saveCafe24TableRow,
  deleteCafe24TableRows: mocks.deleteCafe24TableRows,
}));

vi.mock('./mysql-pool.js', () => ({
  getMysqlPool: () => ({
    execute: mocks.mysqlExecute,
  }),
}));

vi.mock('./notification-preferences.js', () => ({
  getUserNotificationPreferences: mocks.getUserNotificationPreferences,
  loadEnabledNotificationPreferences: mocks.loadEnabledNotificationPreferences,
  normalizeNotificationPreferences: (value = {}) => ({
    enabled: true,
    pref_today_digest: true,
    pref_new_event_alerts: false,
    pref_events: true,
    pref_class: true,
    pref_clubs: true,
    pref_new_event_social: true,
    pref_new_event_class: true,
    pref_new_event_clubs: true,
    pref_digest_time: '08:30',
    pref_digest_days: [0, 1, 2, 3, 4, 5, 6],
    pref_only_with_events: true,
    ...value,
  }),
  saveUserNotificationPreferences: mocks.saveUserNotificationPreferences,
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

const subscription = (id, userId, isAdmin, prefs = {}) => ({
  id,
  user_id: userId,
  is_admin: isAdmin,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  subscription: {
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    keys: {
      p256dh: `p256dh-${id}`,
      auth: `auth-${id}`,
    },
    preferences: {
      pref_new_event_alerts: true,
      pref_new_event_class: true,
      pref_today_digest: true,
      ...prefs,
    },
  },
});

const jsonResponse = () => {
  const res = { json: vi.fn() };
  return res;
};

const adminDeliveryMatrix = ['social', 'class', 'club', 'event'].flatMap((category) => (
  [false, true].flatMap((notificationsEnabled) => (
    [false, true].flatMap((categoryEnabled) => (
      [0, 1, 2, 3].map((deviceCount) => ({
        category,
        notificationsEnabled,
        categoryEnabled,
        deviceCount,
      }))
    ))
  ))
));

describe('Cafe24 push delivery targeting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-user', is_admin: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 'commenter-a', nickname: '댓글러' });
    mocks.saveCafe24TableRow.mockResolvedValue({});
    mocks.deleteCafe24TableRows.mockResolvedValue(undefined);
    mocks.sendNotification.mockResolvedValue({});
    mocks.getUserNotificationPreferences.mockResolvedValue(null);
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([]);
    mocks.saveUserNotificationPreferences.mockImplementation(async (userId, prefs) => ({ user_id: userId, ...prefs }));
    mocks.mysqlExecute.mockImplementation(async (sql) => {
      if (String(sql).includes('WHERE is_admin = 1')) return [[{ id: 'admin-a' }, { id: 'admin-b' }]];
      if (String(sql).includes('FROM users u')) {
        return [[{ user_id: 'admin-a' }, { user_id: 'admin-b' }, { user_id: 'user-a' }]];
      }
      if (String(sql).includes('INSERT IGNORE INTO user_notifications')) return [{ affectedRows: 1 }];
      return [[]];
    });
  });

  it('sends manual push only to admin users, including old rows saved with is_admin false', async () => {
    mocks.loadCafe24TableRows.mockResolvedValue([
      subscription('admin-1', 'admin-a', false),
      subscription('user-1', 'user-a', false),
      subscription('admin-2', 'admin-b', 1),
    ]);

    const { sendPushNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendPushNotification({ body: { title: '테스트', body: '관리자 전용' } }, res);

    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    const sentEndpoints = mocks.sendNotification.mock.calls.map(([sub]) => sub.endpoint);
    expect(sentEndpoints).toEqual([
      'https://fcm.googleapis.com/fcm/send/admin-1',
      'https://fcm.googleapis.com/fcm/send/admin-2',
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      adminOnly: true,
      summary: expect.objectContaining({ targets: 2, success: 2 }),
    }));
  });

  it('does not send to a non-admin user id even when explicitly requested', async () => {
    mocks.loadCafe24TableRows.mockResolvedValue([
      subscription('admin-1', 'admin-a', true),
      subscription('user-1', 'user-a', false),
    ]);

    const { sendPushNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendPushNotification({ body: { userId: 'user-a', title: '테스트' } }, res);

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      adminOnly: true,
      requestedUserId: 'user-a',
      summary: expect.objectContaining({ targets: 0, success: 0 }),
    }));
  });

  it('deletes stale subscriptions when FCM reports expired or VAPID mismatch', async () => {
    const expired = subscription('admin-expired', 'admin-a', true);
    const mismatched = subscription('admin-mismatch', 'admin-b', true);
    mocks.loadCafe24TableRows.mockResolvedValue([expired, mismatched]);
    mocks.sendNotification
      .mockRejectedValueOnce({ statusCode: 410, body: 'push subscription has unsubscribed or expired.' })
      .mockRejectedValueOnce({
        statusCode: 403,
        body: 'the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.',
      });

    const { sendPushNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendPushNotification({ body: { title: '테스트' } }, res);

    expect(mocks.deleteCafe24TableRows).toHaveBeenCalledWith('user_push_subscriptions', [expired, mismatched]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.objectContaining({ targets: 2, success: 0, failure: 2, staleDeleted: 2 }),
    }));
  });

  it('processes queued new-event notifications for subscribers with that route enabled', async () => {
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      { user_id: 'admin-a', enabled: true, pref_new_event_alerts: true, pref_new_event_class: true },
      { user_id: 'user-a', enabled: true, pref_new_event_alerts: true, pref_new_event_class: true },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [
          subscription('admin-enabled-1', 'admin-a', true, { pref_new_event_alerts: true, pref_new_event_class: true }),
          subscription('admin-enabled-2', 'admin-a', true, { pref_new_event_alerts: true, pref_new_event_class: true }),
          subscription('admin-disabled', 'admin-b', true, { pref_new_event_alerts: false, pref_new_event_class: true }),
          subscription('user-enabled', 'user-a', false, { pref_new_event_alerts: true, pref_new_event_class: true }),
        ];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'queue-1',
          title: '새 강습 등록',
          body: '테스트 강습',
          category: 'class',
          payload: { url: '/calendar?id=1' },
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          status: 'pending',
        }];
      }
      return [];
    });

    const { processNotificationQueue } = await import('./push-api.js');
    const res = jsonResponse();
    await processNotificationQueue({ body: {} }, res);

    expect(mocks.sendNotification).toHaveBeenCalledTimes(3);
    const sentEndpoints = mocks.sendNotification.mock.calls.map(([sub]) => sub.endpoint);
    expect(sentEndpoints).toEqual([
      'https://fcm.googleapis.com/fcm/send/admin-enabled-1',
      'https://fcm.googleapis.com/fcm/send/admin-enabled-2',
      'https://fcm.googleapis.com/fcm/send/user-enabled',
    ]);
    expect(mocks.saveCafe24TableRow).toHaveBeenCalledWith(
      'notification_queue',
      expect.objectContaining({ id: 'queue-1', status: 'sent' }),
      ['id'],
    );
    const inboxWrites = mocks.mysqlExecute.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT IGNORE INTO user_notifications')
    ));
    expect(inboxWrites).toHaveLength(3);
    expect(inboxWrites.map(([, values]) => values[0])).toEqual(['admin-a', 'admin-b', 'user-a']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      adminOnly: false,
      processed: 1,
    }));
  });

  it('keeps a queued alert in the server inbox even when web push delivery fails', async () => {
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      { user_id: 'user-a', enabled: true, pref_new_event_alerts: true, pref_new_event_social: true },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [subscription('user-device', 'user-a', false, { pref_new_event_alerts: true })];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'queue-inbox-fallback',
          title: '새 소셜 등록',
          body: '푸시 실패 알림함 테스트',
          category: 'social',
          payload: { url: '/calendar?id=2' },
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          status: 'pending',
        }];
      }
      return [];
    });
    mocks.sendNotification.mockRejectedValueOnce({ statusCode: 500, body: 'temporary push failure' });

    const { processNotificationQueue } = await import('./push-api.js');
    const res = jsonResponse();
    await processNotificationQueue({ body: {} }, res);

    expect(mocks.mysqlExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO user_notifications'),
      expect.arrayContaining(['user-a', '새 소셜 등록', 'new_event', 'queue-inbox-fallback']),
    );
    expect(mocks.saveCafe24TableRow).toHaveBeenCalledWith(
      'notification_queue',
      expect.objectContaining({ id: 'queue-inbox-fallback', status: 'pending' }),
      ['id'],
    );
  });

  it('shows a queued event in the bell only when it was registered after the user last visited', async () => {
    const registeredAt = '2026-08-03T09:00:00.000Z';
    mocks.mysqlExecute.mockImplementation(async (sql) => {
      if (String(sql).includes('WHERE is_admin = 1')) return [[]];
      if (String(sql).includes('FROM users u')) {
        return [[
          { user_id: 'user-before', last_seen_at: '2026-08-03T08:59:00.000Z' },
          { user_id: 'user-after', last_seen_at: '2026-08-03T09:01:00.000Z' },
        ]];
      }
      if (String(sql).includes('INSERT IGNORE INTO user_notifications')) return [{ affectedRows: 1 }];
      return [[]];
    });
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      { user_id: 'user-before', enabled: true, pref_new_event_alerts: true, pref_new_event_social: true },
      { user_id: 'user-after', enabled: true, pref_new_event_alerts: true, pref_new_event_social: true },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [
          subscription('before-device', 'user-before', false),
          subscription('after-device', 'user-after', false),
        ];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'queue-visit-boundary',
          title: '새 소셜 등록',
          body: '방문 시각 경계 검증',
          category: 'social',
          payload: { url: '/calendar?id=visit-boundary' },
          created_at: registeredAt,
          scheduled_at: registeredAt,
          status: 'pending',
        }];
      }
      return [];
    });

    const { processNotificationQueue } = await import('./push-api.js');
    await processNotificationQueue({ body: {} }, jsonResponse());

    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    const inboxRecipients = mocks.mysqlExecute.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT IGNORE INTO user_notifications'))
      .map(([, values]) => values[0]);
    expect(inboxRecipients).toEqual(['user-before']);
  });

  it('suppresses individual device pushes when four or more queue items would create a burst', async () => {
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      { user_id: 'admin-a', enabled: true, pref_new_event_alerts: true, pref_new_event_social: true },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [subscription('burst-admin-device', 'admin-a', true)];
      }
      if (table === 'notification_queue') {
        return Array.from({ length: 4 }, (_, index) => ({
          id: `queue-burst-${index + 1}`,
          title: `새 일정 ${index + 1}`,
          body: '밀린 알림 폭주 방지 검증',
          category: 'social',
          payload: { adminOnly: true, userId: 'admin-a', url: `/calendar?id=burst-${index + 1}` },
          created_at: new Date(Date.now() - 1000).toISOString(),
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          status: 'pending',
        }));
      }
      return [];
    });

    const { processNotificationQueue } = await import('./push-api.js');
    await processNotificationQueue({ body: {} }, jsonResponse());

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    const inboxWrites = mocks.mysqlExecute.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT IGNORE INTO user_notifications')
    ));
    expect(inboxWrites).toHaveLength(4);
    const queueWrites = mocks.saveCafe24TableRow.mock.calls
      .filter(([table]) => table === 'notification_queue');
    expect(queueWrites).toHaveLength(4);
    for (const [, row] of queueWrites) {
      expect(row).toEqual(expect.objectContaining({
        status: 'sent',
        result: expect.objectContaining({
          status: 'suppressed',
          summary: expect.objectContaining({ success: 0, skipped: 1 }),
        }),
      }));
    }
  });

  it('coalesces concurrent queue triggers so the same device is not notified twice', async () => {
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      { user_id: 'admin-a', enabled: true, pref_new_event_alerts: true, pref_new_event_social: true },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [subscription('concurrent-admin-device', 'admin-a', true)];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'queue-concurrent-1',
          title: '동시 실행 검증',
          body: '한 번만 전송되어야 함',
          category: 'social',
          payload: { adminOnly: true, userId: 'admin-a', url: '/calendar?id=concurrent-1' },
          created_at: new Date(Date.now() - 1000).toISOString(),
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          status: 'pending',
        }];
      }
      return [];
    });
    let releasePush;
    let announcePushStarted;
    const pushStarted = new Promise((resolve) => {
      announcePushStarted = resolve;
    });
    mocks.sendNotification.mockImplementation(() => {
      announcePushStarted();
      return new Promise((resolve) => {
        releasePush = resolve;
      });
    });

    const { processNotificationQueue } = await import('./push-api.js');
    const first = processNotificationQueue({ body: {} }, jsonResponse());
    await pushStarted;
    const second = processNotificationQueue({ body: {} }, jsonResponse());
    releasePush({});
    await Promise.all([first, second]);

    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    const inboxWrites = mocks.mysqlExecute.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT IGNORE INTO user_notifications')
    ));
    expect(inboxWrites).toHaveLength(1);
  });

  it('expires stale queue items instead of sending a burst of old alerts', async () => {
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [subscription('user-device', 'user-a', false, { pref_new_event_alerts: true })];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'queue-stale',
          title: '오래된 새 일정',
          body: '이 알림은 발송하면 안 됨',
          category: 'event',
          payload: { url: '/calendar?id=3' },
          scheduled_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        }];
      }
      return [];
    });

    const { processNotificationQueue } = await import('./push-api.js');
    const res = jsonResponse();
    await processNotificationQueue({ body: {} }, res);

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.mysqlExecute.mock.calls.some(([sql]) => (
      String(sql).includes('INSERT IGNORE INTO user_notifications')
    ))).toBe(true);
    expect(mocks.saveCafe24TableRow).toHaveBeenCalledWith(
      'notification_queue',
      expect.objectContaining({ id: 'queue-stale', status: 'expired' }),
      ['id'],
    );
  });

  it('sends a new-comment notification only to the subscribed post author', async () => {
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'board_comments') {
        return [{ id: 'comment-1', post_id: 'post-1', user_id: 'commenter-a', author_name: '댓글러' }];
      }
      if (table === 'board_posts') {
        return [{ id: 'post-1', user_id: 'author-a', title: '테스트 글' }];
      }
      if (table === 'user_push_subscriptions') {
        return [
          subscription('author-device', 'author-a', false),
          subscription('other-device', 'other-a', false),
        ];
      }
      return [];
    });

    const { sendBoardCommentNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendBoardCommentNotification({ body: { commentId: 'comment-1' } }, res);

    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendNotification.mock.calls[0][0].endpoint)
      .toBe('https://fcm.googleapis.com/fcm/send/author-device');
    expect(JSON.parse(mocks.sendNotification.mock.calls[0][1])).toEqual(expect.objectContaining({
      title: '내 글에 새 댓글이 달렸습니다',
      tag: 'board-comment-comment-1',
      data: expect.objectContaining({
        kind: 'board_comment',
        postId: 'post-1',
        commentId: 'comment-1',
      }),
    }));
  });

  it('does not notify for a self-comment or an unsubscribed author', async () => {
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'board_comments') {
        return [{ id: 'comment-1', post_id: 'post-1', user_id: 'commenter-a' }];
      }
      if (table === 'board_posts') {
        return [{ id: 'post-1', user_id: 'commenter-a', title: '내 글' }];
      }
      return [];
    });

    const { sendBoardCommentNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendBoardCommentNotification({ body: { commentId: 'comment-1' } }, res);

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ status: 'skipped', reason: 'self_comment' });
  });

  it('saves an inbox notification even when the post author has no push subscription', async () => {
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'board_comments') {
        return [{ id: 'comment-2', post_id: 'post-2', user_id: 'commenter-a', author_name: '댓글러' }];
      }
      if (table === 'board_posts') {
        return [{ id: 'post-2', user_id: 'author-without-push', title: '알림함 테스트' }];
      }
      return [];
    });

    const { sendBoardCommentNotification } = await import('./push-api.js');
    const res = jsonResponse();
    await sendBoardCommentNotification({ body: { commentId: 'comment-2' } }, res);

    expect(mocks.mysqlExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO user_notifications'),
      expect.arrayContaining(['author-without-push', '내 글에 새 댓글이 달렸습니다']),
    );
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      status: 'saved',
      push: 'skipped',
      reason: 'author_not_subscribed',
    });
  });

  it('keeps only not-ended new events unread in the per-user bell feed', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'reader-a' });
    mocks.mysqlExecute.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM user_notifications')) {
        return [[
          {
            id: 1,
            title: '진행 전 이벤트',
            body: '',
            url: '/calendar?id=future-event',
            kind: 'new_event',
            data_json: JSON.stringify({ eventId: 'future-event' }),
            is_read: 0,
            created_at: '2026-08-03T00:00:00Z',
          },
          {
            id: 2,
            title: '종료된 이벤트',
            body: '',
            url: '/calendar?id=past-event',
            kind: 'new_event',
            data_json: JSON.stringify({ eventId: 'past-event' }),
            is_read: 0,
            created_at: '2026-08-02T00:00:00Z',
          },
        ]];
      }
      return [[]];
    });
    mocks.loadCafe24TableRows.mockImplementation(async (table) => (
      table === 'events'
        ? [
          { id: 'future-event', start_date: '2099-01-01' },
          { id: 'past-event', end_date: '2020-01-01' },
        ]
        : []
    ));

    const { listUserNotifications } = await import('./push-api.js');
    const res = jsonResponse();
    await listUserNotifications({ query: {} }, res);

    expect(res.json).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({ id: 'server:1', is_read: false }),
        expect.objectContaining({ id: 'server:2', is_read: true }),
      ],
    });
  });

  it('marks one notification source read only for the signed-in user', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'reader-a' });
    const { markUserNotificationsRead } = await import('./push-api.js');
    const res = jsonResponse();

    await markUserNotificationsRead({ body: { kind: 'new_event', sourceId: 'event-created:1' } }, res);

    expect(mocks.mysqlExecute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = ? AND kind = ? AND source_id = ?'),
      ['reader-a', 'new_event', 'event-created:1'],
    );
  });

  it.each(adminDeliveryMatrix)(
    'admin-only safety matrix: $category / enabled=$notificationsEnabled / category=$categoryEnabled / devices=$deviceCount',
    async ({ category, notificationsEnabled, categoryEnabled, deviceCount }) => {
      const routePrefs = {
        pref_new_event_social: ['social', 'event'].includes(category) ? categoryEnabled : true,
        pref_new_event_class: category === 'class' ? categoryEnabled : true,
        pref_new_event_clubs: category === 'club' ? categoryEnabled : true,
      };
      mocks.loadEnabledNotificationPreferences.mockResolvedValue(notificationsEnabled
        ? [{
          user_id: 'admin-a',
          enabled: true,
          pref_new_event_alerts: true,
          ...routePrefs,
        }]
        : []);
      const adminDevices = Array.from({ length: deviceCount }, (_, index) => (
        subscription(`matrix-admin-${index + 1}`, 'admin-a', true)
      ));
      mocks.loadCafe24TableRows.mockImplementation(async (table) => {
        if (table === 'user_push_subscriptions') {
          return [
            ...adminDevices,
            subscription('matrix-ordinary-user', 'user-a', false, {
              pref_new_event_alerts: true,
              pref_new_event_social: true,
              pref_new_event_class: true,
              pref_new_event_clubs: true,
            }),
          ];
        }
        if (table === 'notification_queue') {
          return [{
            id: `matrix-${category}-${notificationsEnabled}-${categoryEnabled}-${deviceCount}`,
            title: `관리자 검증 ${category}`,
            body: '실제 전송 없는 안전 매트릭스',
            category,
            payload: {
              adminOnly: true,
              userId: 'admin-a',
              url: '/calendar?id=matrix-event',
            },
            scheduled_at: new Date(Date.now() - 1000).toISOString(),
            status: 'pending',
          }];
        }
        return [];
      });

      const { processNotificationQueue } = await import('./push-api.js');
      await processNotificationQueue({ body: {} }, jsonResponse());

      const expectedPushCount = notificationsEnabled && categoryEnabled ? deviceCount : 0;
      expect(mocks.sendNotification).toHaveBeenCalledTimes(expectedPushCount);
      for (const [sentSubscription] of mocks.sendNotification.mock.calls) {
        expect(sentSubscription.endpoint).toContain('/matrix-admin-');
        expect(sentSubscription.endpoint).not.toContain('ordinary-user');
      }
      const inboxRecipients = mocks.mysqlExecute.mock.calls
        .filter(([sql]) => String(sql).includes('INSERT IGNORE INTO user_notifications'))
        .map(([, values]) => values[0]);
      expect(inboxRecipients).toEqual(['admin-a']);
    },
  );

  it('mirrors the production admin shape without notifying an ordinary user', async () => {
    mocks.loadEnabledNotificationPreferences.mockResolvedValue([
      {
        user_id: 'admin-a',
        enabled: true,
        pref_new_event_alerts: true,
        pref_new_event_social: true,
      },
      {
        user_id: 'admin-b',
        enabled: true,
        pref_new_event_alerts: true,
        pref_new_event_social: true,
      },
      {
        user_id: 'user-a',
        enabled: true,
        pref_new_event_alerts: true,
        pref_new_event_social: true,
      },
    ]);
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [
          subscription('production-shape-admin-device-1', 'admin-a', true),
          subscription('production-shape-admin-device-2', 'admin-a', true),
          subscription('production-shape-user-device', 'user-a', false),
        ];
      }
      if (table === 'notification_queue') {
        return [{
          id: 'production-shape-admin-only',
          title: '운영 관리자 형태 검증',
          body: '실제 전송 없는 격리 테스트',
          category: 'social',
          payload: { adminOnly: true, url: '/calendar?id=production-shape' },
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          status: 'pending',
        }];
      }
      return [];
    });

    const { processNotificationQueue } = await import('./push-api.js');
    await processNotificationQueue({ body: {} }, jsonResponse());

    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    expect(mocks.sendNotification.mock.calls.map(([sentSubscription]) => sentSubscription.endpoint)).toEqual([
      'https://fcm.googleapis.com/fcm/send/production-shape-admin-device-1',
      'https://fcm.googleapis.com/fcm/send/production-shape-admin-device-2',
    ]);
    const inboxRecipients = mocks.mysqlExecute.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT IGNORE INTO user_notifications'))
      .map(([, values]) => values[0]);
    expect(inboxRecipients).toEqual(['admin-a', 'admin-b']);
  });
});
