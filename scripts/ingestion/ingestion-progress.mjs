import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

// One checkpoint owner for documents and their independently persisted children.
// URL alone cannot identify mutable cafe announcements; include their evidence.
export function ingestionItemKey(kind, sourceUrl, evidence) {
  const canonical = value => {
    // Instagram renews CDN hosts/signatures on each read. The media filename
    // identifies the poster; renewed delivery parameters are not new evidence.
    if (typeof value === 'string' && /^https:\/\/[^/]+\.cdninstagram\.com\//i.test(value)) {
      try { return `instagram-media:${new URL(value).pathname}`; } catch { /* Keep malformed evidence unchanged. */ }
    }
    return Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  };
  return `${kind}|${String(sourceUrl).replace(/\/+$/, '')}|${createHash('sha256').update(JSON.stringify(canonical(evidence))).digest('hex')}`;
}

export function completedDocumentKeys(documents = [], completedItems = []) {
  const completed = new Set(completedItems);
  return documents.filter(document => !document.failed
    && document.candidateKeys.every(key => completed.has(key))).map(document => document.key);
}

export function reopenFailedIngestionItems(completedItems = {}, failures = []) {
  const next = Object.fromEntries(Object.entries(completedItems).map(([id, keys]) => [id, [...keys]]));
  for (const failure of failures) {
    const url = String(failure.sourceUrl || '').replace(/\/+$/, '');
    if (!url || !next[failure.sourceId]) continue;
    // Reopen the failed occurrence and its containing document, not its successful siblings.
    next[failure.sourceId] = next[failure.sourceId].filter(key => !key.startsWith(`document|${url}|`)
      && !(failure.candidateId && key.startsWith(`candidate:${failure.candidateId}|${url}|`)));
  }
  return next;
}

export function progressFileForPriority(priority, directory = '', profile = 'swing-daily') {
  const baseDirectory = directory || path.join(os.homedir(), 'ingestion-runs', 'state');
  if (!/^(?:swing-daily|expanded-ingestion-(?:salsa|bachata|tango|street))$/.test(profile)) throw new Error('invalid progress profile');
  return path.join(baseDirectory, `${profile}-priority-${Number(priority)}.json`);
}

// The existing LaunchAgent supplies full-scan hours. Supplemental runs reuse
// the same job/lock and retry only unresolved regular socials occurring today.
export function isSupplementalRecoveryRun(fullScanHours = '', now = new Date(), lastDiscoveryAt) {
  if (!String(fullScanHours).trim()) return false;
  const hours = String(fullScanHours).split(',').map((value) => value.trim());
  if (hours.some((value) => !/^\d{1,2}$/.test(value) || Number(value) > 23)) return false;
  const hourOf = date => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(date));
  const hour = hourOf(now);
  // Each configured window discovers new/changed notices once. A delayed tick
  // catches up to the current window, without replaying every missed window.
  // Completion/deferred item keys still prevent reprocessing unchanged evidence.
  if (typeof lastDiscoveryAt === 'string') {
    const previous = new Date(lastDiscoveryAt);
    if (Number.isNaN(previous.getTime()) || previous > now) return false;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
    if (day.format(previous) !== day.format(now)) return false;
    const windowOf = currentHour => Math.max(-1, ...hours.map(Number).filter(value => value <= currentHour));
    return windowOf(hourOf(previous)) === windowOf(hour);
  }
  return !hours.map(Number).includes(hour);
}

export async function loadIngestionProgress(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return {
      remainingSources: Array.isArray(parsed.remainingSources)
        ? parsed.remainingSources.map(String).filter(Boolean)
        : [],
      lastCompletedAt: typeof parsed.lastCompletedAt === 'string' ? parsed.lastCompletedAt : '',
      lastDiscoveryAt: typeof parsed.lastDiscoveryAt === 'string' ? parsed.lastDiscoveryAt : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      completedItems: Object.fromEntries(Object.entries(parsed.completedItems || {})
        .map(([id, keys]) => [id, Array.isArray(keys) ? keys.filter(key => typeof key === 'string') : []])),
      deferredItems: Object.fromEntries(Object.entries(parsed.deferredItems || {}).map(([id, items]) => [id,
        Object.fromEntries(Object.entries(items || {}).map(([key, dates]) => [key,
          Array.isArray(dates) ? dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) : []]))])),
      instagramSeenPosts: Object.fromEntries(Object.entries(parsed.instagramSeenPosts || {})
        .map(([sourceId, urls]) => [
          String(sourceId),
          Array.isArray(urls) ? urls.map(String).filter(Boolean).slice(0, 96) : [],
        ])
        .filter(([, urls]) => urls.length > 0)),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return {
      remainingSources: [],
      lastCompletedAt: '',
      lastDiscoveryAt: '',
      updatedAt: '',
      instagramSeenPosts: {},
      completedItems: {},
      deferredItems: {},
    };
    throw error;
  }
}

export async function saveIngestionProgress(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export function reorderSourcesForResume(sources = [], remainingSources = [], remainingOnly = false) {
  const priority = new Map(remainingSources.map((id, index) => [String(id), index]));
  return sources.filter(source => !remainingOnly || priority.has(String(source.id))).sort((left, right) => {
    const leftIndex = priority.has(String(left.id)) ? priority.get(String(left.id)) : Number.MAX_SAFE_INTEGER;
    const rightIndex = priority.has(String(right.id)) ? priority.get(String(right.id)) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export function catchupInstagramPostLimit(baseLimit, lastCompletedAt, now = new Date()) {
  const base = Math.max(1, Number(baseLimit) || 1);
  if (!lastCompletedAt) return base;
  const completedAt = new Date(lastCompletedAt);
  if (Number.isNaN(completedAt.getTime())) return base;
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 86_400_000));
  if (elapsedDays <= 1) return base;
  return Math.min(8, Math.max(base, base + ((elapsedDays - 1) * 2)));
}

export function selectUnseenInstagramPosts(links = [], seenPosts = [], limit = 1, recheckCount = 0, completedItems) {
  const visible = [...new Set(links.map(String).filter(Boolean))];
  // Legacy URL checkpoints only prove that a post was opened. Once item-level
  // tracking is available, require its document checkpoint before skipping it.
  const seen = new Set(seenPosts.map(String).filter(url => url && (!Array.isArray(completedItems)
    || completedItems.some(key => key.startsWith(`document|${url.replace(/\/+$/, '')}|`)))));
  const unseen = visible.filter((url) => !seen.has(url));
  const recheck = visible.filter((url) => seen.has(url)).slice(0, Math.max(0, Number(recheckCount) || 0));
  // With verified checkpoints, unread/unfinished documents take priority so
  // recent completed posts cannot consume every slot of a bounded retry.
  return [...new Set(Array.isArray(completedItems) ? [...unseen, ...recheck] : [...recheck, ...unseen])]
    .slice(0, Math.max(1, Number(limit) || 1));
}

// A generated, unconfirmed occurrence is an outstanding collection obligation.
// Do not infer occurrences from rules here: absent administrator-deleted slots
// and confirmed closures must never be reopened by a collector.
export function findUnresolvedTodaySocialSources(events = [], sources = [], today = '') {
  const day = (event) => String(event.date || event.start_date || '').slice(0, 10);
  const generated = (event) => event.automation?.generated_by === 'regular-social-rolling-v1'
    || String(event.id || '').startsWith('regular-social:');
  const venue = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const todayEvents = events.filter((event) => day(event) === today);
  const unresolved = todayEvents.filter((event) => {
    if (!generated(event) || event.automation?.exception_type || event.genre === '휴무' || event.dj_name === '휴무') return false;
    if (event.dj_name && !/^(?:미정|DJ\s*미정|unknown|tbd)$/i.test(String(event.dj_name).trim())) return false;
    const location = venue(event.location || event.venue_name);
    return !todayEvents.some((actual) => actual !== event && !generated(actual)
      && (actual.category === 'social' || actual.activity_type === 'social')
      && location && venue(actual.location || actual.venue_name) === location);
  });
  return [...new Set(sources.filter((source) => {
    if (source.type === 'benefit_search' || source.saveEnabled === false) return false;
    if (source.allowedActivityTypes?.length && !source.allowedActivityTypes.includes('social')) return false;
    const weekday = new Date(`${today}T12:00:00+09:00`).getUTCDay();
    if (source.allowedWeekdays?.length && !source.allowedWeekdays.includes(weekday)) return false;
    return unresolved.some((event) => event.automation?.source_id === source.id
      || (source.venue && venue(source.venue) === venue(event.location || event.venue_name)));
  }).map((source) => String(source.id)))];
}

export function mergeSeenInstagramPosts(seenPosts = [], completedPosts = [], maxEntries = 96) {
  return [...new Set([
    ...completedPosts.map(String).filter(Boolean),
    ...seenPosts.map(String).filter(Boolean),
  ])].slice(0, Math.max(1, Number(maxEntries) || 32));
}

function comparableInstagramPostUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function reopenFailedInstagramPosts(seenPostsBySource = {}, failures = []) {
  const next = Object.fromEntries(Object.entries(seenPostsBySource || {}).map(([sourceId, urls]) => [
    String(sourceId),
    Array.isArray(urls) ? [...urls] : [],
  ]));

  for (const failure of failures || []) {
    const sourceId = String(failure?.sourceId || '').trim();
    const failedUrl = comparableInstagramPostUrl(failure?.sourceUrl);
    if (!sourceId || !failedUrl || !Array.isArray(next[sourceId])) continue;
    next[sourceId] = next[sourceId].filter((url) => comparableInstagramPostUrl(url) !== failedUrl);
    if (next[sourceId].length === 0) delete next[sourceId];
  }

  return next;
}

export function shouldAdvanceInstagramCheckpoint(sourceIssues = [], accessFailed = false) {
  return !accessFailed && !sourceIssues.some((issue) => /^(?:post|auto-register)\s+/i.test(String(issue || '').trim()));
}

export function buildIngestionProgressState({
  remainingSources = [],
  lastCompletedAt = '',
  lastDiscoveryAt = '',
  completed = false,
  instagramSeenPosts = {},
  completedItems = {},
  deferredItems = {},
  now = new Date(),
}) {
  const timestamp = now.toISOString();
  return {
    remainingSources: remainingSources.map(String).filter(Boolean),
    lastCompletedAt: completed ? timestamp : lastCompletedAt,
    lastDiscoveryAt,
    updatedAt: timestamp,
    instagramSeenPosts,
    completedItems,
    deferredItems,
  };
}
