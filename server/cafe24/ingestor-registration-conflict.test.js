import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./auth-api.js', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'admin', is_admin: true })), requireAdmin: vi.fn() }));
vi.mock('./generic-data-api.js', () => ({ loadCafe24TableRows: vi.fn(), saveCafe24TableRow: vi.fn(), deleteCafe24TableRows: vi.fn() }));
vi.mock('./events-api.js', () => ({ enqueueNewEventNotification: vi.fn() }));
import { loadCafe24TableRows, saveCafe24TableRow } from './generic-data-api.js';
import { enqueueNewEventNotification } from './events-api.js';
import { cafe24IngestorRegisterEvent } from './function-api.js';

const candidate = (id = 'candidate', dj = '초리') => ({ id, status: 'pending', source_url: `https://example.com/${id}`, extracted_text: `9월 16일 스윙타임 소셜 DJ ${dj}`,
  auto_registration: { ready: true, mode: 'auto', source_id: 'swingtimebar' },
  structured_data: { title: '스윙타임 수요 소셜', date: '2026-09-16', venue_name: '스윙타임', activity_type: 'social', djs: [dj], evidence_scope: 'date_scoped_social' },
});
const event = { id: 'live', title: 'DJ 뉴야 | 스윙타임 수요 소셜', category: 'social', date: '2026-09-16', location: '스윙타임', link1: 'https://example.com/live' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (id = 'candidate', extra = {}) => ({ body: { automatic: true, scrapedEventId: id, ...extra }, headers: { 'x-ingestion-token': 'test-ingestion-token' } });
let events;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SCRAPED_EVENTS_INGEST_TOKEN', 'test-ingestion-token');
  events = [event];
  loadCafe24TableRows.mockImplementation(async table => table === 'events' ? [...events] : table === 'scraped_events' ? [candidate()] : []);
  saveCafe24TableRow.mockImplementation(async (_table, row) => row);
});

it('persists a reviewable pending candidate and blocks event/notification side effects', async () => {
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(saveCafe24TableRow).toHaveBeenCalledWith('scraped_events', expect.objectContaining({ status: 'pending', auto_registration: expect.objectContaining({ ready: false }) }));
  expect(saveCafe24TableRow.mock.calls.every(([table]) => table === 'scraped_events')).toBe(true);
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});

it.each([false, true])('holds a DJ-less English venue candidate including the final locked check (%s)', async (lateConflict) => {
  const incoming = { ...candidate(), source_id: 'swingscandal-cafe',
    source_url: 'https://example.com/savoy', poster_url: 'test-social-poster.webp',
    extracted_text: '2026.09.19 SAVOY BALLROOM 토요 소셜',
    auto_registration: { ready: true, mode: 'auto', source_id: 'swingscandal-cafe', ai_verified: true, ai_confidence: 0.99 },
    structured_data: { title: 'SAVOY BALLROOM 토요 소셜', date: '2026-09-19', venue_name: 'SAVOY BALLROOM',
      activity_type: 'social', djs: [], venue_provenance: 'poster_text', evidence_scope: 'ai_grounded_social',
      ai_missing_dj_verified: true, ai_evidence_quotes: ['2026.09.19 SAVOY BALLROOM 토요 소셜'] },
  };
  const existing = { ...event, title: 'DJ 단미 | 사보이볼룸 토요 소셜', date: '2026-09-19', location: '사보이볼룸', link1: incoming.source_url };
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

afterEach(() => vi.unstubAllEnvs());


it('retains the same existing event ID on a compatible retry without sending another notification', async () => {
  events = [{ ...event, title: 'DJ 초리 | 스윙타임 수요 소셜', link1: 'https://example.com/candidate' }];
  const res = response();
  await cafe24IngestorRegisterEvent(request(), res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ repaired: true, event: expect.objectContaining({ id: 'live' }) }));
  expect(enqueueNewEventNotification).not.toHaveBeenCalled();
});
