import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalyticsReportService, type AnalyticsSources } from './analytics-reports';
import { getAnalyticsSummaryV2 } from './generic-data-api.js';
const now = new Date('2026-09-23T03:00:00Z');
const id = (day: string) => `analytics-report:v2:${day}:${day}`;
const args = (start: string, end = start) => ({ start_date: start, end_date: end });
const log = (day: string, user = 'member-1', extra = {}) => ({ id: `${day}-${user}`, user_id: user, session_id: `${day}-${user}`, created_at: `${day}T12:00:00+09:00`, target_type: 'page_view', target_id: '/', page_url: '/', user_agent: 'Mozilla/5.0 Chrome/140.0', ...extra });
let sources: AnalyticsSources;
let rows: Map<string, any>;
let deps: any;
let service: ReturnType<typeof createAnalyticsReportService>;
beforeEach(() => {
    sources = { logs: [log('2026-09-21'), log('2026-09-22')], sessions: [], boardUsers: [{user_id:'member-1',nickname:'Member'}], boardAdmins: [], analyticsUsers: [], pwaInstalls: [] };
    rows = new Map();
    let locked = false;
    deps = {
        loadSources: vi.fn(async () => structuredClone(sources)),
        readDays: vi.fn(async (days: string[]) => [...rows.values()].filter(row => days.some(day => row.id === id(day)) || row.id.endsWith(':coverage'))),
        saveRow: vi.fn(async (_: string, row: any) => { rows.set(row.id, structuredClone(row)); return row; }),
        summarize: vi.fn(getAnalyticsSummaryV2),
        withLock: vi.fn(async (run: () => Promise<any>) => { if (locked) return null; locked = true; try { return await run(); } finally { locked = false; } }),
    };
    service = createAnalyticsReportService(deps);
});
describe('server-owned finalized analytics', () => {
    it('creates yesterday without a browser visit; saved-day reads cannot invoke the calculator or raw source loader', async () => {
        expect(await service.getReport(args('2026-09-22'), now)).toMatchObject({status:'pending'});
        expect(deps.loadSources).not.toHaveBeenCalled();
        await service.refreshClosed(now);
        expect(rows.get(id('2026-09-22')).report.summary.user_clicks).toBe(1);
        expect(rows.get(id('2026-09-20')).report.summary.user_clicks).toBe(0);
        deps.loadSources.mockClear(); deps.summarize.mockClear(); deps.saveRow.mockClear();
        expect(await service.getReport(args('2026-09-22'), now)).toMatchObject({status:'ready',source:'daily_snapshot'});
        expect(deps.loadSources).not.toHaveBeenCalled(); expect(deps.summarize).not.toHaveBeenCalled(); expect(deps.saveRow).not.toHaveBeenCalled();
    });
    it('retains finalized days across scheduled retries and fills only holes', async () => {
        await service.refreshClosed(now);
        const previous = rows.get(id('2026-09-22'));
        rows.delete(id('2026-09-21'));
        sources.logs.push(log('2026-09-22','member-2'));
        expect(await service.refreshClosed(now)).toMatchObject({finalized:1});
        expect(rows.get(id('2026-09-22'))).toEqual(previous);
        await service.getReport({...args('2026-09-22'),force_refresh:true},now);
        expect(rows.get(id('2026-09-22')).report.summary.user_clicks).toBe(2);
    });
    it('waits for the KST session closing boundary and never freezes today', async () => {
        await service.refreshClosed(new Date('2026-09-22T15:34:59Z'));
        expect(rows.has(id('2026-09-22'))).toBe(false);
        await service.refreshClosed(new Date('2026-09-22T15:35:00Z'));
        expect(rows.has(id('2026-09-22'))).toBe(true);
        expect(rows.has(id('2026-09-23'))).toBe(false);
    });
    it('combines saved days with cross-day deduplication instead of summing daily unique visitors', async () => {
        await service.refreshClosed(now); deps.loadSources.mockClear();
        const result: any = await service.getReport(args('2026-09-21','2026-09-22'),now);
        expect(result.report.summary.user_clicks).toBe(1);
        expect(result.report.summary.total_clicks).toBe(2);
        expect(result.source).toBe('saved_days'); expect(deps.loadSources).not.toHaveBeenCalled();
    });
    it('uses the frozen past when showing a range that includes today', async () => {
        await service.refreshClosed(now);
        sources.logs.push(log('2026-09-22','late-user'),log('2026-09-23','member-1'));
        const result: any = await service.getReport(args('2026-09-22','2026-09-23'),now);
        expect(result.report.summary.user_clicks).toBe(1);
        expect(result.report.summary.total_clicks).toBe(2);
        expect(result.source).toBe('live'); expect(rows.has(id('2026-09-23'))).toBe(false);
    });
    it('preserves global admin-device, bot and excluded-network protections in saved reports', async () => {
        sources.logs = [log('2026-09-21','admin',{fingerprint:'shared-device',is_admin:true}),log('2026-09-22','',{fingerprint:'shared-device'}),log('2026-09-22','robot',{user_agent:'Googlebot'}),log('2026-09-22','excluded',{analytics_excluded:true}),log('2026-09-22','normal')];
        await service.refreshClosed(now);
        const result: any = await service.getReport(args('2026-09-22'),now);
        expect(result.report.summary.user_clicks).toBe(1);
        expect(result.report.summary.anon_clicks).toBe(0);
        expect(result.report.summary.total_clicks).toBe(1);
    });
    it('keeps legacy session timestamps on their KST day and preserves session-only visitors', async () => {
        sources.logs=[];
        sources.sessions=[{session_id:'legacy',user_id:'member-1',created_at:'2026-09-22T14:59:00Z',user_agent:'Mozilla/5.0',duration_seconds:60,page_views:2}];
        await service.refreshClosed(now);
        const result: any=await service.getReport(args('2026-09-22'),now);
        expect(result.report.summary.user_clicks).toBe(1);
        expect(result.report.summary.session_stats.total_sessions).toBe(1);
        expect(result.report.users[0].user_id).toBe('member-1');
    });
    it('does not replace a saved report when explicit rebuilding fails', async () => {
        await service.refreshClosed(now); const previous=rows.get(id('2026-09-22'));
        deps.summarize.mockRejectedValueOnce(new Error('incomplete'));
        await expect(service.getReport({...args('2026-09-22'),force_refresh:true},now)).rejects.toThrow('incomplete');
        expect(rows.get(id('2026-09-22'))).toEqual(previous);
    });
    it('does not publish coverage after a failed backfill and resumes on the next run', async () => {
        deps.saveRow.mockImplementationOnce(async()=>{throw new Error('storage unavailable')});
        await expect(service.refreshClosed(now)).rejects.toThrow('storage unavailable');
        expect(rows.size).toBe(0);
        await service.refreshClosed(now);
        expect(rows.has(id('2026-09-22'))).toBe(true);
        expect(rows.has('analytics-report:v2:coverage')).toBe(true);
    });
    it('uses a shared lock for scheduler and explicit rebuilds', async () => {
        const results = await Promise.all([service.refreshClosed(now),service.refreshClosed(now)]);
        expect(results.filter(result=>result===null)).toHaveLength(1);
    });
    it('distinguishes empty dates before recorded history from missing dates within history', async () => {
        await service.refreshClosed(now); deps.loadSources.mockClear();
        const empty: any = await service.getReport(args('2020-01-01'),now);
        expect(empty.status).toBe('ready'); expect(empty.report.summary.total_clicks).toBe(0);
        rows.delete(id('2026-09-21'));
        expect(await service.getReport(args('2026-09-21'),now)).toMatchObject({status:'pending'});
        expect(deps.loadSources).not.toHaveBeenCalled();
    });
});
