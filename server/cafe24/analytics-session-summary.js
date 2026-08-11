export const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const ANALYTICS_SESSION_DURATION_CAP_SECONDS = 30 * 60;

function cappedDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(0, Math.floor(parsed)), ANALYTICS_SESSION_DURATION_CAP_SECONDS);
}

function pageViewCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function averageDuration(rows) {
  const completed = rows.filter((row) => row.hasDuration);
  if (!completed.length) return 0;
  return Math.round(completed.reduce((sum, row) => sum + row.durationSeconds, 0) / completed.length);
}

function medianDuration(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2) return values[middle];
  return Math.round((values[middle - 1] + values[middle]) / 2);
}

/**
 * Build the headline session metrics from already purity-filtered server rows.
 * `visitorKey` must use the same identity resolver and Android handoff bridge as
 * the unique-visitor summary so every headline shares one counting contract.
 */
export function buildAnalyticsSessionSummary(rows = [], visitorKey = (_row, index) => `session:${index}`) {
  const normalized = rows
    .map((row, index) => {
      const startMs = Date.parse(row?.session_start || row?.created_at || '');
      const duration = cappedDuration(row?.duration_seconds);
      return {
        row,
        visitorKey: visitorKey(row, index),
        startMs,
        endMs: startMs + ((duration || 0) * 1000),
        durationSeconds: duration || 0,
        hasDuration: duration !== null,
        pageViews: pageViewCount(row?.page_views),
        totalClicks: Math.max(0, Number(row?.total_clicks) || 0),
        isPwa: row?.is_pwa === true || row?.is_pwa === 1 || String(row?.is_pwa || '').toLowerCase() === 'true',
      };
    })
    .filter((row) => Number.isFinite(row.startMs))
    .sort((a, b) => a.visitorKey.localeCompare(b.visitorKey) || a.startMs - b.startMs);

  const logical = [];
  for (const session of normalized) {
    const previous = logical.at(-1);
    const previousEnd = previous ? Math.max(previous.endMs, previous.startMs) : 0;
    const shouldMerge = previous?.visitorKey === session.visitorKey
      && session.startMs - previousEnd <= ANALYTICS_SESSION_TIMEOUT_MS;

    if (!shouldMerge) {
      logical.push({ ...session, rawSessionCount: 1 });
      continue;
    }

    previous.endMs = Math.max(previous.endMs, session.endMs, session.startMs);
    previous.durationSeconds = Math.min(
      ANALYTICS_SESSION_DURATION_CAP_SECONDS,
      Math.floor(Math.max(0, previous.endMs - previous.startMs) / 1000),
    );
    previous.hasDuration = previous.hasDuration || session.hasDuration;
    previous.pageViews += session.pageViews;
    previous.totalClicks += session.totalClicks;
    previous.isPwa = previous.isPwa || session.isPwa;
    previous.rawSessionCount += 1;
  }

  const completedDurations = logical
    .filter((row) => row.hasDuration)
    .map((row) => row.durationSeconds)
    .sort((a, b) => a - b);
  const engaged = logical.filter((row) => (
    row.durationSeconds > 10 || row.totalClicks > 0 || row.pageViews >= 2
  ));
  const pwa = logical.filter((row) => row.isPwa);
  const browser = logical.filter((row) => !row.isPwa);
  const total = logical.length;

  return {
    total_sessions: total,
    raw_sessions: rows.length,
    completed_sessions: completedDurations.length,
    avg_duration: completedDurations.length
      ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
      : 0,
    median_duration: medianDuration(completedDurations),
    engagement_rate: total ? (engaged.length / total) * 100 : 0,
    bounce_rate: total ? ((total - engaged.length) / total) * 100 : 0,
    duration_cap_seconds: ANALYTICS_SESSION_DURATION_CAP_SECONDS,
    pwa_sessions: pwa.length,
    browser_sessions: browser.length,
    pwa_percentage: total ? (pwa.length / total) * 100 : 0,
    avg_pwa_duration: averageDuration(pwa),
    avg_browser_duration: averageDuration(browser),
  };
}
