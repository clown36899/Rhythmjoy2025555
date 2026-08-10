import { beforeEach, describe, expect, it, vi } from 'vitest';

function installCacheMock(cacheNames: string[]) {
  const deleted: string[] = [];
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: {
      keys: vi.fn().mockResolvedValue(cacheNames),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    },
  });
  return deleted;
}

describe('legacy PWA recovery', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('deletes only legacy app-shell caches and preserves share/marker caches', async () => {
    const deleted = installCacheMock([
      'rhythmjoy-runtime-old',
      'rhythmjoy-cache-v56',
      'workbox-precache-v2-https://swingenjoy.com/',
      'rhythmjoy-share-targets-v1',
      'swingenjoy-release-state-v1',
      'unrelated-cache',
    ]);
    const { clearLegacyAppCaches } = await import('./pwaRecovery');

    await expect(clearLegacyAppCaches()).resolves.toEqual([
      'rhythmjoy-runtime-old',
      'rhythmjoy-cache-v56',
      'workbox-precache-v2-https://swingenjoy.com/',
    ]);
    expect(deleted).toEqual([
      'rhythmjoy-runtime-old',
      'rhythmjoy-cache-v56',
      'workbox-precache-v2-https://swingenjoy.com/',
    ]);
  });

  it('deletes the exact legacy notification database', async () => {
    const request: Partial<IDBOpenDBRequest> = {};
    const deleteDatabase = vi.fn(() => request as IDBOpenDBRequest);
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { deleteDatabase },
    });
    const { deleteLegacyNotificationDatabase } = await import('./pwaRecovery');

    const deletion = deleteLegacyNotificationDatabase();
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));
    await expect(deletion).resolves.toBe(true);
    expect(deleteDatabase).toHaveBeenCalledWith('notification-history');
  });

  it('finishes a blocked database cleanup after its bounded timeout', async () => {
    vi.useFakeTimers();
    const request: Partial<IDBOpenDBRequest> = {};
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { deleteDatabase: vi.fn(() => request as IDBOpenDBRequest) },
    });
    const { deleteLegacyNotificationDatabase } = await import('./pwaRecovery');

    const deletion = deleteLegacyNotificationDatabase(50);
    request.onblocked?.call(request as IDBOpenDBRequest, new Event('blocked') as IDBVersionChangeEvent);
    await vi.advanceTimersByTimeAsync(50);
    await expect(deletion).resolves.toBe(false);
  });

  it('drops OAuth credentials from a manual recovery URL', async () => {
    window.history.replaceState({}, '', '/auth/kakao-callback?code=secret#access_token=secret');
    const { createRecoveryUrl } = await import('./pwaRecovery');

    const recovery = new URL(createRecoveryUrl('manual-reset'));
    expect(recovery.pathname).toBe('/');
    expect(recovery.searchParams.has('code')).toBe(false);
    expect(recovery.hash).toBe('');
    expect(recovery.searchParams.has('rj_pwa_recover')).toBe(true);
  });

  it('waits until a waiting worker is actually activated', async () => {
    const worker = new EventTarget() as EventTarget & {
      state: ServiceWorkerState;
      postMessage: ReturnType<typeof vi.fn>;
    };
    worker.state = 'installed';
    worker.postMessage = vi.fn(() => {
      worker.state = 'activated';
      worker.dispatchEvent(new Event('statechange'));
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([{ waiting: worker }]),
      },
    });
    const { activateWaitingServiceWorker } = await import('./pwaRecovery');

    await expect(activateWaitingServiceWorker()).resolves.toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});
