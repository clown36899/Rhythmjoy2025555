// @vitest-environment-options {"url":"https://swingenjoy.com/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    ga: vi.fn(),
}));
vi.mock('../lib/cafe24Client', () => ({ cafe24: { rpc: calls.rpc, auth: { getUser: calls.getUser } } }));
vi.mock('react-ga4', () => ({ default: { send: calls.ga, event: calls.ga, initialize: calls.ga, set: calls.ga } }));

describe('managed browser transport boundary', () => {
    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        calls.rpc.mockResolvedValue({ data: true, error: null });
        calls.getUser.mockResolvedValue({ data: { user: null } });
        vi.useFakeTimers();
        sessionStorage.clear();
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
        const guards = await import('./analyticsGuards');
        vi.spyOn(guards, 'isLikelyBotTraffic').mockReturnValue(false);
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        window.history.replaceState({}, '', '/');
        sessionStorage.clear();
    });

    it('blocks sessions, delayed click transport, GA and content views after internal entry', async () => {
        window.history.replaceState({}, '', '/?analytics=internal');
        const engine = await import('./analyticsEngine');
        const ga = await import('../lib/analytics');
        const { incrementTrackedView } = await import('../hooks/useViewTracking');
        await engine.initializeAnalyticsSession();
        // Removing the query during SPA navigation must not resume tracking.
        window.history.replaceState({}, '', '/calendar');
        await engine.initializeAnalyticsSession({ id: 'admin-test' }, true);
        engine.trackEvent({ target_id: 'event-1', target_type: 'click', section: 'calendar', route: '/calendar' });
        ga.logPageView('/calendar');
        expect(await incrementTrackedView(123, 'event')).toBe(false);
        await vi.advanceTimersByTimeAsync(6000);
        expect(fetch).not.toHaveBeenCalled();
        expect(calls.rpc).not.toHaveBeenCalled();
        expect(calls.getUser).not.toHaveBeenCalled();
        expect(calls.ga).not.toHaveBeenCalled();
    });

    it('still sends ordinary visitor sessions and content views', async () => {
        const engine = await import('./analyticsEngine');
        const { incrementTrackedView } = await import('../hooks/useViewTracking');
        await engine.initializeAnalyticsSession();
        expect(fetch).toHaveBeenCalledWith('/api/analytics/session', expect.objectContaining({ method: 'POST' }));
        expect(await incrementTrackedView(123, 'event')).toBe(true);
        expect(calls.rpc).toHaveBeenCalledWith('increment_item_views', expect.objectContaining({ p_item_id: 123, p_is_admin: false }));
        const ga = await import('../lib/analytics');
        ga.logPageView('/calendar');
        expect(calls.ga).toHaveBeenCalled();
        localStorage.setItem('ga-admin-device-shield', 'true');
        expect(await incrementTrackedView(456, 'event')).toBe(true);
        expect(calls.rpc).toHaveBeenLastCalledWith('increment_item_views', expect.objectContaining({ p_item_id: 456, p_is_admin: true }));
    });

    it('drops a queued click and a pending view when the tab enters internal mode', async () => {
        let upload: (() => void) | undefined;
        vi.stubGlobal('requestIdleCallback', vi.fn(callback => { upload = callback; return 1; }));
        const engine = await import('./analyticsEngine');
        engine.trackEvent({ target_id: 'queued', target_type: 'click', section: 'calendar', route: '/calendar' });
        expect(upload).toBeDefined();
        let finishAuth: ((value: { data: { user: null } }) => void) | undefined;
        calls.getUser.mockImplementationOnce(() => new Promise(resolve => { finishAuth = resolve; }));
        const { incrementTrackedView } = await import('../hooks/useViewTracking');
        const pending = incrementTrackedView(123, 'event');
        vi.mocked(fetch).mockClear();
        window.history.replaceState({}, '', '/?analytics=internal');
        upload?.();
        finishAuth?.({ data: { user: null } });
        expect(await pending).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
        expect(calls.rpc).not.toHaveBeenCalled();
    });
});
