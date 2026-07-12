import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadCafe24TableRows: vi.fn(),
  saveCafe24TableRow: vi.fn(),
  deleteCafe24TableRows: vi.fn(),
  mysqlExecute: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('./auth-api.js', () => ({
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

describe('Cafe24 push delivery targeting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-user', is_admin: true });
    mocks.saveCafe24TableRow.mockResolvedValue({});
    mocks.deleteCafe24TableRows.mockResolvedValue(undefined);
    mocks.sendNotification.mockResolvedValue({});
    mocks.mysqlExecute.mockResolvedValue([[{ id: 'admin-a' }, { id: 'admin-b' }]]);
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
    mocks.loadCafe24TableRows.mockImplementation(async (table) => {
      if (table === 'user_push_subscriptions') {
        return [
          subscription('admin-enabled', 'admin-a', true, { pref_new_event_alerts: true, pref_new_event_class: true }),
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

    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    const sentEndpoints = mocks.sendNotification.mock.calls.map(([sub]) => sub.endpoint);
    expect(sentEndpoints).toEqual([
      'https://fcm.googleapis.com/fcm/send/admin-enabled',
      'https://fcm.googleapis.com/fcm/send/user-enabled',
    ]);
    expect(mocks.saveCafe24TableRow).toHaveBeenCalledWith(
      'notification_queue',
      expect.objectContaining({ id: 'queue-1', status: 'sent' }),
      ['id'],
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      adminOnly: false,
      processed: 1,
    }));
  });
});
