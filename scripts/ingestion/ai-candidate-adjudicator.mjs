import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSourceForCandidate } from './collection-registry.mjs';
import { stripNaverCafeMemberPrefix } from './candidate-utils.mjs';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDir, 'ai-adjudication.schema.json');
const benefitReviewSchemaPath = path.join(moduleDir, 'ai-benefit-review.schema.json');
const socialExtractionSchemaPath = path.join(moduleDir, 'ai-social-extraction.schema.json');
const defaultModel = process.env.INGESTION_AI_MODEL || 'gpt-5.6-sol';
const socialExtractionModel = process.env.INGESTION_AI_SOCIAL_MODEL || 'gpt-5.6-terra';
const defaultReasoningEffort = process.env.INGESTION_AI_REASONING_EFFORT || 'low';
const minimumConfidence = Number(process.env.INGESTION_AI_MIN_CONFIDENCE || 0.98);

export function shouldPersistBenefitAiOutcome(outcome = '') {
  return ['approved', 'review', 'unavailable', 'error'].includes(String(outcome || '').toLowerCase());
}

async function firstExecutable(paths) {
  for (const candidate of paths.filter(Boolean)) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

async function findCodex() {
  return firstExecutable([
    process.env.INGESTION_CODEX_PATH,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ]);
}

function runCodex(codex, args, prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(codex, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const maxBuffer = options.maxBuffer || 2 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const error = new Error('AI adjudication timed out');
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    }, options.timeout);

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(`Codex exited with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
    child.stdin.end(prompt);
  });
}

function decodeImageDataUrl(value = '') {
  const match = String(value || '').match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const extension = /^jpe?g$/i.test(match[1]) ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length < 1_000 || buffer.length > 5_500_000) return null;
  return { extension, buffer };
}

async function materializeImageInputs(workDir, values = []) {
  const paths = [];
  const uniqueValues = [...new Set(values.filter(Boolean))].slice(0, 3);
  for (const value of uniqueValues) {
    const decoded = decodeImageDataUrl(value);
    if (!decoded) continue;
    const imagePath = path.join(workDir, `source-poster-${paths.length + 1}.${decoded.extension}`);
    await writeFile(imagePath, decoded.buffer);
    paths.push(imagePath);
  }
  return paths;
}

function codexImageArgs(imagePaths = []) {
  return imagePaths.flatMap((imagePath) => ['--image', imagePath]);
}

function compactAiError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || error)
    .replace(/\s+/g, ' ')
    .trim();
  if (raw.length <= 1_600) return raw;
  return `${raw.slice(0, 320)} … ${raw.slice(-1_240)}`;
}

function normalized(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function bareDjName(value = '') {
  return stripNaverCafeMemberPrefix(String(value || '').trim())
    .replace(/^(?:d\s*j|디제이)\s*[:：-]?\s*/i, '')
    .trim();
}

function evidenceExplicitlyContainsDj(evidence = '', dj = '') {
  const name = normalized(bareDjName(dj));
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u')
    .test(normalized(evidence));
}

function normalizedVenue(value) {
  return normalized(value)
    .replace(/happy\s*hall/g, '해피홀')
    .replace(/쏘셜클럽/g, '소셜클럽')
    .replace(/사보이홀|사보이볼룸\s*\(\s*사당\s*\)|사보이/g, '사보이볼룸')
    .replace(/스윙타임(?:빠|바)?/g, '스윙타임');
}

function trustedSourceVenueContext(candidate = {}) {
  const source = findSourceForCandidate({ sourceId: candidate.source_id, url: candidate.source_url });
  const provenance = String(candidate?.structured_data?.venue_provenance || '').trim();
  const candidateVenue = candidate?.structured_data?.venue_name || candidate?.structured_data?.location || '';
  if (
    !source?.venue
    || source.autoRegistrationVenuePolicy === 'explicit'
    || provenance !== 'source_registry'
    || normalizedVenue(source.venue) !== normalizedVenue(candidateVenue)
  ) {
    return '';
  }
  return `검증된 공식 수집원 고정 장소: ${source.venue}`;
}

function exactEvidenceIsGrounded(evidenceQuotes, sourceText) {
  const haystack = normalized(sourceText);
  return evidenceQuotes.length > 0
    && evidenceQuotes.every((quote) => quote.length >= 2 && haystack.includes(normalized(quote)));
}

function evidenceMentionsDate(evidence, isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, monthPadded, dayPadded] = match;
  const month = String(Number(monthPadded));
  const day = String(Number(dayPadded));
  if ([
    new RegExp(`${year}\\s*[.\\-/년]\\s*0?${month}\\s*[.\\-/월]\\s*0?${day}(?:\\s*일)?`),
    new RegExp(`(?:^|\\D)0?${month}\\s*월\\s*0?${day}\\s*일`),
    new RegExp(`(?:^|\\D)0?${month}\\s*[./-]\\s*0?${day}(?:\\D|$)`),
  ].some((pattern) => pattern.test(evidence))) return true;

  for (const list of String(evidence || '').matchAll(/(?:^|\D)(\d{1,2})\s*월\s*((?:\d{1,2}\s*(?:일)?\s*(?:[,，·ㆍ/&]|및|와|과)?\s*){1,8})/g)) {
    if (Number(list[1]) !== Number(month)) continue;
    const listedDays = [...String(list[2] || '').matchAll(/\d{1,2}/g)].map((item) => Number(item[0]));
    if (listedDays.includes(Number(day))) return true;
  }
  const inheritedMonthPattern = new RegExp(
    `(?:^|\\D)0?${month}\\s*[./-]\\s*\\d{1,2}[^\\n]{0,80}(?:[/,，·ㆍ&]|및|와|과)\\s*0?${day}\\s*일`,
  );
  if (inheritedMonthPattern.test(String(evidence || ''))) return true;
  return false;
}

const ACTIVITY_EVIDENCE_PATTERNS = {
  social: /(?:소셜|social|정모)/i,
  class: /(?:강습|수업|클래스|class|워크숍|워크샵|workshop|레슨|lesson)/i,
  event: /(?:행사|이벤트|event|파티|party|공연|대회)/i,
  recruit: /(?:모집|신청|등록|recruit)/i,
  sale: /(?:판매|정기권|정기\s*할인권|할인권|다회권|\d+\s*회권|패스|pass|티켓|ticket|월정액|멤버십)/i,
};

const BENEFIT_EVIDENCE_PATTERNS = {
  free_event: /무료|0\s*원|\bfree\b/i,
  discount_event: /할인|특가|얼리\s*버드|조기\s*등록|쿠폰|프로모션|\bdiscount\b|\bpromotion\b/i,
  season_pass: /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|멤버십|\bmembership\b|\bpass\b/i,
};

export function validateBenefitAiReview(candidate, review, config = {}) {
  const sd = candidate?.structured_data || {};
  const today = String(config.today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()));
  const threshold = Number(config.minimumConfidence ?? minimumConfidence);
  const sourceText = [candidate?.extracted_text || '', sd.title || ''].filter(Boolean).join('\n');
  const evidenceQuotes = Array.isArray(review?.evidence_quotes)
    ? review.evidence_quotes.map((quote) => String(quote || '').trim()).filter(Boolean)
    : [];
  const grounded = exactEvidenceIsGrounded(evidenceQuotes, sourceText);
  const expectedKind = String(sd.benefit_kind || '');
  const expectedCategory = String(sd.category || '');
  const expectedActivity = String(sd.activity_type || '');
  const expectedVenue = normalizedVenue(sd.venue_name || sd.location || '');
  const validityEndDate = String(review?.validity_end_date || '');
  const evidenceCorpus = evidenceQuotes.join(' ');
  const errors = [];
  const warnings = [];

  if (Number(review?.confidence || 0) < threshold) errors.push(`AI confidence is below ${threshold}`);
  if (!grounded) errors.push('AI benefit evidence is not an exact substring of source text');
  if (String(review?.benefit_kind || '') !== expectedKind) errors.push('AI benefit kind disagrees with collector benefit kind');
  if (expectedCategory && String(review?.category || '') !== expectedCategory) warnings.push('AI category disagrees with collector category');
  if (expectedActivity && String(review?.activity_type || '') !== expectedActivity) warnings.push('AI activity disagrees with collector activity');
  if (expectedVenue && normalizedVenue(review?.venue || '') !== expectedVenue) warnings.push('AI venue disagrees with collector venue');
  if (validityEndDate && validityEndDate < today) errors.push(`AI found expired benefit validity: ${validityEndDate} < ${today}`);
  const benefitPattern = BENEFIT_EVIDENCE_PATTERNS[expectedKind];
  if (!benefitPattern || !benefitPattern.test(evidenceCorpus)) errors.push(`AI evidence does not explicitly identify benefit ${expectedKind || 'unknown'}`);

  const confidentGroundedReject = review?.decision === 'reject'
    && Number(review?.confidence || 0) >= threshold
    && grounded;
  if (confidentGroundedReject) {
    return {
      outcome: 'rejected',
      ok: false,
      reasons: [...new Set([...(review?.reasons || []), ...errors])],
      warnings,
      confidence: Number(review?.confidence || 0),
      evidence_quotes: evidenceQuotes,
    };
  }

  if (review?.decision !== 'accept') errors.push('AI requires manual benefit review');
  if (review?.active_on_today !== true) errors.push('AI did not confirm the benefit is active today');
  if (warnings.length) errors.push(...warnings);

  return {
    outcome: errors.length === 0 ? 'approved' : 'review',
    ok: errors.length === 0,
    reasons: [...new Set(errors)],
    warnings,
    confidence: Number(review?.confidence || 0),
    evidence_quotes: evidenceQuotes,
  };
}

export function validateAiAdjudication(candidate, adjudication, config = {}) {
  const sd = candidate?.structured_data || {};
  const sourceText = [
    candidate?.extracted_text || '',
    sd.title || '',
    trustedSourceVenueContext(candidate),
  ].filter(Boolean).join('\n');
  const evidenceQuotes = Array.isArray(adjudication?.evidence_quotes)
    ? adjudication.evidence_quotes.map((quote) => String(quote || '').trim()).filter(Boolean)
    : [];
  const candidateDjs = Array.isArray(sd.djs) ? sd.djs.map((dj) => normalized(bareDjName(dj))).filter(Boolean) : [];
  const aiDjs = Array.isArray(adjudication?.djs)
    ? adjudication.djs.map((dj) => normalized(bareDjName(dj))).filter(Boolean)
    : [];
  const threshold = Number(config.minimumConfidence ?? minimumConfidence);
  const evidenceCorpus = normalized(evidenceQuotes.join(' '));
  const djGroundingText = [candidate?.extracted_text || '', trustedSourceVenueContext(candidate)]
    .filter(Boolean)
    .join('\n');
  const candidateVenue = normalizedVenue(sd.venue_name || sd.location);
  const source = findSourceForCandidate({ sourceId: candidate?.source_id, url: candidate?.source_url });
  const hasAttachedOriginalPoster = [
    ...(candidate?._ai_image_data_urls || []),
    candidate?.imageData || '',
  ].some((value) => decodeImageDataUrl(value));
  const reasons = [];

  if (adjudication?.decision !== 'register') reasons.push('AI did not approve registration');
  if (Number(adjudication?.confidence || 0) < threshold) reasons.push(`AI confidence is below ${threshold}`);
  if (String(adjudication?.event_date || '') !== String(sd.date || '').slice(0, 10)) reasons.push('AI date disagrees with collector date');
  if (String(adjudication?.activity_type || '') !== String(sd.activity_type || '')) reasons.push('AI activity disagrees with collector activity');
  if (normalizedVenue(adjudication?.venue) !== candidateVenue) reasons.push('AI venue disagrees with collector venue');
  if (
    String(sd.venue_provenance || '') === 'source_registry'
    && source?.venue
    && normalizedVenue(source.venue) !== candidateVenue
  ) {
    reasons.push('collector registry venue disagrees with configured fixed venue');
  }
  if (candidateDjs.length !== aiDjs.length || candidateDjs.some((dj) => !aiDjs.includes(dj))) {
    reasons.push('AI DJ list disagrees with collector DJ list');
  }
  if (
    sd.activity_type === 'social'
    && candidateDjs.length === 0
    && (sd.ai_missing_dj_verified !== true || !hasAttachedOriginalPoster)
  ) {
    reasons.push('DJ-less social lacks attached double-verification evidence');
  }
  if (!exactEvidenceIsGrounded(evidenceQuotes, sourceText)) reasons.push('AI evidence is not an exact substring of source text');
  if (!evidenceMentionsDate(evidenceCorpus, sd.date)) reasons.push('AI evidence does not explicitly contain the candidate date');
  if (candidateVenue && !normalizedVenue(evidenceCorpus).includes(candidateVenue)) reasons.push('AI evidence does not explicitly contain the candidate venue');
  if (candidateDjs.some((dj) => (
    !evidenceExplicitlyContainsDj(evidenceCorpus, dj)
    || !evidenceExplicitlyContainsDj(djGroundingText, dj)
  ))) reasons.push('AI evidence does not explicitly contain every candidate DJ');
  const activityPattern = ACTIVITY_EVIDENCE_PATTERNS[String(sd.activity_type || '')];
  if (!activityPattern || !activityPattern.test(evidenceCorpus)) {
    reasons.push(`AI evidence does not explicitly identify activity ${String(sd.activity_type || '')}`);
  }
  if (sd.time || (Array.isArray(sd.times) && sd.times.length)) reasons.push('time fields are not accepted');

  return {
    ok: reasons.length === 0,
    reasons,
    confidence: Number(adjudication?.confidence || 0),
    evidence_quotes: evidenceQuotes,
  };
}

export function validateAiSocialExtraction(input = {}, extraction = {}, config = {}) {
  const sourceText = String(input.sourceText || '');
  const posterText = String(extraction?.poster_text || '').trim();
  const attachedImageCount = (input.imageDataUrls || []).filter((value) => decodeImageDataUrl(value)).length;
  const hasAttachedImage = attachedImageCount > 0;
  const trustedVenueContext = input.sourceVenue
    ? `검증된 공식 수집원 고정 장소: ${String(input.sourceVenue).trim()}`
    : '';
  const groundedText = [sourceText, hasAttachedImage ? posterText : '', trustedVenueContext]
    .filter(Boolean)
    .join('\n');
  const threshold = Number(config.minimumConfidence ?? minimumConfidence);
  const today = String(config.today || input.today || '');
  const events = Array.isArray(extraction?.events) ? extraction.events : [];
  const dateHints = [...new Set((input.dateHints || []).map((date) => String(date || '').slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))];
  const reasons = [];
  const approvedEvents = [];
  const seenDates = new Set();

  if (extraction?.decision !== 'extract') reasons.push('AI did not return a social extraction');
  if (Number(extraction?.confidence || 0) < threshold) reasons.push(`AI confidence is below ${threshold}`);
  if (!events.length) reasons.push('AI returned no social sessions');
  if (posterText && !hasAttachedImage) reasons.push('AI poster text was returned without an attached source image');

  for (const event of events) {
    const eventReasons = [];
    const date = String(event?.event_date || '').slice(0, 10);
    const venue = normalizedVenue(event?.venue || '');
    const djs = Array.isArray(event?.djs)
      ? event.djs.map((dj) => bareDjName(dj)).filter(Boolean)
      : [];
    const posterImageIndex = Number(event?.poster_image_index || 0);
    const evidenceQuotes = Array.isArray(event?.evidence_quotes)
      ? event.evidence_quotes.map((quote) => String(quote || '').trim()).filter(Boolean)
      : [];
    const evidenceCorpus = evidenceQuotes.join(' ');
    const textOnlyGrounded = exactEvidenceIsGrounded(
      evidenceQuotes,
      [sourceText, trustedVenueContext].filter(Boolean).join('\n'),
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) eventReasons.push('AI social date is invalid');
    if (today && date < today) eventReasons.push('AI social date is already past');
    if (seenDates.has(date)) eventReasons.push('AI returned duplicate social dates');
    if (!exactEvidenceIsGrounded(evidenceQuotes, groundedText)) eventReasons.push('AI social evidence is not an exact substring of source text or attached poster transcription');
    if (!evidenceMentionsDate(evidenceCorpus, date)) eventReasons.push('AI social evidence does not explicitly contain the event date');
    if (!venue || !normalizedVenue(evidenceCorpus).includes(venue)) eventReasons.push('AI social evidence does not explicitly contain the venue');
    if (!Number.isInteger(posterImageIndex) || posterImageIndex < 0 || posterImageIndex > attachedImageCount) {
      eventReasons.push('AI social poster image index is invalid');
    }
    if (!textOnlyGrounded && posterImageIndex === 0) {
      eventReasons.push('AI social poster evidence requires its source image index');
    }
    if (!djs.length && !hasAttachedImage) {
      eventReasons.push('AI social without a DJ requires an attached original poster');
    } else if (djs.some((dj) => (
      !evidenceExplicitlyContainsDj(evidenceCorpus, dj)
      || !evidenceExplicitlyContainsDj(groundedText, dj)
    ))) {
      eventReasons.push('AI social evidence does not explicitly contain every DJ');
    }
    if (!ACTIVITY_EVIDENCE_PATTERNS.social.test(evidenceCorpus)) eventReasons.push('AI social evidence does not explicitly identify a social');

    if (eventReasons.length) {
      reasons.push(`${date || 'unknown date'}: ${eventReasons.join('; ')}`);
      continue;
    }
    seenDates.add(date);
    approvedEvents.push({
      title: String(event.title || '').trim(),
      event_date: date,
      venue: String(event.venue || '').trim(),
      djs,
      poster_image_index: posterImageIndex,
      evidence_quotes: evidenceQuotes,
    });
  }

  const returnedDates = new Set(approvedEvents.map((event) => event.event_date));
  const omittedHints = dateHints.filter((date) => !returnedDates.has(date));
  if (extraction?.decision === 'extract' && omittedHints.length) {
    reasons.push(`AI omitted collector date hints: ${omittedHints.join(', ')}`);
  }

  const ok = extraction?.decision === 'extract'
    && Number(extraction?.confidence || 0) >= threshold
    && approvedEvents.length === events.length
    && approvedEvents.length > 0
    && reasons.length === 0;
  return {
    ok,
    events: ok ? approvedEvents : [],
    reasons: [...new Set(reasons)],
    confidence: Number(extraction?.confidence || 0),
    poster_text: ok && hasAttachedImage ? posterText : '',
  };
}

export function buildAiAdjudicationPrompt(candidate) {
  const sd = candidate.structured_data || {};
  const trustedVenueContext = trustedSourceVenueContext(candidate);
  return `You are the second-stage verifier for a Korean swing-dance event calendar.
Judge only the supplied source text. Do not browse, infer a time, or use outside knowledge.
The calendar stores dates only. Never output or reason from an event time.

A DJ credit alone never makes an item a social. When the collector candidate or source explicitly
identifies an event, competition, championship, cup, or battle, keep activity_type "event" even if a DJ is listed.

Return "register" only when the text unambiguously supports exactly one event on the collector date,
the activity type, venue, and (for a social) every DJ. If several dates or several DJ lineups are mixed
and the supplied candidate is not clearly one date-specific section, return "review".
The collector resolves the year from the collection date. When SOURCE_TEXT explicitly contains the
same month and day but omits the year, return the collector ISO event_date; an explicit source year
is not required. Never do this when a conflicting event month/day remains in SOURCE_TEXT.
Dates explicitly labeled as advance-registration/payment deadlines are not competing event dates.
Compact source headers such as "8월 1,2일" may support the collector date only when SOURCE_TEXT
contains just the matching weekday/DJ section and no competing lineup.
For every register decision, evidence_quotes must separately include the event date, venue, every DJ,
and an activity marker. For a social, quote text containing "Social", "소셜", or "정모" (the event title
is valid activity evidence). When these fields are explicit, unique, and agree with the collector,
return register with confidence 0.99.
For venue agreement, treat these established spelling aliases as identical:
"쏘셜클럽" = "소셜클럽", "HAPPY HALL" = "해피홀", and
"사보이" = "사보이홀" = "사보이볼룸".
When TRUSTED_SOURCE_CONTEXT contains a fixed venue, it is verified configuration for that official
single-venue source and may be quoted only as venue evidence. It is never date, DJ, or activity evidence.
In Naver Cafe text, a prefix such as "57F 밍밍" before the actual DJ is a member-grade and author
nickname, not part of the DJ name. Exclude that prefix and return only the collector-normalized DJ.
Every evidence quote must be copied exactly from SOURCE_TEXT or TRUSTED_SOURCE_CONTEXT. Confidence >= 0.98 is reserved for
fully explicit, internally consistent evidence. Otherwise return review or reject.
When an original poster image is attached, use it to detect contradictions and to verify fields that
claim poster evidence. A field already explicit in SOURCE_TEXT or TRUSTED_SOURCE_CONTEXT does not have
to be repeated on the poster. In particular, an exact article date that is absent from an otherwise
consistent poster is not a disagreement. Return review when the visible poster contradicts the
collector/source evidence, or when a field relies on the poster but is not visibly supported there.
For a social with an empty collector DJ list, return register only when ai_missing_dj_verified is true,
an original poster is attached, and the source explicitly confirms the date, venue, and social marker.
Do not invent a DJ merely to approve registration.

COLLECTOR_CANDIDATE:
${JSON.stringify({
    title: sd.title || null,
    event_date: String(sd.date || '').slice(0, 10) || null,
    activity_type: sd.activity_type || null,
    venue: sd.venue_name || sd.location || null,
    djs: Array.isArray(sd.djs) ? sd.djs : [],
    ai_missing_dj_verified: sd.ai_missing_dj_verified === true,
    source_id: candidate.source_id || null,
    source_url: candidate.source_url || null,
  })}

SOURCE_TEXT:
${String(candidate.extracted_text || '').slice(0, 6000)}

TRUSTED_SOURCE_CONTEXT:
${trustedVenueContext || '(none)'}`;
}

function buildSocialExtractionPrompt(input = {}) {
  const focusDateHints = [...new Set((input.focusDateHints || [])
    .map((date) => String(date || '').slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))];
  return `You extract today-or-later Korean swing-dance social sessions from one official source post.
Judge only SOURCE_TEXT. Do not browse or use outside knowledge. TODAY_KST is ${input.today}.

Use decision "extract" only when every returned session has an explicit today-or-later calendar date, venue,
and social marker. Include every DJ explicitly shown for that session, but never invent a DJ. A session
with no announced DJ may use an empty djs array only when original poster images are attached and its
date, venue, and social marker are otherwise explicit. Attached images are original source posters and
may supply those fields. Extract all independently grounded sessions in the
post. A compact heading such as "8월 15,16일" may be paired with separate Saturday/Sunday sections;
keep only the DJ names inside each matching day section. Do not carry a DJ into another date.
Return each bare DJ stage name exactly as written after the DJ label. Do not include the "DJ" label,
and do not shorten a final Korean syllable merely because it could also look like a grammatical particle.
In a heading such as "8/14 ... /15일", the second day inherits the explicitly written month.
Resolve a missing year from TODAY_KST, but never invent a month or day. Do not output event times.

If posters are attached, copy their relevant visible text exactly into poster_text; otherwise return an
empty poster_text. Each event needs exact evidence_quotes copied from SOURCE_TEXT, poster_text, or
TRUSTED_SOURCE_CONTEXT. Together those quotes must explicitly contain its month/day, venue, every DJ,
and "소셜", "social", or "정모". TRUSTED_SOURCE_CONTEXT may be used only for venue evidence. If the venue is absent, dates conflict,
weekday mapping is uncertain, a DJ belongs to multiple possible dates, or any required evidence is
implicit, return "review" with no events. Confidence >= 0.98 is reserved for fully explicit evidence.
Set poster_image_index to the 1-based attached-image number that visibly supports that session, or 0
when the session is grounded only in SOURCE_TEXT. Never point a session at an unrelated poster.

${focusDateHints.length
    ? `This is a date-scoped recovery pass after a broad scan missed a possible session. Reinspect every
attached source image, including later images, and return only independently supported sessions for
FOCUS_DATE_HINTS. Do not copy fields from another date. A focus hint is not evidence by itself; return
"review" when the source text or visible poster does not explicitly support it.`
    : ''}

SOURCE_NAME:
${String(input.sourceName || '')}

SOURCE_URL:
${String(input.sourceUrl || '')}

SOURCE_TEXT:
${String(input.sourceText || '').slice(0, 6000)}

TRUSTED_SOURCE_CONTEXT:
${input.sourceVenue ? `검증된 공식 수집원 고정 장소: ${String(input.sourceVenue).trim()}` : '(none)'}

COLLECTOR_DATE_HINTS:
${(input.dateHints || []).length
    ? `${(input.dateHints || []).join(', ')} (syntax-derived hints only; verify each against the source and do not invent unsupported sessions)`
    : '(none)'}

FOCUS_DATE_HINTS:
${focusDateHints.length ? focusDateHints.join(', ') : '(none)'}`;
}

function buildBenefitReviewPrompt(candidate, today) {
  const sd = candidate.structured_data || {};
  return `You are the second-stage reviewer for Korean dance benefit collection.
Judge only SOURCE_TEXT. Do not browse or use outside knowledge. TODAY_KST is ${today}.

Decide whether the source explicitly offers a currently usable benefit:
- free_event: a free class, admission, participation, or event;
- discount_event: a real discount, coupon, early-bird price, or promotion;
- season_pass: a season pass, membership, multi-use ticket, monthly pass, or recurring admission pass for sale.

Reject expired, ended, sold-out, negated, or merely historical offers. active_on_today means the
candidate is still relevant as of TODAY_KST; an upcoming future free/discount event is true even though
the event does not happen today. A source post date is not an
event date. For season_pass, compare an explicit validity end date with TODAY_KST. If there is no
explicit end date but the text clearly says it is currently sold or available, active_on_today may be true;
otherwise use null and decision review. Never turn an old single event into an evergreen offer.

Independently identify the underlying category. A pass for social admission is category social while
activity_type remains sale. A class pass is category class. Do not force every sale into category event.
Return accept only when benefit kind, current validity, title, category/activity, and venue are explicit
and internally consistent. Return review when ambiguous and reject when clearly wrong or expired.
Every evidence quote must be copied exactly from SOURCE_TEXT and must include the benefit wording and
any validity/end wording used in the decision. Confidence >= 0.98 is reserved for fully explicit evidence.

COLLECTOR_CANDIDATE:
${JSON.stringify({
    title: sd.title || null,
    source_post_date: sd.source_post_date || sd.date || null,
    benefit_kind: sd.benefit_kind || null,
    category: sd.category || null,
    activity_type: sd.activity_type || null,
    venue: sd.venue_name || sd.location || null,
    source_url: candidate.source_url || null,
  })}

SOURCE_TEXT:
${String(candidate.extracted_text || '').slice(0, 6000)}`;
}

export async function reviewBenefitCandidateWithAi(candidate, config = {}) {
  const codex = config.codexPath || await findCodex();
  if (!codex) return { available: false, approved: false, outcome: 'unavailable', reasons: ['Codex CLI is unavailable'] };

  const today = String(config.today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()));
  const workDir = await mkdtemp(path.join(tmpdir(), 'rhythmjoy-ai-benefit-review-'));
  const outputPath = path.join(workDir, 'result.json');
  try {
    await writeFile(outputPath, '', 'utf8');
    await runCodex(codex, [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--model', config.model || defaultModel,
      '--config', `model_reasoning_effort="${config.reasoningEffort || defaultReasoningEffort}"`,
      '--output-schema', benefitReviewSchemaPath,
      '--output-last-message', outputPath,
      '-',
    ], buildBenefitReviewPrompt(candidate, today), {
      cwd: moduleDir,
      timeout: Number(config.timeoutMs || process.env.INGESTION_AI_TIMEOUT_MS || 90_000),
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    const adjudication = JSON.parse(await readFile(outputPath, 'utf8'));
    const validation = validateBenefitAiReview(candidate, adjudication, { ...config, today });
    return {
      available: true,
      approved: validation.ok,
      outcome: validation.outcome,
      adjudication,
      validation,
      reasons: validation.reasons,
    };
  } catch (error) {
    const detail = compactAiError(error);
    return {
      available: true,
      approved: false,
      outcome: 'error',
      reasons: [`AI benefit review failed: ${detail || 'unknown error'}`],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function extractSocialScheduleWithAi(input = {}, config = {}) {
  const codex = config.codexPath || await findCodex();
  if (!codex) return { available: false, approved: false, outcome: 'unavailable', reasons: ['Codex CLI is unavailable'] };

  const today = String(config.today || input.today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()));
  const workDir = await mkdtemp(path.join(tmpdir(), 'rhythmjoy-ai-social-extraction-'));
  try {
    const imagePaths = await materializeImageInputs(workDir, input.imageDataUrls || []);
    const totalTimeoutMs = Number(config.timeoutMs || process.env.INGESTION_AI_TIMEOUT_MS || 90_000);
    const deadline = Date.now() + totalTimeoutMs;
    const runAttempt = async (attemptInput, label, model = config.model || socialExtractionModel) => {
      const outputPath = path.join(workDir, `${label}.json`);
      await writeFile(outputPath, '', 'utf8');
      const remainingTimeoutMs = deadline - Date.now();
      if (remainingTimeoutMs < 1_000) throw new Error('AI social extraction retry budget exhausted');
      await runCodex(codex, [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--skip-git-repo-check',
        '--sandbox', 'read-only',
        '--model', model,
        '--config', `model_reasoning_effort="${config.reasoningEffort || defaultReasoningEffort}"`,
        ...codexImageArgs(imagePaths),
        '--output-schema', socialExtractionSchemaPath,
        '--output-last-message', outputPath,
        '-',
      ], buildSocialExtractionPrompt(attemptInput), {
        cwd: moduleDir,
        timeout: remainingTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      });
      const extraction = JSON.parse(await readFile(outputPath, 'utf8'));
      const validation = validateAiSocialExtraction(attemptInput, extraction, { ...config, today });
      return { extraction, validation };
    };

    const baseInput = { ...input, today };
    const retryReasons = [];
    let focusedAttempted = false;
    let { extraction, validation } = await runAttempt(baseInput, 'broad-result');
    const dateHints = [...new Set((input.dateHints || [])
      .map((date) => String(date || '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))];
    const nonOmissionReasons = (validation.reasons || [])
      .filter((reason) => !String(reason).startsWith('AI omitted collector date hints:'));

    if (!validation.ok && extraction?.decision === 'extract' && dateHints.length > 1 && !nonOmissionReasons.length) {
      const broadWithoutCoverage = validateAiSocialExtraction(
        { ...baseInput, dateHints: [] },
        extraction,
        { ...config, today },
      );
      const broadDates = new Set((broadWithoutCoverage.events || []).map((event) => event.event_date));
      const missingDates = dateHints.filter((date) => !broadDates.has(date));
      if (broadWithoutCoverage.ok && missingDates.length) {
        focusedAttempted = true;
        const focusedInput = {
          ...baseInput,
          dateHints: missingDates,
          focusDateHints: missingDates,
        };
        const focused = await runAttempt(
          focusedInput,
          'focused-result',
          config.focusedModel || defaultModel,
        );
        if (focused.validation.ok) {
          const combinedEvents = [...broadWithoutCoverage.events, ...focused.validation.events]
            .filter((event, index, events) => events.findIndex((other) => other.event_date === event.event_date) === index)
            .sort((left, right) => left.event_date.localeCompare(right.event_date));
          extraction = {
            decision: 'extract',
            confidence: Math.min(
              Number(extraction.confidence || 0),
              Number(focused.extraction.confidence || 0),
            ),
            poster_text: [extraction.poster_text, focused.extraction.poster_text]
              .map((value) => String(value || '').trim())
              .filter(Boolean)
              .filter((value, index, values) => values.indexOf(value) === index)
              .join('\n'),
            events: combinedEvents,
            reasons: [],
          };
          validation = validateAiSocialExtraction(baseInput, extraction, { ...config, today });
        } else {
          retryReasons.push(...(focused.validation.reasons || []).map((reason) => `focused retry: ${reason}`));
        }
      }
    }

    if (!validation.ok && dateHints.length && !focusedAttempted) {
      focusedAttempted = true;
      const focusedInput = {
        ...baseInput,
        dateHints,
        focusDateHints: dateHints,
      };
      const focused = await runAttempt(
        focusedInput,
        'full-recovery-result',
        config.focusedModel || defaultModel,
      );
      if (focused.validation.ok) {
        extraction = focused.extraction;
        validation = focused.validation;
      } else {
        retryReasons.push(...(focused.validation.reasons || []).map((reason) => `focused recovery: ${reason}`));
      }
    }

    return {
      available: true,
      approved: validation.ok,
      outcome: validation.ok ? 'approved' : 'review',
      extraction,
      validation,
      events: validation.events,
      reasons: [...new Set([
        ...(validation.reasons || []),
        ...(extraction.reasons || []),
        ...retryReasons,
      ])],
    };
  } catch (error) {
    const detail = compactAiError(error);
    return {
      available: true,
      approved: false,
      outcome: 'error',
      events: [],
      reasons: [`AI social extraction failed: ${detail || 'unknown error'}`],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function adjudicateCandidateWithAi(candidate, config = {}) {
  const codex = config.codexPath || await findCodex();
  if (!codex) return { available: false, approved: false, reasons: ['Codex CLI is unavailable'] };
  const adjudicationModel = config.model
    || (candidate?.structured_data?.evidence_scope === 'ai_grounded_social'
      ? defaultModel
      : candidate?.structured_data?.activity_type === 'social' ? socialExtractionModel : defaultModel);

  const workDir = await mkdtemp(path.join(tmpdir(), 'rhythmjoy-ai-adjudication-'));
  const outputPath = path.join(workDir, 'result.json');
  try {
    await writeFile(outputPath, '', 'utf8');
    const imagePaths = await materializeImageInputs(workDir, [
      ...(candidate?._ai_image_data_urls || []),
      candidate?.imageData || '',
    ]);
    await runCodex(codex, [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--model', adjudicationModel,
      '--config', `model_reasoning_effort="${config.reasoningEffort || defaultReasoningEffort}"`,
      ...codexImageArgs(imagePaths),
      '--output-schema', schemaPath,
      '--output-last-message', outputPath,
      '-',
    ], buildAiAdjudicationPrompt(candidate), {
      cwd: moduleDir,
      timeout: Number(config.timeoutMs || process.env.INGESTION_AI_TIMEOUT_MS || 90_000),
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    const adjudication = JSON.parse(await readFile(outputPath, 'utf8'));
    const validation = validateAiAdjudication(candidate, adjudication, config);
    return {
      available: true,
      approved: validation.ok,
      adjudication,
      validation,
      reasons: validation.reasons,
    };
  } catch (error) {
    const detail = compactAiError(error);
    return {
      available: true,
      approved: false,
      reasons: [`AI adjudication failed: ${detail || 'unknown error'}`],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
