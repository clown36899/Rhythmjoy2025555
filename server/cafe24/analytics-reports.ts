import { gzipSync, gunzipSync } from 'node:zlib';
import { getAnalyticsSummaryV2, loadAnalyticsUsers, loadCafe24TableRows, saveCafe24TableRow } from './generic-data-api.js';
import { getMysqlPool } from './mysql-pool.js';
import { buildAnalyticsReport } from './analytics-report-builder';

export interface AnalyticsSources {
    logs: any[]; sessions: any[]; boardUsers: any[]; boardAdmins: any[]; analyticsUsers: any[]; pwaInstalls: any[];
}
const VERSION = 2;
const DAY = 86400000;
const SETTLE_MS = 35 * 60000; // Existing logical sessions have a 30 minute inactivity boundary.
const dayKey = (date: Date) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00+09:00`);
const idFor = (day: string) => `analytics-report:v${VERSION}:${day}:${day}`;
const emptySources = (): AnalyticsSources => ({ logs: [], sessions: [], boardUsers: [], boardAdmins: [], analyticsUsers: [], pwaInstalls: [] });
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
const daysBetween = (start: string, end: string) => {
    if (!validDay(start) || !validDay(end) || start > end || dayStart(end) - dayStart(start) > 365 * DAY) throw new Error('조회 기간은 올바른 날짜로 최대 366일까지 지정해 주세요.');
    const days: string[] = [];
    for (let ms = dayStart(start); ms <= dayStart(end); ms += DAY) days.push(dayKey(new Date(ms)));
    return days;
};
const inRange = (value: unknown, start: number, end: number) => {
    const ms = new Date(String(value || '')).getTime();
    return Number.isFinite(ms) && ms >= start && ms <= end;
};

// Snapshot storage can exceed the legacy MySQL packet limit when both report
// details and merge inputs are retained. Compress all days, not selected dates.
export function encodeAnalyticsSnapshot(row: any) {
    const { report, inputs, ...metadata } = row;
    return { ...metadata, report_encoding: 'gzip-base64-v1',
        report: gzipSync(Buffer.from(JSON.stringify({ report, inputs }))).toString('base64') };
}
export function decodeAnalyticsSnapshot(row: any) {
    if (row?.report_encoding !== 'gzip-base64-v1') return row;
    try {
        const payload = JSON.parse(gunzipSync(Buffer.from(row.report, 'base64')).toString('utf8'));
        return { ...row, report: payload.report, inputs: payload.inputs };
    } catch {
        // Incomplete/corrupted derived data is pending until the scheduler repairs
        // it; reading it must not trigger a raw-ledger rebuild in the request.
        return { ...row, report: null, inputs: null };
    }
}

async function loadSources(): Promise<AnalyticsSources> {
    const [logs, sessions, boardUsers, boardAdmins, analyticsUsers, pwaInstalls] = await Promise.all([
        loadCafe24TableRows('site_analytics_logs'), loadCafe24TableRows('session_logs'),
        loadCafe24TableRows('board_users'), loadCafe24TableRows('board_admins'), loadAnalyticsUsers(), loadCafe24TableRows('pwa_installs'),
    ]);
    return { logs, sessions, boardUsers, boardAdmins, analyticsUsers, pwaInstalls };
}
async function readDays(days: string[]) {
    if (!days.length) return [];
    const ids = [...days.map(idFor), `analytics-report:v${VERSION}:coverage`];
    const [rows] = await getMysqlPool().execute(
        `SELECT data_json FROM generic_records WHERE table_name = ? AND record_id IN (${ids.map(() => '?').join(',')})`,
        ['site_usage_stats', ...ids],
    );
    return rows.map((row: any) => JSON.parse(row.data_json));
}
async function withLock<T>(run: () => Promise<T>): Promise<T | null> {
    const connection = await getMysqlPool().getConnection();
    try {
        const [rows] = await connection.execute("SELECT GET_LOCK('swingenjoy:analytics-reports', 0) AS acquired");
        if (Number(rows[0]?.acquired) !== 1) return null;
        try { return await run(); }
        finally { await connection.execute("SELECT RELEASE_LOCK('swingenjoy:analytics-reports')"); }
    } finally { connection.release(); }
}

// Dependency injection keeps scheduling and read-vs-rebuild boundaries testable
// without duplicating the calculator or touching operational data.
export function createAnalyticsReportService(deps = { loadSources, readDays, saveRow: saveCafe24TableRow, withLock, summarize: getAnalyticsSummaryV2 }) {
    const isComplete = (row: any, day: string) => row?.id === idFor(day) && row.report_version === VERSION
        && row.report?.summary && Array.isArray(row.report.users) && Array.isArray(row.report.guests)
        && Number.isFinite(row.report.summary.total_clicks)
        && ['daily_details', 'total_top_items', 'total_sections', 'type_breakdown'].every(key => Array.isArray(row.report.summary[key]))
        && row.inputs && Object.keys(emptySources()).every(key => Array.isArray(row.inputs[key]));
    const calculate = async (start: string, end: string, sources: AnalyticsSources) => {
        const args = { start_date: `${start}T00:00:00+09:00`, end_date: `${end}T23:59:59.999+09:00` };
        const core: any = await deps.summarize(args, sources);
        const from = dayStart(start), to = dayStart(end) + DAY - 1;
        const installs = sources.pwaInstalls.filter(row => inRange(row.installed_at, from, to));
        const userIds = new Set([...core.report_rows.logs, ...core.report_rows.sessions, ...installs].map(row => String(row.user_id || '')).filter(Boolean));
        const emails = new Set([
            ...sources.boardUsers.filter(row => userIds.has(String(row.user_id))).map(row => row.email || row.admin_email),
            ...sources.analyticsUsers.filter(row => userIds.has(String(row.id))).map(row => row.email),
        ].filter(Boolean).map(email => String(email).trim().toLowerCase()));
        const relevant = (row: any, id: string) => userIds.has(String(row[id])) || Boolean((row.email || row.admin_email) && emails.has(String(row.email || row.admin_email).trim().toLowerCase()));
        const inputs: AnalyticsSources = {
            logs: core.report_rows.logs, sessions: core.report_rows.sessions,
            pwaInstalls: installs,
            boardUsers: sources.boardUsers.filter(row => relevant(row, 'user_id')).map(({ user_id, email, admin_email, nickname, is_admin }) => ({ user_id, email, admin_email, nickname, is_admin })),
            boardAdmins: sources.boardAdmins.map(({ user_id, email, admin_email }) => ({ user_id, email, admin_email })),
            analyticsUsers: sources.analyticsUsers.filter(row => relevant(row, 'id')),
        };
        return { report: buildAnalyticsReport(args.start_date, args.end_date, inputs, core), inputs };
    };
    const saveDay = async (day: string, sources: AnalyticsSources) => {
        const result = await calculate(day, day, sources);
        const row = { id: idFor(day), report_version: VERSION, ...result,
            snapshot_time: `${day}T23:59:59.999+09:00`, updated_at: new Date().toISOString() };
        await deps.saveRow('site_usage_stats', encodeAnalyticsSnapshot(row), ['id']);
        return row;
    };
    const refreshClosed = async (now = new Date()) => deps.withLock(async () => {
        const lastDay = dayKey(new Date(now.getTime() - SETTLE_MS - DAY));
        // Sources are loaded once per scheduler run; already finalized days never rebuild.
        const sources = await deps.loadSources();
        const firstMs = [...sources.logs.map(row => row.created_at), ...sources.sessions.map(row => row.session_start || row.created_at)]
            .reduce((min, value) => Number.isFinite(Date.parse(value)) ? Math.min(min, Date.parse(value)) : min, dayStart(lastDay) - 365 * DAY);
        const first = dayKey(new Date(firstMs));
        const days: string[] = [];
        for (let ms = dayStart(first); ms <= dayStart(lastDay); ms += DAY) days.push(dayKey(new Date(ms)));
        // Bound SQL parameter count for longer-lived sites without limiting report history.
        let finalized = 0;
        for (let offset = 0; offset < days.length; offset += 366) {
            const chunk = days.slice(offset, offset + 366);
            const rows = (await deps.readDays(chunk)).map(decodeAnalyticsSnapshot);
            const existing = new Map(rows.map((row: any) => [row.id, row]));
            for (const day of chunk) {
                if (isComplete(existing.get(idFor(day)), day)) continue;
                await saveDay(day, sources);
                finalized += 1;
            }
        }
        await deps.saveRow('site_usage_stats', { id: `analytics-report:v${VERSION}:coverage`, first_day: first, last_day: lastDay, report_version: VERSION }, ['id']);
        return { finalized, firstDay: first, lastDay };
    });
    const getReport = async (args: any, now = new Date()) => {
        const start = String(args.start_date || '').slice(0, 10), end = String(args.end_date || '').slice(0, 10);
        const days = daysBetween(start, end), today = dayKey(now);
        if (end > today) throw new Error('미래 날짜의 방문자 통계는 조회할 수 없습니다.');
        const closed = days.filter(day => day < today);
        if (args.force_refresh === true) {
            const done = await deps.withLock(async () => {
                const sources = await deps.loadSources();
                for (const day of closed) await saveDay(day, sources);
                return true;
            });
            if (!done) return { status: 'pending', missingDays: closed };
        }
        const rows = (await deps.readDays(closed)).map(decodeAnalyticsSnapshot);
        const byId = new Map(rows.map((row: any) => [row.id, row]));
        const coverage: any = byId.get(`analytics-report:v${VERSION}:coverage`);
        if (coverage?.first_day) {
            // The closing scan establishes that dates before the source history are
            // empty. This is distinct from a missing report within known history.
            for (const day of closed.filter(day => day < coverage.first_day)) {
                const empty = await calculate(day, day, emptySources());
                byId.set(idFor(day), { id: idFor(day), report_version: VERSION, ...empty });
            }
        }
        const missing = closed.filter(day => !isComplete(byId.get(idFor(day)), day));
        if (missing.length) return { status: 'pending', missingDays: missing }; // A read never becomes a backfill.
        if (days.length === 1 && end < today) {
            return { status: 'ready', source: 'daily_snapshot', report: (byId.get(idFor(end)) as any).report };
        }
        const merged = emptySources();
        const append = (sources: AnalyticsSources) => {
            for (const key of Object.keys(merged) as (keyof AnalyticsSources)[]) merged[key].push(...sources[key]);
        };
        for (const day of closed) append((byId.get(idFor(day)) as any).inputs);
        if (end === today) {
            const current = await calculate(today, today, await deps.loadSources());
            if (days.length === 1) return { status: 'ready', source: 'live', report: current.report };
            append(current.inputs);
        }
        // Combine frozen per-day inputs, preserving cross-day identity deduplication.
        // Never reread past raw ledgers or sum daily unique counts for a period total.
        const combined = await calculate(start, end, merged);
        return { status: 'ready', source: end === today ? 'live' : 'saved_days', report: combined.report };
    };
    return { refreshClosed, getReport };
}
const service = createAnalyticsReportService();
export const refreshClosedAnalyticsReports = service.refreshClosed;
export const getAnalyticsReport = service.getReport;
