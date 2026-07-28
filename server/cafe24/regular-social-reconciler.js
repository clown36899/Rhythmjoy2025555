import crypto from 'node:crypto';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
import { getMysqlPool } from './mysql-pool.js';
import { REGULAR_SOCIAL_RULES } from './regular-social-rules.js';

const DAY_MS = 86_400_000;
const GENERATED_BY = 'regular-social-rolling-v1';

function dateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function dateAtNoonKst(value) {
  return new Date(`${value}T12:00:00+09:00`);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s()[\]·._-]+/g, '');
}

function eventDate(event) {
  return String(event?.date || event?.start_date || '').slice(0, 10);
}

function isSocial(event) {
  const value = `${event?.category || ''} ${event?.activity_type || ''} ${event?.title || ''}`;
  return /social|소셜|정모/i.test(value) && !/class|강습|워크숍|워크샵/i.test(value);
}

function isGenerated(event) {
  return event?.automation?.generated_by === GENERATED_BY
    || String(event?.id || '').startsWith('regular-social:');
}

function recurringIdentity(value) {
  return normalize(value)
    .replace(/(?:월요일|화요일|수요일|목요일|금요일|토요일|일요일|월요|화요|수요|목요|금요|토요|일요)/g, '')
    .replace(/(?:소셜|정모|파티|공지|일정|디제이|dj)/gi, '');
}

function matchesRule(event, rule, source = null) {
  const place = normalize(`${event?.location || ''} ${event?.venue_name || ''}`);
  const title = normalize(event?.title);
  const context = normalize([
    event?.title,
    event?.location,
    event?.venue_name,
    event?.organizer,
    event?.link_name1,
    source?.keyword,
    source?.source_id,
  ].filter(Boolean).join(' '));
  const identity = recurringIdentity(rule.title);
  return place.includes(normalize(rule.location))
    || title.includes(normalize(rule.title).replace(/소셜/g, ''))
    || (identity.length >= 3 && context.includes(identity));
}

export function findGeneratedRegularSocialReplacements(events, explicitEvent, source = null) {
  if (!isSocial(explicitEvent)) return [];
  const date = eventDate(explicitEvent);
  if (!date) return [];
  return events.filter((event) => {
    if (!isGenerated(event) || eventDate(event) !== date) return false;
    const generatedRule = {
      title: event.title || '',
      location: event.location || event.venue_name || '',
    };
    return matchesRule(explicitEvent, generatedRule, source);
  });
}

function exceptionInfo(row) {
  const structured = row?.structured_data || {};
  const type = row?.exception_type || structured.exception_type;
  const date = String(structured.date || row?.date || '').slice(0, 10);
  const sourceId = String(row?.source_id || structured.source_id || '');
  if (!date || !['closure', 'recurring_closure'].includes(type)) return null;
  return { date, sourceId };
}

function sameRegularSlot(left, right) {
  return Number(left.weekday) === Number(right.weekday)
    && normalize(left.location) === normalize(right.location);
}

function officialRuleId(partnerId, externalId) {
  const digest = crypto.createHash('sha256')
    .update(`${partnerId}\0${externalId}`)
    .digest('hex')
    .slice(0, 24);
  return `api:${digest}`;
}

function officialExceptionInfo(row) {
  return {
    ruleId: String(row.rule_id || row.ruleId || ''),
    date: String(row.date || '').slice(0, 10),
    type: row.type,
    title: row.title || null,
    time: row.time || null,
    location: row.location || null,
    venueName: row.venueName || null,
    djName: row.djName || null,
    sourceUrl: row.sourceUrl || null,
    description: row.description || null,
    externalId: row.externalId || null,
  };
}

export function planRegularSocialReconciliation({
  events,
  scrapedEvents = [],
  rules = REGULAR_SOCIAL_RULES,
  officialRules = [],
  officialExceptions = [],
  today = dateKey(new Date()),
  horizonDays = 90,
}) {
  const endMs = dateAtNoonKst(today).getTime() + horizonDays * DAY_MS;
  const existingGenerated = new Map(
    events.filter(isGenerated).map((event) => [String(event.id), event]),
  );
  const explicitEvents = events.filter((event) => !isGenerated(event) && isSocial(event));
  const exceptions = scrapedEvents.map(exceptionInfo).filter(Boolean);
  const apiExceptions = officialExceptions.map(officialExceptionInfo)
    .filter((item) => item.ruleId && item.date && ['closure', 'override'].includes(item.type));
  const fallbackRules = rules.filter((rule) => !officialRules.some((official) => sameRegularSlot(rule, official)));
  const effectiveRules = [...fallbackRules, ...officialRules];
  const creates = [];
  const removes = [];
  const retained = [];
  const consideredIds = new Set();

  for (const rule of effectiveRules) {
    for (let cursor = dateAtNoonKst(today).getTime(); cursor <= endMs; cursor += DAY_MS) {
      const date = new Date(cursor);
      if (date.getDay() !== rule.weekday) continue;
      const key = dateKey(date);
      if (rule.validFrom && key < rule.validFrom) continue;
      if (rule.validUntil && key > rule.validUntil) continue;
      const id = `regular-social:${rule.id}:${key}`;
      consideredIds.add(id);
      const generated = existingGenerated.get(id);
      const closed = exceptions.some((item) => item.date === key && item.sourceId === rule.sourceId);
      const apiException = apiExceptions.find((item) => item.date === key && item.ruleId === rule.id);
      const explicit = explicitEvents.some((event) => eventDate(event) === key && matchesRule(event, rule));

      if (apiException?.type === 'closure' || closed || explicit) {
        if (generated) removes.push(generated);
        continue;
      }
      const override = apiException?.type === 'override' ? apiException : null;
      const desiredTitle = override?.title || rule.title;
      const desiredTime = override?.time || rule.time;
      const desiredLocation = override?.location || rule.location;
      const desiredDjName = override?.djName || '미정';
      const hasGeneratedPoster = Boolean(
        generated?.image
        || generated?.image_medium
        || generated?.image_thumbnail
        || generated?.image_full
      );
      const generatedNeedsUpdate = generated && (
        generated.title !== desiredTitle
        || generated.time !== desiredTime
        || generated.location !== desiredLocation
        || String(generated.dj_name || '') !== desiredDjName
        || String(generated.automation?.exception_id || '') !== String(override?.externalId || '')
        || hasGeneratedPoster
      );
      if (generated && !generatedNeedsUpdate) {
        retained.push(generated);
        continue;
      }
      if (generatedNeedsUpdate) removes.push(generated);

      const venueTemplate = events.find((event) => matchesRule(event, rule) && (
        event.address || event.location_link || event.venue_id
      ));
      creates.push({
        id,
        title: desiredTitle,
        date: key,
        start_date: key,
        end_date: key,
        event_dates: [key],
        time: desiredTime,
        location: desiredLocation,
        venue_name: override?.venueName || override?.location || rule.location,
        address: venueTemplate?.address || desiredLocation,
        location_link: venueTemplate?.location_link || '',
        venue_id: venueTemplate?.venue_id || null,
        dj_name: desiredDjName,
        category: 'social',
        activity_type: 'social',
        dance_scope: 'swing',
        genre: '소셜',
        image: '',
        image_full: '',
        image_medium: '',
        image_thumbnail: '',
        link1: override?.sourceUrl || rule.sourceUrl || '',
        link_name1: override?.sourceUrl || rule.sourceUrl ? '공식 안내' : '',
        description: override?.description
          || (override?.djName ? `DJ ${override.djName}` : 'DJ 미정 · 정규 소셜 일정입니다. 공식 공지 확인 시 갱신됩니다.'),
        organizer: 'Swing Enjoy',
        automation: {
          generated_by: GENERATED_BY,
          rule_id: rule.id,
          source_id: rule.sourceId,
          official_api: Boolean(rule.officialApi),
          exception_id: override?.externalId || null,
          generated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        import_batch: GENERATED_BY,
      });
    }
  }

  for (const generated of existingGenerated.values()) {
    if (
      eventDate(generated) < today
      || eventDate(generated) > dateKey(new Date(endMs))
      || !consideredIds.has(String(generated.id))
    ) {
      if (!removes.some((item) => String(item.id) === String(generated.id))) removes.push(generated);
    }
  }

  return { creates, removes, retained, today, horizonDays };
}

async function loadOfficialRegularSocialData() {
  const pool = getMysqlPool();
  try {
    const [ruleRows] = await pool.execute(
      `SELECT partner_id, external_id, title, weekday, time_text, location, venue_name,
              source_url, source_id, DATE_FORMAT(valid_from, '%Y-%m-%d') AS valid_from,
              DATE_FORMAT(valid_until, '%Y-%m-%d') AS valid_until
         FROM external_regular_social_rules
        WHERE is_active = 1`,
    );
    const [exceptionRows] = await pool.execute(
      `SELECT partner_id, rule_external_id, external_id, exception_date, exception_type,
              title, time_text, location, venue_name, dj_name, source_url, description,
              DATE_FORMAT(exception_date, '%Y-%m-%d') AS exception_date_text
         FROM external_regular_social_exceptions
        WHERE exception_date >= CURDATE()`,
    );
    return {
      rules: ruleRows.map((row) => ({
        id: officialRuleId(row.partner_id, row.external_id),
        externalId: row.external_id,
        title: row.title,
        weekday: Number(row.weekday),
        time: row.time_text || '',
        location: row.location,
        venueName: row.venue_name || row.location,
        sourceUrl: row.source_url || '',
        sourceId: row.source_id || row.external_id,
        validFrom: row.valid_from || null,
        validUntil: row.valid_until || null,
        officialApi: true,
      })),
      exceptions: exceptionRows.map((row) => ({
        ruleId: officialRuleId(row.partner_id, row.rule_external_id),
        externalId: row.external_id,
        date: row.exception_date_text,
        type: row.exception_type,
        title: row.title,
        time: row.time_text,
        location: row.location,
        venueName: row.venue_name,
        djName: row.dj_name,
        sourceUrl: row.source_url,
        description: row.description,
      })),
    };
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return { rules: [], exceptions: [] };
    throw error;
  }
}

function assertCronAccess(req) {
  const expected = process.env.PUSH_CRON_TOKEN || '';
  const provided = req.headers['x-cron-token'] || req.query?.token || req.body?.token || '';
  const local = process.env.NODE_ENV !== 'production'
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(req.socket?.remoteAddress || ''));
  if (!local && (!expected || provided !== expected)) {
    const error = new Error(expected ? 'Invalid cron token' : 'PUSH_CRON_TOKEN is required');
    error.statusCode = expected ? 403 : 503;
    throw error;
  }
}

export async function runRegularSocialReconciliation({ horizonDays = 90, dryRun = false } = {}) {
  const [events, scrapedEvents, official] = await Promise.all([
    loadCafe24TableRows('events'),
    loadCafe24TableRows('scraped_events'),
    loadOfficialRegularSocialData(),
  ]);
  const plan = planRegularSocialReconciliation({
    events,
    scrapedEvents,
    officialRules: official.rules,
    officialExceptions: official.exceptions,
    horizonDays: Math.max(30, Math.min(120, Number(horizonDays || 90))),
  });
  if (!dryRun) {
    if (plan.removes.length) await deleteCafe24TableRows('events', plan.removes);
    for (const event of plan.creates) {
      await saveCafe24TableRow('events', event, ['id']);
    }
  }
  return {
    status: 'ok',
    dryRun,
    rules: REGULAR_SOCIAL_RULES.length,
    officialRules: official.rules.length,
    creates: plan.creates.length,
    removes: plan.removes.length,
    retained: plan.retained.length,
    preview: plan.creates.slice(0, 20).map(({ id, title, date, location }) => ({ id, title, date, location })),
    runId: crypto.randomUUID(),
  };
}

export async function reconcileRegularSocials(req, res) {
  assertCronAccess(req);
  const result = await runRegularSocialReconciliation({
    horizonDays: req.body?.horizonDays || 90,
    dryRun: req.body?.dryRun === true || req.query?.dryRun === '1',
  });
  res.json(result);
}

export function startRegularSocialScheduler() {
  const intervalMs = 24 * 60 * 60 * 1000;
  const run = () => runRegularSocialReconciliation()
    .then((result) => console.log('[regular-socials]', JSON.stringify(result)))
    .catch((error) => console.error('[regular-socials] failed', error));
  const initialTimer = setTimeout(run, 30_000);
  const dailyTimer = setInterval(run, intervalMs);
  initialTimer.unref?.();
  dailyTimer.unref?.();
}
