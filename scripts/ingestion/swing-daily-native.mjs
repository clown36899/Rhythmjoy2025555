#!/usr/bin/env node
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  alignYearlessDatesToPublication,
  buildCafe24Payload,
  classifyConfirmedBenefitEvent,
  collapseSocialCandidateVariants,
  extractDatedDjSections,
  extractIndependentSocialDateSections,
  extractInstagramCaptionHeadline,
  extractNeoWeeklyClosureDates,
  extractNeoWeeklySocialSchedule,
  extractSeasonPassEvidenceSections,
  filterDeadlineOnlyEventDates,
  getBlockedKeywordReason,
  hasBadPosterUrl,
  isHighConfidenceDatedSocialSchedule,
  isInstagramCaptionClassHeadline,
  isCollectableDate,
  isEvergreenSeasonPassCandidate,
  keepFirstEventDateOnly,
  mergeSocialScheduleFallbacks,
  normalizeSourceUrl,
  prepareCandidate,
  publicationDateKey,
  resolveSourceVenueEvidence,
  selectSourceOrderedPosterUrls,
  stripNaverCafeMemberPrefix,
  stripRepeatedDjContext,
  todayISO,
  toMapSafeVenueName,
} from './candidate-utils.mjs';
import { getAutomationSourceList, getExcludedSourceReason } from './collection-registry.mjs';
import {
  benefitSearchMatches,
  buildBenefitSearchUrls,
  classifyInstagramProfilePage,
  expectedInstagramHandleForSource,
  extractBenefitDocumentUrls,
  extractInstagramPostUrls,
  extractInstagramProfileUrls,
  instagramAuthorMatches,
  instagramPostMatchesExpectedHandle,
  isDirectInstagramPostMediaUrl,
  isNaverAdministrativeNoticeText,
  isNaverScheduleOverviewText,
  isVerifiedInstagramFallbackProfile,
  isStaleBenefitSourcePost,
  mergeBenefitSearchTargets,
  naverScheduleOverviewPriority,
  normalizeInstagramPostUrl,
  shouldOpenInstagramCircuit,
} from './benefit-search-utils.mjs';
import {
  adjudicateCandidateWithAi,
  extractSocialScheduleWithAi,
  reviewBenefitCandidateWithAi,
  shouldPersistBenefitAiOutcome,
} from './ai-candidate-adjudicator.mjs';
import {
  buildIngestionProgressState,
  catchupInstagramPostLimit,
  loadIngestionProgress,
  mergeSeenInstagramPosts,
  progressFileForPriority,
  reorderSourcesForResume,
  saveIngestionProgress,
  selectUnseenInstagramPosts,
  shouldAdvanceInstagramCheckpoint,
} from './ingestion-progress.mjs';
import {
  formatAutoRegistrationTelegramLine,
  toAutoRegistrationReportEntry,
} from './auto-registration-report.mjs';

chromium.use(stealthPlugin());


const profile = process.env.INGESTION_PROFILE || 'swing-daily';
const defaultEndpoint = process.env.INGESTOR_V3 === '1'
  ? 'https://swingenjoy.com/api/ingestor-v3/candidates'
  : 'https://swingenjoy.com/api/scraped-events';
const endpoint = process.env.CAFE24_INGEST_ENDPOINT || defaultEndpoint;
const automaticRegistrationEndpoint = process.env.CAFE24_AUTO_REGISTER_ENDPOINT
  || new URL('/api/ingestor-register-event', endpoint).toString();
const ingestToken = process.env.SCRAPED_EVENTS_INGEST_TOKEN || process.env.CAFE24_INGEST_TOKEN || '';
const exceptionBacktest = process.env.INGESTION_EXCEPTION_BACKTEST === '1';
const dryRun = process.env.INGESTION_NATIVE_DRY_RUN === '1' || exceptionBacktest;
const diagnosticJson = dryRun && process.env.INGESTION_NATIVE_DIAGNOSTIC_JSON === '1';
const aiAdjudicationEnabled = process.env.INGESTION_AI_ADJUDICATION !== '0';
const aiSocialExtractionEnabled = aiAdjudicationEnabled && process.env.INGESTION_AI_SOCIAL_EXTRACTION !== '0';
const benefitAiReviewDryRun = process.env.INGESTION_AI_REVIEW_DRY_RUN === '1';
const exceptionLookbackDays = Math.max(
  1,
  Number(process.env.INGESTION_EXCEPTION_LOOKBACK_DAYS || 180),
);
const sourceLimit = Number(process.env.INGESTION_NATIVE_SOURCE_LIMIT || 0);
const sourceIds = (process.env.INGESTION_NATIVE_SOURCE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const targetInstagramPostUrls = (process.env.INGESTION_NATIVE_POST_URLS || '')
  .split(',')
  .map((url) => normalizeInstagramPostUrl(url))
  .filter((url) => /^https:\/\/(?:www\.)?instagram\.com\/[^/]+\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/i.test(url));
const traceSourceIds = new Set((process.env.INGESTION_NATIVE_TRACE_SOURCE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean));
const sourcePriorities = (process.env.INGESTION_NATIVE_SOURCE_PRIORITY || process.env.INGESTION_NATIVE_PRIORITY || '')
  .split(',')
  .map((priority) => priority.trim())
  .filter(Boolean)
  .map((priority) => Number(priority))
  .filter((priority) => Number.isFinite(priority));
const sourceTypes = (process.env.INGESTION_NATIVE_SOURCE_TYPES || '')
  .split(',')
  .map((type) => type.trim())
  .filter(Boolean);
const sourceBatchTotal = Math.max(0, Number(process.env.INGESTION_NATIVE_SOURCE_BATCH_TOTAL || 0));
const sourceBatchIndex = Math.max(0, Number(process.env.INGESTION_NATIVE_SOURCE_BATCH_INDEX || 0));
const postLimit = Number(process.env.INGESTION_NATIVE_POST_LIMIT || 4);
let instagramSourcePostLimit = Number(process.env.INGESTION_NATIVE_INSTAGRAM_POST_LIMIT || 2);
const naverSourcePostLimit = Number(process.env.INGESTION_NATIVE_NAVER_POST_LIMIT || 3);
const daumSourcePostLimit = Number(process.env.INGESTION_NATIVE_DAUM_POST_LIMIT || 3);
const littlySourceCardLimit = Number(process.env.INGESTION_NATIVE_LITTLY_CARD_LIMIT || 6);
const maxFutureDays = Number(process.env.INGESTION_NATIVE_MAX_FUTURE_DAYS || 180);
const sourceTimeoutMs = Number(process.env.INGESTION_NATIVE_SOURCE_TIMEOUT_MS || 45000);
const postTimeoutMs = Number(process.env.INGESTION_NATIVE_POST_TIMEOUT_MS || 28000);
const postRequestTimeoutMs = Number(process.env.INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS || 20_000);
const imageFetchTimeoutMs = Number(process.env.INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS || 12_000);
const aiSocialExtractionTimeoutMs = Math.max(10_000, Number(process.env.INGESTION_AI_TIMEOUT_MS || 90_000));
const runBudgetMs = Number(process.env.INGESTION_NATIVE_RUN_BUDGET_MS || 20 * 60_000);
const cleanupCount = process.env.INGESTION_PRE_CLEANUP_COUNT || '0';
const browserCdpUrl = process.env.INGESTION_BROWSER_CDP_URL || 'http://localhost:9222';
const browserProfileDir = process.env.INGESTION_BROWSER_PROFILE_DIR || '/Users/inteyeo/.chrome-automation';
const browserHeadless = process.env.INGESTION_BROWSER_HEADLESS === '1';
const instagramSafeMode = process.env.INGESTION_INSTAGRAM_SAFE_MODE !== '0';
const instagramSourceDelayMs = Number(process.env.INGESTION_INSTAGRAM_SOURCE_DELAY_MS || (instagramSafeMode ? 45_000 : 0));
const instagramPostDelayMs = Number(process.env.INGESTION_INSTAGRAM_POST_DELAY_MS || (instagramSafeMode ? 12_000 : 0));
const instagramProfileWaitMs = Number(process.env.INGESTION_INSTAGRAM_PROFILE_WAIT_MS || (instagramSafeMode ? 5_500 : 1_800));
const instagramFailureCircuitThreshold = Number(process.env.INGESTION_INSTAGRAM_FAILURE_CIRCUIT_THRESHOLD || (instagramSafeMode ? 3 : 0));
const dryRunReferenceDate = String(process.env.INGESTION_TEST_TODAY || '').trim();
const today = dryRun && /^20\d{2}-\d{2}-\d{2}$/.test(dryRunReferenceDate)
  ? dryRunReferenceDate
  : todayISO();
const runStartedAtMs = Date.now();
const oneDayPattern = /원\s*데이|원데이|\b1\s*day\b|\bone\s*day\b|\boneday\b|일일\s*(?:클래스|강습|수업|체험)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|체험|배워)|체험\s*(?:클래스|강습|수업)|오픈\s*클래스|open\s*class/i;
const graduationEventPattern = /졸업\s*(?:공연|파티)|graduation\s*(?:show|party|performance)/i;
const closureEventPattern = /(?:정기\s*)?휴무|휴업|쉬어\s*갑니다|쉽니다|쉬어요|(?:이번|금)\s*주[^.\n]{0,30}(?:쉽니다|쉬어요|휴무)|소셜[^.\n]{0,20}(?:없습니다|없어요|취소)|(?:행사|운영)[^.\n]{0,20}취소/i;

const result = {
  inserted: 0,
  skipped: 0,
  accessFailures: [],
  instagramCircuitSkips: [],
  noContentSources: [],
  issues: [],
  candidates: [],
  autoRegisteredEvents: [],
  deadlineReached: false,
  remainingSources: [],
  benefitSearchStats: [],
  benefitAiReviewStats: {
    approved: 0,
    review: 0,
    rejected: 0,
    error: 0,
    unavailable: 0,
  },
  socialAiExtractionStats: {
    approved: 0,
    review: 0,
    error: 0,
    unavailable: 0,
  },
  pipeline: {
    discovery: { documents: 0, failures: 0 },
    classification: { documents: 0, matchedDocuments: 0, emptyDocuments: 0, candidates: 0, byActivity: {} },
    decomposition: { candidates: 0 },
    persistence: { attempted: 0, saved: 0, refreshed: 0, skipped: 0, failures: 0 },
    registration: { attempted: 0, succeeded: 0, duplicates: 0, blocked: 0, notReady: 0 },
    blockers: [],
  },
};

class RunBudgetReachedError extends Error {
  constructor(label = '') {
    super(label ? `run budget reached: ${label}` : 'run budget reached');
    this.name = 'RunBudgetReachedError';
  }
}

class NetworkUnavailableError extends Error {
  constructor(message = 'network unavailable') {
    super(message);
    this.name = 'NetworkUnavailableError';
  }
}

const sourceTypeWeight = new Map([
  ['benefit_search', -1],
  ['littly', 0],
  ['naver_cafe', 1],
  ['daum_cafe', 2],
  ['website', 3],
  ['instagram', 10],
]);

const venueAliases = [
  [/경성홀|kyungsung/i, '경성홀'],
  [/해피홀|happy\s*hall/i, '해피홀'],
  [/스윙\s*타임|swing\s*time/i, '스윙타임'],
  [/봉천\s*살롱|bongcheon/i, '봉천살롱'],
  [/비밥\s*바|bebop/i, '비밥바'],
  [/피에스타|fiesta/i, '피에스타'],
  [/루나|luna/i, '루나'],
  [/인더무드|in\s*the\s*mood/i, '인더무드신림'],
  [/쏘셜\s*클럽|소셜\s*클럽|sosyal|social\s*club/i, '소셜클럽'],
  [/탐나홀|tamna/i, '탐나홀'],
  [/kp\s*댄스홀|kp\s*dance/i, 'KP댄스홀'],
  [/스탭업|step\s*up/i, '스탭업댄스'],
];

const sourceSpecificVenue = new Map([
  ['happyhall2004', '해피홀'],
  ['swingtimebar', '스윙타임'],
  ['fiesta_swingdance', '피에스타'],
  ['bongcheonsalon', '봉천살롱'],
  ['bebopbar_swing', '비밥바'],
  ['luna_swingbar', '루나'],
  ['swingcats20', '루나'],
  ['inthemood_sillim', '인더무드신림'],
  ['kyungsunghall', '경성홀'],
  ['tamnahall', '탐나홀'],
  ['kpdancehall', 'KP댄스홀'],
  ['stepupdance_swing', '스탭업댄스'],
  ['sosyalclub_swing', '소셜클럽'],
  ['daejeon_swingfever', '스윙잇'],
  ['swingscandal-cafe', '사보이볼룸'],
  ['swingscandal-littly', '사보이'],
  ['swingtown-cafe', '봉천살롱'],
  ['swingtown-schedule-cafe', '봉천살롱'],
  ['swingfriends-cafe', '스윙타임'],
  ['swingfriends-happyhall-cafe', '해피홀'],
  ['swingfriends-busan-cafe', '스윙243'],
  ['swing_friends', '스윙타임'],
  ['balboaland-instagram', '피에스타'],
  ['swingkids-oneday-littly', '피에스타'],
  ['swingfriends-oneday-littly', '스윙타임'],
  ['neo_swing', '해피홀'],
  ['neoswing-daum', '해피홀'],
  ['swinghouse-littly', '비밥바'],
]);

let lastInstagramHitAt = 0;
let instagramProfileFailureStreak = 0;
let instagramCircuitOpen = false;
let instagramSeenPosts = {};
let instagramPendingSeenPosts = {};
let progressTrackingEnabled = false;

function log(message) {
  console.log(`[native-ingestion] ${message}`);
}

function recordPipelineBlocker(stage, {
  sourceId = '',
  sourceUrl = '',
  candidateId = '',
  reason = '',
} = {}) {
  const normalizedStage = String(stage || 'unknown');
  const entry = {
    stage: normalizedStage,
    ...(sourceId ? { sourceId: String(sourceId) } : {}),
    ...(sourceUrl ? { sourceUrl: normalizeSourceUrl(sourceUrl) } : {}),
    ...(candidateId ? { candidateId: String(candidateId) } : {}),
    reason: String(reason || 'unknown failure').slice(0, 500),
  };
  if (result.pipeline.blockers.length < 40) result.pipeline.blockers.push(entry);
  if (normalizedStage === 'discovery' || normalizedStage === 'extraction') {
    result.pipeline.discovery.failures += 1;
  }
  log(`pipeline blocked ${normalizedStage} ${entry.sourceId || entry.candidateId || 'unknown'}: ${entry.reason}`);
}

function recordPipelineDocument(source, candidateCount = 0) {
  const count = Math.max(0, Number(candidateCount || 0));
  result.pipeline.classification.documents += 1;
  result.pipeline.classification.candidates += count;
  if (count > 0) result.pipeline.classification.matchedDocuments += 1;
  else result.pipeline.classification.emptyDocuments += 1;
  if (traceSourceIds.has(source?.id)) {
    log(`pipeline classified ${source.id}: ${count} candidate(s)`);
  }
}

function recordRegistrationPolicyBlocker(candidate = {}) {
  result.pipeline.registration.notReady += 1;
  recordPipelineBlocker('registration-policy', {
    sourceId: candidate.source_id,
    sourceUrl: candidate.source_url,
    candidateId: candidate.id,
    reason: (candidate.auto_registration?.reasons || ['candidate requires manual review']).join('; '),
  });
}

function recordNoContent(sourceOrLabel, reason) {
  const label = typeof sourceOrLabel === 'string' ? sourceOrLabel : sourceOrLabel.id;
  result.noContentSources.push(`${label}(${reason})`);
  log(`no content ${label}: ${reason}`);
}

function recordAccessFailure(sourceOrLabel, reason) {
  const label = typeof sourceOrLabel === 'string' ? sourceOrLabel : sourceOrLabel.id;
  result.accessFailures.push(`${label}(${reason})`);
  recordPipelineBlocker(String(label).includes(':') ? 'extraction' : 'discovery', {
    sourceId: String(label).split(':')[0],
    reason,
  });
  log(`access failure ${label}: ${reason}`);
  if (instagramSafeMode && !String(label).includes(':post') && /^instagram /.test(reason) && reason !== 'instagram safe circuit open') {
    if (shouldOpenInstagramCircuit(reason)) {
      instagramProfileFailureStreak += 1;
      if (instagramFailureCircuitThreshold > 0 && instagramProfileFailureStreak >= instagramFailureCircuitThreshold) {
        instagramCircuitOpen = true;
        log(`instagram safe circuit opened after ${instagramProfileFailureStreak} consecutive global block responses`);
      }
    } else {
      instagramProfileFailureStreak = 0;
    }
  }
}

function recordInstagramCircuitSkip(source) {
  const label = typeof source === 'string' ? source : source.id;
  if (result.instagramCircuitSkips.length === 0) {
    result.issues.push('instagram global access circuit open; skipped sources will resume next run');
  }
  result.instagramCircuitSkips.push(label);
  if (!result.remainingSources.includes(label)) result.remainingSources.push(label);
  log(`instagram circuit skip ${label}`);
}

function compactText(value = '') {
  return String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

const naverCafeChromeRe = /인기\s*멤버|새싹\s*멤버|멤버\s*등급|부\s*매니저|매니저|스탭|운영진|1\s*:\s*1\s*채팅|채팅|작성자|조회수?|댓글|목록|URL\s*복사|좋아요|신고|게시글|멤버\s*리스트/i;
const leadingDateTitleRe = /^\s*(?:20\d{2}\s*[.\-/년]\s*)?\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*(?:일)?\s*[.\s]*(?:\([월화수목금토일]\))?\s*/i;

function looksLikeNaverCafeChromeLine(value = '') {
  const text = compactText(value);
  if (!text) return false;
  return naverCafeChromeRe.test(text)
    || /^내\s*카페|^카페\s*앱|^가입하기|^전체글|^공지사항/i.test(text);
}

function stripNaverCafeChrome(value = '') {
  const raw = String(value || '').replace(/\u00a0/g, ' ');
  const dateMatch = raw.match(/(?:20\d{2}\s*[.\-/년]\s*)?\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*(?:일)?/);
  if (dateMatch && dateMatch.index > 0 && naverCafeChromeRe.test(raw.slice(0, dateMatch.index))) {
    return raw.slice(dateMatch.index).trim();
  }

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !looksLikeNaverCafeChromeLine(line))
    .join('\n')
    .trim();
}

function cleanTitle(value = '') {
  return compactText(stripNaverCafeChrome(value))
    .replace(/^Instagram(?:의)?\s+[^:：]{1,120}\s*[:：]\s*["“”']?\s*/i, '')
    .replace(/^[^:]{1,80}\s+on\s+Instagram:\s*/i, '')
    .replace(/^\[(?:정모|행사|강습|공지사항|공지|필독|이벤트|소셜|모집)[^\]]{0,20}\]\s*/i, '')
    .replace(/^(?:월|화|수|목|금|토|일)(?:\s*\/\s*(?:월|화|수|목|금|토|일))*\s+/i, '')
    .replace(/^(?:사항|강습일정|공지사항|공지|필독)\s*(?:필독|공지)?말머리\s*/i, '')
    .replace(/^강습일정\s*공지말머리\s*/i, '')
    .replace(/^사항\s*(?:필독|공지)말머리\s*/i, '')
    .replace(/^말머리\s*/i, '')
    .replace(/^\[(?:정모|행사|강습|공지사항|공지|필독|이벤트|소셜|모집)[^\]]{0,20}\]\s*/i, '')
    .replace(/^(필독|공지)\s*/i, '')
    .replace(/^\[(?:공지사항|공지|필독)\]\s*/i, '')
    .replace(/\s*댓글\s*\(?\d+\)?\s*$/i, '')
    .replace(leadingDateTitleRe, '')
    .replace(/\s+(?:DJ|디제이)\s*$/i, '')
    .slice(0, 120);
}

function looksLikeNonTitleLine(value = '') {
  const line = compactText(value);
  if (!line) return true;
  const digitCount = (line.match(/\d/g) || []).length;
  return looksLikeNaverCafeChromeLine(line)
    || /(?:₩|원|krw|입장|현금|카드|계좌|주소|도로명|서울|seoul|republic\s+of\s+korea|nambusunhwan|문의|open\s*kakao|오픈채팅)/i.test(line)
    || /\b\d{1,2}\s*[:：]\s*\d{2}\b.*\b\d{1,2}\s*[:：]\s*\d{2}\b/.test(line)
    || (digitCount >= 8 && !/(?:소셜|social|강습|수업|class|workshop|파티|party|dj|디제이)/i.test(line))
    || /^[\d\s:：~\-.,/()]+$/.test(line);
}

function titleLineScore(line = '', eventType = '', djs = []) {
  const value = compactText(line);
  if (!value || looksLikeNonTitleLine(value)) return -100;
  let score = 0;
  if (/(?:소셜|social|파티|party|강습|수업|레슨|class|workshop|워크샵|워크숍|원\s*데이|원데이)/i.test(value)) score += 5;
  if (/(?:^|\s)(?:DJ|디제이)(?:\s|$)|토요|금요|목요|수요|화요|월요|일요/i.test(value)) score += 3;
  if (eventType && value.includes(eventType)) score += 2;
  if (djs.some((dj) => dj && value.toLowerCase().includes(String(dj).toLowerCase()))) score += 2;
  if (value.length >= 8 && value.length <= 42) score += 2;
  if (value.length > 64) score -= 4;
  return score;
}

function pickPosterTitleLine(rawText = '', eventType = '', djs = []) {
  const lines = String(rawText || '')
    .split(/\n| {2,}|\s+[|｜]\s+/)
    .map((line) => cleanTitle(line))
    .filter((line) => line.length >= 4 && line.length <= 80);
  const ranked = lines
    .map((line, index) => ({ line, index, score: titleLineScore(line, eventType, djs) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.line || '';
}

function extractInstagramCaptionTitle(value = '') {
  return cleanTitle(extractInstagramCaptionHeadline(value));
}

function looksLikeCaptionFragmentTitle(value = '') {
  const title = cleanTitle(value);
  return !title
    || /[，,]\s*$/.test(title)
    || /(?:은|는|을|를|며|고|에서|까지)\s*$/.test(title)
    || /^(?:무료|유료)?\s*라인\s*강습(?:은|는|이|을|를)?\b/i.test(title)
    || /^(?:잊지\s*말고|일찍\s*오셔서|아직|여러분|문의|연락처|신청은|프로필\s*링크)/i.test(title)
    || /^[^\p{L}\p{N}가-힣]*(?:강습\s*)?(?:기간|일정|링크)\s*[:：]/iu.test(title)
    || /^[^\p{L}\p{N}가-힣]*일정\s*[:：].*(?:매주|주간|주\s*[회차]|~|～)/iu.test(title)
    || /^(?:바로\s*)?이어지는.{0,40}(?:소셜|행사)/i.test(title)
    || /(?:만나요|확인해\s*주세요|부탁드립니다|감사합니다|즐겨?\s*보세요|활용해\s*보세요)\s*[.!。]*$/i.test(title);
}

function makeCandidateTitle({ source, rawTitle, rawText = '', cleanText, eventType, djs = [] }) {
  const benefitTitlePattern = source.benefitKind === 'season_pass'
    ? /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|멤버십/i
    : source.benefitKind === 'discount_event'
      ? /할인|특가|얼리\s*버드|쿠폰|프로모션/i
      : source.benefitKind === 'free_event'
        ? /무료\s*(?:이벤트|행사|파티|강습|클래스|수업|체험|입장|관람)/i
        : null;
  const benefitTitle = benefitTitlePattern
    ? String(rawText || cleanText || '')
      .split(/\n| {2,}/)
      .map((line) => cleanTitle(line))
      .find((line) => (
        line.length >= 6
        && line.length <= 100
        && benefitTitlePattern.test(line)
        && !looksLikeNonTitleLine(line)
      ))
    : '';
  if (benefitTitle && !looksLikeCaptionFragmentTitle(benefitTitle)) return benefitTitle;

  const instagramCaptionTitle = extractInstagramCaptionTitle(rawTitle);
  if (instagramCaptionTitle && !looksLikeCaptionFragmentTitle(instagramCaptionTitle)) return instagramCaptionTitle;

  const cleaned = cleanTitle(rawTitle || '');
  const looksGeneratedByPlatform = /on\s+Instagram|Instagram\s+photos|네이버\s*카페|Daum\s*카페|강습일정\s*필독말머리/i.test(rawTitle || '');
  if (cleaned && cleaned.length <= 64 && !looksGeneratedByPlatform && !looksLikeNonTitleLine(cleaned) && !looksLikeCaptionFragmentTitle(cleaned)) return cleaned;

  const posterTitle = pickPosterTitleLine(rawText, eventType, djs);
  if (posterTitle) return posterTitle;

  const firstMeaningfulLine = String(rawText || cleanText || '')
    .split(/\n| {2,}/)
    .map((line) => cleanTitle(line))
    .find((line) => line.length >= 6 && line.length <= 64 && !looksLikeNonTitleLine(line) && !looksLikeCaptionFragmentTitle(line));
  if (firstMeaningfulLine && !/on\s+Instagram/i.test(firstMeaningfulLine)) return firstMeaningfulLine;

  if (eventType === '소셜' && djs.length) return `${source.name} 소셜 (${djs.slice(0, 2).join(', ')})`;
  return `${source.name} ${eventType}`;
}

function normalizeForCompare(value = '') {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\w가-힣]/g, '');
}

function looksLikeGenericTitle(title = '', source, eventType = '') {
  const normalizedTitle = normalizeForCompare(title);
  const suffixes = [eventType, '강습', '행사', '소셜', '모집'].filter(Boolean).map(normalizeForCompare);
  const sourceNames = [source?.name, source?.id].filter(Boolean).map(normalizeForCompare);
  return sourceNames.some((name) => suffixes.some((suffix) => normalizedTitle === `${name}${suffix}`));
}

function looksLikeBroadScheduleNotice(title = '', text = '') {
  const value = `${title}\n${text}`;
  if (graduationEventPattern.test(value)) return false;
  return /(?:\d{4}\s*년도\s*)?\d+\s*학기\s*정규\s*수업.*확정|정규\s*수업\s*시간표|전체\s*강습\s*일정|강습\s*전체\s*일정|공지사항.*정규\s*수업|공지사항.*정규수업/i.test(value);
}

function hasExplicitEventDateMention(text = '') {
  const raw = compactText(text);
  return /20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/.test(raw)
    || /\d{1,2}\s*월\s*\d{1,2}/.test(raw)
    || /(?<!\d)\d{1,2}\s*[./]\s*\d{1,2}(?!\d)/.test(raw);
}

function selectCandidateDates({ title, cleanText, activity }) {
  const evidenceText = `${title}\n${cleanText}`;
  const titleDates = filterDeadlineOnlyEventDates(extractDates(title), evidenceText, activity);
  if (titleDates.length) {
    if (activity === 'social') return titleDates;
    return keepFirstEventDateOnly(titleDates);
  }
  if (hasExplicitEventDateMention(title)) return [];
  const sourceDates = filterDeadlineOnlyEventDates(extractDates(cleanText), evidenceText, activity);
  if (activity === 'social') return sourceDates;
  return keepFirstEventDateOnly(sourceDates);
}

function socialDayTitle(day = '') {
  return ({
    월: '월요',
    화: '화요',
    수: '수요',
    목: '목요',
    금: '금요',
    토: '토요',
    일: '일요',
  })[day] || '';
}

function getYearForMonth(month) {
  const now = new Date();
  const currentMonth = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(now));
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
  if (exceptionBacktest) {
    return Number(month) > currentMonth ? currentYear - 1 : currentYear;
  }
  return Number(month) + 1 < currentMonth ? currentYear + 1 : currentYear;
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleWithin(promise, timeoutMs = 2_000) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve(promise).catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 0, readBody = (response) => response.text()) {
  const controller = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)
    : null;
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await readBody(response);
    return { response, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function jitter(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.round(ms * (0.8 + Math.random() * 0.4)));
}

function runRemainingMs() {
  if (!runBudgetMs) return Number.POSITIVE_INFINITY;
  return Math.max(0, runBudgetMs - (Date.now() - runStartedAtMs));
}

function hasRunBudget(minRemainingMs = 0) {
  return runRemainingMs() > minRemainingMs;
}

function runDeadlineGuardMs() {
  if (!runBudgetMs) return 0;
  return runBudgetMs >= 120_000 ? 60_000 : Math.max(1_000, Math.floor(runBudgetMs * 0.1));
}

function ensureRunBudgetOrThrow(label = '', minRemainingMs = 0) {
  if (!hasRunBudget(minRemainingMs)) {
    throw new RunBudgetReachedError(label);
  }
}

function boundedRunTimeout(timeoutMs, guardMs = 1_000) {
  if (!runBudgetMs) return timeoutMs;
  const remaining = runRemainingMs() - Math.max(0, guardMs);
  if (remaining <= 0) {
    throw new RunBudgetReachedError('bounded step');
  }
  return Math.max(1_000, Math.min(timeoutMs, remaining));
}

function recordDeadlineReached(sources, startIndex) {
  if (result.deadlineReached) return;
  const remaining = sources.slice(startIndex).map((source) => source.id);
  result.deadlineReached = true;
  result.remainingSources = unique([...result.remainingSources, ...remaining]);
  result.issues.push(`run budget reached; remaining sources ${remaining.length}`);
  log(`run budget reached; remaining=${remaining.length}; remaining_ms=${runRemainingMs()}`);
}

function recordNetworkUnavailable(sources, startIndex, reason = 'network unavailable') {
  const remaining = sources.slice(startIndex).map((source) => source.id);
  result.remainingSources = unique([...result.remainingSources, ...remaining]);
  result.issues.push(`${reason}; remaining sources ${remaining.length}`);
  log(`${reason}; remaining=${remaining.length}; remaining_ms=${runRemainingMs()}`);
}

function isNetworkUnavailableMessage(message = '') {
  return /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/i.test(String(message || ''));
}

function sourceOrderWeight(source) {
  const hasRunOrder = source.runOrder !== null && source.runOrder !== undefined;
  const runOrder = Number(source.runOrder);
  if (hasRunOrder && Number.isFinite(runOrder)) return runOrder;
  return sourceTypeWeight.get(source.type) ?? 5;
}

function eventLabelForBenefitSource(source = {}) {
  const label = String(source.name || '').replace(
    /\s+(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|프리\s*패스|티켓\s*북|멤버십)(?:\s*(?:판매|검색))?\s*$/i,
    '',
  ).trim();
  return label || String(source.name || '');
}

function instagramProfileUrl(url = '') {
  try {
    const parsed = new URL(url);
    if (/instagram\.com$/i.test(parsed.hostname) && !parsed.searchParams.has('hl')) {
      parsed.searchParams.set('hl', 'ko');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function instagramHandleFromSource(source = {}) {
  try {
    const parsed = new URL(source.url || '');
    return parsed.pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return '';
  }
}

function expectedInstagramHandlesForSource(source = {}) {
  return unique([
    expectedInstagramHandleForSource(source),
    ...(source.instagramPostAuthorHandles || []),
  ].map((handle) => String(handle || '').trim().replace(/^@/, '').toLowerCase()).filter(Boolean));
}

function instagramShortcodeFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1] || '';
  } catch {
    return '';
  }
}

function instagramPostUrlFromShortcode(handle = '', shortcode = '') {
  if (!shortcode) return '';
  return handle
    ? `https://www.instagram.com/${handle}/p/${shortcode}/`
    : `https://www.instagram.com/p/${shortcode}/`;
}

function sortInstagramShortcodesNewestFirst(values = []) {
  return [...values].sort((a, b) => {
    const aCode = instagramShortcodeFromUrl(a);
    const bCode = instagramShortcodeFromUrl(b);
    return bCode.localeCompare(aCode) || a.localeCompare(b);
  });
}

function socialAiStepAllowanceMs(source = {}) {
  return aiSocialExtractionEnabled
    && !exceptionBacktest
    && source?.scope === 'swing'
    && !source?.benefitKind
    ? aiSocialExtractionTimeoutMs
    : 0;
}

function candidatePostStepTimeoutMs(source = {}, extraMs = 8_000) {
  return postTimeoutMs + extraMs + socialAiStepAllowanceMs(source);
}

function estimatedInstagramSourceBudgetMs(postCount = 1, source = {}) {
  const safePostCount = Math.max(1, Number(postCount) || 1);
  const profileBudgetMs = instagramSourceDelayMs + sourceTimeoutMs + instagramProfileWaitMs + 3_000;
  return profileBudgetMs + estimatedInstagramPostScanBudgetMs(safePostCount, source);
}

function estimatedInstagramPostScanBudgetMs(postCount = 1, source = {}) {
  const safePostCount = Math.max(1, Number(postCount) || 1);
  const perPostBudgetMs = instagramPostDelayMs + postTimeoutMs + postRequestTimeoutMs
    + imageFetchTimeoutMs + socialAiStepAllowanceMs(source) + 2_000;
  return (safePostCount * perPostBudgetMs) + runDeadlineGuardMs();
}

function resolveInstagramPostLimit(linkCount = postLimit, source = {}) {
  const maxPosts = Math.max(1, Math.min(postLimit, instagramSourcePostLimit, Number(linkCount) || 0));
  if (!runBudgetMs) return maxPosts;
  for (let count = maxPosts; count >= 1; count -= 1) {
    if (runRemainingMs() >= estimatedInstagramPostScanBudgetMs(count, source)) return count;
  }
  return 0;
}

function resolveSourceScanLimit(source, discoveredCount = 0) {
  const count = Math.max(0, Number(discoveredCount) || 0);
  if (count <= 0) return 0;

  const sourceText = `${source?.name || ''}\n${source?.notes || ''}\n${source?.id || ''}`;
  const graduationBoost = graduationEventPattern.test(sourceText) ? 1 : 0;

  if (source.type === 'instagram') return Math.max(1, Math.min(count, instagramSourcePostLimit + graduationBoost));
  if (source.type === 'naver_cafe') return Math.max(1, Math.min(count, naverSourcePostLimit + graduationBoost));
  if (source.type === 'daum_cafe') return Math.max(1, Math.min(count, daumSourcePostLimit + graduationBoost));
  if (source.type === 'littly') return Math.max(1, Math.min(count, littlySourceCardLimit + (graduationBoost * 2)));
  return Math.max(1, Math.min(count, postLimit));
}

async function throttleInstagram(label, baseDelayMs) {
  if (!instagramSafeMode || !baseDelayMs) return;
  const elapsed = Date.now() - lastInstagramHitAt;
  const waitMs = elapsed > baseDelayMs ? 0 : jitter(baseDelayMs - elapsed);
  if (waitMs > 0) {
    ensureRunBudgetOrThrow(`instagram throttle ${label}`, waitMs + runDeadlineGuardMs());
    log(`instagram safe wait ${Math.round(waitMs / 1000)}s before ${label}`);
    await sleep(waitMs);
  }
  lastInstagramHitAt = Date.now();
}

function markInstagramProfileSuccess() {
  instagramProfileFailureStreak = 0;
}

function extractDates(text = '') {
  const raw = compactText(text);
  const dates = [];
  const isTimeContext = (index, length) => {
    const context = raw.slice(Math.max(0, index - 10), Math.min(raw.length, index + length + 10));
    return /(?:오전|오후|저녁|am|pm)\s*$/i.test(context.slice(0, 10))
      || /^\s*(?:시|:|\d{2}\b)/.test(context.slice(10))
      || /\d{1,2}\s*[:：]\s*\d{2}/.test(context);
  };

  for (const match of raw.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)) {
    dates.push(isoDate(match[1], match[2], match[3]));
  }

  for (const match of raw.matchAll(/(\d{1,2})\s*월\s*((?:\d{1,2}\s*(?:일)?\s*(?:[,，·ㆍ/&]|및|와|과|~|-)?\s*){1,8})/g)) {
    const month = Number(match[1]);
    const year = getYearForMonth(month);
    const days = [...match[2].matchAll(/\d{1,2}/g)].map((day) => Number(day[0])).filter((day) => day >= 1 && day <= 31);
    for (const day of days) dates.push(isoDate(year, month, day));
  }

  for (const match of raw.matchAll(/(?<!\d)(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (isTimeContext(match.index, match[0].length)) continue;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(isoDate(getYearForMonth(month), month, day));
    }
  }

  const todayMs = Date.parse(`${today}T00:00:00+09:00`);
  const lookbackStartMs = todayMs - exceptionLookbackDays * 86400000;
  return unique(dates)
    .filter((date) => {
      const dateMs = Date.parse(`${date}T00:00:00+09:00`);
      if (!Number.isFinite(dateMs)) return false;
      if (exceptionBacktest) return dateMs >= lookbackStartMs && dateMs <= todayMs;
      return date >= today && (dateMs - todayMs) / 86400000 <= maxFutureDays;
    })
    .sort();
}

function extractSocialDateHints(text = '') {
  const value = compactText(text);
  const dates = new Set(extractDates(value));
  for (const match of value.matchAll(/(?<!\d)(\d{1,2})\s*[./]\s*(\d{1,2})[^\n]{0,80}(?:[/,，·ㆍ&]|및|와|과)\s*(\d{1,2})\s*일/g)) {
    const month = Number(match[1]);
    const firstDay = Number(match[2]);
    const inheritedDay = Number(match[3]);
    if (month < 1 || month > 12 || firstDay < 1 || firstDay > 31 || inheritedDay < 1 || inheritedDay > 31) continue;
    for (const day of [firstDay, inheritedDay]) {
      const date = isoDate(getYearForMonth(month), month, day);
      if (isCollectableDate(date, { today })) dates.add(date);
    }
  }
  return [...dates].sort();
}

function inferActivity(text = '', rawTitle = '') {
  if (/판매\s*이벤트|이벤트\s*판매|정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b|\bsale\b|\bpromotion\b/i.test(text)) {
    return { activity: 'sale', eventType: '판매이벤트' };
  }
  if (/(?:창립|오픈|개장)?\s*\d+\s*주년.{0,30}(?:파티|행사)|(?:파티|행사).{0,30}\d+\s*주년|anniversary/i.test(text)) {
    return { activity: 'event', eventType: '행사' };
  }
  if (/(참가자|팀원|크루|멤버|강사|댄서|출연진)\s*모집|오디션/i.test(text)) return { activity: 'recruit', eventType: '모집' };
  if (/(?:강습|클래스|원\s*데이|원데이).{0,40}(?:신청\s*링크|신청서|접수|모집)|(?:신청\s*링크|신청서|접수|모집).{0,40}(?:강습|클래스|원\s*데이|원데이)/i.test(text)) {
    return { activity: 'recruit', eventType: '모집' };
  }
  if (isInstagramCaptionClassHeadline(rawTitle)) {
    return { activity: 'class', eventType: '강습' };
  }
  if (
    /(?:경성|다이나믹\s*발보아|dynamic\s*balboa)\s*클래스|클래스\s*[:：]|(?:강습|수업|클래스).{0,24}(?:신청|안내)|신청.{0,24}(?:강습|수업|클래스)/i.test(text)
  ) {
    return { activity: 'class', eventType: '강습' };
  }
  if (/소셜|social|(?<![A-Za-z0-9가-힣])DJ|디제이|파티|party/i.test(text)) return { activity: 'social', eventType: '소셜' };
  if (graduationEventPattern.test(text)) return { activity: 'event', eventType: '행사' };
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원\s*데이|원데이|오픈\s*클래스|체험\s*(?:클래스|강습|수업)|일일\s*(?:클래스|강습|수업)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|배워)|입문|초급|중급|class|lesson|workshop|one\s*day|oneday|open\s*class/i.test(text)) {
    return { activity: 'class', eventType: '강습' };
  }
  return { activity: 'event', eventType: '행사' };
}

function selectSourceEvidenceText(text = '', source = {}) {
  const raw = String(text || '');
  if (source.id !== 'sosyalclub_swing') return raw;

  const [koreanSection = ''] = raw.split(/-{10,}/);
  if (
    /Balboa in Social club/i.test(koreanSection)
    && /날짜\s*[:：]\s*\d{1,2}\s*월\s*\d{1,2}\s*일/i.test(koreanSection)
    && /장소\s*[:：]\s*쏘?셜클럽/i.test(koreanSection)
    && /D\s*J\s*[:：]\s*[A-Za-z가-힣]/i.test(koreanSection)
  ) {
    return koreanSection.trim();
  }
  return raw;
}

function inferVenueDetails(text = '', source) {
  const configured = sourceSpecificVenue.get(source?.id);
  const resolved = resolveSourceVenueEvidence({
    text,
    sourceVenue: source?.venue || '',
    mappedVenue: configured || '',
    aliases: venueAliases,
    djs: inferDjs(text),
  });
  if (resolved.venue || resolved.provenance === 'explicit_variable') return resolved;
  const sourceMatched = venueAliases.find(([pattern]) => pattern.test(`${source?.name || ''} ${source?.id || ''}`));
  if (sourceMatched) return { venue: sourceMatched[1], provenance: 'source_alias' };
  return resolved;
}

function inferDjs(text = '') {
  const djs = [];
  const explicitLabelMatches = [...text.matchAll(/(?<![A-Za-z0-9가-힣])(?:D\s*J(?![A-Za-z])|디제이(?![A-Za-z0-9가-힣]))(?:\s*(?:는|은|가|이))?\s*[:：]\s*["'“”‘’♥♡❤💙💛💜]*\s*([A-Za-z0-9가-힣._&+\-/ ★☆✦✧♥♡❤💙💛💜]{1,40})/gi)];
  const broadLabelMatches = explicitLabelMatches.length ? [] : [...text.matchAll(/(?<![A-Za-z0-9가-힣])(?:D\s*J(?![A-Za-z])|디제이(?![A-Za-z0-9가-힣]))(?:\s*(?:는|은|가|이)(?=\s|[:：♥♡❤]))?\s*[:：]?\s*["'“”‘’♥♡❤💙💛💜]*\s*([A-Za-z0-9가-힣._&+\-/ ★☆✦✧♥♡❤💙💛💜]{1,40})/gi)];
  for (const match of explicitLabelMatches.length ? explicitLabelMatches : broadLabelMatches) {
    const value = stripRepeatedDjContext(stripNaverCafeMemberPrefix(compactText(match[1]))
      .replace(/\s*(?:DJ\s*)?time\b.*$/i, '')
      .replace(/\s*(?:application|registration|apply)\s*link\b.*$/i, '')
      .replace(/\s*(?:사전\s*신청|현장\s*신청|신청|등록|입금|계좌|문의)\s*(?:링크|방법|안내)?.*$/i, '')
      .replace(/\s+20\d{2}[.\-/년].*$/i, '')
      .replace(/^(?:인기\s*멤버\s*)?(?:\d+\s*F\s*)?스칼라\s+(?:부\s*매니저\s*\d*\s*)?/i, '')
      .replace(/\s*(?:와|과|및|님|입니다|입니다\.|와 함께).*$/i, '')
      .replace(/\s*(?:소셜은|소셜\s*은|참석|되시며|됩니다|문의|입장|현금|카드|제로페이).*$/i, '')
      .replace(/\s*(?:月|월|생일|잼서클|라인\s*강습|있어요|쉬어요|\d+\s*기|지터벅|확정|환영).*$/i, '')
      .replace(/\s*(?:AM|PM|오전|오후)\b.*$/i, '')
      .replace(/\s*\d{1,2}[:：]\d{2}.*$/, '')
      .replace(/^[._\-\s]+/, '')
      .replace(/\b([A-Za-z가-힣._-]{1,12})\s+\1\b/i, '$1')
      .replace(/^(.{1,12})\s+\1$/u, '$1')
      .trim());
    if (
      value
      && value.length <= 28
      && !/(?:line[\s-]*up|라인업|social|소셜|\bD\s*J\b|디제이)/i.test(value)
      && !looksLikeNaverCafeChromeLine(value)
      && !leadingDateTitleRe.test(value)
    ) {
      djs.push(value);
    }
  }
  return unique(djs).slice(0, 5);
}

function inferFee(text = '') {
  const match = String(text || '').match(/\(?\s*(\d{1,3}(?:,\d{3})*)\s*원\s*\)?/);
  return match ? `${match[1]}원` : '';
}

function inferUnambiguousFee(text = '') {
  const fees = unique(
    [...String(text || '').matchAll(/\(?\s*(\d{1,3}(?:,\d{3})*)\s*원\s*\)?/g)]
      .map((match) => `${match[1]}원`),
  );
  return fees.length === 1 ? fees[0] : '';
}

function explicitDateListEvidence(text = '', date = '') {
  const match = String(date).match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  for (const dateList of String(text).matchAll(/\d{1,2}\s*월\s*(?:\d{1,2}\s*(?:일)?\s*(?:[,，·ㆍ/&]|및|와|과)?\s*){1,8}/g)) {
    const value = dateList[0];
    const parsedMonth = Number(value.match(/^(\d{1,2})/)?.[1]);
    const days = [...value.replace(/^\d{1,2}\s*월/, '').matchAll(/\d{1,2}/g)].map((item) => Number(item[0]));
    if (parsedMonth === month && days.includes(day)) return value.trim();
  }
  return '';
}

function extractSocialScheduleItems(text = '', source, title = '', publishedAt = '') {
  const raw = compactText(text);
  if (source?.id === 'neo_swing' && /위클리\s*네오/i.test(raw)) {
    return extractNeoWeeklySocialSchedule({ text: raw, today }).flatMap((item) => {
      const [date] = alignYearlessDatesToPublication([item.date], raw, publishedAt);
      if (!isCollectableDate(date, { today })) return [];
      return [{
        date,
        day: item.day,
        title: `${source.name.replace(/\s*인스타그램$/i, '')} ${socialDayTitle(item.day) || ''} 소셜`.replace(/\s+/g, ' ').trim(),
        djs: item.djs,
        fee: '',
        aiEvidenceText: [
          item.venueEvidence,
          item.dateLabel,
          item.normalizedDateEvidence,
          item.djLabel,
        ].filter(Boolean).join('\n'),
      }];
    });
  }
  const items = [];
  for (const section of extractIndependentSocialDateSections({ title, text, today })) {
    const [date] = alignYearlessDatesToPublication([section.date], raw, publishedAt);
    if (!isCollectableDate(date, { today })) continue;
    const titleDay = socialDayTitle(section.day);
    items.push({
      date,
      day: section.day,
      title: titleDay ? `${source.name} ${titleDay} 소셜` : `${source.name} 소셜`,
      djs: inferDjs(section.segment),
      fee: inferUnambiguousFee(section.segment),
      aiEvidenceText: [
        source.venue && raw.includes(source.venue) ? source.venue : '',
        section.titleEvidence || title,
        explicitDateListEvidence(raw, date),
        section.normalizedDateEvidence,
        section.dayLabel,
        section.segment,
      ].filter(Boolean).join('\n'),
    });
  }
  const pattern = /(?:^|\s)(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2})\s*(?:일)?\s*(?:\(\s*([월화수목금토일])\s*\))?\s*(?:소셜|social)\s*[:：]?\s*([\s\S]*?)(?=(?:\s\d{1,2}\s*(?:[./]|월)\s*\d{1,2}\s*(?:일)?\s*(?:\(\s*[월화수목금토일]\s*\))?\s*(?:소셜|social)\s*[:：]?)|$)/gi;
  for (const match of raw.matchAll(pattern)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const [date] = alignYearlessDatesToPublication(
      [isoDate(getYearForMonth(month), month, day)],
      raw,
      publishedAt,
    );
    const segment = compactText(match[4] || '');
    if (!isCollectableDate(date, { today })) continue;
    const dayLabel = match[3] || '';
    const titleDay = socialDayTitle(dayLabel);
    items.push({
      date,
      day: dayLabel,
      title: titleDay ? `${source.name} ${titleDay} 소셜` : `${source.name} 소셜`,
      djs: inferDjs(segment),
      fee: inferUnambiguousFee(segment),
    });
  }
  const mergedItems = mergeSocialScheduleFallbacks(items, extractDatedDjSocialItems(raw, source, publishedAt));
  items.splice(0, items.length, ...mergedItems);
  const seen = new Set(items.map((item) => `${item.date}:${item.djs.join(',')}`));
  for (const item of extractHappyHallWeeklySocialItems(raw, source, publishedAt)) {
    const key = `${item.date}:${item.djs.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

function extractDatedDjSocialItems(raw = '', source, publishedAt = '') {
  const items = [];
  for (const section of extractDatedDjSections({ text: raw, today })) {
    const [date] = alignYearlessDatesToPublication([section.date], raw, publishedAt);
    if (!isCollectableDate(date, { today })) continue;
    const segment = compactText(section.segment);
    const djs = inferDjs(segment);
    if (!djs.length) continue;

    const dayLabel = section.day || dayLabelFromISO(date);
    const titleDay = socialDayTitle(dayLabel);
    items.push({
      date,
      day: dayLabel,
      title: `${source.name} ${titleDay || ''} 소셜`.replace(/\s+/g, ' ').trim(),
      djs,
      fee: inferUnambiguousFee(segment),
      aiEvidenceText: [
        raw.includes(source.name) ? source.name : '',
        source.venue && raw.includes(source.venue) ? source.venue : '',
        section.dateLabel,
        segment.split(/\s(?:💰|✨|입장료|클래스\s*[:：])/i)[0].trim(),
      ].filter(Boolean).join('\n'),
    });
  }
  return items;
}

function dayLabelFromISO(date = '') {
  const index = new Date(`${date}T00:00:00+09:00`).getDay();
  return ['일', '월', '화', '수', '목', '금', '토'][index] || '';
}

function extractHappyHallWeeklySocialItems(raw = '', source, publishedAt = '') {
  const sourceValue = `${source?.id || ''} ${source?.name || ''}`;
  if (!/(happyhall2004|neo_swing|neoswing|해피홀|네오스윙)/i.test(sourceValue)) return [];
  if (!/(금\s*햅|일\s*햅|해피홀|happy\s*hall|DJ|디제이)/i.test(raw)) return [];
  const dates = alignYearlessDatesToPublication(extractDates(raw), raw, publishedAt)
    .filter((date) => isCollectableDate(date, { today }))
    .slice(0, 4);
  const djs = inferDjs(raw);
  if (!dates.length || !djs.length) return [];
  const fee = inferFee(raw);
  const items = [];
  for (const [index, date] of dates.entries()) {
    const assignedDj = djs[index] || (dates.length === 1 ? djs[0] : '');
    if (!assignedDj) continue;
    if (!isCollectableDate(date, { today })) continue;
    const day = dayLabelFromISO(date);
    const titleDay = socialDayTitle(day);
    items.push({
      date,
      day,
      title: `${source.name} ${titleDay || ''} 소셜`.replace(/\s+/g, ' ').trim(),
      djs: [assignedDj],
      fee,
      aiEvidenceText: [
        source.venue && raw.includes(source.venue) ? source.venue : '',
        explicitDateListEvidence(raw, date),
        raw.slice(0, 3000),
      ].filter(Boolean).join('\n'),
    });
  }
  return items;
}

function imageNaturalArea(image) {
  return Number(image?.w || 0) * Number(image?.h || 0);
}

function imageRenderedArea(image) {
  return Number(image?.rectW || 0) * Number(image?.rectH || 0);
}

function isUsablePosterImage(image) {
  const src = String(image?.src || '');
  const alt = String(image?.alt || '');
  return src
    && Number(image.w || 0) >= 300
    && Number(image.h || 0) >= 300
    && !/profile|avatar|emoji|emoticon|static\/cafe|btn_|logo/i.test(`${src} ${alt}`);
}

function pickPosterImages(images = [], limit = 1) {
  const seen = new Set();
  return images
    .filter(isUsablePosterImage)
    .sort((a, b) => (
      Number(b.priority || 0) - Number(a.priority || 0)
      || imageRenderedArea(b) - imageRenderedArea(a)
      || imageNaturalArea(b) - imageNaturalArea(a)
    ))
    .map((image) => image.src)
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .slice(0, limit);
}

function pickPosterImage(images = []) {
  return pickPosterImages(images, 1)[0] || '';
}

function pickInstagramPostImages(images = [], limit = 4) {
  const eligible = images.filter(isUsablePosterImage);
  if (!eligible.length) return [];
  const directPostMedia = eligible.filter((image) => isDirectInstagramPostMediaUrl(image.src));
  // Current Instagram pages may omit an <article> wrapper and append equally large
  // recommendation images below the post. Prefer URLs marked as the opened post's
  // media; fall back only when Instagram did not expose those URL markers at all.
  const scopedEligible = directPostMedia.length ? directPostMedia : eligible;
  const maxRenderedArea = Math.max(0, ...scopedEligible.map(imageRenderedArea));
  const maxNaturalArea = Math.max(0, ...scopedEligible.map(imageNaturalArea));
  const primaryImages = scopedEligible
    .filter((image) => {
      const renderedArea = imageRenderedArea(image);
      const naturalArea = imageNaturalArea(image);
      if (maxRenderedArea >= 90_000 && renderedArea >= maxRenderedArea * 0.55) return true;
      // Instagram carousels often keep only the active slide visibly rendered.
      // Keep similarly large off-screen images so multi-image posts do not collapse to one poster.
      return maxNaturalArea > 0 && naturalArea >= maxNaturalArea * 0.55;
    })
    .sort((a, b) => (
      Number(b.priority || 0) - Number(a.priority || 0)
      || imageRenderedArea(b) - imageRenderedArea(a)
      || imageNaturalArea(b) - imageNaturalArea(a)
    ));
  const seen = new Set();
  return primaryImages
    .filter((image) => {
      const src = image.src;
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .slice(0, limit);
}

function pickInstagramPostImageUrls(images = [], limit = 4) {
  return pickInstagramPostImages(images, limit).map((image) => image.src);
}

function cleanInstagramImageAlt(value = '') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw || /프로필\s*사진|profile picture/i.test(raw)) return '';
  const quoted = raw.match(/문구\s*:\s*['"“”‘’]?\s*([\s\S]{6,700}?)(?:['"“”‘’]?\s*(?:의\s*이미지|의\s*사진|일\s*수\s*있음)|$)/i);
  if (quoted?.[1]) return quoted[1].trim();
  return raw
    .replace(/^Photo by [^.]+ on [^.]+\.?\s*/i, '')
    .replace(/(?:의\s*이미지|의\s*사진)일\s*수\s*있음\.?$/i, '')
    .trim();
}

async function imageToDataUrl(page, imageUrl, referer = '') {
  if (!imageUrl) return '';
  try {
    return await page.evaluate(async ({ url, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error(`image fetch ${response.status}`);
        const blob = await response.blob();
        if (blob.size < 1000 || blob.size > 5_500_000) return '';
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } finally {
        clearTimeout(timer);
      }
    }, { url: imageUrl, timeoutMs: imageFetchTimeoutMs });
  } catch {}

  try {
    const { response, body: buffer } = await fetchWithTimeout(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...(referer ? { Referer: referer } : {}),
      },
    }, imageFetchTimeoutMs, async (response) => Buffer.from(await response.arrayBuffer()));
    if (!response.ok) return '';
    if (buffer.length < 1000 || buffer.length > 5_500_000) return '';
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function safeGoto(page, url, timeout = sourceTimeoutMs) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1800);
}

async function bestEffortGoto(page, url, timeout = 15_000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  } catch (error) {
    if (!/timeout/i.test(error.message || '')) throw error;
  }
  await page.waitForTimeout(1800);
}

async function collectInstagramLinks(page, source) {
  await safeGoto(page, instagramProfileUrl(source.url));
  await page.waitForTimeout(instagramProfileWaitMs);
  await page.keyboard.press('Escape').catch(() => {});
  const state = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map((a, index) => ({
        href: a.href ? a.href.split('?')[0] : '',
        text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
        index,
      }))
      .filter((item) => item.href)
      .sort((a, b) => {
        const aPinned = /고정|pinned/i.test(a.text) ? 1 : 0;
        const bPinned = /고정|pinned/i.test(b.text) ? 1 : 0;
        return aPinned - bPinned || a.index - b.index;
      });
    const seen = new Set();
    const dedupedLinks = [];
    for (const item of links) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      dedupedLinks.push(item.href);
    }
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000);
    const title = document.title || '';
    const url = window.location.href;
    return { links: dedupedLinks.slice(0, 48), bodyText, title, url };
  }).catch(() => ({ links: [], bodyText: '', title: '', url: '' }));

  if (state.links.length) {
    const expectedHandles = expectedInstagramHandlesForSource(source);
    const scopedLinks = state.links.filter((url) => instagramPostMatchesExpectedHandle(url, expectedHandles));
    if (scopedLinks.length) return scopedLinks;
  }

  const profilePageState = classifyInstagramProfilePage({
    url: state.url,
    title: state.title,
    bodyText: state.bodyText,
    linkCount: 0,
  });
  if (profilePageState === 'source_unavailable') {
    throw new Error('instagram source page unavailable');
  }
  const fallbackLinks = await collectInstagramLinksViaImginn(page, source);
  if (fallbackLinks.length) {
    log(`instagram profile fallback ${source.id}: imginn ${fallbackLinks.length} links`);
    return fallbackLinks;
  }

  if (profilePageState === 'no_content') {
    throw new Error('no content: instagram no posts yet');
  }
  if (profilePageState === 'global_block') {
    throw new Error('instagram global access blocked or challenge required');
  }
  if (profilePageState === 'login_wall') {
    throw new Error('instagram login wall; public profile fallback unavailable');
  }

  throw new Error('instagram post list unavailable');
}

async function collectBenefitSearchLinks(page, source) {
  const readSearchTargets = async (url) => {
    await safeGoto(page, url, Math.min(sourceTimeoutMs, 20_000));
    const state = await page.evaluate(() => ({
      hrefs: [...document.querySelectorAll('a[href]')].map((anchor) => anchor.getAttribute('href') || anchor.href || ''),
      bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500),
      url: window.location.href,
    }));
    return {
      state,
      targets: {
        postUrls: extractInstagramPostUrls(state.hrefs, state.url),
        profileUrls: extractInstagramProfileUrls(state.hrefs, state.url),
        documentUrls: extractBenefitDocumentUrls(state.hrefs, state.url),
      },
    };
  };

  const googleBatches = [];
  let googleBlocked = false;
  for (const searchUrl of buildBenefitSearchUrls(source.query, source.url)) {
    const batch = await readSearchTargets(searchUrl);
    googleBatches.push(batch.targets);
    const currentPageBlocked = /unusual traffic|abnormal traffic|비정상적인\s*트래픽|captcha|자동화된\s*쿼리|로봇이\s*아니|동의하기/i.test(batch.state.bodyText);
    googleBlocked ||= currentPageBlocked;
    if (traceSourceIds.has(source.id)) {
      log(`trace ${source.id} search page: ${JSON.stringify({
        requestedUrl: searchUrl,
        resultUrl: batch.state.url,
        bodyText: batch.state.bodyText.slice(0, 300),
        relevantHrefs: batch.state.hrefs.filter((href) => /daum|sweetyswing|instagram|naver/i.test(href)).slice(0, 20),
        targets: batch.targets,
      })}`);
    }
    if (currentPageBlocked) break;
  }
  let mergedTargets = mergeBenefitSearchTargets(...googleBatches);

  if (!mergedTargets.postUrls.length && !mergedTargets.profileUrls.length && !mergedTargets.documentUrls.length && googleBlocked) {
    recordAccessFailure(source, 'Google search blocked by unusual traffic');
    const fallbackUrl = `https://www.bing.com/search?q=${encodeURIComponent(source.query || '')}`;
    const fallback = await readSearchTargets(fallbackUrl);
    const naverLatestUrl = `https://search.naver.com/search.naver?where=nexearch&sort=date&query=${encodeURIComponent(source.query || '')}`;
    const naverRelevanceUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(source.query || '')}`;
    const naverLatest = await readSearchTargets(naverLatestUrl);
    const naverRelevance = await readSearchTargets(naverRelevanceUrl);
    mergedTargets = mergeBenefitSearchTargets(fallback.targets, naverLatest.targets, naverRelevance.targets);
  } else if (!mergedTargets.postUrls.length && !mergedTargets.profileUrls.length && !mergedTargets.documentUrls.length) {
    const naverLatestUrl = `https://search.naver.com/search.naver?where=nexearch&sort=date&query=${encodeURIComponent(source.query || '')}`;
    const naverRelevanceUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(source.query || '')}`;
    const naverLatest = await readSearchTargets(naverLatestUrl);
    const naverRelevance = await readSearchTargets(naverRelevanceUrl);
    mergedTargets = mergeBenefitSearchTargets(naverLatest.targets, naverRelevance.targets);
  }

  if (traceSourceIds.has(source.id)) {
    log(`trace ${source.id} search targets: ${JSON.stringify(mergedTargets)}`);
  }

  return {
    postUrls: mergedTargets.postUrls.slice(0, Math.max(1, postLimit)),
    profileUrls: mergedTargets.profileUrls.slice(0, 3),
    documentUrls: mergedTargets.documentUrls.slice(0, Math.max(1, postLimit)),
  };
}

async function collectInstagramLinksViaImginn(page, source) {
  const handle = instagramHandleFromSource(source);
  if (!handle) return [];
  const discoveryUrl = `https://imginn.com/${handle}/`;
  try {
    await bestEffortGoto(page, discoveryUrl, Math.min(sourceTimeoutMs, 15_000));
    await page.waitForTimeout(2_500);
    const state = await page.evaluate(() => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200);
      const title = document.title || '';
      const url = window.location.href;
      const links = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
        .map((a) => a.href)
        .filter(Boolean);
      return { bodyText, title, url, links };
    });
    if (!isVerifiedInstagramFallbackProfile({
      expectedHandle: handle,
      title: state.title,
      bodyText: state.bodyText,
      url: state.url,
    })) {
      return [];
    }
    const urls = [...new Set(state.links
      .map((url) => instagramPostUrlFromShortcode(handle, instagramShortcodeFromUrl(url)))
      .filter(Boolean))];
    return sortInstagramShortcodesNewestFirst(urls).slice(0, Math.max(postLimit * 12, 48));
  } catch (error) {
    log(`instagram profile fallback failed ${source.id}: ${error.message || error}`);
    return [];
  }
}

async function scrapeInstagramPost(page, url, source) {
  await safeGoto(page, url, postTimeoutMs);
  await page.keyboard.press('Escape').catch(() => {});
  const data = await page.evaluate(() => {
    const metaDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]')?.getAttribute('content') || '';
    const articleText = [...document.querySelectorAll('article span, h1, div[role="button"]')]
      .map((node) => node.textContent || '')
      .filter((text) => text.trim().length > 20)
      .join('\n');
    const article = document.querySelector('article') || document;
    const images = [...article.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
        rectW: Math.round(img.getBoundingClientRect().width || 0),
        rectH: Math.round(img.getBoundingClientRect().height || 0),
      }));
    const publishedAt = document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const profileHrefs = [...article.querySelectorAll('a[href]')]
      .map((anchor) => anchor.href || anchor.getAttribute('href') || '')
      .filter(Boolean)
      .slice(0, 80);
    return { metaDescription, ogTitle, ogImage, twitterImage, articleText, images, publishedAt, profileHrefs };
  });

  const primaryImages = pickInstagramPostImages(data.images, postLimit);
  const imageAltText = primaryImages
    .map((image) => cleanInstagramImageAlt(image.alt || ''))
    .filter(Boolean)
    .join('\n');
  let text = [imageAltText, data.articleText || data.metaDescription || data.ogTitle || '']
    .filter(Boolean)
    .join('\n');
  if (traceSourceIds.has(source.id)) {
    log(`trace ${source.id} ${url}: ${JSON.stringify({
      publishedAt: data.publishedAt,
      title: data.ogTitle,
      text: text.slice(0, 3000),
      primaryImages: primaryImages.map(({ src, w, h, rectW, rectH }) => ({ src, w, h, rectW, rectH })),
      ogImage: data.ogImage,
    })}`);
  }
  const quoted = data.metaDescription.match(/:\s*"([\s\S]*?)(?:"$|$)/);
  if (quoted?.[1] && quoted[1].length > text.length / 2) text = quoted[1];
  const expectedHandles = expectedInstagramHandlesForSource(source);
  if (!instagramAuthorMatches({
    expectedHandles,
    ogTitle: data.ogTitle,
    metaDescription: data.metaDescription.slice(0, 240),
    profileHrefs: data.profileHrefs,
  })) {
    result.skipped += 1;
    log(`skip ${source.id}: instagram author mismatch (${expectedHandles.join(',')})`);
    return [];
  }
  const posterUrls = primaryImages.map((image) => image.src);
  const fallbackPosterUrl = pickPosterImage([
    { src: data.ogImage, w: 336, h: 336, priority: 1 },
    { src: data.twitterImage, w: 336, h: 336, priority: 1 },
    ...data.images,
  ]);
  return buildCandidatesFromText({
    source,
    sourceUrl: url,
    text,
    title: data.ogTitle || text,
    posterUrl: posterUrls[0] || fallbackPosterUrl,
    posterUrls: posterUrls.length ? posterUrls : [fallbackPosterUrl].filter(Boolean),
    page,
    publishedAt: data.publishedAt,
  });
}

async function collectNaverArticleLinks(page, source) {
  await safeGoto(page, source.url);
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]').length > 0, null, { timeout: 9000 }).catch(() => {});
  const items = await page.evaluate(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const imageOf = (root) => {
      const img = root?.querySelector('img');
      return img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazysrc') || '';
    };
    return [...document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]')]
      .map((anchor, index) => {
        const href = anchor.href.split('&commentFocus=')[0];
        const row = anchor.closest('tr, li, .ArticleListItem, .item, .board-list, .article-board, .article-list') || anchor.parentElement;
        const rowTitle = textOf(row?.querySelector('a.tit, a.article, .tit, .article, strong, .title'));
        const title = textOf(anchor) || rowTitle;
        return {
          href,
          title,
          rowText: textOf(row),
          posterUrl: imageOf(row),
          index,
        };
      })
      .filter((item) => item.href && item.title && !/commentFocus=true/.test(item.href));
  }).catch(() => []);

  const hasEventDate = (title) => /\b20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}|(?:^|\s)\d{1,2}[./월]\s*\d{1,2}(?:일|\b)/.test(title);
  const hasGraduationEvent = (title) => /졸업\s*(공연|파티)|graduation\s*(show|party|performance)/i.test(title);
  const deduped = [...new Map(items.map((item) => [item.href, item])).values()];
  const ranked = deduped
    .filter((item) => !isNaverAdministrativeNoticeText(`${item.title} ${item.rowText}`))
    .sort((a, b) => {
      const aText = `${a.title} ${a.rowText}`;
      const bText = `${b.title} ${b.rowText}`;
      const aSchedule = naverScheduleOverviewPriority(aText, today);
      const bSchedule = naverScheduleOverviewPriority(bText, today);
      const aGraduation = hasGraduationEvent(aText) ? 0 : 1;
      const bGraduation = hasGraduationEvent(bText) ? 0 : 1;
      const aDate = hasEventDate(a.title) ? 0 : 1;
      const bDate = hasEventDate(b.title) ? 0 : 1;
      return aSchedule - bSchedule || aGraduation - bGraduation || aDate - bDate || a.index - b.index;
    })
    .slice(0, 24);
  if (traceSourceIds.has(source.id)) {
    log(`trace ${source.id} naver links: ${JSON.stringify(ranked.slice(0, 12).map((item) => ({ title: item.title, href: item.href })))}`);
  }
  return ranked;
}

async function scrapeNaverArticle(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  const frame = page.frames().find((item) => item.name() === 'cafe_main') || page.mainFrame();
  await frame.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2))).catch(() => {});
  await page.waitForTimeout(700);
  await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(700);
  const data = await frame.evaluate(() => {
    const badTitleRe = /인기\s*멤버|새싹\s*멤버|멤버\s*등급|부\s*매니저|매니저|스탭|운영진|1\s*:\s*1\s*채팅|작성자|조회수?|댓글|목록|URL\s*복사|좋아요|신고|게시글/i;
    const titleSelectors = [
      '.title_text',
      'h3.title_text',
      '.ArticleTitle .title_text',
      '.article_header .title_text',
      '.tit_area .tit',
    ].join(',');
    const title = [...document.querySelectorAll(titleSelectors)]
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .find((value) => value && !badTitleRe.test(value)) || '';
    const viewer = document.querySelector('.article_viewer, .se-main-container, .ContentRenderer, .ArticleContentBox, #tbody, .NHN_Writeform_Main, .post_ct, .se-viewer, .article_container, .article-content, .content-area');
    const text = viewer?.innerText || '';
    const publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || document.querySelector('time[datetime]')?.getAttribute('datetime')
      || document.querySelector('.date, .article_info .date, .ArticleWriter .date, [class*="date"]')?.textContent
      || '';
    const imageRoot = viewer || document;
    const images = [...imageRoot.querySelectorAll('img[src*="postfiles"], img[src*="cafeptthumb"], .se-image-resource, img')]
      .map((img) => ({
        src: img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazysrc') || img.getAttribute('data-original') || img.getAttribute('data-url') || '',
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }))
      .filter((img) => img.src);
    return { title, text, images, publishedAt };
  });

  const posterUrls = selectSourceOrderedPosterUrls(data.images, 3);
  const posterUrl = posterUrls[0] || pickPosterImage(data.images);
  const title = cleanTitle(data.title || link.title);
  const text = stripNaverCafeChrome(`${data.title}\n${data.text}`);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(link.href),
    text: `${title}\n${text}`,
    title: title || cleanTitle(link.title),
    posterUrl,
    posterUrls,
    page,
    referer: 'https://cafe.naver.com/',
    publishedAt: data.publishedAt,
  });
}

async function collectDaumArticleLinks(page, source) {
  await safeGoto(page, source.url);
  return await page.evaluate((benefitKind) => {
    const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const hasGraduationEvent = (title) => /졸업\s*(공연|파티)|graduation\s*(show|party|performance)/i.test(title);
    const hasEventDate = (title) => /\b20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}|(?:^|\s)\d{1,2}[./월]\s*\d{1,2}(?:일|\b)/.test(title);
    const hasRequestedBenefit = (title) => {
      if (benefitKind === 'season_pass') return /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|멤버십/i.test(title);
      if (benefitKind === 'discount_event') return /할인|특가|얼리\s*버드|쿠폰|프로모션/i.test(title);
      if (benefitKind === 'free_event') return /무료\s*(?:이벤트|행사|파티|강습|클래스|수업|체험|입장|관람)/i.test(title);
      return false;
    };
    const items = [...document.querySelectorAll('a[href]')]
      .map((a, index) => {
        const href = a.href.split('#')[0];
        const row = a.closest('li, .list_detail, .box_board, .item, .article_item, .cont_post') || a.parentElement;
        const title = textOf(a) || textOf(row);
        return { href, title, rowText: textOf(row), index };
      })
      .filter((item) => (
        /^https?:\/\/m\.cafe\.daum\.net\/[^/]+\/[A-Za-z0-9]+\/\d+\??/i.test(item.href)
        && !/\/comments\??$/i.test(item.href)
        && item.title
      ));
    return [...new Map(items.map((item) => [item.href, item])).values()]
      .sort((a, b) => {
        const aBenefit = hasRequestedBenefit(a.title) ? 0 : 1;
        const bBenefit = hasRequestedBenefit(b.title) ? 0 : 1;
        const aGraduation = hasGraduationEvent(`${a.title} ${a.rowText}`) ? 0 : 1;
        const bGraduation = hasGraduationEvent(`${b.title} ${b.rowText}`) ? 0 : 1;
        const aDate = hasEventDate(a.title) ? 0 : 1;
        const bDate = hasEventDate(b.title) ? 0 : 1;
        return aBenefit - bBenefit || aGraduation - bGraduation || aDate - bDate || a.index - b.index;
      })
      .slice(0, 20);
  }, source.benefitKind || '').catch(() => []);
}

async function scrapeDaumArticle(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  const data = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      || document.querySelector('.tit_subject, .article_title, .tit_view, h3, h2')?.textContent
      || '';
    const visiblePublishedAt = text.match(/작성시간\s*((?:20)?\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})/)?.[1] || '';
    const publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || document.querySelector('time[datetime]')?.getAttribute('datetime')
      || visiblePublishedAt
      || document.querySelector('.txt_date, .date, .info_date, [class*="date"]')?.textContent
      || '';
    const images = [...document.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }));
    return { title, text, images, publishedAt };
  });
  const posterUrl = pickPosterImage(data.images);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(link.href),
    text: `${data.title}\n${data.text}`,
    title: data.title || link.title,
    posterUrl,
    page,
    referer: 'https://m.cafe.daum.net/',
    publishedAt: data.publishedAt,
  });
}

async function scrapeGenericBenefitDocument(page, url, source) {
  await safeGoto(page, url, postTimeoutMs);
  const data = await page.evaluate(() => {
    const article = document.querySelector('article, main, [role="main"]') || document.body;
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      || document.querySelector('h1, h2')?.textContent
      || document.title
      || '';
    const description = document.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute('content') || '';
    const text = article?.innerText || description;
    const publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || document.querySelector('time[datetime]')?.getAttribute('datetime')
      || '';
    const images = [...article.querySelectorAll('img')].map((img) => ({
      src: img.currentSrc || img.src,
      w: img.naturalWidth || img.width || 0,
      h: img.naturalHeight || img.height || 0,
    }));
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    return { title, text: `${description}\n${text}`, publishedAt, images, ogImage };
  });
  const posterUrl = pickPosterImage([
    ...data.images,
    ...(data.ogImage ? [{ src: data.ogImage, w: 1200, h: 630 }] : []),
  ]);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(url),
    text: `${data.title}\n${data.text}`,
    title: data.title,
    posterUrl,
    page,
    referer: url,
    publishedAt: data.publishedAt,
  });
}

async function scrapeBenefitDocument(page, url, source) {
  if (/^https:\/\/m\.cafe\.daum\.net\//i.test(url)) {
    return scrapeDaumArticle(page, { href: url, title: '' }, source);
  }
  if (/^https:\/\/cafe\.naver\.com\/f-e\/cafes\/\d+\/articles\/\d+/i.test(url)) {
    return scrapeNaverArticle(page, { href: url, title: '' }, source);
  }
  return scrapeGenericBenefitDocument(page, url, source);
}

function resolveLittlyImageUrl(imageUrl = '') {
  const value = String(imageUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/images/')) return `https://cdn.litt.ly${value}`;
  return value;
}

async function collectLittlyCards(page, source) {
  await safeGoto(page, source.url, sourceTimeoutMs);
  const cards = await page.evaluate((sourceKind) => {
    const script = document.querySelector('script#data[type="text/plain"]');
    if (!script?.textContent) return [];
    let parsed;
    try {
      const encoded = script.textContent.trim();
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch {
      try {
        parsed = JSON.parse(atob(script.textContent.trim()));
      } catch {
        return [];
      }
    }

    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const profileTitle = parsed.profile?.title || parsed.profile?.subtitle || document.title || '';
    const oneDayHub = sourceKind === 'one_day_hub';
    const oneDayRe = /원\s*데이|원데이|\b1\s*day\b|\bone\s*day\b|\boneday\b|일일\s*(?:클래스|강습|수업|체험)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|체험|배워)|체험\s*(?:클래스|강습|수업)|오픈\s*클래스|open\s*class/i;
    const collectableRe = /20\d{2}|원\s*데이|원데이|one\s*day|oneday|강습|수업|레슨|클래스|워크샵|워크숍|특강|입문|초급|소셜|파티|모집|class|lesson|workshop|social|party/i;
    const textBlocks = blocks
      .filter((block) => block?.use !== false && block?.type === 'text')
      .map((block) => [block.title, block.body].filter(Boolean).join('\n'))
      .filter(Boolean);

    return blocks
      .filter((block) => block?.use !== false && block?.type === 'link' && block.url)
      .map((block, index) => {
        const title = block.title || '';
        const body = block.body || '';
        const ownText = [title, body, block.url].filter(Boolean).join('\n');
        const localContext = textBlocks
          .filter((text) => oneDayRe.test(ownText) && oneDayRe.test(text))
          .slice(0, 2)
          .join('\n');
        return {
          index,
          href: block.url,
          title,
          body,
          image: block.image?.url || '',
          ownText,
          text: [profileTitle, localContext, title, body, block.url].filter(Boolean).join('\n'),
        };
      })
      .filter((item) => {
        if (oneDayHub && !oneDayRe.test(item.ownText)) return false;
        return collectableRe.test(item.text);
      })
      .sort((a, b) => {
        const aGraduation = /졸업\s*(공연|파티)|graduation\s*(show|party|performance)/i.test(`${a.title} ${a.body} ${a.text}`) ? 0 : 1;
        const bGraduation = /졸업\s*(공연|파티)|graduation\s*(show|party|performance)/i.test(`${b.title} ${b.body} ${b.text}`) ? 0 : 1;
        return aGraduation - bGraduation || a.index - b.index;
      })
      .slice(0, 18);
  }, source.sourceKind || '').catch(() => []);

  return cards;
}

async function scrapeLittlyCard(page, card, source) {
  const posterUrl = resolveLittlyImageUrl(card.image);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(card.href || source.url),
    text: card.text,
    title: card.title,
    posterUrl,
    page,
    referer: source.url,
  });
}

function exceptionEvidence(text = '', pattern) {
  const index = text.search(pattern);
  if (index < 0) return compactText(text).slice(0, 500);
  return compactText(text.slice(Math.max(0, index - 220), index + 320));
}

function relativeWeekdayDate(text = '', publishedAt = '') {
  const match = text.match(/(?:이번\s*주|금\s*주)\s*(월|화|수|목|금|토|일)요일/);
  if (!match || !publishedAt) return '';
  const targetDay = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }[match[1]];
  const published = new Date(publishedAt);
  if (!Number.isFinite(published.getTime())) return '';
  const seoul = new Date(published.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const delta = (targetDay - seoul.getDay() + 7) % 7;
  seoul.setDate(seoul.getDate() + delta);
  const relativeDate = `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, '0')}-${String(seoul.getDate()).padStart(2, '0')}`;
  return extractDates(relativeDate)[0] || '';
}

function nearestExplicitDateBefore(text = '', signalIndex = -1) {
  if (signalIndex < 0) return '';
  const prefix = text.slice(Math.max(0, signalIndex - 80), signalIndex);
  const matches = [...prefix.matchAll(/(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?/g)];
  const match = matches.at(-1);
  if (!match) return '';
  const year = Number(match[1] || getYearForMonth(Number(match[2])));
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isFinite(parsed) ? value : '';
}

function exceptionDates(text = '', title = '', pattern, publishedAt = '') {
  const allDates = extractDates(`${title}\n${text}`);
  const signalIndex = text.search(pattern);
  if (signalIndex >= 0) {
    const signalText = text.slice(Math.max(0, signalIndex - 120), signalIndex + 160);
    const monthRange = signalText.match(/(\d{1,2})\s*,\s*(\d{1,2})월(?:에는|은|에)?\s*(?:휴무|쉬어|쉽니다)/);
    if (monthRange) {
      const year = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
      }).format(new Date(publishedAt || Date.now())));
      return {
        dates: [''],
        allDates,
        ambiguous: false,
        periods: [monthRange[1], monthRange[2]]
          .map((month) => `${year}-${String(Number(month)).padStart(2, '0')}`),
      };
    }
    const relativeDate = relativeWeekdayDate(signalText, publishedAt);
    if (relativeDate) return { dates: [relativeDate], allDates, ambiguous: false };

    const explicitBefore = nearestExplicitDateBefore(text, signalIndex);
    if (explicitBefore) {
      const todayMs = Date.parse(`${today}T00:00:00+09:00`);
      const dateMs = Date.parse(`${explicitBefore}T00:00:00+09:00`);
      const lookbackStartMs = todayMs - exceptionLookbackDays * 86400000;
      if (dateMs > todayMs || dateMs < lookbackStartMs) {
        return { dates: [], allDates, ambiguous: false };
      }
      return { dates: [explicitBefore], allDates, ambiguous: false };
    }

    const beforeDates = extractDates(text.slice(Math.max(0, signalIndex - 120), signalIndex));
    if (beforeDates.length) {
      return { dates: [beforeDates.at(-1)], allDates, ambiguous: false };
    }
    const afterDates = extractDates(text.slice(signalIndex, signalIndex + 120));
    if (afterDates.length) {
      return { dates: [afterDates[0]], allDates, ambiguous: false };
    }
  }
  if (allDates.length === 1) return { dates: allDates, allDates, ambiguous: false };
  return { dates: [''], allDates, ambiguous: allDates.length > 1 };
}

function buildExceptionBacktestCandidates({
  source,
  sourceUrl,
  cleanText,
  title,
  posterUrl,
  posterUrls = [],
  publishedAt = '',
}) {
  const detections = [];
  if (closureEventPattern.test(cleanText)) {
    detections.push({
      type: /격주\s*휴무/i.test(cleanText) ? 'recurring_closure' : 'closure',
      label: '휴무',
      pattern: closureEventPattern,
    });
  }
  if (graduationEventPattern.test(cleanText)) {
    detections.push({
      type: 'graduation',
      label: '졸공',
      pattern: graduationEventPattern,
    });
  }
  if (!detections.length) return [];

  const djs = inferDjs(cleanText);
  const venueResolution = inferVenueDetails(cleanText, source);
  const venue = venueResolution.venue;
  const exceptionSourceId = source.regularSocialExceptionSourceId || source.id;
  const sourceKey = Buffer.from(sourceUrl).toString('base64url').slice(-18);
  const candidates = [];
  for (const detection of detections) {
    const dateSelection = exceptionDates(cleanText, title, detection.pattern, publishedAt);
    for (const date of dateSelection.dates) {
      candidates.push({
        id: `exception-backtest:${source.id}:${detection.type}:${date || 'unknown'}:${sourceKey}`,
        keyword: source.name,
        source_id: exceptionSourceId,
        discovery_source_id: source.id,
        exception_origin_source_id: source.id,
        source_url: sourceUrl,
        poster_url: posterUrls[0] || posterUrl || '',
        published_at: publishedAt || '',
        exception_type: detection.type,
        date_ambiguous: dateSelection.ambiguous,
        date_candidates: dateSelection.allDates,
        ...(dateSelection.periods?.length
          ? { closure_periods: dateSelection.periods }
          : {}),
        evidence: exceptionEvidence(cleanText, detection.pattern),
        structured_data: {
          title: `${source.name} ${detection.label}${date ? ` ${date}` : ''}`,
          date,
          activity_type: 'social_exception',
          event_type: detection.label,
          ...(venue ? { location: venue, venue_name: venue, venue_provenance: venueResolution.provenance } : {}),
          dance_scope: source.scope,
          genre_family: source.genre_family,
          dance_genre: source.dance_genre,
          ...(djs.length ? { djs } : {}),
        },
      });
    }
  }
  return candidates;
}

function shouldAttemptAiSocialExtraction(source, text = '', hasPoster = false) {
  if (!aiSocialExtractionEnabled || exceptionBacktest || source?.benefitKind || source?.scope !== 'swing') return false;
  const value = String(text || '').normalize('NFKC');
  return /(?:소셜|social|정모)/i.test(value)
    && (/(?:DJ|디제이)/i.test(value) || hasPoster)
    && /(?:20\d{2}\s*[.\-/년]\s*)?\d{1,2}\s*(?:[.\-/]|월)\s*\d{1,2}/i.test(value);
}

async function buildAiSocialFallbackCandidates({
  source,
  sourceUrl,
  cleanText,
  posterUrl = '',
  posterUrls = [],
  page,
  referer = '',
  publishedAt = '',
}) {
  const sourceImageUrls = unique([...posterUrls, posterUrl])
    .filter((url) => url && !hasBadPosterUrl(url))
    .slice(0, 3);
  if (!shouldAttemptAiSocialExtraction(source, cleanText, sourceImageUrls.length > 0)) return [];

  const sourceImages = [];
  for (const imageUrl of sourceImageUrls) {
    const dataUrl = await imageToDataUrl(page, imageUrl, referer || sourceUrl);
    if (dataUrl) sourceImages.push({ url: imageUrl, dataUrl });
  }

  ensureRunBudgetOrThrow(`AI social extraction ${source.id}`, Math.min(95_000, Math.max(10_000, runDeadlineGuardMs())));
  const aiResult = await extractSocialScheduleWithAi({
    sourceName: source.name,
    sourceUrl,
    sourceText: cleanText,
    sourceVenue: source.venue || '',
    imageDataUrls: sourceImages.map((image) => image.dataUrl),
    dateHints: extractSocialDateHints(cleanText),
    today,
  }, {
    today,
    timeoutMs: Math.max(10_000, Math.min(aiSocialExtractionTimeoutMs, runRemainingMs() - runDeadlineGuardMs())),
  });
  const outcome = aiResult.outcome || (aiResult.available === false ? 'unavailable' : 'error');
  if (Object.hasOwn(result.socialAiExtractionStats, outcome)) result.socialAiExtractionStats[outcome] += 1;
  if (!aiResult.approved || !aiResult.events?.length) {
    log(`AI social extraction ${outcome} ${source.id}: ${(aiResult.reasons || []).join('; ') || 'no approved sessions'}`);
    return [];
  }

  const posterText = String(aiResult.validation?.poster_text || '').trim();
  const groundedSourceText = [cleanText.slice(0, 6000), posterText ? `[AI_POSTER_TRANSCRIPTION]\n${posterText}` : '']
    .filter(Boolean)
    .join('\n');
  const candidates = [];
  for (const event of aiResult.events) {
    const evidenceQuotes = event.evidence_quotes || [];
    const normalizedEventVenue = toMapSafeVenueName(event.venue) || source.venue || event.venue;
    const normalizedEventTitle = `${normalizedEventVenue || source.name} ${socialDayTitle(dayLabelFromISO(event.event_date))} 소셜`
      .replace(/\s+/g, ' ')
      .trim();
    const selectedSourceImage = sourceImages[Number(event.poster_image_index || 0) - 1]
      || sourceImages[0]
      || null;
    const selectedPosterUrl = selectedSourceImage?.url || sourceImageUrls[0] || '';
    const imageData = selectedSourceImage?.dataUrl || '';
    const raw = {
      source_id: source.id,
      discovery_source_id: source.discovery_source_id || source.id,
      discovery_source_type: source.discovery_source_type || source.type,
      ...(publishedAt ? { published_at: publishedAt } : {}),
      keyword: source.name,
      source_url: sourceUrl,
      ...(selectedPosterUrl ? { poster_url: selectedPosterUrl } : {}),
      ...(imageData ? { imageData } : {}),
      _ai_evidence_text: evidenceQuotes.join('\n'),
      extracted_text: groundedSourceText,
      structured_data: {
        title: normalizedEventTitle,
        date: event.event_date,
        event_type: '소셜',
        activity_type: 'social',
        location: normalizedEventVenue,
        venue_name: normalizedEventVenue,
        venue_provenance: normalizedEvidenceIncludes(cleanText, event.venue)
          || normalizedEvidenceIncludes(cleanText, normalizedEventVenue)
          ? 'source_text'
          : normalizedEvidenceIncludes(posterText, event.venue)
            || normalizedEvidenceIncludes(posterText, normalizedEventVenue) ? 'poster_text' : 'source_registry',
        dance_scope: source.scope,
        genre_family: source.genre_family,
        dance_genre: source.dance_genre,
        djs: event.djs,
        evidence_scope: 'ai_grounded_social',
        ...(event.djs.length === 0 && sourceImages.length
          ? { ai_missing_dj_verified: true }
          : {}),
        ai_evidence_quotes: evidenceQuotes,
      },
    };
    const prepared = prepareCandidate(raw, { today });
    if (!prepared.validation.ok) {
      result.skipped += 1;
      log(`skip AI social ${source.id} ${event.event_date}: ${prepared.validation.errors.join('; ')}`);
      continue;
    }
    const payload = buildCafe24Payload(raw, { today });
    payload.auto_registration = {
      ...(payload.auto_registration || {}),
      ai_verified: false,
      ai_extraction_confidence: aiResult.validation?.confidence || aiResult.extraction?.confidence || 0,
      reasons: [...(payload.auto_registration?.reasons || [])],
    };
    candidates.push(payload);
  }
  if (candidates.length) log(`AI social extraction approved ${source.id}: ${candidates.length} session(s)`);
  return candidates;
}

function normalizedEvidenceIncludes(text = '', value = '') {
  const normalize = (item) => String(item || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = normalize(value);
  return Boolean(needle) && normalize(text).includes(needle);
}

async function buildCandidatesFromText({
  source,
  sourceUrl,
  text,
  title,
  posterUrl,
  posterUrls = [],
  page,
  referer = '',
  publishedAt = '',
  splitMixedSeasonPass = true,
}) {
  const candidateProvenance = {
    source_id: source.id,
    discovery_source_id: source.discovery_source_id || source.id,
    discovery_source_type: source.discovery_source_type || source.type,
    ...(publishedAt ? { published_at: publishedAt } : {}),
  };
  const sourceExcluded = getExcludedSourceReason(sourceUrl);
  if (sourceExcluded) {
    result.skipped += 1;
    return [];
  }

  const rawText = selectSourceEvidenceText(text, source);
  const cleanText = compactText(rawText);
  if (!cleanText || cleanText.length < 20) {
    result.skipped += 1;
    return [];
  }
  if (exceptionBacktest) {
    const exceptions = buildExceptionBacktestCandidates({
      source,
      sourceUrl,
      cleanText,
      title,
      posterUrl,
      posterUrls,
      publishedAt,
    });
    if (!exceptions.length) result.skipped += 1;
    return exceptions;
  }
  const normalizedRawText = String(rawText || '').normalize('NFKC');
  const focusedSeasonPassSections = splitMixedSeasonPass && source.benefitKind === 'season_pass'
    ? extractSeasonPassEvidenceSections(normalizedRawText).filter((section) => (
      normalizeForCompare(section) !== normalizeForCompare(normalizedRawText)
    ))
    : [];
  const focusedSeasonPassCandidates = [];
  for (const section of focusedSeasonPassSections) {
    const sectionTitle = String(section)
      .split(/\n| {2,}/)
      .map((line) => cleanTitle(line))
      .find((line) => /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십/i.test(line))
      || title;
    const sectionCandidates = await buildCandidatesFromText({
      source,
      sourceUrl,
      text: section,
      title: sectionTitle,
      posterUrl: '',
      posterUrls: [],
      page,
      referer,
      publishedAt,
      splitMixedSeasonPass: false,
    });
    focusedSeasonPassCandidates.push(...sectionCandidates.filter((candidate) => (
      candidate.structured_data?.benefit_kind === 'season_pass'
    )));
  }
  const socialExtractionSource = source.benefitKind
    ? { ...source, name: eventLabelForBenefitSource(source) }
    : source;
  const socialEvidenceText = focusedSeasonPassSections.reduce(
    (remaining, section) => remaining.replace(section, '\n'),
    normalizedRawText,
  ).split(/\n/).filter((line) => (
    !/정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십/i.test(line)
  )).join('\n');
  const socialExtractionTitle = source.benefitKind === 'season_pass' ? '' : title;
  const preclassifiedSocialScheduleItems = extractSocialScheduleItems(
    socialEvidenceText,
    socialExtractionSource,
    socialExtractionTitle,
    publishedAt,
  )
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const genericMixedClosureCandidates = closureEventPattern.test(cleanText) && preclassifiedSocialScheduleItems.length
    ? buildExceptionBacktestCandidates({
      source,
      sourceUrl,
      cleanText,
      title,
      posterUrl,
      posterUrls,
      publishedAt,
    }).filter((candidate) => (
      ['closure', 'recurring_closure'].includes(candidate.exception_type)
      && candidate.structured_data.date
    ))
    : [];
  const neoClosureDates = source.id === 'neo_swing'
    ? extractNeoWeeklyClosureDates({ text: rawText, today })
    : [];
  const venueResolutionForClosure = inferVenueDetails(cleanText, source);
  const exceptionSourceIdForClosure = source.regularSocialExceptionSourceId || source.id;
  const sourceKeyForClosure = Buffer.from(sourceUrl).toString('base64url').slice(-18);
  const neoMixedClosureCandidates = neoClosureDates.map((date) => ({
    id: `exception-backtest:${source.id}:closure:${date}:${sourceKeyForClosure}`,
    keyword: source.name,
    source_id: exceptionSourceIdForClosure,
    discovery_source_id: source.id,
    exception_origin_source_id: source.id,
    source_url: sourceUrl,
    poster_url: posterUrls[0] || posterUrl || '',
    published_at: publishedAt || '',
    exception_type: 'closure',
    date_ambiguous: false,
    date_candidates: [date],
    evidence: exceptionEvidence(cleanText, closureEventPattern),
    structured_data: {
      title: `${source.name} 휴무 ${date}`,
      date,
      activity_type: 'social_exception',
      event_type: '휴무',
      ...(venueResolutionForClosure.venue ? {
        location: venueResolutionForClosure.venue,
        venue_name: venueResolutionForClosure.venue,
        venue_provenance: venueResolutionForClosure.provenance,
      } : {}),
      dance_scope: source.scope,
      genre_family: source.genre_family,
      dance_genre: source.dance_genre,
    },
  }));
  const mixedClosureCandidates = [...new Map(
    [...genericMixedClosureCandidates, ...neoMixedClosureCandidates]
      .map((candidate) => [candidate.id, candidate]),
  ).values()];
  if (closureEventPattern.test(cleanText) && !preclassifiedSocialScheduleItems.length) {
    if (!posterUrls.length && !posterUrl) {
      result.skipped += 1;
      log(`skip ${source.id}: closure notice without poster`);
      return [];
    }
    const closures = buildExceptionBacktestCandidates({
      source,
      sourceUrl,
      cleanText,
      title,
      posterUrl,
      posterUrls,
      publishedAt,
    }).filter((candidate) => (
      ['closure', 'recurring_closure'].includes(candidate.exception_type)
      && candidate.structured_data.date
    ));
    if (!closures.length) result.skipped += 1;
    return closures;
  }
  if (closureEventPattern.test(cleanText) && preclassifiedSocialScheduleItems.length) {
    log(`mixed closure/social ${source.id}: preserving ${preclassifiedSocialScheduleItems.length} explicit dated DJ schedule(s)`);
  }
  const blockedKeywordReason = getBlockedKeywordReason(`${title}\n${cleanText}\n${sourceUrl}`);
  if (blockedKeywordReason) {
    result.skipped += 1;
    log(`skip ${source.id}: ${blockedKeywordReason}`);
    return [];
  }

  const posterUrlList = unique([...posterUrls, posterUrl].filter(Boolean))
    .filter((url) => !hasBadPosterUrl(url));
  let aiSocialFallbackPromise;
  const aiSocialFallback = () => {
    aiSocialFallbackPromise ??= buildAiSocialFallbackCandidates({
      source,
      sourceUrl,
      cleanText,
      posterUrl,
      posterUrls,
      page,
      referer,
      publishedAt,
    });
    return aiSocialFallbackPromise;
  };
  const inferredActivity = inferActivity(cleanText, title);
  const socialScheduleItems = preclassifiedSocialScheduleItems;
  const socialScheduleDates = new Set(socialScheduleItems.map((item) => item.date).filter(Boolean));
  const explicitScheduleDateCount = extractSocialDateHints(`${title}\n${cleanText}`).length;
  if (
    posterUrlList.length
    && /(?:소셜|social|정모)/i.test(`${title}\n${cleanText}`)
    && explicitScheduleDateCount > socialScheduleDates.size
  ) {
    const aiCandidates = await aiSocialFallback();
    const aiDates = new Set(aiCandidates.map((candidate) => candidate.structured_data?.date).filter(Boolean));
    if (
      aiCandidates.length
      && aiDates.size >= explicitScheduleDateCount
      && [...socialScheduleDates].every((date) => aiDates.has(date))
    ) {
      return aiCandidates;
    }
  }
  const preferDatedSocialSchedule = isHighConfidenceDatedSocialSchedule(socialScheduleItems);
  const { activity, eventType } = preferDatedSocialSchedule
    ? { activity: 'social', eventType: '소셜' }
    : inferredActivity;
  const imageOptionalBenefit = source.benefitKind === 'season_pass'
    && /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십/i.test(cleanText);
  if (!posterUrlList.length && activity !== 'social' && source.type !== 'benefit_search' && !imageOptionalBenefit) {
    const aiCandidates = await aiSocialFallback();
    if (aiCandidates.length) return aiCandidates;
    result.skipped += 1;
    result.issues.push(`${source.id}: poster missing`);
    return [];
  }
  const venueResolution = inferVenueDetails(cleanText, source);
  const venue = venueResolution.venue;
  const djs = inferDjs(cleanText);
  const candidateTitle = makeCandidateTitle({ source, rawTitle: title, rawText, cleanText, eventType, djs });
  const isOneDayCandidate = oneDayPattern.test(`${candidateTitle}\n${cleanText}`);
  if (!isOneDayCandidate && looksLikeBroadScheduleNotice(candidateTitle, cleanText)) {
    const aiCandidates = await aiSocialFallback();
    if (aiCandidates.length) return aiCandidates;
    result.skipped += 1;
    log(`skip ${source.id}: broad schedule notice (${candidateTitle})`);
    return [];
  }
  const hasCompleteDatedSocialIdentity = preferDatedSocialSchedule
    && socialScheduleItems.every((item) => item.djs.length > 0);
  if (
    looksLikeGenericTitle(candidateTitle, source, eventType)
    && !hasCompleteDatedSocialIdentity
    && !(activity === 'social' && djs.length)
  ) {
    const aiCandidates = await aiSocialFallback();
    if (aiCandidates.length) return aiCandidates;
    result.skipped += 1;
    log(`skip ${source.id}: generic fallback title (${candidateTitle})`);
    return [];
  }

  if (activity === 'social' && socialScheduleItems.length) {
    const candidates = [];
    const socialDateCounts = socialScheduleItems.reduce((counts, item) => {
      const date = String(item.date || '').slice(0, 10);
      counts.set(date, (counts.get(date) || 0) + 1);
      return counts;
    }, new Map());
    const imageDataByUrl = new Map();
    const getImageData = async (imageUrl) => {
      if (!imageDataByUrl.has(imageUrl)) {
        imageDataByUrl.set(imageUrl, await imageToDataUrl(page, imageUrl, referer || sourceUrl));
      }
      return imageDataByUrl.get(imageUrl);
    };

    for (const [index, item] of socialScheduleItems.entries()) {
      const candidatePosterUrl = posterUrlList[index] || posterUrlList[0] || '';
      const imageData = candidatePosterUrl ? await getImageData(candidatePosterUrl) : '';
      const hasSameDateSiblings = (socialDateCounts.get(String(item.date || '').slice(0, 10)) || 0) > 1;
      const socialDetailSuffix = hasSameDateSiblings
        ? [item.title, item.djs.join(','), index].filter(Boolean).join('|')
        : '';
      const socialTitle = hasSameDateSiblings && item.djs.length
        ? `${item.title} DJ ${item.djs.join(', ')}`
        : item.title;
      const raw = {
        ...candidateProvenance,
        keyword: socialExtractionSource.name,
        source_url: sourceUrl,
        ...(socialDetailSuffix ? { id_suffix: socialDetailSuffix } : {}),
        ...(candidatePosterUrl ? { poster_url: candidatePosterUrl } : {}),
        ...(imageData ? { imageData } : {}),
        ...(item.aiEvidenceText ? { _ai_evidence_text: `${item.aiEvidenceText}\n${socialTitle}` } : {}),
        ...(item.aiEvidenceText ? { _date_scoped_social_evidence: true } : {}),
        extracted_text: String(item.aiEvidenceText || cleanText).slice(0, 6000),
        structured_data: {
          title: socialTitle,
          date: item.date,
          ...(item.day ? { day: item.day } : {}),
          event_type: eventType,
          activity_type: activity,
          ...(venue ? { location: venue, venue_name: venue, venue_provenance: venueResolution.provenance } : {}),
          dance_scope: source.scope,
          genre_family: source.genre_family,
          dance_genre: source.dance_genre,
          ...(item.djs.length ? { djs: item.djs } : {}),
          ...(item.fee ? { fee: item.fee } : {}),
          ...(item.aiEvidenceText ? { evidence_scope: 'date_scoped_social' } : {}),
        },
      };

      const prepared = prepareCandidate(raw, { today });
      if (!prepared.validation.ok) {
        result.skipped += 1;
        log(`skip ${source.id} ${item.date}: ${prepared.validation.errors.join('; ')}`);
        continue;
      }

      const scopedBenefitKind = classifyConfirmedBenefitEvent({
        extracted_text: item.aiEvidenceText || '',
        structured_data: {
          title: socialTitle,
          ...(item.fee ? { fee: item.fee } : {}),
        },
      });
      if (source.benefitKind && scopedBenefitKind !== source.benefitKind) {
        result.skipped += 1;
        log(`skip ${source.id} ${item.date}: social has no confirmed ${source.benefitKind} benefit`);
        continue;
      }

      candidates.push(buildCafe24Payload(raw, { today }));
    }

    if (candidates.length) return [...mixedClosureCandidates, ...candidates, ...focusedSeasonPassCandidates];
    const aiCandidates = await aiSocialFallback();
    return [...mixedClosureCandidates, ...aiCandidates, ...focusedSeasonPassCandidates];
  }

  if (focusedSeasonPassCandidates.length) return focusedSeasonPassCandidates;

  const publicationDate = publicationDateKey(publishedAt);
  const isEvergreenSeasonPass = source.benefitKind === 'season_pass'
    && isEvergreenSeasonPassCandidate({
      extracted_text: cleanText,
      structured_data: { title: candidateTitle, date: publicationDate || today },
    }, { today });
  if (
    source.type === 'benefit_search'
    && isStaleBenefitSourcePost({ publishedAt, today })
  ) {
    result.skipped += 1;
    log(`skip ${source.id}: stale source post ${String(publishedAt).slice(0, 10)}`);
    return [];
  }
  if (
    source.type === 'benefit_search'
    && !isEvergreenSeasonPass
    && !publicationDate
    && !/20\d{2}\s*[.\-/년]/.test(`${candidateTitle}\n${cleanText}`)
  ) {
    result.skipped += 1;
    log(`skip ${source.id}: date-bound benefit lacks a verified publication year`);
    return [];
  }
  const dates = isEvergreenSeasonPass
    ? [publicationDate || today]
    : alignYearlessDatesToPublication(
      selectCandidateDates({ title: candidateTitle, cleanText, activity }),
      `${candidateTitle}\n${cleanText}`,
      publishedAt,
    );
  if (!dates.length) {
    const aiCandidates = await aiSocialFallback();
    if (aiCandidates.length) return aiCandidates;
    result.skipped += 1;
    if (oneDayPattern.test(cleanText)) {
      result.issues.push(`${source.id}: one-day info has no explicit future date`);
    }
    return [];
  }

  const candidates = [];
  const imageDataByUrl = new Map();
  const getImageData = async (imageUrl) => {
    if (!imageDataByUrl.has(imageUrl)) {
      imageDataByUrl.set(imageUrl, await imageToDataUrl(page, imageUrl, referer || sourceUrl));
    }
    return imageDataByUrl.get(imageUrl);
  };

  for (const [index, date] of dates.entries()) {
    if (!isCollectableDate(date, { today })) {
      result.skipped += 1;
      log(`skip ${source.id} ${date}: event date is already past`);
      continue;
    }
    const candidatePosterUrl = posterUrlList[index] || posterUrlList[0] || '';
    const imageData = candidatePosterUrl ? await getImageData(candidatePosterUrl) : '';
    const raw = {
      ...candidateProvenance,
      keyword: source.name,
      source_url: sourceUrl,
      ...(candidatePosterUrl || imageOptionalBenefit ? { poster_url: candidatePosterUrl } : {}),
      ...(imageData ? { imageData } : {}),
      extracted_text: cleanText.slice(0, 6000),
      structured_data: {
        title: candidateTitle,
        date,
        event_type: eventType,
        activity_type: activity,
        ...(venue ? { location: venue, venue_name: venue, venue_provenance: venueResolution.provenance } : {}),
        dance_scope: source.scope,
        genre_family: source.genre_family,
        dance_genre: source.dance_genre,
        ...(djs.length ? { djs } : {}),
      },
    };

    if (traceSourceIds.has(source.id)) {
      log(`trace ${source.id} candidate ${date}: ${JSON.stringify({
        title: candidateTitle,
        activity,
        eventType,
        venue,
        djs,
        posterUrl: candidatePosterUrl,
        imageDataBytes: imageData.length,
      })}`);
    }

    const prepared = prepareCandidate(raw, { today });
    if (!prepared.validation.ok) {
      result.skipped += 1;
      log(`skip ${source.id} ${date}: ${prepared.validation.errors.join('; ')}`);
      continue;
    }

    if (
      source.benefitKind
      && activity === 'social'
      && classifyConfirmedBenefitEvent(raw) !== source.benefitKind
    ) {
      result.skipped += 1;
      log(`skip ${source.id} ${date}: social has no confirmed ${source.benefitKind} benefit`);
      continue;
    }

    candidates.push(buildCafe24Payload(raw, { today }));
  }

  if (candidates.length) return candidates;
  return aiSocialFallback();
}

async function postCandidate(candidate) {
  if (exceptionBacktest) {
    result.inserted += 1;
    result.candidates.push(candidate);
    return;
  }

  const {
    _ai_evidence_text: aiEvidenceText = '',
    _ai_image_data_urls: aiImageDataUrls = [],
    _date_scoped_social_evidence: _dateScopedSocialEvidence = false,
    ...candidateForPost
  } = candidate;
  let candidateToPost = candidateForPost;
  const isBenefitCandidate = candidate.structured_data?.benefit_eligible === true;
  const shouldRunBenefitAiReview = aiAdjudicationEnabled
    && isBenefitCandidate
    && ((!dryRun && profile !== 'expanded-research') || benefitAiReviewDryRun);
  if (shouldRunBenefitAiReview) {
    const benefitAiResult = await reviewBenefitCandidateWithAi(candidate, {
      today,
      timeoutMs: Math.max(5_000, Math.min(90_000, runRemainingMs() - runDeadlineGuardMs())),
    });
    const benefitAiStatus = benefitAiResult.outcome || (benefitAiResult.available === false ? 'unavailable' : 'error');
    if (Object.hasOwn(result.benefitAiReviewStats, benefitAiStatus)) {
      result.benefitAiReviewStats[benefitAiStatus] += 1;
    }
    candidateToPost = {
      ...candidateForPost,
      structured_data: {
        ...(candidateForPost.structured_data || {}),
        benefit_ai_review: {
          status: benefitAiStatus,
          confidence: benefitAiResult.validation?.confidence || benefitAiResult.adjudication?.confidence || 0,
          suggested_benefit_kind: benefitAiResult.adjudication?.benefit_kind || null,
          suggested_category: benefitAiResult.adjudication?.category || null,
          suggested_activity_type: benefitAiResult.adjudication?.activity_type || null,
          active_on_today: benefitAiResult.adjudication?.active_on_today ?? null,
          validity_end_date: benefitAiResult.adjudication?.validity_end_date || null,
          suggested_title: benefitAiResult.adjudication?.title || null,
          suggested_venue: benefitAiResult.adjudication?.venue || null,
          evidence_quotes: benefitAiResult.validation?.evidence_quotes || [],
          reasons: benefitAiResult.reasons || [],
        },
      },
    };
    if (benefitAiStatus === 'rejected') {
      result.skipped += 1;
      log(`AI rejected benefit ${candidate.id}: ${(benefitAiResult.reasons || []).join('; ')}`);
      return;
    }
    if (!shouldPersistBenefitAiOutcome(benefitAiStatus)) {
      result.skipped += 1;
      log(`skip benefit after grounded AI rejection ${candidate.id} (${benefitAiStatus}): ${(benefitAiResult.reasons || []).join('; ')}`);
      return;
    }
  }

  if (dryRun || profile === 'expanded-research') {
    result.inserted += 1;
    result.candidates.push(diagnosticJson ? {
      id: candidateToPost.id,
      keyword: candidateToPost.keyword,
      source_id: candidateToPost.source_id || null,
      source_url: candidateToPost.source_url,
      poster_url: candidateToPost.poster_url || null,
      structured_data: candidateToPost.structured_data,
      auto_registration: candidateToPost.auto_registration || null,
    } : `${candidateToPost.keyword}:${candidateToPost.structured_data?.date}:${candidateToPost.structured_data?.title}`);
    if (candidateToPost.auto_registration?.ready !== true) {
      recordRegistrationPolicyBlocker(candidateToPost);
    }
    return;
  }

  if (
    aiAdjudicationEnabled
    && candidateToPost.auto_registration?.ready === true
    && candidateToPost.auto_registration?.ai_verified !== true
    && !(
      _dateScopedSocialEvidence === true
      && candidateToPost.structured_data?.activity_type === 'social'
      && candidateToPost.structured_data?.evidence_scope === 'date_scoped_social'
    )
  ) {
    const aiCandidate = {
      ...candidateToPost,
      ...(aiImageDataUrls.length ? { _ai_image_data_urls: aiImageDataUrls } : {}),
      ...(aiEvidenceText ? { extracted_text: aiEvidenceText } : {}),
    };
    const aiResult = await adjudicateCandidateWithAi(aiCandidate);
    candidateToPost = {
      ...candidateToPost,
      structured_data: {
        ...(candidateToPost.structured_data || {}),
        ai_adjudication: aiResult.adjudication || null,
        ai_evidence_quotes: aiResult.validation?.evidence_quotes || [],
      },
      auto_registration: {
        ...(candidateToPost.auto_registration || {}),
        ready: aiResult.approved === true,
        ai_verified: aiResult.approved === true,
        ai_confidence: aiResult.validation?.confidence || 0,
        reasons: [
          ...(candidate.auto_registration?.reasons || []),
          ...(aiResult.reasons || []),
        ],
      },
    };
    if (!aiResult.approved) {
      recordPipelineBlocker('verification', {
        sourceId: candidateToPost.source_id,
        sourceUrl: candidateToPost.source_url,
        candidateId: candidate.id,
        reason: (aiResult.reasons || []).join('; ') || 'AI adjudication did not approve the candidate',
      });
      log(`AI review required ${candidate.id}: ${(aiResult.reasons || []).join('; ')}`);
    }
  }

  let response;
  let bodyText = '';
  const headers = { 'Content-Type': 'application/json' };
  if (ingestToken) headers['X-Ingestion-Token'] = ingestToken;
  result.pipeline.persistence.attempted += 1;
  try {
    const postResult = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(candidateToPost),
    }, postRequestTimeoutMs);
    response = postResult.response;
    bodyText = postResult.body;
  } catch (error) {
    const message = error?.message || error?.name || 'post request failed';
    result.skipped += 1;
    result.pipeline.persistence.failures += 1;
    recordPipelineBlocker('persistence', {
      sourceId: candidateToPost.source_id,
      sourceUrl: candidateToPost.source_url,
      candidateId: candidate.id,
      reason: message,
    });
    result.issues.push(`post ${candidate.id}: ${message}`);
    log(`post failed ${candidate.id}: ${message}`);
    return;
  }

  let body = {};
  try { body = JSON.parse(bodyText); } catch {}

  if (!response.ok) {
    result.skipped += 1;
    result.pipeline.persistence.failures += 1;
    recordPipelineBlocker('persistence', {
      sourceId: candidateToPost.source_id,
      sourceUrl: candidateToPost.source_url,
      candidateId: candidate.id,
      reason: `HTTP ${response.status}`,
    });
    result.issues.push(`post ${candidate.id}: HTTP ${response.status}`);
    log(`post failed ${candidate.id}: ${response.status} ${bodyText.slice(0, 300)}`);
    return;
  }

  if (Array.isArray(body.skipped) && body.skipped.length) {
    result.skipped += body.skipped.length;
    result.pipeline.persistence.skipped += body.skipped.length;
    result.candidates.push(`skip:${candidate.keyword}:${body.skipped[0].reason}`);
    return;
  }

  const savedCandidate = Array.isArray(body?.data) ? body.data[0] : body?.data || body;
  result.pipeline.persistence.saved += Number(body.count || 0);
  result.pipeline.persistence.refreshed += Number(body.refreshedCount || 0);
  if (candidateToPost.auto_registration?.ready === true && savedCandidate?.id && ingestToken) {
    result.pipeline.registration.attempted += 1;
    try {
      const autoResult = await fetchWithTimeout(automaticRegistrationEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          automatic: true,
          scrapedEventId: savedCandidate.id,
        }),
      }, postRequestTimeoutMs);
      let autoBody = {};
      try { autoBody = JSON.parse(autoResult.body); } catch {}
      if (autoResult.response.status === 409 && autoBody?.duplicate) {
        result.skipped += 1;
        result.pipeline.registration.duplicates += 1;
        result.candidates.push(`skip:${candidate.keyword}:${autoBody.duplicate.reason || 'operational duplicate'}`);
        log(`auto-register skipped duplicate ${savedCandidate.id}: ${autoBody.duplicate.reason || 'operational duplicate'}`);
        return;
      }
      if (!autoResult.response.ok) {
        result.pipeline.registration.blocked += 1;
        recordPipelineBlocker('registration', {
          sourceId: candidateToPost.source_id,
          sourceUrl: candidateToPost.source_url,
          candidateId: savedCandidate.id,
          reason: (autoBody?.reasons || [autoBody?.error || `HTTP ${autoResult.response.status}`]).join('; '),
        });
        result.issues.push(`auto-register ${savedCandidate.id}: HTTP ${autoResult.response.status}`);
        log(`auto-register blocked ${savedCandidate.id}: ${autoResult.response.status} ${autoResult.body.slice(0, 300)}`);
      } else {
        result.pipeline.registration.succeeded += 1;
        if (autoBody?.event) {
          result.autoRegisteredEvents.push(toAutoRegistrationReportEntry(autoBody.event, {
            repaired: autoBody.repaired === true,
          }));
        }
        log(`auto-registered ${savedCandidate.id}`);
      }
    } catch (error) {
      result.pipeline.registration.blocked += 1;
      recordPipelineBlocker('registration', {
        sourceId: candidateToPost.source_id,
        sourceUrl: candidateToPost.source_url,
        candidateId: savedCandidate.id,
        reason: error?.message || error?.name || 'request failed',
      });
      result.issues.push(`auto-register ${savedCandidate.id}: ${error?.message || error?.name || 'request failed'}`);
      log(`auto-register failed ${savedCandidate.id}: ${error?.message || error}`);
    }
  }

  if (candidateToPost.auto_registration?.ready !== true) {
    recordRegistrationPolicyBlocker({
      ...candidateToPost,
      id: savedCandidate?.id || candidate.id,
    });
  }

  if (Number(body.refreshedCount || 0) > 0) {
    log(`refreshed ${candidate.id}`);
    result.candidates.push(`refresh:${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
    return;
  }

  result.inserted += Number(body.count ?? 1);
  result.candidates.push(`${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
}

async function withBoundedStep(label, fn, timeoutMs) {
  let timer;
  const effectiveTimeoutMs = boundedRunTimeout(timeoutMs, Math.min(5_000, runDeadlineGuardMs()));
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${effectiveTimeoutMs}ms`)), effectiveTimeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof RunBudgetReachedError) {
      throw error;
    }
    const message = error.message || 'unknown error';
    if (message.startsWith('no content: ')) {
      recordNoContent(label, message.replace(/^no content:\s*/, ''));
    } else {
      recordAccessFailure(label, message);
    }
    if (isNetworkUnavailableMessage(message)) {
      throw new NetworkUnavailableError('network unavailable');
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function hasAccessFailure(label) {
  return result.accessFailures.some((item) => (
    item.startsWith(`${label}(`) || item.startsWith(`${label}:`)
  ));
}

function hasNoContent(label) {
  return result.noContentSources.some((item) => (
    item.startsWith(`${label}(`) || item.startsWith(`${label}:`)
  ));
}

async function collectSource(page, source) {
  ensureRunBudgetOrThrow(`source ${source.id}`, runDeadlineGuardMs());

  if (source.type === 'benefit_search') {
    const targetResult = await withBoundedStep(source.id, () => collectBenefitSearchLinks(page, source), sourceTimeoutMs);
    const targets = targetResult && !Array.isArray(targetResult)
      ? targetResult
      : { postUrls: [], profileUrls: [], documentUrls: [] };
    const directPostUrls = unique(targets.postUrls || []);
    const documentUrls = unique(targets.documentUrls || []);
    if (!directPostUrls.length && !documentUrls.length && !targets.profileUrls.length) {
      result.benefitSearchStats.push({
        sourceId: source.id,
        scope: source.scope,
        benefitKind: source.benefitKind,
        discoveredPosts: 0,
        checkedTargets: 0,
        checkedCandidates: 0,
        matchedCandidates: 0,
      });
      if (!hasAccessFailure(source.id)) recordNoContent(source, 'no verified source results');
      return [];
    }
    const candidates = [];
    let checkedTargets = 0;
    let checkedCandidates = 0;
    let discoveredPostCount = directPostUrls.length;

    // 검색 결과의 카페·블로그 원문을 프로필 확장보다 먼저 확인한다.
    for (const [documentIndex, url] of documentUrls.slice(0, Math.max(1, postLimit)).entries()) {
      ensureRunBudgetOrThrow(`benefit search document ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      const stepLabel = `${source.id}:document-${documentIndex + 1}`;
      const documentCandidates = await withBoundedStep(
        stepLabel,
        () => scrapeBenefitDocument(page, url, source),
        postTimeoutMs + 8000,
      );
      checkedTargets += 1;
      checkedCandidates += documentCandidates.length;
      const matched = documentCandidates.filter((candidate) => benefitSearchMatches(candidate, source.benefitKind));
      result.skipped += documentCandidates.length - matched.length;
      candidates.push(...matched);
    }

    for (const [postIndex, url] of directPostUrls.slice(0, Math.max(1, Math.min(postLimit, 2))).entries()) {
      ensureRunBudgetOrThrow(`benefit search post ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      await throttleInstagram(`benefit post ${source.id}`, instagramPostDelayMs);
      const stepLabel = `${source.id}:post-${postIndex + 1}`;
      const postCandidates = await withBoundedStep(stepLabel, () => scrapeInstagramPost(page, url, source), postTimeoutMs + 8000);
      checkedTargets += 1;
      checkedCandidates += postCandidates.length;
      const matched = postCandidates.filter((candidate) => benefitSearchMatches(candidate, source.benefitKind));
      result.skipped += postCandidates.length - matched.length;
      candidates.push(...matched);
    }

    // 직접 원문에서 혜택이 없을 때만 Instagram 프로필을 추가 탐색한다.
    if (!candidates.length) {
      for (const [profileIndex, profileUrl] of targets.profileUrls.entries()) {
        const discoveredSource = {
          ...source,
          id: `${source.id}:profile-${profileIndex + 1}`,
          name: profileUrl.split('/').filter(Boolean).at(-1) || source.name,
          type: 'instagram',
          url: profileUrl,
          discovery_source_id: source.discovery_source_id || source.id,
          discovery_source_type: source.discovery_source_type || source.type,
        };
        const discoveredPosts = await withBoundedStep(
          discoveredSource.id,
          () => collectInstagramLinks(page, discoveredSource),
          sourceTimeoutMs,
        );
        discoveredPostCount += discoveredPosts.length;
        for (const [postIndex, url] of unique(discoveredPosts).slice(0, Math.max(1, Math.min(postLimit, 2))).entries()) {
          ensureRunBudgetOrThrow(`benefit profile post ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
          await throttleInstagram(`benefit profile post ${source.id}`, instagramPostDelayMs);
          const stepLabel = `${source.id}:profile-${profileIndex + 1}-post-${postIndex + 1}`;
          const postCandidates = await withBoundedStep(stepLabel, () => scrapeInstagramPost(page, url, discoveredSource), postTimeoutMs + 8000);
          checkedTargets += 1;
          checkedCandidates += postCandidates.length;
          const matched = postCandidates.filter((candidate) => benefitSearchMatches(candidate, source.benefitKind));
          result.skipped += postCandidates.length - matched.length;
          candidates.push(...matched);
          if (candidates.length) break;
        }
        if (candidates.length) break;
      }
    }
    result.benefitSearchStats.push({
      sourceId: source.id,
      scope: source.scope,
      benefitKind: source.benefitKind,
      discoveredPosts: discoveredPostCount + documentUrls.length,
      checkedTargets,
      checkedCandidates,
      matchedCandidates: candidates.length,
    });
    if (!candidates.length && checkedTargets > 0 && !hasAccessFailure(source.id)) {
      recordNoContent(source, 'posts checked but explicit benefit was not confirmed');
    }
    return candidates;
  }

  if (source.type === 'instagram') {
    ensureRunBudgetOrThrow(`instagram source ${source.id}`, estimatedInstagramSourceBudgetMs(1, source));
    if (instagramCircuitOpen) {
      recordInstagramCircuitSkip(source);
      return [];
    }
    let links;
    if (targetInstagramPostUrls.length) {
      const expectedHandles = expectedInstagramHandlesForSource(source);
      links = targetInstagramPostUrls.filter((url) => instagramPostMatchesExpectedHandle(url, expectedHandles));
      log(`instagram targeted posts ${source.id}: ${links.length}/${targetInstagramPostUrls.length}`);
    } else {
      await throttleInstagram(`profile ${source.id}`, instagramSourceDelayMs);
      links = await withBoundedStep(source.id, () => collectInstagramLinks(page, source), sourceTimeoutMs);
    }
    if (!links.length) {
      if (targetInstagramPostUrls.length) {
        recordNoContent(source, 'no targeted post matches the configured source authors');
        return [];
      }
      if (hasAccessFailure(source.id)) return [];
      if (hasNoContent(source.id)) return [];
      recordAccessFailure(source, 'instagram post links unavailable or session required');
      return [];
    }
    if (!targetInstagramPostUrls.length) markInstagramProfileSuccess();
    const candidates = [];
    const knownPosts = progressTrackingEnabled ? (instagramSeenPosts[source.id] || []) : [];
    const unseenLinks = progressTrackingEnabled
      ? selectUnseenInstagramPosts(links, knownPosts, links.length)
      : links;
    if (progressTrackingEnabled && unseenLinks.length === 0) {
      log(`instagram no new posts ${source.id}: ${links.length} visible post(s) already checked`);
      return [];
    }
    const instagramPostLimit = resolveInstagramPostLimit(unseenLinks.length, source);
    if (instagramPostLimit <= 0) {
      throw new RunBudgetReachedError(`instagram posts ${source.id}`);
    }
    if (instagramPostLimit < unseenLinks.length) {
      log(`instagram post scan capped ${source.id}: ${instagramPostLimit}/${unseenLinks.length} unseen remaining_ms=${runRemainingMs()}`);
    }
    const completedPosts = [];
    const selectedLinks = unseenLinks.slice(0, instagramPostLimit);
    result.pipeline.discovery.documents += selectedLinks.length;
    for (const url of selectedLinks) {
      ensureRunBudgetOrThrow(`instagram post ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      await throttleInstagram(`post ${source.id}`, instagramPostDelayMs);
      const postCandidates = await withBoundedStep(
        `${source.id}:post`,
        () => scrapeInstagramPost(page, url, source),
        candidatePostStepTimeoutMs(source),
      );
      recordPipelineDocument(source, postCandidates.length);
      if (!hasAccessFailure(`${source.id}:post`)) completedPosts.push(url);
      candidates.push(...postCandidates);
      if (hasAccessFailure(`${source.id}:post`)) break;
    }
    if (progressTrackingEnabled && completedPosts.length) {
      instagramPendingSeenPosts[source.id] = completedPosts;
    }
    return candidates;
  }

  if (source.type === 'naver_cafe') {
    const links = await withBoundedStep(source.id, () => collectNaverArticleLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no article links');
      return [];
    }
    const candidates = [];
    const selectedLinks = links.slice(0, resolveSourceScanLimit(source, links.length));
    result.pipeline.discovery.documents += selectedLinks.length;
    for (const link of selectedLinks) {
      ensureRunBudgetOrThrow(`naver article ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      const postCandidates = await withBoundedStep(
        `${source.id}:article`,
        () => scrapeNaverArticle(page, link, source),
        candidatePostStepTimeoutMs(source),
      );
      recordPipelineDocument(source, postCandidates.length);
      candidates.push(...postCandidates);
      if (hasAccessFailure(`${source.id}:article`)) break;
    }
    return candidates;
  }

  if (source.type === 'daum_cafe') {
    const links = await withBoundedStep(source.id, () => collectDaumArticleLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no article links');
      return [];
    }
    const candidates = [];
    const selectedLinks = links.slice(0, resolveSourceScanLimit(source, links.length));
    result.pipeline.discovery.documents += selectedLinks.length;
    for (const link of selectedLinks) {
      ensureRunBudgetOrThrow(`daum article ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      const postCandidates = await withBoundedStep(
        `${source.id}:article`,
        () => scrapeDaumArticle(page, link, source),
        candidatePostStepTimeoutMs(source),
      );
      recordPipelineDocument(source, postCandidates.length);
      candidates.push(...postCandidates);
      if (hasAccessFailure(`${source.id}:article`)) break;
    }
    return candidates;
  }

  if (source.type === 'littly') {
    const cards = await withBoundedStep(source.id, () => collectLittlyCards(page, source), sourceTimeoutMs);
    if (!cards.length) {
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no active link cards');
      return [];
    }
    const candidates = [];
    const selectedCards = cards.slice(0, resolveSourceScanLimit(source, cards.length));
    result.pipeline.discovery.documents += selectedCards.length;
    for (const card of selectedCards) {
      ensureRunBudgetOrThrow(`littly card ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));
      const cardCandidates = await withBoundedStep(
        `${source.id}:card`,
        () => scrapeLittlyCard(page, card, source),
        candidatePostStepTimeoutMs(source, 5_000),
      );
      recordPipelineDocument(source, cardCandidates.length);
      candidates.push(...cardCandidates);
      if (hasAccessFailure(`${source.id}:card`)) break;
    }
    return candidates;
  }

  recordAccessFailure(source, `unsupported ${source.type}`);
  return [];
}

function browserContextOptions() {
  return {
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  };
}

async function openBrowserContext() {
  try {
    const browser = await chromium.connectOverCDP(browserCdpUrl, { timeout: 6000 });
    const context = browser.contexts()[0];
    if (context) {
      log(`browser connected over CDP: ${browserCdpUrl}`);
      return { browser, context, close: () => browser.close() };
    }
    await browser.close();
  } catch (error) {
    log(`browser CDP unavailable: ${error.message}`);
  }

  try {
    const context = await chromium.launchPersistentContext(browserProfileDir, {
      ...browserContextOptions(),
      channel: 'chrome',
      headless: browserHeadless,
    });
    log(`browser persistent profile: ${browserProfileDir} headless=${browserHeadless}`);
    return { browser: null, context, close: () => context.close() };
  } catch (error) {
    log(`browser persistent profile unavailable: ${error.message}`);
  }

  const browser = await chromium.launch({ headless: browserHeadless });
  const context = await browser.newContext(browserContextOptions());
  log(`browser fallback: ephemeral chromium headless=${browserHeadless}`);
  return { browser, context, close: () => browser.close() };
}

async function main() {
  if (!['swing-daily', 'expanded-research', 'expanded-ingestion'].includes(profile)) {
    throw new Error(`unsupported native collector profile: ${profile}`);
  }
  if (targetInstagramPostUrls.length && sourceIds.length === 0) {
    throw new Error('INGESTION_NATIVE_POST_URLS requires INGESTION_NATIVE_SOURCE_IDS');
  }

  let sources = getAutomationSourceList(profile)
    .filter((source) => profile === 'expanded-research' || source.saveEnabled)
    .filter((source) => sourcePriorities.length === 0 || sourcePriorities.includes(Number(source.priority)))
    .filter((source) => sourceTypes.length === 0 || sourceTypes.includes(source.type))
    .filter((source) => sourceIds.length === 0 || sourceIds.includes(source.id))
    .sort((a, b) => sourceOrderWeight(a) - sourceOrderWeight(b)
      || Number(a.priority || 99) - Number(b.priority || 99)
      || a.name.localeCompare(b.name, 'ko'))
    .filter((source, index) => sourceBatchTotal > 1 ? index % sourceBatchTotal === sourceBatchIndex : true)
    .slice(0, sourceLimit > 0 ? sourceLimit : undefined);

  const progressEnabled = profile === 'swing-daily'
    && sourcePriorities.length === 1
    && sourceIds.length === 0
    && sourceBatchTotal <= 1
    && sourceLimit <= 0
    && !dryRun;
  progressTrackingEnabled = progressEnabled;
  const progressFile = progressEnabled
    ? progressFileForPriority(sourcePriorities[0], process.env.INGESTION_PROGRESS_STATE_DIR || '')
    : '';
  const progressState = progressEnabled
    ? await loadIngestionProgress(progressFile)
    : { remainingSources: [], lastCompletedAt: '', updatedAt: '', instagramSeenPosts: {} };
  if (progressEnabled) {
    instagramSeenPosts = { ...(progressState.instagramSeenPosts || {}) };
    sources = reorderSourcesForResume(sources, progressState.remainingSources);
    instagramSourcePostLimit = catchupInstagramPostLimit(instagramSourcePostLimit, progressState.lastCompletedAt);
    await saveIngestionProgress(progressFile, buildIngestionProgressState({
      remainingSources: sources.map((source) => source.id),
      lastCompletedAt: progressState.lastCompletedAt,
      instagramSeenPosts,
    }));
    log(`resume state=${progressFile} prior_remaining=${progressState.remainingSources.length} instagram_post_limit=${instagramSourcePostLimit}`);
  }

  const checkpointProgress = async (remainingSources, completed = false) => {
    if (!progressEnabled) return;
    await saveIngestionProgress(progressFile, buildIngestionProgressState({
      remainingSources,
      lastCompletedAt: progressState.lastCompletedAt,
      completed,
      instagramSeenPosts,
    }));
  };

  const checkpointRemainingSources = (futureSources = []) => unique([
    ...result.remainingSources,
    ...futureSources,
  ]);

  log(`start profile=${profile} sources=${sources.length} today=${today} dryRun=${dryRun} exception_backtest=${exceptionBacktest} lookback_days=${exceptionLookbackDays} priorities=${sourcePriorities.join(',') || 'all'} batch=${sourceBatchTotal > 1 ? `${sourceBatchIndex}/${sourceBatchTotal}` : 'all'} budget_ms=${runBudgetMs} post_timeout_ms=${postRequestTimeoutMs} image_timeout_ms=${imageFetchTimeoutMs}`);
  const browserSession = await openBrowserContext();
  const { context } = browserSession;

  try {
    const seenRunKeys = new Set();
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex];
      if (!hasRunBudget(runDeadlineGuardMs())) {
        recordDeadlineReached(sources, sourceIndex);
        break;
      }

      const excluded = getExcludedSourceReason(source.url);
      if (excluded) {
        result.skipped += 1;
        log(`excluded source ${source.id}: ${excluded}`);
        await checkpointProgress(checkpointRemainingSources(sources.slice(sourceIndex + 1).map((item) => item.id)));
        continue;
      }

      log(`source ${source.id} ${source.type} ${source.url}`);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1600, height: 1200 }).catch(() => {});
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(18000);
      try {
        const issueCountBeforeSource = result.issues.length;
        const candidates = await collectSource(page, source);
        const mergedSocialVariants = collapseSocialCandidateVariants(candidates);
        const deduped = [...new Map(mergedSocialVariants.map((candidate) => [candidate.id, candidate])).values()];
        result.pipeline.decomposition.candidates += deduped.length;
        for (const candidate of deduped) {
          const activity = String(candidate.structured_data?.activity_type || 'unknown');
          result.pipeline.classification.byActivity[activity] = (result.pipeline.classification.byActivity[activity] || 0) + 1;
        }
        for (const candidate of deduped) {
          ensureRunBudgetOrThrow(`post candidate ${source.id}`, Math.min(10_000, runDeadlineGuardMs()));

          const sd = candidate.structured_data || {};
          const runKey = sd.benefit_kind === 'season_pass'
            ? [
              'season_pass',
              normalizeForCompare(sd.title),
              normalizeForCompare(sd.location || sd.venue_name),
            ].join('|')
            : [
              sd.date,
              normalizeForCompare(sd.title),
              normalizeForCompare(sd.location || sd.venue_name),
            ].join('|');
          if (seenRunKeys.has(runKey)) {
            result.skipped += 1;
            log(`skip ${source.id} ${sd.date}: duplicate within run (${sd.title})`);
            continue;
          }
          seenRunKeys.add(runKey);
          await postCandidate(candidate);
        }
        if (
          progressTrackingEnabled
          && shouldAdvanceInstagramCheckpoint(result.issues.slice(issueCountBeforeSource))
          && instagramPendingSeenPosts[source.id]?.length
        ) {
          instagramSeenPosts[source.id] = mergeSeenInstagramPosts(
            instagramSeenPosts[source.id] || [],
            instagramPendingSeenPosts[source.id],
          );
        }
        delete instagramPendingSeenPosts[source.id];
      } catch (error) {
        delete instagramPendingSeenPosts[source.id];
        if (error instanceof RunBudgetReachedError) {
          recordDeadlineReached(sources, sourceIndex);
          break;
        }
        if (error instanceof NetworkUnavailableError) {
          recordNetworkUnavailable(sources, sourceIndex, error.message);
          break;
        }
        throw error;
      } finally {
        await settleWithin(page.close(), 2_000);
      }

      if (result.deadlineReached) break;
      await checkpointProgress(checkpointRemainingSources(sources.slice(sourceIndex + 1).map((item) => item.id)));
    }
  } finally {
    await settleWithin(browserSession.close(), 2_000);
  }

  const partialRun = result.deadlineReached || result.remainingSources.length > 0;
  await checkpointProgress(partialRun ? result.remainingSources : [], !partialRun);

  printSummary();
}

function printSummary() {
  const accessFailures = unique(result.accessFailures).slice(0, 12);
  const instagramCircuitSkipsAll = unique(result.instagramCircuitSkips);
  const instagramCircuitSkips = instagramCircuitSkipsAll.slice(0, 12);
  const noContentSources = unique(result.noContentSources).slice(0, 12);
  const issues = unique(result.issues).slice(0, 8);
  console.log('INGESTION_RESULT_JSON_START');
  console.log(JSON.stringify({
    engine: 'native',
    insertCount: result.inserted,
    skipCount: result.skipped,
    accessFailures,
    instagramCircuitSkips: {
      count: instagramCircuitSkipsAll.length,
      sources: instagramCircuitSkips,
    },
    noContentSources,
    issues,
    candidates: result.candidates.slice(0, exceptionBacktest ? 200 : 20),
    autoRegisteredEvents: result.autoRegisteredEvents,
    deadlineReached: result.deadlineReached,
    remainingSources: result.remainingSources.slice(0, 20),
    remainingSourceCount: result.remainingSources.length,
    benefitSearchStats: result.benefitSearchStats,
    benefitAiReviewStats: result.benefitAiReviewStats,
    socialAiExtractionStats: result.socialAiExtractionStats,
    pipeline: result.pipeline,
  }, null, 2));
  console.log('INGESTION_RESULT_JSON_END');
  console.log('==TELEGRAM_SUMMARY_START==');
  console.log(`신규: ${result.inserted}건`);
  console.log(`자동등록: ${formatAutoRegistrationTelegramLine(result.autoRegisteredEvents)}`);
  console.log(`스킵: ${result.skipped}건`);
  console.log(`과거데이터삭제: ${cleanupCount}건`);
  console.log(`접근불가: ${accessFailures.length ? accessFailures.join(', ') : 'none'}`);
  console.log(`인스타회로차단: ${instagramCircuitSkipsAll.length ? `${instagramCircuitSkipsAll.length}건 (${instagramCircuitSkips.join(', ')}${instagramCircuitSkipsAll.length > instagramCircuitSkips.length ? ', ...' : ''})` : 'none'}`);
  console.log(`수집대상없음: ${noContentSources.length ? noContentSources.join(', ') : 'none'}`);
  console.log(`AI혜택판정: 확인 ${result.benefitAiReviewStats.approved} / 재검토 ${result.benefitAiReviewStats.review} / 제외 ${result.benefitAiReviewStats.rejected} / 오류 ${result.benefitAiReviewStats.error + result.benefitAiReviewStats.unavailable}`);
  console.log(`AI소셜추출: 확인 ${result.socialAiExtractionStats.approved} / 재검토 ${result.socialAiExtractionStats.review} / 오류 ${result.socialAiExtractionStats.error + result.socialAiExtractionStats.unavailable}`);
  console.log(`파이프라인: 발견 ${result.pipeline.discovery.documents} / 판별문서 ${result.pipeline.classification.documents} / 분해후보 ${result.pipeline.decomposition.candidates} / 저장 ${result.pipeline.persistence.saved + result.pipeline.persistence.refreshed} / 자동등록 ${result.pipeline.registration.succeeded} / 차단 ${result.pipeline.registration.blocked + result.pipeline.registration.notReady}`);
  console.log(`단계차단: ${result.pipeline.blockers.length ? result.pipeline.blockers.slice(0, 5).map((item) => `${item.stage}:${item.sourceId || item.candidateId || 'unknown'}(${item.reason})`).join(' / ') : 'none'}`);
  console.log(`이슈: ${issues.length ? issues.join(' / ') : 'none'}`);
  console.log('==TELEGRAM_SUMMARY_END==');
}

async function flushAndExit(code) {
  await new Promise((resolve) => process.stdout.write('', resolve));
  await new Promise((resolve) => process.stderr.write('', resolve));
  process.exit(code);
}

main()
  .then(async () => {
    await flushAndExit(result.deadlineReached || result.remainingSources.length ? 75 : 0);
  })
  .catch(async (error) => {
    result.issues.push(error.message);
    printSummary();
    await flushAndExit(1);
  });
