import { beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('notificationStore server ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads unread notifications from the server without opening IndexedDB', async () => {
    const indexedDbOpen = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      notifications: [{
        id: 'server:7',
        title: '서버 알림',
        body: '본문',
        received_at: '2026-08-10T03:00:00.000Z',
        is_read: false,
      }],
    }));
    vi.stubGlobal('indexedDB', { open: indexedDbOpen });
    vi.stubGlobal('fetch', fetchMock);

    const { notificationStore } = await import('./notificationStore');
    await expect(notificationStore.getUnread()).resolves.toEqual([
      expect.objectContaining({ id: 'server:7', title: '서버 알림' }),
    ]);
    expect(indexedDbOpen).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications?unread=1', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
    }));
  });

  it('keeps admin preview notifications volatile and marks them read without IndexedDB', async () => {
    const indexedDbOpen = vi.fn();
    vi.stubGlobal('indexedDB', { open: indexedDbOpen });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ notifications: [] })));

    const { notificationStore } = await import('./notificationStore');
    await notificationStore.upsertMany([{
      id: 'preview:1',
      title: '미리보기',
      body: '로컬 관리자 미리보기',
      received_at: '2026-08-10T03:00:00.000Z',
      is_read: false,
    }]);
    await expect(notificationStore.getUnread()).resolves.toEqual([
      expect.objectContaining({ id: 'preview:1' }),
    ]);
    await notificationStore.markAsRead('preview:1');
    await expect(notificationStore.getUnread()).resolves.toEqual([]);
    expect(indexedDbOpen).not.toHaveBeenCalled();
  });

  it('marks a server notification through the authenticated server endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { notificationStore } = await import('./notificationStore');
    await notificationStore.markAsRead('server:42');

    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/read', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ id: 'server:42' }),
    }));
  });

  it('falls back only to volatile previews when the server is temporarily unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { notificationStore } = await import('./notificationStore');
    await notificationStore.upsertMany([{
      id: 'preview:offline',
      title: '오프라인 미리보기',
      body: '본문',
      received_at: '2026-08-10T03:00:00.000Z',
      is_read: false,
    }]);

    await expect(notificationStore.getUnread()).resolves.toEqual([
      expect.objectContaining({ id: 'preview:offline' }),
    ]);
    expect(warn).toHaveBeenCalled();
  });
});
