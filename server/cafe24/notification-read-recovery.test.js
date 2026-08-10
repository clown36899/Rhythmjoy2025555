import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification explicit-read recovery migration', () => {
  it('restores recent new-event rows once and leaves later deploys idempotent', async () => {
    const sql = await fs.readFile(path.join(
      process.cwd(),
      'server/cafe24/migrations/2026-08-11-notification-explicit-read-recovery.sql',
    ), 'utf8');

    expect(sql).toContain('INSERT IGNORE INTO notification_data_migrations');
    expect(sql).toContain("kind = 'new_event'");
    expect(sql).toContain('SET is_read = 0');
    expect(sql).toContain('@notification_read_recovery_applied = 1');
    expect(sql).toContain('START TRANSACTION');
    expect(sql).toContain('COMMIT');
  });
});
