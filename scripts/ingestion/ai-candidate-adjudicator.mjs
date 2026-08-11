import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSourceByUrl } from './collection-registry.mjs';
import { stripNaverCafeMemberPrefix } from './candidate-utils.mjs';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDir, 'ai-adjudication.schema.json');
const benefitReviewSchemaPath = path.join(moduleDir, 'ai-benefit-review.schema.json');
const defaultModel = process.env.INGESTION_AI_MODEL || 'gpt-5.6-sol';
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

function normalized(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizedVenue(value) {
  return normalized(value)
    .replace(/쏘셜클럽/g, '소셜클럽')
    .replace(/사보이홀|사보이볼룸\s*\(\s*사당\s*\)|사보이/g, '사보이볼룸')
    .replace(/스윙타임(?:빠|바)?/g, '스윙타임');
}

function trustedSourceVenueContext(candidate = {}) {
  const source = findSourceByUrl(candidate.source_url);
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
  return [
    new RegExp(`${year}\\s*[.\\-/년]\\s*0?${month}\\s*[.\\-/월]\\s*0?${day}(?:\\s*일)?`),
    new RegExp(`(?:^|\\D)0?${month}\\s*월\\s*0?${day}\\s*일`),
    new RegExp(`(?:^|\\D)0?${month}\\s*월\\s*(?:0?\\d{1,2}\\s*(?:일)?\\s*[,，·ㆍ/&]\\s*)+0?${day}\\s*일`),
    new RegExp(`(?:^|\\D)0?${month}\\s*[./-]\\s*0?${day}(?:\\D|$)`),
  ].some((pattern) => pattern.test(evidence));
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
  const candidateDjs = Array.isArray(sd.djs) ? sd.djs.map(normalized).filter(Boolean) : [];
  const aiDjs = Array.isArray(adjudication?.djs)
    ? adjudication.djs.map((dj) => normalized(stripNaverCafeMemberPrefix(dj))).filter(Boolean)
    : [];
  const threshold = Number(config.minimumConfidence ?? minimumConfidence);
  const evidenceCorpus = normalized(evidenceQuotes.join(' '));
  const candidateVenue = normalizedVenue(sd.venue_name || sd.location);
  const source = findSourceByUrl(candidate?.source_url);
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
  if (candidateDjs.length && (candidateDjs.length !== aiDjs.length || candidateDjs.some((dj) => !aiDjs.includes(dj)))) {
    reasons.push('AI DJ list disagrees with collector DJ list');
  }
  if (!exactEvidenceIsGrounded(evidenceQuotes, sourceText)) reasons.push('AI evidence is not an exact substring of source text');
  if (!evidenceMentionsDate(evidenceCorpus, sd.date)) reasons.push('AI evidence does not explicitly contain the candidate date');
  if (candidateVenue && !normalizedVenue(evidenceCorpus).includes(candidateVenue)) reasons.push('AI evidence does not explicitly contain the candidate venue');
  if (candidateDjs.some((dj) => !evidenceCorpus.includes(dj))) reasons.push('AI evidence does not explicitly contain every candidate DJ');
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

function buildPrompt(candidate) {
  const sd = candidate.structured_data || {};
  const trustedVenueContext = trustedSourceVenueContext(candidate);
  return `You are the second-stage verifier for a Korean swing-dance event calendar.
Judge only the supplied source text. Do not browse, infer a time, or use outside knowledge.
The calendar stores dates only. Never output or reason from an event time.

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
and an activity marker. For a social, quote text containing "Social" or "소셜" (the event title is
valid activity evidence). When these fields are explicit, unique, and agree with the collector,
return register with confidence 0.99.
For venue agreement, treat these established spelling aliases as identical:
"쏘셜클럽" = "소셜클럽", and "사보이" = "사보이홀" = "사보이볼룸".
When TRUSTED_SOURCE_CONTEXT contains a fixed venue, it is verified configuration for that official
single-venue source and may be quoted only as venue evidence. It is never date, DJ, or activity evidence.
In Naver Cafe text, a prefix such as "57F 밍밍" before the actual DJ is a member-grade and author
nickname, not part of the DJ name. Exclude that prefix and return only the collector-normalized DJ.
Every evidence quote must be copied exactly from SOURCE_TEXT or TRUSTED_SOURCE_CONTEXT. Confidence >= 0.98 is reserved for
fully explicit, internally consistent evidence. Otherwise return review or reject.

COLLECTOR_CANDIDATE:
${JSON.stringify({
    title: sd.title || null,
    event_date: String(sd.date || '').slice(0, 10) || null,
    activity_type: sd.activity_type || null,
    venue: sd.venue_name || sd.location || null,
    djs: Array.isArray(sd.djs) ? sd.djs : [],
    source_id: candidate.source_id || null,
    source_url: candidate.source_url || null,
  })}

SOURCE_TEXT:
${String(candidate.extracted_text || '').slice(0, 6000)}

TRUSTED_SOURCE_CONTEXT:
${trustedVenueContext || '(none)'}`;
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
    const detail = String(error?.stderr || error?.stdout || error?.message || error)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800);
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

export async function adjudicateCandidateWithAi(candidate, config = {}) {
  const codex = config.codexPath || await findCodex();
  if (!codex) return { available: false, approved: false, reasons: ['Codex CLI is unavailable'] };

  const workDir = await mkdtemp(path.join(tmpdir(), 'rhythmjoy-ai-adjudication-'));
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
      '--output-schema', schemaPath,
      '--output-last-message', outputPath,
      '-',
    ], buildPrompt(candidate), {
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
    const detail = String(error?.stderr || error?.stdout || error?.message || error)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800);
    return {
      available: true,
      approved: false,
      reasons: [`AI adjudication failed: ${detail || 'unknown error'}`],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
