import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('service worker notification ownership', () => {
  it('shows push notifications without owning the app notification database', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');

    expect(source).toContain('self.registration.showNotification');
    expect(source).toContain("url.searchParams.set('notification_kind'");
    expect(source).not.toContain('notification-history');
    expect(source).not.toContain('indexedDB');
    expect(source).not.toContain('saveToDB');
    expect(source).not.toContain('notification_local_id');
  });
});
