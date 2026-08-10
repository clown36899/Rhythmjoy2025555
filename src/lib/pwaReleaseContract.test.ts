import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA release overlap contract', () => {
  it('uploads new hashed assets before entry files and does not delete old client assets', () => {
    const deploy = readFileSync(resolve(process.cwd(), 'scripts/deploy-cafe24.sh'), 'utf8');
    const assetUpload = 'dist/assets/ "${TARGET}:${APP_DIR}/dist/assets/"';
    const entryUpload = 'dist/ "${TARGET}:${APP_DIR}/dist/"';

    expect(deploy).toContain(assetUpload);
    expect(deploy).toContain("--exclude 'assets/'");
    expect(deploy.indexOf(assetUpload)).toBeLessThan(deploy.indexOf(entryUpload));
    expect(deploy).not.toMatch(/rsync[^\n]*--delete[^\n]*dist\/[^-]/);
  });

  it('terminates missing asset requests before the SPA HTML fallback', () => {
    const server = readFileSync(resolve(process.cwd(), 'server/cafe24/app.js'), 'utf8');
    const asset404 = "app.use('/assets', (_req, res) => {";
    const spaFallback = "app.use((req, res, next) => {";

    expect(server).toContain(asset404);
    expect(server.indexOf(asset404)).toBeLessThan(server.lastIndexOf(spaFallback));
    expect(server).toContain("res.status(404).type('text/plain').send('Asset not found')");
  });

  it('uses a one-time legacy bridge and returns later releases to prompt activation', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const worker = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');
    const installHandler = worker.slice(
      worker.indexOf("self.addEventListener('install'"),
      worker.indexOf('function compactShareValue'),
    );
    const activateHandler = worker.slice(
      worker.indexOf("self.addEventListener('activate'"),
      worker.indexOf('// Only the Web Share Target'),
    );

    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
    expect(config).toContain("globPatterns: ['index.html']");
    expect(config).not.toContain("globPatterns: ['assets/**/*.{js,css}', 'index.html']");
    expect(worker).toContain("LEGACY_BRIDGE_EPOCH = 'legacy-autoupdate-bridge-20260811-v1'");
    expect(installHandler).toContain('!completed && hasLegacyActiveWorker');
    expect(installHandler).toContain('await self.skipWaiting()');
    expect(activateHandler).toContain('if (legacyBridgePending)');
    expect(activateHandler).toContain('await self.clients.claim()');
    expect(activateHandler).toContain('!completedResponse && pendingStamp === RELEASE_STAMP');
    expect(worker.match(/self\.clients\.claim\(\)/g)).toHaveLength(1);
    expect(activateHandler).not.toContain('await client.navigate');
    expect(worker).toContain("event.data.type === 'SKIP_WAITING'");
  });

  it('never precaches or serves a cached application shell', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');

    expect(worker).not.toContain('precacheAndRoute');
    expect(worker).not.toContain('cleanupOutdatedCaches');
    expect(worker).not.toContain("cache.addAll([");
    expect(worker).not.toContain("caches.match('/index.html')");
    expect(worker).not.toContain("cache.put('/index.html'");
    expect(worker).not.toContain("event.request.mode === 'navigate'");
    expect(worker).toContain("const SHARE_TARGET_CACHE = 'rhythmjoy-share-targets-v1'");
    expect(worker).toContain("cacheName.startsWith(WORKBOX_CACHE_PREFIX)");
  });

  it('gates the React entry on a no-store build check', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const bootstrap = readFileSync(resolve(process.cwd(), 'src/bootstrap.ts'), 'utf8');
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(html).toContain('<script type="module" src="/src/bootstrap.ts"></script>');
    expect(html).not.toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(bootstrap).toContain("cache: 'no-store'");
    expect(bootstrap).toContain("serverBuildId !== __BUILD_TIME__");
    expect(bootstrap).toContain('showRecoveryStop(serverBuildId, attempts)');
    expect(bootstrap).not.toContain('preparePwaRecovery({ hardReset:');
    expect(bootstrap.indexOf('serverBuildId !== __BUILD_TIME__')).toBeLessThan(bootstrap.indexOf("import('./main')"));
    expect(config).toContain("apply: 'build'");
    expect(config).toContain('if (process.env.VITEST) return');
  });
});
