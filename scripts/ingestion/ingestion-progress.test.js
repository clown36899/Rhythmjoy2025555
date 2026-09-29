// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { automaticSocialCollectionEnabled, isAutomaticCollectionActivityEnabled } from './collection-registry.mjs';
import { stripRepeatedDjContext, stripNaverCafeMemberPrefix, filterDeadlineOnlyEventDates, prepareCandidate, buildCafe24Payload, toMapSafeVenueName, extractExplicitClosureDates } from './candidate-utils.mjs';
import {
  buildIngestionProgressState, completedDocumentKeys, ingestionItemKey,
  loadIngestionProgress, reopenFailedIngestionItems, saveIngestionProgress,
  shouldAdvanceInstagramCheckpoint, reorderSourcesForResume, mergeSeenInstagramPosts, findUnresolvedTodaySocialSources, isSupplementalRecoveryRun, selectUnseenInstagramPosts,
} from './ingestion-progress.mjs';

// Exercise the actual native entry points without launching its top-level CLI,
// real browser, AI service, or production writes.
const native = ts.createSourceFile('native.mjs', await fs.readFile(new URL('./swing-daily-native.mjs', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const functions = names => native.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(native)).join('\n');
const candidate = (id, url = 'https://example.com/post') => ({ id, source_id: 'source', source_url: url,
  structured_data: { date: '2026-10-01', title: id, activity_type: 'class', location: '검증 홀' }, extracted_text: id });
const input = (url, text = '본문') => ({ source: { id: 'source' }, sourceUrl: url, text, title: '모집' });
const directories = [];
// Exercise the active policy by default; paused-policy cases override it explicitly.
const nativeContext = values => vm.createContext({ automaticSocialCollectionEnabled,
  isAutomaticCollectionActivityEnabled, ...values });
it('applies the existing article-date boundary to AI without trusting a fabricated poster date', async () => {
  const h = nativeContext({
    today: '2026-09-24', maxFutureDays: 60, exceptionBacktest: false, exceptionLookbackDays: 0,
    compactText: value => String(value).replace(/\s+/g, ' ').trim(), unique: values => [...new Set(values)],
    getYearForMonth: () => 2026, filterDeadlineOnlyEventDates, prepareCandidate, buildCafe24Payload, toMapSafeVenueName,
    aiSocialExtractionEnabled: true, aiSocialExtractionTimeoutMs: 10000,
    hasBadPosterUrl: () => false, shouldAttemptAiSocialExtraction: () => true,
    imageToDataUrl: vi.fn(async () => 'data:image/png;base64,cG9zdGVy'),
    extractExplicitClosureDates: () => [], ensureRunBudgetOrThrow: () => {}, runDeadlineGuardMs: () => 0, runRemainingMs: () => 100000,
    extractSocialScheduleWithAi: vi.fn(), recordPipelineBlocker: vi.fn(), log: vi.fn(),
    dayLabelFromISO: () => '목',
    result: { issues: [], remainingSources: [], skipped: 0, socialAiExtractionStats: { approved: 0 } },
  });
  vm.runInContext(functions(['isoDate', 'extractDates', 'hasExplicitEventDateMention', 'selectCandidateDates', 'extractSocialDateHints',
    'buildAiSocialFallbackCandidates', 'normalizedEvidenceIncludes', 'socialDayTitle']), h);
  const source = { id: 'swingscandal-cafe', name: '스윙스캔들', scope: 'swing', genre_family: 'partner', dance_genre: 'swing', venue: '사보이볼룸' };
  const input = { source, sourceUrl: 'https://cafe.naver.com/f-e/cafes/14933600/articles/example',
    title: '2026.09.17 스윙스캔들 목요소셜 DJ', cleanText: '2026.09.17 스윙스캔들 목요소셜 DJ 몽룡님입니다', posterUrl: 'https://example.com/poster.png' };
  expect(await h.buildAiSocialFallbackCandidates(input)).toEqual([]);
  expect(h.imageToDataUrl).not.toHaveBeenCalled();
  expect(h.extractSocialScheduleWithAi).not.toHaveBeenCalled();

  // Exercise the browser-reader call boundary too: display cleanup used to
  // discard the leading date before either deterministic or AI date selection.
  const frame = { name: () => 'cafe_main', waitForFunction: vi.fn(async () => true),
    evaluate: vi.fn(async fn => fn === h.readNaverArticleDocument ? { title: input.title, text: '몽룡님입니다', images: [], publishedAt: '2026.09.14' } : undefined) };
  Object.assign(h, { safeGoto: async () => {}, postTimeoutMs: 100, readNaverArticleDocument: () => {},
    selectSourceOrderedPosterUrls: () => [input.posterUrl], pickPosterImage: () => input.posterUrl,
    cleanTitle: value => value.replace(/^2026\.09\.17\s*/, ''), stripNaverCafeChrome: value => value,
    normalizeSourceUrl: value => value,
    buildCandidatesFromText: vi.fn(value => h.buildAiSocialFallbackCandidates({ ...value, cleanText: value.text })) });
  vm.runInContext(functions(['scrapeNaverArticle']), h);
  expect(await h.scrapeNaverArticle({ frames: () => [frame], waitForTimeout: async () => {} }, { href: input.sourceUrl, title: input.title }, source)).toEqual([]);
  expect(h.buildCandidatesFromText).toHaveBeenCalledWith(expect.objectContaining({ title: input.title }));
  expect(h.extractSocialScheduleWithAi).not.toHaveBeenCalled();

  const extraction = { approved: true, outcome: 'approved', validation: { confidence: 0.99, poster_text: '9.25 목요 소셜' },
    events: [{ event_date: '2026-09-25', venue: '사보이볼룸', djs: ['해림'], poster_image_index: 1, evidence_quotes: ['9.25 목요 소셜'] }] };
  h.extractSocialScheduleWithAi.mockResolvedValue(extraction);
  const current = { ...input, title: '2026.09.24 스윙스캔들 목요소셜 DJ', cleanText: '2026.09.24 스윙스캔들 목요소셜 DJ 해림님입니다' };
  expect(await h.buildAiSocialFallbackCandidates(current)).toEqual([]);
  expect(h.recordPipelineBlocker).toHaveBeenCalledWith('extraction', expect.objectContaining({ reason: expect.stringContaining('explicit article title') }));
  expect(h.result.remainingSources).toEqual([source.id]);

  h.extractSocialScheduleWithAi.mockResolvedValue({ ...extraction, validation: { confidence: 0.99, poster_text: '목사 DJ 해림 SAVOY BALLROOM BAR' },
    events: [{ ...extraction.events[0], event_date: '2026-09-24', evidence_quotes: ['2026.09.24', '스윙스캔들 목요소셜', 'DJ 해림'] }] });
  const [valid] = await h.buildAiSocialFallbackCandidates(current);
  expect(valid.structured_data).toMatchObject({ date: '2026-09-24', djs: ['해림'] });
  // An undated monthly/weekly heading still permits dates grounded in its body/posters.
  const monthly = await h.buildAiSocialFallbackCandidates({ ...current, title: '9월 소셜 안내' });
  expect(monthly).toHaveLength(1);
  expect(h.hasExplicitEventDateMention('🌕 9월 4주 위클리네오 🌕')).toBe(false);
  h.today = '2026-09-01';
  expect(h.extractDates('2026년 9월 4주차 / 9월 14주 / 9월 4 주')).toEqual([]);
  expect(h.extractDates('9월 25일, 27일')).toEqual(['2026-09-25', '2026-09-27']);
});

it('resolves grouped weekly closures from publication evidence without treating a week number as a past day', () => {
  const h = nativeContext({ today: '2026-09-25', maxFutureDays: 180, exceptionBacktest: false, exceptionLookbackDays: 180,
    Buffer, compactText: value => String(value).replace(/\s+/g, ' ').trim(), unique: values => [...new Set(values)],
    getYearForMonth: () => 2026, inferDjs: () => [], inferVenueDetails: () => ({ venue: '해피홀', provenance: 'source_registry' }),
    extractExplicitClosureDates, closureEventPattern: /쉬어\s*갑니다|쉽니다|휴무/, graduationEventPattern: /졸업공연/ });
  vm.runInContext(functions(['isoDate', 'extractDates', 'relativeWeekdayDate', 'nearestExplicitDateBefore', 'exceptionDates', 'exceptionEvidence', 'buildExceptionBacktestCandidates']), h);
  const notice = { source: { id: 'neo_swing', name: '네오스윙' }, sourceUrl: 'https://www.instagram.com/neo_swing/p/Ddkbx2cTSNq/',
    title: '🌕 9월 4주 위클리네오 🌕', publishedAt: '2026-09-22T00:20:34.000Z',
    cleanText: '🌕 9월 4주 위클리네오 🌕\n이번주 금햅, 일햅은 추석연휴로 쉬어갑니다!\n입문, 베이직 클래스 강습 진행됩니다.' };
  expect(h.buildExceptionBacktestCandidates(notice).map(row => row.structured_data.date)).toEqual(['2026-09-25', '2026-09-27']);
  expect(h.nearestExplicitDateBefore('9월 4주 쉬어갑니다', 6)).toBe('');
  expect(h.buildExceptionBacktestCandidates({ ...notice, publishedAt: '' }).filter(row => row.structured_data.date)).toEqual([]);
  expect(h.buildExceptionBacktestCandidates({ ...notice, title: '', cleanText: '9월 4일 소셜 쉽니다' })).toEqual([]);
  h.exceptionBacktest = true;
  expect(h.buildExceptionBacktestCandidates(notice).map(row => row.structured_data.date).filter(Boolean)).toEqual(['2026-09-25']);
  h.exceptionBacktest = false; h.today = '2026-09-28';
  expect(h.buildExceptionBacktestCandidates(notice).filter(row => row.structured_data.date)).toEqual([]);
});

it('reads the last successful and current social DJs without accepting OCR fee headings as performers', () => {
  const h = nativeContext({ stripRepeatedDjContext, stripNaverCafeMemberPrefix,
    compactText: value => String(value).replace(/\s+/g, ' ').trim(), unique: values => [...new Set(values)],
    looksLikeNaverCafeChromeLine: () => false, leadingDateTitleRe: /^\d{1,2}[./]/ });
  vm.runInContext(functions(['inferDjs']), h);
  expect(h.inferDjs('BALBOA SOCIAL IN CLUB DJ. 현장 :1000원 사전신청:8000원')).toEqual([]);
  expect(h.inferDjs('장소 : 쏘셜클럽 D J : 쓴귤 사전신청 : 8,000원')).toEqual(['쓴귤']);
  expect(h.inferDjs('장소 : 쏘셜클럽 D J : Benny 사전신청 : 8,000원')).toEqual(['Benny']);
});
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });

function harness() {
  const context = nativeContext({
    ingestionItemKey, shouldAdvanceInstagramCheckpoint,
    normalizeSourceUrl: value => String(value).replace(/\/+$/, ''),
    completedItems: {}, deferredItems: {}, pendingDocuments: {}, progressTrackingEnabled: true, today: '2026-10-01',
    result: { issues: [], accessFailures: [], skipped: 0 }, log: vi.fn(),
    updateExpectedAutomaticSocial: vi.fn(), unique: values => [...new Set(values)],
    extractCandidatesFromText: vi.fn(), persistCandidate: vi.fn(async () => true),
  });
  vm.runInContext(functions(['candidateCompletionKey', 'buildCandidatesFromText', 'postCandidate']), context);
  return context;
}

it('preserves successful posts when another post in the same source fails', async () => {
  const h = harness();
  const good = candidate('good', 'https://example.com/good');
  h.extractCandidatesFromText.mockResolvedValueOnce([good]).mockImplementationOnce(async () => {
    h.result.issues.push('post source: AI extraction unavailable'); return [];
  });
  await h.buildCandidatesFromText(input(good.source_url));
  await h.buildCandidatesFromText(input('https://example.com/failed'));
  await h.postCandidate(good);
  const keys = completedDocumentKeys(h.pendingDocuments.source, h.completedItems.source);
  expect(keys).toEqual([h.pendingDocuments.source[0].key]);
  h.completedItems.source.push(...keys);
  await h.buildCandidatesFromText(input(good.source_url));
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(2);
  h.extractCandidatesFromText.mockResolvedValue([]);
  await h.buildCandidatesFromText(input('https://example.com/failed'));
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(3);
});

it('retries only the failed child of a multi-event document, including after restart', async () => {
  const h = harness(), good = candidate('good'), failed = candidate('failed');
  h.extractCandidatesFromText.mockResolvedValue([good, failed]);
  h.persistCandidate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await h.buildCandidatesFromText(input(good.source_url));
  await h.postCandidate(good); await h.postCandidate(failed);
  expect(completedDocumentKeys(h.pendingDocuments.source, h.completedItems.source)).toEqual([]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ingestion-checkpoint-')); directories.push(directory);
  const file = path.join(directory, 'state.json');
  await saveIngestionProgress(file, buildIngestionProgressState({ completedItems: h.completedItems, remainingSources: ['source'] }));
  const resumed = harness();
  resumed.completedItems = (await loadIngestionProgress(file)).completedItems;
  await resumed.postCandidate(good); await resumed.postCandidate(failed);
  expect(resumed.persistCandidate).toHaveBeenCalledTimes(1);
  expect(resumed.persistCandidate).toHaveBeenCalledWith(failed);
  expect(completedDocumentKeys(h.pendingDocuments.source, resumed.completedItems.source)).toEqual([h.pendingDocuments.source[0].key]);
});

it('reopens changed cafe evidence while unchanged evidence bypasses extraction', async () => {
  const h = harness();
  h.extractCandidatesFromText.mockResolvedValue([]);
  await h.buildCandidatesFromText(input('https://example.com/notice', '첫 안내'));
  h.completedItems.source = completedDocumentKeys(h.pendingDocuments.source, []);
  await h.buildCandidatesFromText(input('https://example.com/notice', '첫 안내'));
  await h.buildCandidatesFromText(input('https://example.com/notice', '수정된 개강 안내'));
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(2);
  expect(ingestionItemKey('document', 'url', { b: 1, a: 2 })).toBe(ingestionItemKey('document', 'url', { a: 2, b: 1 }));
  await h.buildCandidatesFromText({ ...input('https://example.com/notice', '첫 안내'), source: { id: 'source', autoRegistrationPolicy: 'auto' } });
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(3);
  const posterNotice = { ...input('https://www.instagram.com/source/p/post/'), posterUrl: 'https://scontent-a.cdninstagram.com/v/poster.webp?_nc_gid=old&oh=old' };
  await h.buildCandidatesFromText(posterNotice);
  h.completedItems.source = completedDocumentKeys(h.pendingDocuments.source, []);
  await h.buildCandidatesFromText({ ...posterNotice, posterUrl: 'https://scontent-b.cdninstagram.com/v/poster.webp?_nc_gid=new&oh=new' });
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(4);
  await h.buildCandidatesFromText({ ...posterNotice, posterUrl: 'https://scontent-b.cdninstagram.com/v/replacement.webp?_nc_gid=new&oh=new' });
  expect(h.extractCandidatesFromText).toHaveBeenCalledTimes(5);
});

it('does not checkpoint access or persistence failures and leaves dry runs untouched', async () => {
  const h = harness(), row = candidate('failed');
  h.extractCandidatesFromText.mockImplementation(async () => { h.result.accessFailures.push('login wall'); return []; });
  await h.buildCandidatesFromText(input(row.source_url));
  expect(completedDocumentKeys(h.pendingDocuments.source, [])).toEqual([]);
  h.persistCandidate.mockResolvedValue(false);
  await h.postCandidate(row);
  expect(h.completedItems).toEqual({});
  h.progressTrackingEnabled = false;
  h.persistCandidate.mockResolvedValue(true);
  await h.postCandidate(row);
  expect(h.completedItems).toEqual({});
});

it('reopens only the failed occurrence and its document after public reconciliation', () => {
  const url = 'https://example.com/post', h = harness();
  const document = ingestionItemKey('document', url, '본문');
  const good = h.candidateCompletionKey(candidate('good')), bad = h.candidateCompletionKey(candidate('bad'));
  const result = reopenFailedIngestionItems({ source: [document, good, bad], other: ['untouched'] }, [{ sourceId: 'source', sourceUrl: url, candidateId: 'bad' }]);
  expect(result).toEqual({ source: [good], other: ['untouched'] });
});

it('loads legacy progress without losing seen posts or inventing completion', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ingestion-legacy-')); directories.push(directory);
  const file = path.join(directory, 'state.json');
  await fs.writeFile(file, JSON.stringify({ remainingSources: ['failed'], instagramSeenPosts: { source: ['https://example.com/good'] } }));
  expect(await loadIngestionProgress(file)).toMatchObject({ remainingSources: ['failed'], instagramSeenPosts: { source: ['https://example.com/good'] }, completedItems: {} });
});

it.each([201, 422, 503])('uses actual registration outcome for completion while retaining saved counts (HTTP %s)', async status => {
  const h = harness();
  Object.assign(h, { exceptionBacktest: false, aiAdjudicationEnabled: false, dryRun: false, profile: 'swing-daily',
    ingestToken: 'test-token', endpoint: 'https://example.com/candidates', automaticRegistrationEndpoint: 'https://example.com/register', postRequestTimeoutMs: 100,
    recordPipelineBlocker: vi.fn(), recordRegistrationPolicyBlocker: vi.fn(), toAutoRegistrationReportEntry: value => value,
    fetchWithTimeout: vi.fn().mockResolvedValueOnce({ response: { ok: true }, body: JSON.stringify({ data: [{ id: 'candidate' }], count: 1 }) })
      .mockResolvedValueOnce({ response: { ok: status === 201, status }, body: JSON.stringify(status === 201 ? { event: { id: 'event' } } : { error: 'failed' }) }),
    result: { issues: [], skipped: 0, inserted: 0, candidates: [], autoRegisteredEvents: [],
      pipeline: { persistence: { attempted: 0, failures: 0, saved: 0, refreshed: 0 }, registration: { attempted: 0, blocked: 0, succeeded: 0 } } },
  });
  vm.runInContext(functions(['persistCandidate']), h);
  await h.postCandidate({ ...candidate('candidate'), auto_registration: { ready: true } });
  expect(h.completedItems.source?.length || 0).toBe(status === 201 ? 1 : 0);
  expect(h.result.inserted).toBe(1);
  expect(h.fetchWithTimeout).toHaveBeenCalledTimes(2);
});

function mainHarness({ state = buildIngestionProgressState({}), succeeds = true, recovery = false, date = '2026-09-23', events = [], sources, clockDate = date } = {}) {
  const good = candidate('good', 'https://example.com/good'), bad = candidate('bad', 'https://example.com/bad');
    const h = harness();
    Object.assign(h, {
      profile: 'swing-daily', targetInstagramPostUrls: [], sourceIds: [], sourceScopes: [], sourcePriorities: [1], sourceTypes: [],
      sourceBatchTotal: 1, sourceBatchIndex: 0, sourceLimit: 0, dryRun: false, process: { env: {} },
      getAutomationSourceList: () => sources || [{ id: 'source', saveEnabled: true, priority: 1, name: '공식 출처', type: 'instagram', venue: '검증 홀', url: 'https://example.com' }],
      sourceOrderWeight: () => 0, isSupplementalRecoveryRun: () => recovery, progressFileForPriority: () => '/unused',
      loadIngestionProgress: async () => structuredClone(state), saveIngestionProgress: async (_file, next) => { state = structuredClone(next); },
      buildIngestionProgressState, reorderSourcesForResume, mergeSeenInstagramPosts, completedDocumentKeys,
      catchupInstagramPostLimit: value => value, instagramSourcePostLimit: 2, instagramSeenPosts: {}, instagramPendingSeenPosts: {},
      loadPublicEventsForDates: vi.fn(async () => events), findUnresolvedTodaySocialSources, sameDayRecoverySources: new Set(),
      today: date, todayISO: () => clockDate, expectedAutomaticSocials: [], exceptionBacktest: false, exceptionLookbackDays: 180, runBudgetMs: 1200000, postRequestTimeoutMs: 100, imageFetchTimeoutMs: 100,
      openBrowserContext: vi.fn(async () => ({ context: { newPage: async () => ({ setViewportSize: async () => {}, setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, close: async () => {} }) }, close: async () => {} })),
      hasRunBudget: () => true, runDeadlineGuardMs: () => 1, ensureRunBudgetOrThrow() {}, getExcludedSourceReason: () => '',
      collapseSocialCandidateVariants: rows => rows, dedupeCandidatesByContentIdentity: rows => rows,
      ensureExpectedAutomaticSocialCandidate() {}, normalizeForCompare: value => String(value || ''),
      hasAccessFailure: () => false, reconcileExpectedAutomaticSocials: async () => {}, settleWithin: value => value, printSummary() {},
      result: { issues: [], accessFailures: [], remainingSources: [], skipped: 0, deadlineReached: false,
        pipeline: { decomposition: { candidates: 0 }, classification: { byActivity: {} }, reconciliation: { failures: [] } } },
    });
    h.extractCandidatesFromText.mockImplementation(async item => [item.sourceUrl === good.source_url ? good : bad]);
    h.persistCandidate.mockImplementation(async item => item.id === 'good' || succeeds);
    h.collectSource = async () => {
      h.instagramPendingSeenPosts.source = [good.source_url, bad.source_url];
      return [...await h.buildCandidatesFromText(input(good.source_url)), ...await h.buildCandidatesFromText(input(bad.source_url))];
    };
    vm.runInContext(functions(['main']), h);
    h.getState = () => state;
    return h;
}

it('persists per-document completion through the actual main loop and retries only unfinished work on the next run', async () => {
  const good = candidate('good', 'https://example.com/good'), bad = candidate('bad', 'https://example.com/bad');
  const first = mainHarness({ succeeds: false });
  await first.main();
  expect(first.getState().remainingSources).toEqual(['source']);
  expect(first.getState().instagramSeenPosts.source).toEqual([good.source_url]);
  const second = mainHarness({ state: first.getState() });
  await second.main();
  expect(second.extractCandidatesFromText).toHaveBeenCalledTimes(1);
  expect(second.persistCandidate).toHaveBeenCalledTimes(1);
  expect(second.persistCandidate).toHaveBeenCalledWith(bad);
  expect(second.getState().remainingSources).toEqual([]);
  expect(second.getState().instagramSeenPosts.source.sort()).toEqual([bad.source_url, good.source_url]);
});

const wednesday = { id: 'regular-social:source:2026-09-23', date: '2026-09-23', location: '검증 홀', dj_name: '미정',
  automation: { generated_by: 'regular-social-rolling-v1', source_id: 'source' } };

it('reopens a legacy seen-only weekly post through the real selector and main loop, retries failure, then stops after closure', async () => {
  const url = 'https://www.instagram.com/source/p/weekly/';
  const events = [{ ...wednesday }];
  const rows = ['2026-09-23', '2026-09-27'].map(date => ({ ...candidate(`closure-${date}`, url), exception_type: 'closure',
    structured_data: { date, title: `휴무 ${date}`, activity_type: 'social_exception', location: '검증 홀' } }));
  let state = buildIngestionProgressState({ instagramSeenPosts: { source: [url] } });
  for (let tick = 0; tick < 3; tick += 1) {
    const h = mainHarness({ state, recovery: true, events });
    Object.assign(h, { supportsPublicScheduleSource: () => false, estimatedInstagramSourceBudgetMs: () => 1,
      instagramCircuitOpen: false, throttleInstagram: async () => {}, instagramSourceDelayMs: 0, instagramPostDelayMs: 0,
      withBoundedStep: (_id, read) => read(), collectInstagramLinks: async () => [url], sourceTimeoutMs: 100,
      markInstagramProfileSuccess() {}, selectUnseenInstagramPosts, resolveInstagramPostLimit: () => 2,
      candidatePostStepTimeoutMs: () => 100, recordPipelineDocument() {}, runRemainingMs: () => 100000,
      scrapeInstagramPost: vi.fn((_page, sourceUrl, source) => h.buildCandidatesFromText({ source, sourceUrl, text: '주간 휴무', title: '공지' })) });
    h.result.pipeline.discovery = { documents: 0 };
    h.extractCandidatesFromText.mockResolvedValue(rows);
    h.persistCandidate.mockImplementation(async () => {
      if (tick === 0) return false;
      events[0].dj_name = '휴무'; return true;
    });
    vm.runInContext(functions(['collectSource']), h);
    await h.main();
    expect(h.scrapeInstagramPost).toHaveBeenCalledTimes(tick < 2 ? 1 : 0);
    expect(h.persistCandidate).toHaveBeenCalledTimes(tick < 2 ? 1 : 0);
    if (tick < 2) expect(h.persistCandidate.mock.calls[0][0].structured_data.date).toBe(wednesday.date);
    if (tick === 2) expect(h.openBrowserContext).not.toHaveBeenCalled();
    state = h.getState();
  }
  expect(state.completedItems.source.filter(key => key.startsWith('candidate:closure-2026-09-23'))).toHaveLength(1);
  expect(Object.values(state.deferredItems.source)).toContainEqual(['2026-09-27']);
  const completed = ingestionItemKey('document', 'https://example.com/done', 'read and registered');
  expect(selectUnseenInstagramPosts(['https://example.com/done', url], ['https://example.com/done', url], 1, 2, [completed])).toEqual([url]);
  expect(selectUnseenInstagramPosts(['https://example.com/done'], ['https://example.com/done'], 2, 0, [completed])).toEqual([]);
});

it.each(['2026-09-22', '2026-09-24'])('does not retry Wednesday on %s even with old unfinished sources', async date => {
  const state = buildIngestionProgressState({ remainingSources: ['source', 'old-class-failure'] });
  const h = mainHarness({ state, recovery: true, date, events: [wednesday] });
  await h.main();
  expect(h.openBrowserContext).not.toHaveBeenCalled();
  expect(h.getState()).toEqual(state);
});

it.each([
  [], [{ ...wednesday, dj_name: '휴무' }],
  [wednesday, { id: 'actual', date: wednesday.date, location: wednesday.location, category: 'social' }],
])('stops retries for absent, closed, or already registered occurrences (%j)', async events => {
  const h = mainHarness({ recovery: true, events, state: buildIngestionProgressState({ remainingSources: ['source'] }) });
  await h.main();
  expect(h.openBrowserContext).not.toHaveBeenCalled();
});

it('retries Wednesday socials only, deferring future occurrences and classes without draining the source repeatedly', async () => {
  const h = mainHarness({ recovery: true, events: [wednesday], state: buildIngestionProgressState({ remainingSources: ['unrelated'] }) });
  const social = date => ({ ...candidate(date), structured_data: { date, activity_type: 'social', title: date, location: '검증 홀' } });
  h.collectSource = vi.fn(async () => {
    h.expectedAutomaticSocials.push({ date: '2026-09-23' }, { date: '2026-09-30' });
    return [social('2026-09-23'), social('2026-09-30'), candidate('class')];
  });
  await h.main();
  expect(h.collectSource).toHaveBeenCalledTimes(1);
  expect(h.persistCandidate).toHaveBeenCalledTimes(1);
  expect(h.persistCandidate.mock.calls[0][0].structured_data.date).toBe('2026-09-23');
  expect(h.expectedAutomaticSocials.map(row => row.date)).toEqual(['2026-09-23']);
  expect(h.getState().remainingSources).toContain('unrelated');
});

it('stops an alternate source immediately after the same-day social is registered', async () => {
  const events = [wednesday];
  const sources = ['source', 'alternate'].map(id => ({ id, saveEnabled: true, priority: 1, name: id, type: 'instagram', venue: '검증 홀' }));
  const h = mainHarness({ recovery: true, events, sources });
  h.collectSource = vi.fn(async () => [{ ...candidate('today'), structured_data: { date: wednesday.date, activity_type: 'social', title: '오늘 소셜' } }]);
  h.persistCandidate.mockImplementation(async () => { events.push({ id: 'actual', date: wednesday.date, location: wednesday.location, category: 'social' }); return true; });
  await h.main();
  expect(h.collectSource).toHaveBeenCalledTimes(1);
  expect(h.getState().remainingSources).toEqual([]);
  expect(h.result.pipeline.reconciliation.sameDayRetry).toMatchObject({ verified: true, pendingSources: [] });
});

it.each([422, 503])('retries an actual failed registration (HTTP %s) next tick, then stops only after public registration', async failureStatus => {
  const events = [wednesday];
  const row = { ...candidate('original-id'), auto_registration: { ready: true },
    structured_data: { date: wednesday.date, activity_type: 'social', title: '수요 소셜', location: wednesday.location } };
  let state = buildIngestionProgressState({ lastDiscoveryAt: '2026-09-22T23:00:00Z' });
  for (const [index, status] of [failureStatus, 201, 201].entries()) {
    const h = mainHarness({ state, recovery: true, events });
    const instant = `2026-09-23T0${index}:30:00Z`;
    Object.assign(h, { isSupplementalRecoveryRun,
      process: { env: { INGESTION_NATIVE_FULL_SCAN_HOURS: '8,12,16,18,20' } },
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } },
      aiAdjudicationEnabled: false, ingestToken: 'test-token',
      endpoint: 'https://example.com/candidates', automaticRegistrationEndpoint: 'https://example.com/register',
      recordPipelineBlocker: vi.fn(), recordRegistrationPolicyBlocker: vi.fn(), toAutoRegistrationReportEntry: value => value,
      fetchWithTimeout: vi.fn(async (url, options) => {
        if (url === h.endpoint) return { response: { ok: true }, body: JSON.stringify({ data: [{ id: 'server-resolved-id' }], count: 1 }) };
        expect(JSON.parse(options.body).scrapedEventId).toBe('server-resolved-id');
        const event = { id: 'public-event', date: wednesday.date, location: wednesday.location, category: 'social' };
        if (status === 201) events.push(event);
        return { response: { ok: status === 201, status }, body: JSON.stringify(status === 201 ? { event } : { error: 'registration failed' }) };
      }),
    });
    Object.assign(h.result, { inserted: 0, candidates: [], autoRegisteredEvents: [] });
    Object.assign(h.result.pipeline, { persistence: { attempted: 0, failures: 0, saved: 0, refreshed: 0 },
      registration: { attempted: 0, blocked: 0, succeeded: 0 } });
    vm.runInContext(functions(['persistCandidate']), h);
    h.extractCandidatesFromText.mockResolvedValue([row]);
    h.collectSource = vi.fn(async () => h.buildCandidatesFromText(input(row.source_url)));
    await h.main();
    expect(h.fetchWithTimeout).toHaveBeenCalledTimes(index < 2 ? 2 : 0);
    expect(h.openBrowserContext).toHaveBeenCalledTimes(index < 2 ? 1 : 0);
    expect(h.result.pipeline.reconciliation.sameDayRetry).toMatchObject({
      date: wednesday.date, verified: true, pendingSources: index === 0 ? ['source'] : [],
    });
    if (index === 0) {
      expect(h.getState().completedItems.source || []).toEqual([]);
      expect(h.getState().remainingSources).toContain('source');
    }
    state = h.getState();
  }
  expect(events.filter(event => event.id === 'public-event')).toHaveLength(1);
});

it('keeps state intact when the public baseline fails and never starts collection', async () => {
  const state = buildIngestionProgressState({ remainingSources: ['source'] });
  const h = mainHarness({ recovery: true, state });
  h.loadPublicEventsForDates.mockRejectedValue(new Error('503'));
  await h.main();
  expect(h.openBrowserContext).not.toHaveBeenCalled();
  expect(h.getState()).toEqual(state);
  expect(h.result.issues).toContain('same-day recovery verification failed: 503');
  expect(h.result.pipeline.reconciliation.sameDayRetry.verified).toBe(false);
});

it('does not collect after the KST date changes during an outstanding retry', async () => {
  const h = mainHarness({ recovery: true, events: [wednesday], clockDate: '2026-09-24' });
  h.collectSource = vi.fn();
  await h.main();
  expect(h.collectSource).not.toHaveBeenCalled();
  expect(h.persistCandidate).not.toHaveBeenCalled();
});

it('discovers once per configured KST window, catches delayed starts, and preserves legacy/manual behavior', () => {
  const configured = '8,12,16,18,20';
  const check = (now, previous) => isSupplementalRecoveryRun(configured, new Date(now), previous);
  expect(check('2026-09-23T04:00:00Z', '')).toBe(false); // First start at 13:00.
  expect(check('2026-09-23T06:30:00Z', '2026-09-23T04:00:00Z')).toBe(true); // Same noon window.
  expect(check('2026-09-23T07:30:00Z', '2026-09-23T04:00:00Z')).toBe(false); // New 16:00 window.
  expect(check('2026-09-23T09:30:00Z', '2026-09-22T23:00:00Z')).toBe(false); // Missed windows, one discovery.
  expect(check('2026-09-23T10:30:00Z', '2026-09-23T09:30:00Z')).toBe(true);
  expect(check('2026-09-23T11:30:00Z', '2026-09-23T09:30:00Z')).toBe(false);
  expect(check('2026-09-23T15:00:00Z', '2026-09-23T04:00:00Z')).toBe(false); // KST midnight.
  expect(check('2026-09-23T07:30:00Z', 'invalid')).toBe(false);
  expect(check('2026-09-23T07:30:00Z', '2026-09-24T07:30:00Z')).toBe(false);
  expect(isSupplementalRecoveryRun('', new Date('2026-09-23T07:30:00Z'), '2026-09-23T04:00:00Z')).toBe(false);
  expect(isSupplementalRecoveryRun('25', new Date('2026-09-23T07:30:00Z'), '')).toBe(false);
  expect(check('2026-09-23T07:30:00Z', undefined)).toBe(false);
  expect(check('2026-09-23T08:30:00Z', undefined)).toBe(true);
});

it('discovers a later future notice in the next window without rewriting a completed notice or retrying an unchanged future failure', async () => {
  expect(automaticSocialCollectionEnabled).toBe(true);
  const future = id => ({ ...candidate(id, `https://example.com/${id}`),
    structured_data: { date: '2026-09-27', activity_type: 'social', title: id, location: '검증 홀' } });
  const completed = future('morning-success'), deferred = future('morning-failure'), later = future('afternoon-new');
  let state = buildIngestionProgressState({});
  const run = async (instant, rows) => {
    const h = mainHarness({ state });
    Object.assign(h, { isSupplementalRecoveryRun, process: { env: { INGESTION_NATIVE_FULL_SCAN_HOURS: '8,12,16,18,20' } },
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } } });
    h.extractCandidatesFromText.mockImplementation(async input => [rows.find(row => row.source_url === input.sourceUrl)]);
    h.collectSource = vi.fn(async () => {
      const candidates = [];
      for (const row of rows) candidates.push(...await h.buildCandidatesFromText(input(row.source_url)));
      return candidates;
    });
    h.persistCandidate.mockImplementation(async row => row.id !== deferred.id);
    await h.main(); state = h.getState(); return h;
  };
  const morning = await run('2026-09-22T23:30:00Z', [completed, deferred]);
  expect(morning.persistCandidate).toHaveBeenCalledTimes(2);
  const middle = await run('2026-09-23T01:30:00Z', [completed, deferred, later]);
  expect(middle.openBrowserContext).not.toHaveBeenCalled();
  const afternoon = await run('2026-09-23T04:30:00Z', [completed, deferred, later]);
  expect(afternoon.extractCandidatesFromText).toHaveBeenCalledTimes(1);
  expect(afternoon.persistCandidate).toHaveBeenCalledExactlyOnceWith(later);
  expect(state.lastDiscoveryAt).toBe('2026-09-23T04:30:00.000Z');
  const sameWindow = await run('2026-09-23T05:30:00Z', [completed, deferred, later]);
  expect(sameWindow.openBrowserContext).not.toHaveBeenCalled();
});

it('treats next Wednesday as a new occurrence without reopening last Wednesday', () => {
  const sources = [{ id: 'source', type: 'instagram', venue: '검증 홀', allowedWeekdays: [3] }];
  const next = { ...wednesday, id: 'regular-social:source:2026-09-30', date: '2026-09-30' };
  const registered = { id: 'actual', date: wednesday.date, location: wednesday.location, category: 'social' };
  expect(findUnresolvedTodaySocialSources([wednesday, registered, next], sources, '2026-09-29')).toEqual([]);
  expect(findUnresolvedTodaySocialSources([wednesday, registered, next], sources, '2026-09-30')).toEqual(['source']);
});

it('does not retry a failed future social during daily discovery before or after its occurrence date', async () => {
  const h = harness();
  const row = { ...candidate('wednesday'), structured_data: { date: '2026-09-23', activity_type: 'social', title: '수요일 소셜' } };
  h.today = '2026-09-21'; h.persistCandidate.mockResolvedValue(false);
  await h.postCandidate(row);
  h.today = '2026-09-22'; await h.postCandidate(row);
  expect(h.persistCandidate).toHaveBeenCalledTimes(1);
  h.today = '2026-09-23'; await h.postCandidate(row);
  expect(h.persistCandidate).toHaveBeenCalledTimes(2);
  h.today = '2026-09-24'; await h.postCandidate(row);
  expect(h.persistCandidate).toHaveBeenCalledTimes(2);
});

it('defers an unchanged multi-date document until the remaining occurrence day and reopens changed evidence', async () => {
  const first = mainHarness({ date: '2026-09-21' });
  const rows = ['2026-09-23', '2026-09-30'].map(date => ({ ...candidate(date), structured_data: { date, activity_type: 'social', title: date } }));
  first.extractCandidatesFromText.mockResolvedValue(rows);
  first.collectSource = async () => first.buildCandidatesFromText(input('https://example.com/weekly'));
  first.persistCandidate.mockResolvedValue(false);
  await first.main();
  const onTuesday = mainHarness({ date: '2026-09-22', state: first.getState() });
  onTuesday.collectSource = async () => onTuesday.buildCandidatesFromText(input('https://example.com/weekly'));
  await onTuesday.main();
  expect(onTuesday.extractCandidatesFromText).not.toHaveBeenCalled();
  const onWednesday = mainHarness({ date: '2026-09-23', state: onTuesday.getState() });
  onWednesday.extractCandidatesFromText.mockResolvedValue(rows);
  onWednesday.collectSource = async () => onWednesday.buildCandidatesFromText(input('https://example.com/weekly'));
  await onWednesday.main();
  expect(onWednesday.persistCandidate).toHaveBeenCalledTimes(1);
  expect(onWednesday.persistCandidate.mock.calls[0][0].structured_data.date).toBe('2026-09-23');
  const onThursday = mainHarness({ date: '2026-09-24', state: onWednesday.getState() });
  onThursday.collectSource = async () => onThursday.buildCandidatesFromText(input('https://example.com/weekly'));
  await onThursday.main();
  expect(onThursday.extractCandidatesFromText).not.toHaveBeenCalled();
  const nextWednesday = mainHarness({ date: '2026-09-30', state: onThursday.getState() });
  nextWednesday.extractCandidatesFromText.mockResolvedValue(rows);
  nextWednesday.collectSource = async () => nextWednesday.buildCandidatesFromText(input('https://example.com/weekly'));
  await nextWednesday.main();
  expect(nextWednesday.persistCandidate).toHaveBeenCalledTimes(1);
  expect(nextWednesday.persistCandidate.mock.calls[0][0].structured_data.date).toBe('2026-09-30');
  const changed = mainHarness({ date: '2026-09-22', state: first.getState() });
  changed.collectSource = async () => changed.buildCandidatesFromText(input('https://example.com/weekly', '새로 올라온 공지 내용'));
  await changed.main();
  expect(changed.extractCandidatesFromText).toHaveBeenCalledTimes(1);
});


const pausedPolicy = { automaticSocialCollectionEnabled: false,
  isAutomaticCollectionActivityEnabled: activity => !['social', 'social_exception', 'closure', 'recurring_closure'].includes(String(activity).trim().toLowerCase()) };

it('can pause supplemental social retries before any browser or public read', async () => {
  const state = buildIngestionProgressState({ remainingSources: ['source', 'old-class-failure'] });
  const h = mainHarness({ state, recovery: true, events: [wednesday] });
  Object.assign(h, pausedPolicy);
  await h.main();
  expect(h.openBrowserContext).not.toHaveBeenCalled();
  expect(h.loadPublicEventsForDates).not.toHaveBeenCalled();
  expect(h.getState()).toEqual(state);
  expect(h.result.issues).toEqual([]);
});

it('retains classes in mixed documents without saving or retrying the social and closure children', async () => {
  const h = mainHarness();
  Object.assign(h, pausedPolicy);
  const lesson = candidate('class');
  const social = { ...candidate('social'), structured_data: { ...lesson.structured_data, activity_type: 'social' } };
  const closure = { ...candidate('closure'), structured_data: { ...lesson.structured_data, activity_type: 'social_exception' } };
  h.extractCandidatesFromText.mockResolvedValue([social, lesson, closure]);
  h.collectSource = async () => h.buildCandidatesFromText(input('https://example.com/mixed'));
  await h.main();
  expect(h.persistCandidate).toHaveBeenCalledTimes(1);
  expect(h.persistCandidate).toHaveBeenCalledWith(lesson);
  expect(h.getState().remainingSources).toEqual([]);
  expect(h.loadPublicEventsForDates).not.toHaveBeenCalled();
  await h.postCandidate(social);
  await h.postCandidate(closure);
  expect(h.persistCandidate).toHaveBeenCalledTimes(1);
});

it('skips social AI and closure extraction before downloading posters', async () => {
  const h = nativeContext(pausedPolicy);
  vm.runInContext(functions(['buildAiSocialFallbackCandidates', 'buildExceptionBacktestCandidates']), h);
  expect(await h.buildAiSocialFallbackCandidates({})).toEqual([]);
  expect(h.buildExceptionBacktestCandidates({})).toEqual([]);
});
