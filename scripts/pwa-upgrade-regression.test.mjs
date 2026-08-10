import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = resolve(PROJECT_ROOT, 'dist');
const CURRENT_WORKER_PATH = resolve(DIST_DIR, 'service-worker.js');
const CURRENT_INDEX_PATH = resolve(DIST_DIR, 'index.html');

const LEGACY_CACHE_NAMES = [
  'rhythmjoy-runtime-95cf4ff6',
  'rhythmjoy-cache-95cf4ff6',
  'workbox-precache-v2-95cf4ff6',
];
const SHARE_CACHE_NAME = 'rhythmjoy-share-targets-v1';
const UNRELATED_CACHE_NAME = 'pwa-regression-unrelated';
const RELEASE_STATE_CACHE_NAME = 'swingenjoy-release-state-v1';
const LEGACY_DB_NAME = 'notification-history';

const LEGACY_PAGE = `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8"><title>95cf4ff6 legacy client</title></head>
  <body>
    <main id="legacy-client">legacy 95cf4ff6</main>
    <script>
      window.__LEGACY_BUILD__ = '95cf4ff607946ba03bacb06b6740b45f40f1f0b7';
      window.__LEGACY_REGISTRATION__ = navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    </script>
  </body>
</html>`;

// The relevant lifecycle behavior of the worker shipped with 95cf4ff6:
// install-time skipWaiting and activate-time clients.claim.
const LEGACY_WORKER = `
const LEGACY_BUILD = '95cf4ff607946ba03bacb06b6740b45f40f1f0b7';
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'LEGACY_BUILD' && event.ports?.[0]) {
    event.ports[0].postMessage(LEGACY_BUILD);
  }
});
`;

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendText(response, statusCode, body, contentType, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, payload, statusCode = 200) {
  sendText(response, statusCode, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function safeDistPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relativePath = decoded.replace(/^\/+/, '');
  const candidate = resolve(DIST_DIR, relativePath || 'index.html');
  return candidate === DIST_DIR || candidate.startsWith(`${DIST_DIR}${sep}`) ? candidate : null;
}

async function sendDistFile(response, pathname) {
  const filePath = safeDistPath(pathname);
  if (!filePath) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    response.writeHead(200, {
      'Cache-Control': pathname === '/service-worker.js' || pathname === '/version.json'
        ? 'no-store'
        : 'public, max-age=0, must-revalidate',
      'Content-Length': fileStat.size,
      'Content-Type': MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      ...(pathname === '/service-worker.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function createReleaseServer() {
  let release = 'legacy';
  const requestLog = [];

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://swingenjoy.localhost');
    const { pathname } = requestUrl;
    requestLog.push({ release, pathname });

    if (release === 'legacy') {
      if (pathname === '/service-worker.js') {
        sendText(response, 200, LEGACY_WORKER, 'text/javascript; charset=utf-8', {
          'Service-Worker-Allowed': '/',
        });
        return;
      }
      if (pathname === '/' || pathname === '/index.html') {
        sendText(response, 200, LEGACY_PAGE, 'text/html; charset=utf-8');
        return;
      }
      sendText(response, 404, 'legacy fixture not found', 'text/plain; charset=utf-8');
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/auth/me') {
        sendJson(response, { user: null });
      } else if (pathname.startsWith('/api/notifications')) {
        sendJson(response, { notifications: [], ok: true });
      } else {
        sendJson(response, { data: [], error: null, count: 0, ok: true });
      }
      return;
    }

    if (await sendDistFile(response, pathname)) return;

    const acceptsHtml = String(request.headers.accept || '').includes('text/html');
    if (acceptsHtml && await sendDistFile(response, '/index.html')) return;
    sendText(response, 404, 'current build asset not found', 'text/plain; charset=utf-8');
  });

  return {
    server,
    useCurrentRelease() {
      release = 'current';
    },
    getRequestLog() {
      return requestLog.slice();
    },
  };
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function waitForLegacyController(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const legacyBuild = await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return '';
    return new Promise((resolveBuild) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolveBuild(''), 2_000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolveBuild(event.data);
      };
      controller.postMessage({ type: 'LEGACY_BUILD' }, [channel.port2]);
    });
  });
  assert.equal(legacyBuild, '95cf4ff607946ba03bacb06b6740b45f40f1f0b7');
}

async function seedLegacyState(page, origin) {
  await page.evaluate(async ({ cacheNames, shareCacheName, unrelatedCacheName, dbName, baseUrl }) => {
    const cachePayloads = [
      ...cacheNames.map((name) => [name, `known:${name}`]),
      [shareCacheName, 'preserve:share'],
      [unrelatedCacheName, 'preserve:unrelated'],
    ];
    for (const [name, payload] of cachePayloads) {
      const cache = await caches.open(name);
      await cache.put(`${baseUrl}/__pwa-test-cache/${encodeURIComponent(name)}`, new Response(payload));
    }

    await new Promise((resolveDatabase, rejectDatabase) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('notifications')) {
          request.result.createObjectStore('notifications', { keyPath: 'id' });
        }
      };
      request.onerror = () => rejectDatabase(request.error);
      request.onsuccess = () => {
        request.result.close();
        resolveDatabase(undefined);
      };
    });
  }, {
    cacheNames: LEGACY_CACHE_NAMES,
    shareCacheName: SHARE_CACHE_NAME,
    unrelatedCacheName: UNRELATED_CACHE_NAME,
    dbName: LEGACY_DB_NAME,
    baseUrl: origin,
  });
}

async function readCacheState(page, origin) {
  return page.evaluate(async ({ shareCacheName, unrelatedCacheName, baseUrl }) => {
    const names = await caches.keys();
    const readSentinel = async (cacheName) => {
      const cache = await caches.open(cacheName);
      const response = await cache.match(`${baseUrl}/__pwa-test-cache/${encodeURIComponent(cacheName)}`);
      return response ? response.text() : null;
    };
    return {
      names,
      shareValue: await readSentinel(shareCacheName),
      unrelatedValue: await readSentinel(unrelatedCacheName),
    };
  }, {
    shareCacheName: SHARE_CACHE_NAME,
    unrelatedCacheName: UNRELATED_CACHE_NAME,
    baseUrl: origin,
  });
}

async function openLegacyDatabaseAtVersionOne(page) {
  return page.evaluate((dbName) => new Promise((resolveOpen, rejectOpen) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('notifications')) {
        request.result.createObjectStore('notifications', { keyPath: 'id' });
      }
    };
    request.onerror = () => rejectOpen(request.error);
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolveOpen(version);
    };
  }), LEGACY_DB_NAME);
}

async function inspectPageState(page) {
  try {
    const evaluation = page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return {
        appStarted: window.__APP_STARTED === true,
        controller: navigator.serviceWorker.controller?.scriptURL || null,
        active: registration?.active?.state || null,
        waiting: registration?.waiting?.state || null,
        installing: registration?.installing?.state || null,
        updateError: window.__PWA_UPDATE_ERROR__ || null,
        errors: window.__PWA_REGRESSION_ERRORS__ || [],
        title: document.title,
        url: window.location.href,
      };
    });
    return await Promise.race([
      evaluation,
      new Promise((resolveTimeout) => setTimeout(() => resolveTimeout({
        appStarted: false,
        evaluationError: 'page evaluation timed out during navigation',
        url: page.url(),
      }), 1_000)),
    ]);
  } catch (error) {
    return {
      appStarted: false,
      evaluationError: String(error?.message || error),
      url: page.url(),
    };
  }
}

async function waitForCurrentBootstraps(pages, timeoutMs, onProgress) {
  const deadline = Date.now() + timeoutMs;
  let nextReportAt = 0;
  let states = [];

  while (Date.now() < deadline) {
    states = await Promise.all(pages.map(inspectPageState));
    if (states.every((state) => state.appStarted)) return states;
    if (Date.now() >= nextReportAt) {
      onProgress(`waiting for current bootstrap: ${JSON.stringify(states)}`);
      nextReportAt = Date.now() + 5_000;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`tabs did not converge to the current bootstrap: ${JSON.stringify(states)}`);
}

test('legacy 95cf4ff6 worker converges two tabs through the built current worker', { timeout: 90_000 }, async (t) => {
  const progress = (message) => t.diagnostic(message);
  assert.equal(existsSync(CURRENT_WORKER_PATH), true, 'dist/service-worker.js must exist; run the production build first');
  assert.equal(existsSync(CURRENT_INDEX_PATH), true, 'dist/index.html must exist; run the production build first');

  const releaseServer = createReleaseServer();
  const port = await listen(releaseServer.server);
  progress(`release server listening on 127.0.0.1:${port}`);
  // *.localhost remains a trustworthy HTTP origin, while avoiding the app's
  // exact-host local-development branch that intentionally unregisters PWA state.
  const origin = `http://swingenjoy.localhost:${port}`;
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-proxy-server',
      '--host-resolver-rules=MAP swingenjoy.localhost 127.0.0.1',
      `--unsafely-treat-insecure-origin-as-secure=${origin}`,
    ],
  });

  try {
    const context = await browser.newContext();
    await context.route((url) => new URL(url).origin !== origin, async (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === 'script') {
        await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      } else {
        await route.fulfill({ status: 204, body: '' });
      }
    });
    await context.addInitScript(() => {
      window.__PWA_REGRESSION_ERRORS__ = [];
      window.addEventListener('error', (event) => {
        window.__PWA_REGRESSION_ERRORS__.push(String(event.error?.message || event.message || 'window.error'));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__PWA_REGRESSION_ERRORS__.push(String(event.reason?.message || event.reason || 'unhandledrejection'));
      });
    });

    const firstTab = await context.newPage();
    firstTab.on('framenavigated', (frame) => {
      if (frame === firstTab.mainFrame()) progress(`first tab navigated: ${frame.url()}`);
    });
    await firstTab.goto(origin, { waitUntil: 'domcontentloaded' });
    progress('legacy first tab loaded');
    assert.equal(await firstTab.evaluate(() => isSecureContext && 'serviceWorker' in navigator), true);
    await firstTab.evaluate(() => window.__LEGACY_REGISTRATION__);
    await waitForLegacyController(firstTab);
    progress('legacy first tab controlled');

    const secondTab = await context.newPage();
    secondTab.on('framenavigated', (frame) => {
      if (frame === secondTab.mainFrame()) progress(`second tab navigated: ${frame.url()}`);
    });
    await secondTab.goto(origin, { waitUntil: 'domcontentloaded' });
    await secondTab.evaluate(() => window.__LEGACY_REGISTRATION__);
    await waitForLegacyController(secondTab);
    progress('legacy second tab controlled');

    await seedLegacyState(firstTab, origin);
    progress('legacy v2 database and caches seeded');
    const beforeUpgrade = await readCacheState(firstTab, origin);
    for (const cacheName of [...LEGACY_CACHE_NAMES, SHARE_CACHE_NAME, UNRELATED_CACHE_NAME]) {
      assert(beforeUpgrade.names.includes(cacheName), `seeded cache is missing: ${cacheName}`);
    }

    releaseServer.useCurrentRelease();
    progress('server switched to current dist');

    await firstTab.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) throw new Error('legacy service worker registration not found');
      registration.update().catch((error) => {
        window.__PWA_UPDATE_ERROR__ = String(error?.message || error);
      });
    });
    progress('service worker update requested');
    await new Promise((resolveWait) => setTimeout(resolveWait, 3_000));
    progress(`post-update URLs: ${JSON.stringify([firstTab.url(), secondTab.url()])}`);
    await waitForCurrentBootstraps([firstTab, secondTab], 45_000, progress).catch((error) => {
      const recentRequests = releaseServer.getRequestLog().slice(-40);
      throw new Error(`${error.message}; recent server requests: ${JSON.stringify(recentRequests)}`);
    });
    progress('both tabs reached current __APP_STARTED');

    for (const [index, page] of [firstTab, secondTab].entries()) {
      assert.equal(await page.evaluate(() => window.__APP_STARTED), true, `tab ${index + 1} did not start the current app`);
      assert.equal(await page.locator('#crash-fallback-overlay').count(), 0, `tab ${index + 1} rendered the crash overlay`);
      const versionErrors = await page.evaluate(() => (
        window.__PWA_REGRESSION_ERRORS__.filter((message) => /requested version|versionerror/i.test(message))
      ));
      assert.deepEqual(versionErrors, [], `tab ${index + 1} recorded an IndexedDB VersionError`);
    }

    const afterUpgrade = await readCacheState(firstTab, origin);
    for (const cacheName of LEGACY_CACHE_NAMES) {
      assert.equal(afterUpgrade.names.includes(cacheName), false, `known legacy cache survived: ${cacheName}`);
    }
    assert(afterUpgrade.names.includes(RELEASE_STATE_CACHE_NAME), 'one-time bridge completion marker cache is missing');
    assert(afterUpgrade.names.includes(SHARE_CACHE_NAME), 'share-target cache was incorrectly removed');
    assert(afterUpgrade.names.includes(UNRELATED_CACHE_NAME), 'unrelated cache was incorrectly removed');
    assert.equal(afterUpgrade.shareValue, 'preserve:share');
    assert.equal(afterUpgrade.unrelatedValue, 'preserve:unrelated');

    const databasesBeforeLegacyOpen = await firstTab.evaluate(async () => (
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).map((database) => ({ name: database.name, version: database.version }))
        : []
    ));
    if (databasesBeforeLegacyOpen.length > 0) {
      assert.equal(
        databasesBeforeLegacyOpen.some((database) => database.name === LEGACY_DB_NAME),
        false,
        'legacy notification database survived current bootstrap recovery',
      );
    }

    assert.equal(await openLegacyDatabaseAtVersionOne(firstTab), 1, 'legacy v1 database open did not recover');

    await context.close();
  } finally {
    await browser.close();
    await closeServer(releaseServer.server);
  }
});
