import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDir, 'ai-adjudication.schema.json');
const defaultModel = process.env.INGESTION_AI_MODEL || 'gpt-5.6-sol';
const minimumConfidence = Number(process.env.INGESTION_AI_MIN_CONFIDENCE || 0.98);

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

export function validateAiAdjudication(candidate, adjudication, config = {}) {
  const sd = candidate?.structured_data || {};
  const sourceText = `${candidate?.extracted_text || ''}\n${sd.title || ''}`;
  const evidenceQuotes = Array.isArray(adjudication?.evidence_quotes)
    ? adjudication.evidence_quotes.map((quote) => String(quote || '').trim()).filter(Boolean)
    : [];
  const candidateDjs = Array.isArray(sd.djs) ? sd.djs.map(normalized).filter(Boolean) : [];
  const aiDjs = Array.isArray(adjudication?.djs) ? adjudication.djs.map(normalized).filter(Boolean) : [];
  const threshold = Number(config.minimumConfidence ?? minimumConfidence);
  const evidenceCorpus = normalized(evidenceQuotes.join(' '));
  const candidateVenue = normalized(sd.venue_name || sd.location);
  const reasons = [];

  if (adjudication?.decision !== 'register') reasons.push('AI did not approve registration');
  if (Number(adjudication?.confidence || 0) < threshold) reasons.push(`AI confidence is below ${threshold}`);
  if (String(adjudication?.event_date || '') !== String(sd.date || '').slice(0, 10)) reasons.push('AI date disagrees with collector date');
  if (String(adjudication?.activity_type || '') !== String(sd.activity_type || '')) reasons.push('AI activity disagrees with collector activity');
  if (normalized(adjudication?.venue) !== normalized(sd.venue_name || sd.location)) reasons.push('AI venue disagrees with collector venue');
  if (candidateDjs.length && (candidateDjs.length !== aiDjs.length || candidateDjs.some((dj) => !aiDjs.includes(dj)))) {
    reasons.push('AI DJ list disagrees with collector DJ list');
  }
  if (!exactEvidenceIsGrounded(evidenceQuotes, sourceText)) reasons.push('AI evidence is not an exact substring of source text');
  if (!evidenceMentionsDate(evidenceCorpus, sd.date)) reasons.push('AI evidence does not explicitly contain the candidate date');
  if (candidateVenue && !evidenceCorpus.includes(candidateVenue)) reasons.push('AI evidence does not explicitly contain the candidate venue');
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
  return `You are the second-stage verifier for a Korean swing-dance event calendar.
Judge only the supplied source text. Do not browse, infer a time, or use outside knowledge.
The calendar stores dates only. Never output or reason from an event time.

Return "register" only when the text unambiguously supports exactly one event on the collector date,
the activity type, venue, and (for a social) every DJ. If several dates or several DJ lineups are mixed
and the supplied candidate is not clearly one date-specific section, return "review".
Every evidence quote must be copied exactly from SOURCE_TEXT. Confidence >= 0.98 is reserved for
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
${String(candidate.extracted_text || '').slice(0, 6000)}`;
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
