import { describe, expect, it } from 'vitest';
import { buildAnalyticsSessionSummary } from './analytics-session-summary.js';

describe('server analytics session summary', () => {
  it('merges split browser contexts for the same resolved visitor within 30 minutes', () => {
    const rows = [
      { session_start: '2026-08-11T05:35:00.000Z', duration_seconds: 120, page_views: 1, total_clicks: 1 },
      { session_start: '2026-08-11T05:38:00.000Z', duration_seconds: 180, page_views: 2, total_clicks: 2 },
    ];
    const summary = buildAnalyticsSessionSummary(rows, () => 'guest:shared-network-device:2026-08-11');

    expect(summary.raw_sessions).toBe(2);
    expect(summary.total_sessions).toBe(1);
    expect(summary.avg_duration).toBe(360);
    expect(summary.engagement_rate).toBe(100);
  });

  it('keeps sessions separated after the timeout and caps duration outliers', () => {
    const rows = [
      { session_start: '2026-08-11T00:00:00.000Z', duration_seconds: 9999, page_views: 1 },
      { session_start: '2026-08-11T01:00:01.000Z', duration_seconds: 0, page_views: 1 },
    ];
    const summary = buildAnalyticsSessionSummary(rows, () => 'guest:a');

    expect(summary.total_sessions).toBe(2);
    expect(summary.avg_duration).toBe(900);
    expect(summary.median_duration).toBe(900);
    expect(summary.duration_cap_seconds).toBe(1800);
  });

  it('uses logical sessions for PWA ratios', () => {
    const rows = [
      { session_start: '2026-08-11T00:00:00.000Z', duration_seconds: 60, is_pwa: true },
      { session_start: '2026-08-11T02:00:00.000Z', duration_seconds: 30, is_pwa: false },
    ];
    const summary = buildAnalyticsSessionSummary(rows, (_row, index) => `guest:${index}`);

    expect(summary.pwa_sessions).toBe(1);
    expect(summary.browser_sessions).toBe(1);
    expect(summary.pwa_percentage).toBe(50);
  });
});
