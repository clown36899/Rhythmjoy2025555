// Public DOM adapters only. Candidate validation, identity, persistence and
// registration remain owned by candidate-utils and the shared native runner.
import { alignYearlessDatesToPublication, isCollectableDate, normalizeSourceUrl, publicationDateKey } from './candidate-utils.mjs';
import { findSourceForCandidate } from './collection-registry.mjs';

export function supportsPublicScheduleSource(source) {
  return !source.discoveryOnly && (source.type === 'meetup'
    || /^https:\/\/pf\.kakao\.com\/_[A-Za-z0-9]+\/?$/.test(source.url));
}

export function publicPublicationDate(label, today) {
  const absolute = publicationDateKey(label);
  if (absolute) return absolute;
  const days = String(label).match(/^(\d+)일 전$/);
  if (days) return new Date(Date.parse(`${today}T12:00:00+09:00`) - Number(days[1]) * 86400000).toISOString().slice(0, 10);
  if (/^(?:오늘|방금 전|\d+(?:분|시간) 전)$/.test(String(label))) return today;
  return '';
}

function cleanPublicText(text) {
  // Access codes in a public channel footer are not event information.
  return String(text || '').replace(/[^\n]*(?:비번|비밀번호|password|access\s*code)[^\n]*/gi, '').trim();
}

export function publicScheduleRows(document, source, { today }) {
  const rows = [];
  const issues = [];
  const text = cleanPublicText(document.text);
  if (document.kind === 'meetup') {
    const date = String(document.date || '').slice(0, 10);
    if (!isCollectableDate(date, { today })) return { rows, issues };
    if (document.cancelled) return { rows, issues: ['cancelled occurrence'] };
    if (source.allowedActivityTypes?.length === 1 && source.allowedActivityTypes[0] === 'class') {
      const day = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T12:00:00+09:00`).getUTCDay()];
      const scheduleStart = text.indexOf('The Schedule');
      const headingPattern = /(?:^|\n)[^\p{L}\p{N}\n]*(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)[^\n]*/gu;
      const headings = [...text.slice(Math.max(0, scheduleStart)).matchAll(headingPattern)];
      const index = headings.findIndex(match => match[1] === day);
      if (scheduleStart < 0 || index < 0) return { rows, issues: ['dated class weekday program unverified'] };
      const program = text.slice(scheduleStart + headings[index].index, headings[index + 1] ? scheduleStart + headings[index + 1].index : undefined)
        .split(/Class Fee:|What to bring:|Follow us on:/i)[0];
      if (!/salsa|살사/i.test(program) || !/class|lesson|강습|수업/i.test(text.slice(0, scheduleStart))) return { rows, issues: ['salsa class program unverified'] };
      // Different venues in a shared timetable require review at the source.
      if (/Location:|Venue:/i.test(program)) return { rows, issues: ['weekday venue needs independent verification'] };
      if (!document.venue) return { rows, issues: ['occurrence venue missing'] };
      rows.push({ sourceUrl: normalizeSourceUrl(document.sourceUrl), date,
        title: `${document.title} · 강습`, activity: 'class',
        venue: document.venue.split(',')[0].trim(), address: document.venue.split(',').slice(1).join(',').trim(),
        venueProvenance: 'source_text', publishedAt: '', djText: '',
        text: `${date} ${document.dateLabel}\n${document.venue}\n${text.slice(0, scheduleStart)}\n${program}` });
      return { rows, issues };
    }
    // The dated card owns this occurrence. Never expand "every Thursday" or
    // mistake the attached lesson, old signup deadline, or chat host for it.
    if (!/social|party|night|소셜|파티|정모/i.test(document.title)
      || /class|lesson|강습|수업/i.test(document.title)) return { rows, issues: ['not a social occurrence'] };
    const mainProgram = text.split(/#{2,}[^\n]*(?:Class|Detailed Event|Contact|Recruitment)|(?:^|\n)Contact:/i)[0];
    const socialDetails = text.match(/(?:^|\n)[^\n]*(?:Late Night|Social Party)[^\n]*\n[\s\S]*?(?=\n#{2,}[^\n]*(?:Class|Contact|Recruitment)|$)/i)?.[0] || '';
    const socialEvidence = [mainProgram, socialDetails].filter(Boolean).join('\n');
    if (!/salsa|살사/i.test(mainProgram)) return { rows, issues: ['salsa program unverified'] };
    if (!/\bDJ\s+[A-Za-z가-힣]/i.test(mainProgram)) return { rows, issues: ['performing DJ unverified'] };
    if (!document.venue) return { rows, issues: ['occurrence venue missing'] };
    rows.push({
      sourceUrl: normalizeSourceUrl(document.sourceUrl), date, title: document.title,
      venue: document.venue.split(',')[0].trim(), address: document.venue.split(',').slice(1).join(',').trim(), venueProvenance: 'source_text',
      text: `${date} ${document.dateLabel}\n${document.venue}\n${socialEvidence}`,
      djText: mainProgram, publishedAt: '',
    });
    return { rows, issues };
  }

  const publishedAt = publicPublicationDate(document.publishedAt, today);
  if (!publishedAt) return { rows, issues: ['publication year unverified'] };
  // Preserve line boundaries: an inline workshop date is not a social heading.
  const headings = [...text.matchAll(/(?:^|\n)[^\p{L}\p{N}\n]*(\d{1,2})\s*(?:월|[./])\s*(\d{1,2})\s*일?\s*\(([월화수목금토일])\)[^\n]*/gu)];
  if (!headings.length) issues.push('no dated weekly social headings');
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const provisional = `${publishedAt.slice(0, 4)}-${heading[1].padStart(2, '0')}-${heading[2].padStart(2, '0')}`;
    const [date] = alignYearlessDatesToPublication([provisional], heading[0], publishedAt);
    if (!isCollectableDate(date, { today })) continue;
    if ('일월화수목금토'[new Date(`${date}T12:00:00+09:00`).getUTCDay()] !== heading[3]) {
      issues.push(`${date}: weekday conflict`);
      continue;
    }
    const section = text.slice(heading.index, headings[i + 1]?.index ?? text.length).trim();
    if (/소셜\s*휴무|소셜\s*취소|휴강주|closed|cancelled/i.test(section)) continue;
    if (!/살사|salsa|살\s*[:：]\s*바|바\s*[:：]\s*살/i.test(section)) {
      issues.push(`${date}: salsa program unverified`);
      continue;
    }
    // Keep other halls in the description, but never borrow a Kizomba/Zouk DJ.
    const djText = section.split('\n').filter(line => !/키좀바|kizomba|주크|zouk/i.test(line)).join('\n');
    if (!/(?:\bDJ|디제이)\s*[:：]?\s*[A-Za-z가-힣]/i.test(djText)) {
      issues.push(`${date}: performing DJ unverified`);
      continue;
    }
    rows.push({ sourceUrl: normalizeSourceUrl(document.sourceUrl), date,
      title: `${source.venue || source.name} ${heading[3]}요 소셜`,
      venue: source.venue || '', venueProvenance: 'source_registry',
      text: section, djText, publishedAt });
  }
  return { rows, issues };
}

// Read the displayed occurrence card; do not synthesize recurring dates.
export function readMeetupCardsFromDom() {
  return [...document.querySelectorAll('[data-testid="group-events-card"]')].map(card => {
    const time = card.querySelector('time');
    const title = card.querySelector('h2,h3')?.textContent?.trim() || '';
    const lines = card.innerText.split('\n').map(line => line.trim()).filter(Boolean);
    const dateLabel = time?.textContent?.trim() || '';
    return { kind: 'meetup', title,
      sourceUrl: card.querySelector('a[href*="/events/"]')?.href || '',
      date: time?.getAttribute('datetime') || '', dateLabel,
      venue: lines[lines.indexOf(dateLabel) + 1] || '',
      text: card.innerText,
      cancelled: /cancelled|canceled|취소/i.test(lines.slice(0, 4).join(' ')),
    };
  });
}

export function readKakaoPostsFromDom() {
  return [...document.querySelectorAll('.area_card')].flatMap(card => {
    const link = card.querySelector('a.link_title[href]');
    if (!link) return [];
    return [{ kind: 'kakao', sourceUrl: link.href,
      title: card.querySelector('.tit_card')?.innerText || '',
      text: card.querySelector('.desc_card')?.innerText || '',
      publishedAt: card.querySelector('.txt_date')?.innerText?.trim() || '',
    }];
  });
}

export async function collectPublicScheduleDocuments(page, source, { limit = 4, timeoutMs = 18000 } = {}) {
  const isMeetup = source.type === 'meetup';
  const url = isMeetup
    ? `${source.url.replace(/\/(?:events\/?)?$/, '')}/events/`
    : `${source.url.replace(/\/$/, '')}/posts`;
  const started = Date.now();
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining() });
  // A rendered 0 count during hydration is not evidence of an empty calendar.
  await page.locator(isMeetup ? '[data-testid="group-events-card"]' : 'a.link_title[href]').first()
    .waitFor({ timeout: remaining() });
  if (isMeetup) {
    while (remaining() > 2500) {
      const cards = page.locator('[data-testid="group-events-card"]');
      const count = await cards.count();
      if (count >= limit) break;
      await cards.last().scrollIntoViewIfNeeded({ timeout: Math.min(2000, remaining()) });
      const grew = await page.waitForFunction(previous => document.querySelectorAll('[data-testid="group-events-card"]').length > previous,
        count, { timeout: Math.min(2000, remaining()) }).then(() => true).catch(() => false);
      if (!grew) break;
    }
  }
  const documents = await page.evaluate(isMeetup ? readMeetupCardsFromDom : readKakaoPostsFromDom);
  const allowed = documents.filter(item => findSourceForCandidate({ sourceId: source.id, url: item.sourceUrl })?.id === source.id);
  // Count actual cards and report the unread tail instead of silently claiming
  // the first page or first four mixed class/social cards cover the whole source.
  const eligible = isMeetup && !source.allowedActivityTypes?.includes('class') ? allowed.filter(item => /social|party|night|소셜|파티|정모/i.test(item.title)
    && !/class|lesson|강습|수업/i.test(item.title)) : allowed;
  return { documents: eligible.slice(0, limit), discovered: allowed.length,
    remaining: isMeetup ? Math.max(0, eligible.length - limit) : 0 };
}
