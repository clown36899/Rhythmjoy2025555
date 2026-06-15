import crypto from 'node:crypto';

export const ANALYTICS_BOT_UA_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|curl|wget|python-requests|gptbot|chatgpt|oai-searchbot|openai|claude|anthropic|perplexity|bytespider|ccbot|googleother|google-extended|cohere|mistralai|amazonbot|applebot-extended/i;
export const ANALYTICS_KIOSK_ROUTE_PATTERN = /^\/(?:kiosk|키오스크)(?:\/|$)/i;
export const ANALYTICS_INTERNAL_ROUTE_PATTERN = /^\/(?:admin|test|main-v2-test|debug|__|api|kiosk|키오스크)(?:\/|$)/i;

function splitConfiguredValues(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function analyticsRowPath(row = {}) {
  return String(row.page_url || row.route || row.entry_page || row.exit_page || row.path || row.pathname || row.target_id || '');
}

export function isAnalyticsBotUserAgent(userAgent = '') {
  return Boolean(userAgent && ANALYTICS_BOT_UA_PATTERN.test(String(userAgent)));
}

export function isAnalyticsBotRow(row = {}) {
  return isAnalyticsBotUserAgent(row.user_agent);
}

export function isAnalyticsInternalRouteRow(row = {}) {
  return ANALYTICS_INTERNAL_ROUTE_PATTERN.test(analyticsRowPath(row))
    || String(row.section || '').includes('admin')
    || String(row.target_id || row.targetId || '').startsWith('admin_');
}

export function analyticsClientIp(row = {}) {
  return row.client_ip || row.ip_address || row.ip || null;
}

export function analyticsIpHash(value = '') {
  const ip = String(value || '').replace(/^::ffff:/, '').trim();
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

export function analyticsConfiguredExcludedIpHashes() {
  return new Set([
    ...splitConfiguredValues(process.env.ANALYTICS_EXCLUDED_IP_HASHES),
    ...splitConfiguredValues(process.env.ANALYTICS_KIOSK_IP_HASHES),
  ]);
}

export function analyticsConfiguredExcludedIps() {
  return new Set([
    ...splitConfiguredValues(process.env.ANALYTICS_EXCLUDED_IPS),
    ...splitConfiguredValues(process.env.ANALYTICS_KIOSK_IPS),
  ]);
}

export function isAnalyticsExcludedIpRow(row = {}) {
  const configuredIps = analyticsConfiguredExcludedIps();
  const configuredHashes = analyticsConfiguredExcludedIpHashes();
  const clientIp = analyticsClientIp(row);
  const rowIpHash = row.ip_hash || row.ipHash || null;

  if (clientIp && configuredIps.has(String(clientIp).replace(/^::ffff:/, '').trim())) return true;
  if (rowIpHash && configuredHashes.has(String(rowIpHash))) return true;

  const computedHash = analyticsIpHash(clientIp);
  return Boolean(computedHash && configuredHashes.has(computedHash));
}

export function isAnalyticsDatacenterIp(value = '') {
  const ip = String(value || '').replace(/^::ffff:/, '').trim();
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;

  // Public cloud/DC ranges that should not count as real visitor traffic.
  if (a === 44 && b >= 192) return true; // AWS EC2
  if ([3, 13, 18, 34, 35, 52, 54].includes(a)) return true; // AWS/GCP/Azure common public cloud ranges
  return false;
}

export function isAnalyticsDatacenterRow(row = {}) {
  return isAnalyticsDatacenterIp(analyticsClientIp(row));
}

export function analyticsGuestDeviceIdentity(row = {}) {
  const raw = `${row.platform || ''} ${row.user_agent || ''}`.toLowerCase();
  if (raw.includes('ipad')) return 'ipad';
  if (raw.includes('iphone') || raw.includes('ios') || raw.includes('crios')) return 'iphone';
  if (raw.includes('android')) return 'android';
  if (raw.includes('windows') || raw.includes('win32') || raw.includes('win64') || raw.includes('wow64')) return 'windows';
  if (raw.includes('mac os') || raw.includes('macintosh') || raw.includes('macintel') || raw.includes('macos')) return 'macos';
  if (raw.includes('cros') || raw.includes('chrome os')) return 'chromeos';
  if (raw.includes('linux') || raw.includes('x11')) return 'linux';
  return row.platform ? String(row.platform).trim().toLowerCase() : 'unknown';
}

export function analyticsGuestNetworkIdentity(row = {}) {
  const network = row.ip_hash || analyticsClientIp(row);
  if (!network) return null;
  return `${String(network)}:${analyticsGuestDeviceIdentity(row)}`;
}

export function hasAnalyticsIdentityEvidence(row = {}) {
  return Boolean(row.user_id || row.userId || row.fingerprint || row.user_agent || row.platform);
}

export function analyticsKstDate(value) {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 9 * 60 * 60 * 1000);
}

export function analyticsKstDateKey(value) {
  const date = analyticsKstDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function analyticsKstMonthKey(value) {
  const dateKey = analyticsKstDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : null;
}

export function analyticsKstDisplayMonthKey(value) {
  const monthKey = analyticsKstMonthKey(value);
  return monthKey ? monthKey.replace('-', '.') : null;
}

export function analyticsKstWeekday(value) {
  const date = analyticsKstDate(value);
  return date ? date.getUTCDay() : null;
}

export function analyticsKstHour(value) {
  const date = analyticsKstDate(value);
  return date ? date.getUTCHours() : null;
}
