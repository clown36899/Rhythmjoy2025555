import { isAdminAnalyticsShielded } from './analyticsGuards';

const STORAGE_KEY = 'rj_perf_trace';

export const isPerfTraceEnabled = (isAdmin = false) => {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('perfTrace') === '1' || params.get('tracePerf') === '1') {
            localStorage.setItem(STORAGE_KEY, 'true');
            return true;
        }
        return (
            isAdmin ||
            isAdminAnalyticsShielded() ||
            localStorage.getItem(STORAGE_KEY) === 'true'
        );
    } catch {
        return isAdmin;
    }
};

export const perfNow = () => (
    typeof performance !== 'undefined' ? performance.now() : Date.now()
);

export const perfMs = (startedAt: number) => Math.round(perfNow() - startedAt);

export const perfInfo = (label: string, details: Record<string, unknown> = {}, isAdmin = false) => {
    if (!isPerfTraceEnabled(isAdmin)) return;
    console.info(`[perf] ${label}`, {
        at: new Date().toISOString(),
        path: window.location.pathname + window.location.search,
        ...details,
    });
};
