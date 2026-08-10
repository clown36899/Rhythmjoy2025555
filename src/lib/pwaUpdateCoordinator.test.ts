import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PWA update coordinator', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('activates one waiting worker only after the app requests a safe update', async () => {
    const coordinator = await import('./pwaUpdateCoordinator');
    const activate = vi.fn().mockResolvedValue(undefined);
    const ready = vi.fn();
    window.addEventListener(coordinator.PWA_UPDATE_READY_EVENT, ready);
    coordinator.registerPwaUpdateActivator(activate);

    await expect(coordinator.activatePendingPwaUpdate()).resolves.toBe(false);
    coordinator.markPwaUpdateWaiting();
    expect(ready).toHaveBeenCalledTimes(1);
    await expect(coordinator.activatePendingPwaUpdate()).resolves.toBe(true);
    await expect(coordinator.activatePendingPwaUpdate()).resolves.toBe(false);
    expect(activate).toHaveBeenCalledTimes(1);

    window.removeEventListener(coordinator.PWA_UPDATE_READY_EVENT, ready);
  });

  it('keeps a failed activation pending for a later safe retry', async () => {
    const coordinator = await import('./pwaUpdateCoordinator');
    const activate = vi.fn()
      .mockRejectedValueOnce(new Error('activation failed'))
      .mockResolvedValueOnce(undefined);
    coordinator.registerPwaUpdateActivator(activate);
    coordinator.markPwaUpdateWaiting();

    await expect(coordinator.activatePendingPwaUpdate()).rejects.toThrow('activation failed');
    await expect(coordinator.activatePendingPwaUpdate()).resolves.toBe(true);
    expect(activate).toHaveBeenCalledTimes(2);
  });
});
