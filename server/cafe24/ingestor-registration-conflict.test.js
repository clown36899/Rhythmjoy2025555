import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// Exercise the active collection policy; only the pause test overrides it.
vi.mock('../../scripts/ingestion/collection-registry.mjs', async importOriginal => {
  const policy = await importOriginal();
  return { ...policy, isAutomaticCollectionActivityEnabled: vi.fn(policy.isAutomaticCollectionActivityEnabled) };
});
import { isAutomaticCollectionActivityEnabled } from '../../scripts/ingestion/collection-registry.mjs';
vi.mock('./auth-api.js', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'admin', is_admin: true })), requireAdmin: vi.fn() }));
vi.mock('./generic-data-api.js', () => ({ loadCafe24TableRows: vi.fn(), saveCafe24TableRow: vi.fn(), deleteCafe24TableRows: vi.fn() }));
vi.mock('./events-api.js', () => ({ enqueueNewEventNotification: vi.fn() }));
vi.mock('./regular-social-reconciler.js', async importOriginal => ({ ...(await importOriginal()), runRegularSocialReconciliation: vi.fn(async () => ({ status: 'ok' })) }));
import { runRegularSocialReconciliation } from './regular-social-reconciler.js';
import { loadCafe24TableRows, saveCafe24TableRow } from './generic-data-api.js';
import { enqueueNewEventNotification } from './events-api.js';
import { buildCollectedScrapedEventRow, cafe24IngestorRegisterEvent, cafe24ScrapedEvents } from './function-api.js';

const candidate = (id = 'candidate', dj = '초리') => ({ id, status: 'pending', source_url: `https://example.com/${id}`, extracted_text: `9월 16일 스윙타임 소셜 DJ ${dj}`,
  auto_registration: { ready: true, mode: 'auto', source_id: 'swingtimebar' },
  structured_data: { title: '스윙타임 수요 소셜', date: '2026-09-16', venue_name: '스윙타임', activity_type: 'social', djs: [dj], evidence_scope: 'date_scoped_social' },
});
const event = { id: 'live', title: 'DJ 뉴야 | 스윙타임 수요 소셜', category: 'social', date: '2026-09-16', location: '스윙타임', link1: 'https://example.com/live' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (id = 'candidate', extra = {}) => ({ body: { automatic: true, scrapedEventId: id, ...extra }, headers: { 'x-ingestion-token': 'test-ingestion-token' } });
let events;
beforeEach(async () => {
  vi.clearAllMocks();
  const policy = await vi.importActual('../../scripts/ingestion/collection-registry.mjs');
  isAutomaticCollectionActivityEnabled.mockImplementation(policy.isAutomaticCollectionActivityEnabled);
  vi.stubEnv('SCRAPED_EVENTS_INGEST_TOKEN', 'test-ingestion-token');
  events = [event];
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? [...events] : table === 'scraped_events' ? [candidate()] : []);
  saveCafe24TableRow.mockImplementation(async (_table, row) => row);
});

it('reopens an unregistered fuzzy duplicate through intake and keeps one public event on retry', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T03:00:00Z'));
  events = [];
  const incoming = candidate();
  const primary = { ...candidate('unverified-old-post'), auto_registration: { ready: false },
    structured_data: { ...incoming.structured_data, djs: [] } };
  let rows = [primary, { ...incoming, status: 'duplicate', structured_data: { ...incoming.structured_data,
    _duplicate: { target: 'scraped_events', existingId: primary.id, reason: '같은 날짜, 유사 제목, 같은 장소' } } }];
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? [...events] : table === 'scraped_events' ? [...rows] : []);
  saveCafe24TableRow.mockImplementation(async (table, row, _keys, options) => {
    if (table === 'events') { await options?.beforeEventSave?.({}); events.push(row); }
    if (table === 'scraped_events') rows = rows.map(old => old.id === row.id ? row : old);
    return row;
  });
  const intake = async () => {
    const res = response();
    await cafe24ScrapedEvents({ method: 'POST', headers: request().headers, body: [incoming] }, res);
    return res.json.mock.calls[0][0];
  };
  const recovered = await intake();
  expect(recovered.skipped).toEqual([]);
  expect(recovered.data[0]).toMatchObject({ id: incoming.id, status: 'pending' });
  const registered = response();
  await cafe24IngestorRegisterEvent(request(recovered.data[0].id), registered);
  expect(registered.status).toHaveBeenCalledWith(201);
  expect(events).toHaveLength(1);
  expect(rows.find(row => row.id === incoming.id)).toMatchObject({ status: 'collected', registered_event_id: events[0].id });
  expect(rows.find(row => row.id === primary.id)).toEqual(primary);
  const eventId = events[0].id;
  // Explicit reprocessing remains available for same-event corrections. The
  // collector's public reconciliation stops routine retries after completion.
  await intake();
  const retried = response();
  await cafe24IngestorRegisterEvent(request(incoming.id), retried);
  expect(retried.json).toHaveBeenCalledWith(expect.objectContaining({ repaired: true, event: expect.objectContaining({ id: eventId }) }));
  expect(new Set(events.map(row => row.id)).size).toBe(1);
  expect(enqueueNewEventNotification).toHaveBeenCalledTimes(1);
});

it('applies a saved closure immediately and retries reconciliation even when intake already stored it', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T03:00:00Z'));
  const incoming = { id: 'closure', source_id: 'neo_swing', source_url: 'https://www.instagram.com/neo_swing/p/weekly/',
    exception_type: 'closure', evidence: '이번주 금요일 소셜 쉬어갑니다',
    structured_data: { title: '휴무', date: '2026-09-25', activity_type: 'social_exception', location: '해피홀' } };
  let rows = [];
  loadCafe24TableRows.mockImplementation(async table => table === 'scraped_events' ? [...rows] : []);
  saveCafe24TableRow.mockImplementation(async (table, row) => { if (table === 'scraped_events') rows = [row]; return row; });
  runRegularSocialReconciliation.mockRejectedValueOnce(new Error('public write failed'));
  const intake = () => cafe24ScrapedEvents({ method: 'POST', headers: request().headers, body: incoming }, response());
  await expect(intake()).rejects.toThrow('public write failed');
  expect(rows).toHaveLength(1);
  await intake();
  expect(runRegularSocialReconciliation).toHaveBeenCalledTimes(2);
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});

it('persists a reviewable pending candidate and blocks event/notification side effects', async () => {
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(saveCafe24TableRow).toHaveBeenCalledWith('scraped_events', expect.objectContaining({ status: 'pending', auto_registration: expect.objectContaining({ ready: false }) }));
  expect(saveCafe24TableRow.mock.calls.every(([table]) => table === 'scraped_events')).toBe(true);
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});

it.each([false, true].flatMap(late => ['swingscandal-cafe', 'happyhall2004'].map(source => [late, source])))('holds a DJ-less official venue candidate including the final locked check (%s, %s)', async (lateConflict, sourceId) => {
  const venue = sourceId === 'happyhall2004' ? 'HAPPY HALL' : 'SAVOY BALLROOM';
  const canonicalVenue = sourceId === 'happyhall2004' ? '해피홀' : '사보이볼룸';
  const incoming = { ...candidate(), source_id: sourceId,
    source_url: 'https://example.com/savoy', poster_url: 'test-social-poster.webp',
    extracted_text: `2026.09.19 ${venue} 토요 소셜`,
    auto_registration: { ready: true, mode: 'auto', source_id: sourceId, ai_verified: true, ai_confidence: 0.99 },
    structured_data: { title: `${venue} 토요 소셜`, date: '2026-09-19', venue_name: venue,
      activity_type: 'social', djs: [], venue_provenance: 'poster_text', evidence_scope: 'ai_grounded_social',
      ai_missing_dj_verified: true, ai_evidence_quotes: [`2026.09.19 ${venue} 토요 소셜`] },
  };
  const existing = { ...event, title: `DJ 단미 | ${canonicalVenue} 토요 소셜`, date: '2026-09-19', location: canonicalVenue, link1: incoming.source_url };
  events = lateConflict ? [] : [existing];
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? [...events] : table === 'scraped_events' ? [incoming] : []);
  saveCafe24TableRow.mockImplementation(async (table, row, _keys, options) => {
    if (table === 'events') {
      events = [existing];
      await options.beforeEventSave({});
      events.push(row);
    }
    return row;
  });
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ conflict: expect.objectContaining({ existingId: 'live' }) }));
  expect(saveCafe24TableRow).toHaveBeenCalledWith('scraped_events', expect.objectContaining({ status: 'pending',
    auto_registration: expect.objectContaining({ ready: false, reasons: expect.arrayContaining([expect.stringContaining('#live')]) }) }));
  expect(events).toEqual([existing]);
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});

it('leaves a dry-run conflict unchanged and retains the existing strict duplicate result', async () => {
  await cafe24IngestorRegisterEvent(request('candidate', { dryRun: true }), response());
  expect(saveCafe24TableRow).not.toHaveBeenCalled();
  events = [{ ...event, title: 'DJ 초리 | 스윙타임 수요 소셜' }];
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(saveCafe24TableRow).toHaveBeenCalledWith('scraped_events', expect.objectContaining({ status: 'duplicate' }));
});

it('permits administrator-reviewed registration through the existing manual path', async () => {
  const res = response();
  await cafe24IngestorRegisterEvent({ body: { scrapedEventId: 'candidate', eventData: { title: '별도 확인한 소셜', date: '2026-09-16', category: 'social', location: '스윙타임' } }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(enqueueNewEventNotification).toHaveBeenCalledTimes(1);
});

it('rechecks serialized writes so concurrent candidates cannot create a second social', async () => {
  events = [];
  const candidates = [candidate('a', '초리'), candidate('b', '뉴야')];
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? [...events] : table === 'scraped_events' ? candidates : []);
  let tail = Promise.resolve();
  saveCafe24TableRow.mockImplementation((table, row, _keys, options) => {
    if (table !== 'events') return Promise.resolve(row);
    const run = tail.then(async () => { await options.beforeEventSave({}); events.push(row); return row; });
    tail = run.catch(() => {});
    return run;
  });
  const responses = [response(), response()];
  await Promise.all(candidates.map((c, i) => cafe24IngestorRegisterEvent(request(c.id), responses[i])));
  expect(events).toHaveLength(1);
  expect(enqueueNewEventNotification).toHaveBeenCalledTimes(1);
  expect(responses.map(r => r.status.mock.calls[0][0]).sort()).toEqual([201, 422]);
});

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it.each([true, false])('moves a successful registration exclusively to collected, including benefit evidence (automatic=%s)', async automatic => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T03:00:00Z'));
  events = [];
  let row = candidate();
  row.structured_data = { ...row.structured_data, benefit_eligible: true, benefit_kind: 'free_event' };
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? events : table === 'scraped_events' ? [row] : []);
  saveCafe24TableRow.mockImplementation(async (table, saved) => {
    if (table === 'events') events.push(saved);
    if (table === 'scraped_events') row = saved;
    return saved;
  });
  const list = async tab => {
    const res = response();
    await cafe24ScrapedEvents({ method: 'GET', query: { tab }, headers: {} }, res);
    return res.json.mock.calls[0][0];
  };
  expect((await list('new')).total).toBe(1);
  expect((await list('free')).total).toBe(1);
  const res = response();
  await cafe24IngestorRegisterEvent(automatic ? request() : {
    body: { scrapedEventId: row.id, eventData: { title: row.structured_data.title, date: '2026-09-16', category: 'social', location: '스윙타임' } }, headers: {},
  }, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(row.registered_event_id).toBe(events[0].id);
  for (const tab of ['new', 'free', 'duplicate']) expect((await list(tab)).total).toBe(0);
  expect((await list('collected')).data).toEqual([row]);
  vi.setSystemTime(new Date('2026-09-23T03:00:00Z'));
  expect((await list('collected')).data).toEqual([row]);
});

it('keeps completed legacy rows out of review tabs while retaining pending and genuine duplicate rows', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T03:00:00Z'));
  const pending = candidate('pending');
  const duplicate = { ...candidate('duplicate'), status: 'duplicate', structured_data: { ...candidate().structured_data, _duplicate: { existingId: 'other' } } };
  const completed = buildCollectedScrapedEventRow({ scrapedEvent: candidate('completed'), structuredData: duplicate.structured_data, registeredEvent: event });
  const legacy = { ...candidate('legacy'), status: 'collected' };
  loadCafe24TableRows.mockResolvedValue([pending, duplicate, completed, legacy]);
  for (const [tab, ids] of [['new', ['pending']], ['duplicate', ['duplicate']], ['collected', ['completed', 'legacy']]]) {
    const res = response();
    await cafe24ScrapedEvents({ method: 'GET', query: { tab }, headers: {} }, res);
    expect(res.json.mock.calls[0][0].data.map(row => row.id).sort()).toEqual(ids);
  }
  expect(saveCafe24TableRow).not.toHaveBeenCalled();
});


it('retains the same existing event ID on a compatible retry without sending another notification', async () => {
  events = [{ ...event, title: 'DJ 초리 | 스윙타임 수요 소셜', link1: 'https://example.com/candidate' }];
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ repaired: true, event: expect.objectContaining({ id: 'live' }) }));
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});


it('connects automatic registration to the existing venue record and persists the same metadata to its ledger', async () => {
  events = [];
  const venue = { id: 'venue-swingtime', name: '스윙타임(선릉)', address: '서울 강남구 검증된 장소 주소',
    map_url: JSON.stringify({ naver: 'https://naver.me/verified' }) };
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? events : table === 'venues' ? [venue] : table === 'scraped_events' ? [candidate()] : []);
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.status).toHaveBeenCalledWith(201);
  const metadata = { venue_id: venue.id, venue_name: '스윙타임', address: venue.address, location_link: 'https://naver.me/verified' };
  expect(saveCafe24TableRow).toHaveBeenCalledWith('events', expect.objectContaining(metadata), [], expect.any(Object));
  expect(saveCafe24TableRow).toHaveBeenCalledWith('scraped_events', expect.objectContaining({ structured_data: expect.objectContaining(metadata) }));
  expect(enqueueNewEventNotification).toHaveBeenCalledTimes(1);
});


it('blocks social automatic intake and backlog registration while leaving explicit manual registration available', async () => {
  const policy = await vi.importActual('../../scripts/ingestion/collection-registry.mjs');
  expect(policy.automaticSocialCollectionEnabled).toBe(true);
  expect(policy.isAutomaticCollectionActivityEnabled('social')).toBe(true);
  isAutomaticCollectionActivityEnabled.mockImplementation(activity => !['social', 'social_exception', 'closure', 'recurring_closure'].includes(String(activity).trim().toLowerCase()));
  const auto = response();
  await cafe24IngestorRegisterEvent(request(), auto);
  expect(auto.status).toHaveBeenCalledWith(422);
  expect(saveCafe24TableRow).not.toHaveBeenCalled();
  const intake = response();
  const closure = { ...candidate('closure'), exception_type: 'closure', structured_data: { activity_type: 'social_exception' } };
  await cafe24ScrapedEvents({ method: 'POST', headers: request().headers, body: [candidate(), closure] }, intake);
  expect(intake.json.mock.calls[0][0]).toMatchObject({ count: 0, total: 0, skipped: expect.any(Array) });
  expect(intake.json.mock.calls[0][0].skipped).toHaveLength(2);
  expect(saveCafe24TableRow).not.toHaveBeenCalled();
  expect(runRegularSocialReconciliation).not.toHaveBeenCalled();
  events = [];
  const manual = response();
  await cafe24IngestorRegisterEvent(request('candidate', { automatic: false, eventData: { ...event, id: undefined } }), manual);
  expect(manual.status).toHaveBeenCalledWith(201);
});
