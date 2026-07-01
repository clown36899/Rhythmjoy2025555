import crypto from 'node:crypto';

export const ANALYTICS_BOT_UA_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|selenium|webdriver|curl|wget|python-requests|gptbot|chatgpt|oai-searchbot|openai|claude|anthropic|perplexity|bytespider|ccbot|googleother|google-extended|cohere|mistralai|amazonbot|applebot-extended/i;
export const ANALYTICS_KIOSK_ROUTE_PATTERN = /^\/(?:kiosk|키오스크)(?:\/|$)/i;
export const ANALYTICS_INTERNAL_ROUTE_PATTERN = /^\/(?:admin|test|main-v2-test|debug|__|api|kiosk|키오스크)(?:\/|$)/i;
export const ANALYTICS_DEFAULT_DATACENTER_IP_RULES = Object.freeze([
  '3.0.0.0/8',
  '13.0.0.0/8',
  '18.0.0.0/8',
  '34.0.0.0/8',
  '35.0.0.0/8',
  '44.192.0.0/10',
  '52.0.0.0/8',
  '54.0.0.0/8',
  '74.125.0.0/16',
  '103.4.248.0/22',
  '103.196.8.0/22',
  '104.168.0.0/17',
  '162.43.224.0/19',
]);

function splitConfiguredValues(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAnalyticsIp(value = '') {
  return String(value || '')
    .replace(/^::ffff:/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim();
}

function ipv4ToNumber(value = '') {
  const ip = normalizeAnalyticsIp(value);
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

export function analyticsIpMatchesRule(ipValue = '', ruleValue = '') {
  const ip = normalizeAnalyticsIp(ipValue);
  const rule = normalizeAnalyticsIp(ruleValue);
  if (!ip || !rule) return false;

  if (rule.includes('/')) {
    const [baseIp, prefixValue] = rule.split('/');
    const ipNumber = ipv4ToNumber(ip);
    const baseNumber = ipv4ToNumber(baseIp);
    const prefix = Number(prefixValue);
    if (
      ipNumber === null ||
      baseNumber === null ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > 32
    ) {
      return false;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNumber & mask) === (baseNumber & mask);
  }

  if (rule.endsWith('.*')) {
    return ip.startsWith(rule.slice(0, -1));
  }

  return ip === rule;
}

export function analyticsIpMatchesAnyRule(ipValue = '', rules = []) {
  const ip = normalizeAnalyticsIp(ipValue);
  if (!ip) return false;
  return rules.some((rule) => analyticsIpMatchesRule(ip, rule));
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
    ...splitConfiguredValues(process.env.ANALYTICS_EXCLUDED_IP_RANGES),
    ...splitConfiguredValues(process.env.ANALYTICS_KIOSK_IP_RANGES),
  ]);
}

export function isAnalyticsExcludedIpRow(row = {}) {
  const configuredIps = analyticsConfiguredExcludedIps();
  const configuredHashes = analyticsConfiguredExcludedIpHashes();
  const clientIp = analyticsClientIp(row);
  const rowIpHash = row.ip_hash || row.ipHash || null;

  if (clientIp && analyticsIpMatchesAnyRule(clientIp, Array.from(configuredIps))) return true;
  if (rowIpHash && configuredHashes.has(String(rowIpHash))) return true;

  const computedHash = analyticsIpHash(clientIp);
  return Boolean(computedHash && configuredHashes.has(computedHash));
}

export function analyticsConfiguredDatacenterIps() {
  return new Set([
    ...ANALYTICS_DEFAULT_DATACENTER_IP_RULES,
    ...splitConfiguredValues(process.env.ANALYTICS_DATACENTER_IPS),
    ...splitConfiguredValues(process.env.ANALYTICS_DATACENTER_IP_RANGES),
    ...splitConfiguredValues(process.env.ANALYTICS_BOT_IPS),
    ...splitConfiguredValues(process.env.ANALYTICS_BOT_IP_RANGES),
  ]);
}

export function isAnalyticsDatacenterIp(value = '') {
  return analyticsIpMatchesAnyRule(value, Array.from(analyticsConfiguredDatacenterIps()));
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
