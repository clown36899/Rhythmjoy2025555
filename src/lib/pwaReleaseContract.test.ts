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

  it('waits for the app coordinator instead of activating a new worker immediately', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const worker = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');
    const installHandler = worker.slice(
      worker.indexOf("self.addEventListener('install'"),
      worker.indexOf('function compactShareValue'),
    );

    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
    expect(installHandler).not.toContain('skipWaiting');
    expect(worker).toContain("event.data.type === 'SKIP_WAITING'");
  });
});
