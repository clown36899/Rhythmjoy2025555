import crypto from 'node:crypto';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
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

function matchesRule(event, rule) {
  const place = normalize(`${event?.location || ''} ${event?.venue_name || ''}`);
  const title = normalize(event?.title);
  return place.includes(normalize(rule.location))
    || title.includes(normalize(rule.title).replace(/소셜/g, ''));
}

function exceptionInfo(row) {
  const structured = row?.structured_data || {};
  const type = row?.exception_type || structured.exception_type;
  const date = String(structured.date || row?.date || '').slice(0, 10);
  const sourceId = String(row?.source_id || structured.source_id || '');
  if (!date || !['closure', 'recurring_closure'].includes(type)) return null;
  return { date, sourceId };
}

export function planRegularSocialReconciliation({
  events,
  scrapedEvents = [],
  rules = REGULAR_SOCIAL_RULES,
  today = dateKey(new Date()),
  horizonDays = 90,
}) {
  const endMs = dateAtNoonKst(today).getTime() + horizonDays * DAY_MS;
  const existingGenerated = new Map(
    events.filter(isGenerated).map((event) => [String(event.id), event]),
  );
  const explicitEvents = events.filter((event) => !isGenerated(event) && isSocial(event));
  const exceptions = scrapedEvents.map(exceptionInfo).filter(Boolean);
  const creates = [];
  const removes = [];
  const retained = [];

  for (const rule of rules) {
    for (let cursor = dateAtNoonKst(today).getTime(); cursor <= endMs; cursor += DAY_MS) {
      const date = new Date(cursor);
      if (date.getDay() !== rule.weekday) continue;
      const key = dateKey(date);
      const id = `regular-social:${rule.id}:${key}`;
      const generated = existingGenerated.get(id);
      const closed = exceptions.some((item) => item.date === key && item.sourceId === rule.sourceId);
      const explicit = explicitEvents.some((event) => eventDate(event) === key && matchesRule(event, rule));

      if (closed || explicit) {
        if (generated) removes.push(generated);
        continue;
      }
      if (generated) {
        retained.push(generated);
        continue;
      }

      const template = events.find((event) => matchesRule(event, rule) && (
        event.image || event.image_medium || event.image_thumbnail
      ));
      creates.push({
        id,
        title: rule.title,
        date: key,
        start_date: key,
        end_date: key,
        event_dates: [key],
        time: rule.time,
        location: rule.location,
        venue_name: rule.location,
        category: 'social',
        activity_type: 'social',
        dance_scope: 'swing',
        genre: '소셜',
        image: template?.image || template?.image_medium || template?.image_thumbnail || '',
        image_medium: template?.image_medium || '',
        image_thumbnail: template?.image_thumbnail || '',
        link1: template?.link1 || '',
        link_name1: template?.link_name1 || '',
        description: '정규 소셜 일정입니다. 휴무·특별행사·DJ 공지가 확인되면 자동으로 갱신됩니다.',
        organizer: 'Swing Enjoy',
        automation: {
          generated_by: GENERATED_BY,
          rule_id: rule.id,
          source_id: rule.sourceId,
          generated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        import_batch: GENERATED_BY,
      });
    }
  }

  for (const generated of existingGenerated.values()) {
    if (eventDate(generated) < today || eventDate(generated) > dateKey(new Date(endMs))) {
      if (!removes.some((item) => String(item.id) === String(generated.id))) removes.push(generated);
    }
  }

  return { creates, removes, retained, today, horizonDays };
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

export async function reconcileRegularSocials(req, res) {
  assertCronAccess(req);
  const [events, scrapedEvents] = await Promise.all([
    loadCafe24TableRows('events'),
    loadCafe24TableRows('scraped_events'),
  ]);
  const plan = planRegularSocialReconciliation({
    events,
    scrapedEvents,
    horizonDays: Math.max(30, Math.min(120, Number(req.body?.horizonDays || 90))),
  });
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === '1';
  if (!dryRun) {
    if (plan.removes.length) await deleteCafe24TableRows('events', plan.removes);
    for (const event of plan.creates) {
      await saveCafe24TableRow('events', event, ['id']);
    }
  }
  res.json({
    status: 'ok',
    dryRun,
    rules: REGULAR_SOCIAL_RULES.length,
    creates: plan.creates.length,
    removes: plan.removes.length,
    retained: plan.retained.length,
    preview: plan.creates.slice(0, 20).map(({ id, title, date, location }) => ({ id, title, date, location })),
    runId: crypto.randomUUID(),
  });
}
