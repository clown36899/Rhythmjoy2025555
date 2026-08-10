import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('client log boot boundaries', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('migrates old unscoped logs as historical entries', async () => {
    window.localStorage.setItem('rhythmjoy_client_logs_v1', JSON.stringify([{
      id: 7,
      timestamp: '2026-08-10T14:39:08.317Z',
      level: 'error',
      route: '/',
      message: 'The requested version (1) is less than the existing version (2).',
    }]));
    const logger = await import('./clientLogBuffer');

    expect(logger.getClientLogs()).toEqual([expect.objectContaining({
      buildId: 'legacy-unknown',
      bootId: 'legacy-boot',
    })]);
    expect(logger.getCurrentBootClientLogs()).toEqual([]);
    expect(logger.getClientLogText()).toContain('Previous Boot Logs (historical; not current errors):');
    expect(window.localStorage.getItem('rhythmjoy_client_logs_v1')).toBeNull();
  });

  it('records build and boot ids and counts only the current boot', async () => {
    const logger = await import('./clientLogBuffer');
    logger.addClientLog('error', 'current failure');

    expect(logger.getCurrentBootClientLogs()).toEqual([expect.objectContaining({
      buildId: logger.CURRENT_CLIENT_BUILD_ID,
      bootId: logger.CURRENT_CLIENT_BOOT_ID,
      message: 'current failure',
    })]);
    expect(logger.getClientLogText()).toContain(`Current Build: ${logger.CURRENT_CLIENT_BUILD_ID}`);
    expect(logger.getClientLogText()).toContain(`Current Boot: ${logger.CURRENT_CLIENT_BOOT_ID}`);
  });

  it('keeps a previous boot error for copying but not as a current error', async () => {
    const firstBoot = await import('./clientLogBuffer');
    firstBoot.addClientLog('error', 'old boot failure');
    const firstBootId = firstBoot.CURRENT_CLIENT_BOOT_ID;

    vi.resetModules();
    const nextBoot = await import('./clientLogBuffer');
    expect(nextBoot.CURRENT_CLIENT_BOOT_ID).not.toBe(firstBootId);
    expect(nextBoot.getCurrentBootClientLogs()).toEqual([]);
    expect(nextBoot.getClientLogText()).toContain('old boot failure');
    expect(nextBoot.getClientLogText()).toContain('Previous Boot Logs (historical; not current errors):');
  });
});
