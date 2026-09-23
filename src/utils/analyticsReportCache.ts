import { cafe24 } from '../lib/cafe24Client';

// Browser reads server-owned reports. Closed days are created by the scheduled
// job; explicit repair uses the existing non-retrying snapshot mutation RPC.
export async function loadAnalyticsReport(start: string, end: string, rebuild = false) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const response = await Promise.race([
            cafe24.rpc(rebuild ? 'create_usage_snapshot' : 'get_analytics_summary_v2', {
                start_date: start, end_date: end, report: true,
            }),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('통계 응답 시간이 초과됐습니다. 다시 조회해 주세요.')), rebuild ? 120000 : 30000);
            }),
        ]);
        if (response.error) throw response.error;
        return response.data;
    } finally { if (timeout) clearTimeout(timeout); }
}
