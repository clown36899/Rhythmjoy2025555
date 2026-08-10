const APP_CACHE_PREFIXES = [
  'rhythmjoy-runtime-',
  'rhythmjoy-cache-',
  'workbox-precache',
] as const;

export const LEGACY_NOTIFICATION_DB_NAME = 'notification-history';
export const PWA_RECOVERY_QUERY = 'rj_pwa_recover';

const RECOVERY_ATTEMPT_KEY = 'rhythmjoy:pwa-preboot-recovery';
const DEFAULT_OPERATION_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function isAppRuntimeCache(cacheName: string) {
  return APP_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

export async function clearLegacyAppCaches() {
  if (typeof window === 'undefined' || !('caches' in window)) return [] as string[];

  const cacheNames = await caches.keys();
  const targets = cacheNames.filter(isAppRuntimeCache);
  await Promise.allSettled(targets.map((cacheName) => caches.delete(cacheName)));
  return targets;
}

export function deleteLegacyNotificationDatabase(timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (deleted: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(deleted);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);

    try {
      const request = window.indexedDB.deleteDatabase(LEGACY_NOTIFICATION_DB_NAME);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      // A legacy tab can briefly keep the old connection open. Do not hang the
      // recovery screen; the other converging tabs retry this cleanup as well.
      request.onblocked = () => { /* bounded by the timeout above */ };
    } catch {
      finish(false);
    }
  });
}

async function waitForInstallingWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
) {
  const current = registration.installing;
  if (!current || current.state === 'installed' || current.state === 'activated') return;

  await withTimeout(new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (current.state === 'installed' || current.state === 'activated' || current.state === 'redundant') {
        current.removeEventListener('statechange', handleStateChange);
        resolve();
      }
    };
    current.addEventListener('statechange', handleStateChange);
  }), timeoutMs, undefined);
}

export async function requestLatestServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(registrations.map(async (registration) => {
    await registration.update();
    await waitForInstallingWorker(registration);
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }));
  return registrations.length > 0;
}

export async function activateWaitingServiceWorker(timeoutMs = 6_000) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const waitingWorker = registrations
    .map((registration) => registration.waiting)
    .find((worker): worker is ServiceWorker => Boolean(worker));
  if (!waitingWorker) return false;

  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    const finish = (result: boolean) => {
      window.clearTimeout(timer);
      waitingWorker.removeEventListener('statechange', handleStateChange);
      resolve(result);
    };
    const handleStateChange = () => {
      if (waitingWorker.state === 'activated') finish(true);
      if (waitingWorker.state === 'redundant') finish(false);
    };
    waitingWorker.addEventListener('statechange', handleStateChange);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
}

export async function unregisterAllServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return [] as boolean[];

  const registrations = await navigator.serviceWorker.getRegistrations();
  const results = await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  return results.map((result) => result.status === 'fulfilled' && result.value);
}

export function createRecoveryUrl(reason: string, targetBuildId = '') {
  const url = new URL(window.location.href);
  const hasSensitiveAuthState = /(?:^|[?&])(?:code|error)=/i.test(url.search)
    || /(?:access_token|refresh_token)=/i.test(url.hash);
  if (hasSensitiveAuthState) {
    url.pathname = '/';
    url.search = '';
    url.hash = '';
  }
  const marker = [reason, targetBuildId, Date.now().toString(36)].filter(Boolean).join('-');
  url.searchParams.set(PWA_RECOVERY_QUERY, marker);
  return url.href;
}

export function consumeRecoveryQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PWA_RECOVERY_QUERY)) return false;
  url.searchParams.delete(PWA_RECOVERY_QUERY);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function getRecoveryAttempt(targetBuildId: string) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECOVERY_ATTEMPT_KEY) || '{}') as {
      targetBuildId?: string;
      count?: number;
    };
    return stored.targetBuildId === targetBuildId ? Number(stored.count || 0) : 0;
  } catch {
    return 0;
  }
}

export function markRecoveryAttempt(targetBuildId: string) {
  const count = getRecoveryAttempt(targetBuildId) + 1;
  try {
    sessionStorage.setItem(RECOVERY_ATTEMPT_KEY, JSON.stringify({ targetBuildId, count }));
  } catch {
    // Storage is optional in embedded/private browser modes.
  }
  return count;
}

export function clearRecoveryAttempt() {
  try {
    sessionStorage.removeItem(RECOVERY_ATTEMPT_KEY);
  } catch {
    // Storage is optional in embedded/private browser modes.
  }
}

export async function cleanupLegacyRuntimeState() {
  await Promise.allSettled([
    clearLegacyAppCaches(),
    deleteLegacyNotificationDatabase(),
  ]);
}

export async function preparePwaRecovery(options: { hardReset?: boolean } = {}) {
  const tasks: Promise<unknown>[] = [
    cleanupLegacyRuntimeState(),
  ];

  if (options.hardReset) {
    tasks.push(unregisterAllServiceWorkers());
  } else {
    tasks.push(requestLatestServiceWorker());
  }

  await Promise.allSettled(tasks);
}

export async function resetAppRuntimeAndRestart() {
  await preparePwaRecovery({ hardReset: true });

  try {
    sessionStorage.clear();
  } catch {
    // no-op
  }
  try {
    localStorage.clear();
  } catch {
    // no-op
  }

  window.location.replace(createRecoveryUrl('manual-reset'));
}
