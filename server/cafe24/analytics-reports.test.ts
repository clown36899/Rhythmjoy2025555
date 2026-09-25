import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalyticsReportService, encodeAnalyticsSnapshot, decodeAnalyticsSnapshot, type AnalyticsSources } from './analytics-reports';
import { getAnalyticsSummaryV2 } from './generic-data-api.js';
const now = new Date('2026-09-23T03:00:00Z');
const LIVE_ID = 'analytics-report:v2:live';
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
        readDays: vi.fn(async (days: string[], includeLive = false) => [...rows.values()].filter(row => days.some(day => row.id === id(day)) || row.id.endsWith(':coverage') || (includeLive && row.id === LIVE_ID))),
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
        expect(decodeAnalyticsSnapshot(rows.get(id('2026-09-22'))).report.summary.user_clicks).toBe(1);
        expect(decodeAnalyticsSnapshot(rows.get(id('2026-09-20'))).report.summary.user_clicks).toBe(0);
        deps.loadSources.mockClear(); deps.summarize.mockClear(); deps.saveRow.mockClear();
        expect(await service.getReport(args('2026-09-22'), now)).toMatchObject({status:'ready',source:'daily_snapshot'});
        expect(deps.loadSources).not.toHaveBeenCalled(); expect(deps.summarize).not.toHaveBeenCalled(); expect(deps.saveRow).not.toHaveBeenCalled();
    });
    it('retains finalized days across scheduled retries and fills only holes', async () => {
        await service.refreshClosed(now);
        const previous = rows.get(id('2026-09-22'));
        rows.delete(id('2026-09-21'));
        rows.get('analytics-report:v2:coverage').updated_at = '2026-09-21T00:00:00Z';
        sources.logs.push(log('2026-09-22','member-2'));
        expect(await service.refreshClosed(now)).toMatchObject({finalized:1});
        expect(rows.get(id('2026-09-22'))).toEqual(previous);
        await service.getReport({...args('2026-09-22'),force_refresh:true},now);
        expect(decodeAnalyticsSnapshot(rows.get(id('2026-09-22'))).report.summary.user_clicks).toBe(2);
    });
    it('waits for the KST session closing boundary and never freezes today', async () => {
        await service.refreshClosed(new Date('2026-09-22T15:34:59Z'));
        expect(rows.has(id('2026-09-22'))).toBe(false);
        await service.refreshClosed(new Date('2026-09-22T15:35:00Z'));
        expect(rows.has(id('2026-09-22'))).toBe(true);
        expect(decodeAnalyticsSnapshot(rows.get(LIVE_ID)).finalized).toBe(false);
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
        await service.refreshClosed(now); deps.loadSources.mockClear();
        const result: any = await service.getReport(args('2026-09-22','2026-09-23'),now);
        expect(result.report.summary.user_clicks).toBe(1);
        expect(result.report.summary.total_clicks).toBe(2);
        expect(result.source).toBe('live_snapshot'); expect(deps.loadSources).not.toHaveBeenCalled(); expect(decodeAnalyticsSnapshot(rows.get(LIVE_ID)).finalized).toBe(false);
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
    it('stores large reports below the legacy MySQL packet boundary and round-trips every detail', () => {
        const row = { id: id('2026-09-22'), report_version: 2, report: { summary: { total_clicks: 2000 }, users: [], guests: [] }, inputs: { ...sources, logs: Array.from({length: 2000}, (_,i)=>log('2026-09-22', `member-${i}`, {target_title:'Repeated navigation and activity details '.repeat(10)})) } };
        expect(Buffer.byteLength(JSON.stringify(row))).toBeGreaterThan(1048576);
        const encoded = encodeAnalyticsSnapshot(row);
        expect(Buffer.byteLength(JSON.stringify(encoded))).toBeLessThan(1048576);
        expect(decodeAnalyticsSnapshot(encoded)).toMatchObject(row);
    });
    it('accepts already saved uncompressed v2 days and repairs malformed compressed rows', async () => {
        await service.refreshClosed(now);
        const existing=decodeAnalyticsSnapshot(rows.get(id('2026-09-22')));
        delete existing.report_encoding;
        rows.set(id('2026-09-22'),existing);
        deps.summarize.mockClear();
        expect(await service.getReport(args('2026-09-22'),now)).toMatchObject({status:'ready'});
        expect(deps.summarize).not.toHaveBeenCalled();
        rows.set(id('2026-09-22'),{...existing,report_encoding:'gzip-base64-v1',report:'invalid'});
        rows.get('analytics-report:v2:coverage').updated_at = '2026-09-21T00:00:00Z';
        expect(await service.getReport(args('2026-09-22'),now)).toMatchObject({status:'pending'});
        expect(await service.refreshClosed(now)).toMatchObject({finalized:1});
        expect(await service.getReport(args('2026-09-22'),now)).toMatchObject({status:'ready'});
    });
    it('distinguishes empty dates before recorded history from missing dates within history', async () => {
        await service.refreshClosed(now); deps.loadSources.mockClear();
        const empty: any = await service.getReport(args('2020-01-01'),now);
        expect(empty.status).toBe('ready'); expect(empty.report.summary.total_clicks).toBe(0);
        rows.delete(id('2026-09-21'));
        expect(await service.getReport(args('2026-09-21'),now)).toMatchObject({status:'pending'});
        expect(deps.loadSources).not.toHaveBeenCalled();
    });
    it('serves today without raw reads or calculation, marks stale values, and refreshes only by explicit mutation', async () => {
        sources.logs.push(log('2026-09-23'));
        await service.refreshClosed(now);
        deps.loadSources.mockClear(); deps.summarize.mockClear(); deps.saveRow.mockClear();
        expect(await service.getReport(args('2026-09-23'), now)).toMatchObject({source:'live_snapshot', stale:false});
        expect(await service.getReport(args('2026-09-23'), new Date(now.getTime()+121000))).toMatchObject({stale:true});
        expect(deps.loadSources).not.toHaveBeenCalled(); expect(deps.summarize).not.toHaveBeenCalled(); expect(deps.saveRow).not.toHaveBeenCalled();
        sources.logs.push(log('2026-09-23','new-user'));
        const updated:any=await service.getReport({...args('2026-09-23'),force_refresh:true},now);
        expect(updated.report.summary.user_clicks).toBe(2);
        expect(deps.loadSources).toHaveBeenCalledTimes(1);
    });
    it('keeps the last good live result on scheduler failure and avoids reading all history each minute', async () => {
        await service.refreshClosed(now); const saved=rows.get(LIVE_ID);
        deps.readDays.mockClear(); deps.summarize.mockClear();
        await service.refreshClosed(new Date(now.getTime()+60000));
        expect(deps.readDays).toHaveBeenCalledTimes(1); expect(deps.readDays).toHaveBeenCalledWith([]);
        expect(deps.summarize).toHaveBeenCalledTimes(1);
        deps.summarize.mockRejectedValueOnce(new Error('failed refresh'));
        const latest=rows.get(LIVE_ID);
        await expect(service.refreshClosed(new Date(now.getTime()+120000))).rejects.toThrow('failed refresh');
        expect(rows.get(LIVE_ID)).toEqual(latest); expect(saved).toBeDefined();
    });
    it('transfers only summary first and pages all visitor details without recalculating a range', async () => {
        sources.logs=Array.from({length:61},(_,i)=>log('2026-09-22',`member-${i}`));
        await service.refreshClosed(now); deps.summarize.mockClear();
        const range=args('2026-09-21','2026-09-22');
        const summary:any=await service.getReport({...range,report_part:'summary'},now);
        expect(summary.userCount).toBe(61); expect(summary.report.users).toEqual([]);
        expect(summary.report.summary.daily_details.every((d:any)=>d.events.length===0)).toBe(true);
        const seen=[];
        for (const offset of [0,25,50]) {
            const page:any=await service.getReport({...range,report_part:'users',offset,limit:25},now);
            expect(page.total).toBe(61); seen.push(...page.report.users.map((u:any)=>u.user_id));
        }
        expect(new Set(seen).size).toBe(61); expect(deps.summarize).toHaveBeenCalledTimes(1);
        await service.getReport({...range,report_part:'summary',force_refresh:true},now);
        expect(deps.summarize.mock.calls.length).toBeGreaterThan(1);
    });
    it('keeps transitive admin links independent of source order and KST pattern boundaries unchanged', async () => {
        const chain=Array.from({length:80},(_,i)=>log('2026-09-21','',{session_id:`s-${i}`,fingerprint:`f-${i}`,is_admin:i===0}));
        chain.push(...Array.from({length:79},(_,i)=>log('2026-09-21','',{session_id:`s-${i}`,fingerprint:`f-${i+1}`})));
        sources.logs=[...chain.reverse(),log('2026-09-23','',{session_id:'last',fingerprint:'f-79'}),log('2026-09-23','normal',{created_at:'2026-09-22T15:00:00Z'})];
        await service.refreshClosed(now);
        const result:any=await service.getReport(args('2026-09-23'),now);
        expect(result.report.summary.user_clicks).toBe(1); expect(result.report.summary.anon_clicks).toBe(0);
        expect(result.report.summary.visitor_stats.hourly[0].count).toBe(1);
        expect(result.report.summary.visitor_stats.weekday[3].count).toBe(1);
    });

    it('refreshes only today from a mixed period without rebuilding finalized days', async () => {
        await service.refreshClosed(now); const saved=rows.get(id('2026-09-22'));
        sources.logs.push(log('2026-09-22','late-change'),log('2026-09-23','new-user'));
        deps.saveRow.mockClear();
        const result:any=await service.getReport({...args('2026-09-22','2026-09-23'),force_refresh:true,refresh_today:true},now);
        expect(rows.get(id('2026-09-22'))).toEqual(saved);
        expect(deps.saveRow).toHaveBeenCalledTimes(1);
        expect(result.report.summary.user_clicks).toBe(2);
    });

});
