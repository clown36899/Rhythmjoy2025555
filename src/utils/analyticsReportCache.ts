import { cafe24 } from '../lib/cafe24Client';

// Bump when visitor identity, exclusion rules, or the report contract changes.
const REPORT_VERSION = 1;
export interface AnalyticsReport<Summary = any, User = any, Guest = any> {
    summary: Summary;
    users: User[];
    guests: Guest[];
}

export function closedAnalyticsReportId(start: string, end: string, now = new Date()): string | null {
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!validDate(start) || !validDate(end) || start > end || end >= today) return null;
    return `analytics-report:v${REPORT_VERSION}:${start}:${end}`;
}

export async function readAnalyticsReport(id: string): Promise<AnalyticsReport | null> {
    // Always pass through the existing administrator authorization, even on repeat views.
    const { data, error } = await cafe24.from('site_usage_stats').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    const report = data?.report;
    if (data?.report_version !== REPORT_VERSION || !report || !report.summary
        || !Array.isArray(report.users) || !Array.isArray(report.guests)
        || !Number.isFinite(report.summary.total_clicks)
        || !['daily_details', 'total_top_items', 'total_sections', 'type_breakdown'].every(
            key => Array.isArray(report.summary[key]))) return null;
    return report;
}

export async function writeAnalyticsReport(id: string, end: string, report: AnalyticsReport): Promise<void> {
    const { error } = await cafe24.from('site_usage_stats').upsert({
        id,
        report_version: REPORT_VERSION,
        report,
        // Keep legacy current-day snapshots separate from closed-period reports.
        snapshot_time: `${end}T23:59:59.999+09:00`,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
}
