export const ANALYTICS_BOT_UA_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|curl|wget|python-requests|gptbot|chatgpt|oai-searchbot|openai|claude|anthropic|perplexity|bytespider|ccbot|googleother|google-extended|cohere|mistralai|amazonbot|applebot-extended/i;
export const ANALYTICS_INTERNAL_ROUTE_PATTERN = /^\/(?:admin|test|main-v2-test|debug|__|api)(?:\/|$)/i;

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
