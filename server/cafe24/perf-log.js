const PERF_LOG_DISABLED = process.env.CAFE24_PERF_LOG === 'disabled';
const PERF_LOG_ALL = process.env.CAFE24_PERF_LOG_ALL === 'true';
const PERF_LOG_THRESHOLD_MS = Number(process.env.CAFE24_PERF_LOG_THRESHOLD_MS || 200);

export function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

export function elapsedMs(startedAt) {
  return Math.round(nowMs() - startedAt);
}

export function perfShouldLog(ms, always = false, thresholdMs = PERF_LOG_THRESHOLD_MS) {
  return !PERF_LOG_DISABLED && (PERF_LOG_ALL || always || ms >= thresholdMs);
}

function safeText(value, max = 140) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function safeFilter(filter) {
  if (!filter || typeof filter !== 'object') return null;
  const value = filter.value;
  return {
    field: safeText(filter.field, 80),
    op: safeText(filter.op, 40),
    valueType: Array.isArray(value) ? 'array' : typeof value,
    valueSize: Array.isArray(value) ? value.length : String(value ?? '').length,
  };
}

function sessionHint(value) {
  const text = String(value || '');
  if (!text) return null;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

export function summarizeApiRequest(req) {
  const path = req.path || req.originalUrl || '';
  const body = req.body || {};
  const summary = {
    hasSessionCookie: String(req.headers.cookie || '').includes('swingenjoy_session='),
  };

  const cafe24DataMatch = path.match(/^\/api\/cafe24-data\/([^/]+)\/([^/?]+)/);
  if (cafe24DataMatch) {
    summary.table = decodeURIComponent(cafe24DataMatch[1]);
    summary.action = decodeURIComponent(cafe24DataMatch[2]);
    summary.selectSize = typeof body.select === 'string' ? body.select.length : 0;
    summary.filterCount = Array.isArray(body.filters) ? body.filters.length : 0;
    summary.filters = Array.isArray(body.filters) ? body.filters.slice(0, 6).map(safeFilter).filter(Boolean) : [];
    summary.orderCount = Array.isArray(body.orders) ? body.orders.length : 0;
    if (body.range) summary.range = body.range;
    if (body.single) summary.single = true;
    if (body.maybeSingle) summary.maybeSingle = true;
    if (body.count) summary.count = body.count;
    return summary;
  }

  const rpcMatch = path.match(/^\/api\/cafe24-rpc\/([^/?]+)/);
  if (rpcMatch) {
    summary.rpc = decodeURIComponent(rpcMatch[1]);
    summary.argKeys = Object.keys(body.args || {}).slice(0, 16);
    return summary;
  }

  if (path === '/api/analytics/session') {
    summary.analyticsAction = safeText(body.action || body.event_type || body.type, 60);
    summary.payloadIsAdmin = Boolean(body.is_admin);
    summary.payloadExcluded = Boolean(body.analytics_excluded);
    summary.sessionId = sessionHint(body.session_id || body.sessionId);
    summary.userId = sessionHint(body.user_id || body.userId);
    summary.fingerprint = sessionHint(body.fingerprint);
    summary.route = safeText(body.route || body.page_url || body.entry_page || body.exit_page, 120);
    return summary;
  }

  return summary;
}

export function perfLog(scope, payload = {}, level = 'log') {
  if (PERF_LOG_DISABLED) return;
  const line = `[perf:${scope}] ${JSON.stringify({
    at: new Date().toISOString(),
    ...payload,
  })}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createPerfTrace(scope, meta = {}, options = {}) {
  const startedAt = nowMs();
  let lastAt = startedAt;
  const steps = [];
  const always = Boolean(options.always);
  const thresholdMs = Number(options.thresholdMs || PERF_LOG_THRESHOLD_MS);

  return {
    mark(step, data = {}) {
      const current = nowMs();
      steps.push({
        step,
        ms: Math.round(current - startedAt),
        deltaMs: Math.round(current - lastAt),
        ...data,
      });
      lastAt = current;
    },
    end(data = {}) {
      const ms = elapsedMs(startedAt);
      if (perfShouldLog(ms, always, thresholdMs)) {
        perfLog(scope, { ...meta, ms, steps, ...data });
      }
      return ms;
    },
    error(error, data = {}) {
      const ms = elapsedMs(startedAt);
      perfLog(scope, {
        ...meta,
        ms,
        steps,
        error: error?.message || String(error),
        ...data,
      }, 'error');
      return ms;
    },
  };
}
