import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const state = vi.hoisted(() => ({ user: null, rows: new Map(), writes: [], execute: vi.fn(), query: vi.fn() }));
vi.mock('./auth-api.js', () => ({
  getCurrentUser: async () => state.user,
  requireAdmin: async () => {
    if (!state.user) throw Object.assign(new Error('로그인이 필요합니다.'), { statusCode: 401 });
    if (!state.user.is_admin) throw Object.assign(new Error('관리자 권한이 필요합니다.'), { statusCode: 403 });
    return state.user;
  },
}));
vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: state.execute, query: state.query }) }));
import { insertRecords, updateRecords, upsertRecords, deleteRecords, queryRecords } from './generic-data-api.js';
import { cafe24OneDayRecruitLogo } from './function-api.js';

const table = 'swing_oneday_recruit_links';
const legacy = { id: 'legacy-link', community: '기존 동호회', url: 'https://example.com/old', region: '서울', is_active: true, logo_full: '/uploads/old.webp', sort_order: 10 };
const temporaryUploads = await fs.mkdtemp(path.join(os.tmpdir(), 'oneday-logos-'));
const oldUploads = process.env.CAFE24_UPLOADS_DIR;
process.env.CAFE24_UPLOADS_DIR = temporaryUploads;
afterAll(async () => {
  if (oldUploads === undefined) delete process.env.CAFE24_UPLOADS_DIR;
  else process.env.CAFE24_UPLOADS_DIR = oldUploads;
  await fs.rm(temporaryUploads, { recursive: true, force: true });
});
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (values = {}, extra = {}) => ({ headers: {}, params: { table }, body: { values, single: true, ...extra } });
const filter = (id) => [{ field: 'id', op: 'eq', value: id }];
const created = () => ({ id: 'new-link', community: '신규 동호회', venue: null, region: '서울', area: '서울', lat: 37.5, lng: 127, url: 'https://example.com/new', dance_scope: 'salsa', is_active: true, sort_order: 20, benefit_eligible: false, benefit_kind: null });

beforeEach(() => {
  state.user = { id: 'ordinary-user', is_admin: false };
  state.rows = new Map([[legacy.id, { ...legacy }]]);
  state.writes = [];
  state.execute.mockReset().mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT data_json')) {
      const rows = sql.includes('record_id = ?') ? [state.rows.get(args[1])].filter(Boolean) : [...state.rows.values()];
      return [rows.map(row => ({ data_json: JSON.stringify(row) }))];
    }
    if (sql.trimStart().startsWith('INSERT INTO generic_records')) {
      const row = JSON.parse(args[2]);
      if (!sql.includes('ON DUPLICATE KEY') && state.rows.has(args[1])) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      state.rows.set(args[1], row); state.writes.push(row); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  state.query.mockReset().mockImplementation(async (sql, args) => {
    if (sql.startsWith('DELETE FROM generic_records')) { args.slice(1).forEach(id => state.rows.delete(id)); return [{ affectedRows: args.length - 1 }]; }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('shared one-day directory permissions', () => {
  it.each(['kakao', 'google'])('allows a signed-in %s member to create without administrator privileges', async provider => {
    state.user.provider = provider;
    const res = response(); await insertRecords(request(created()), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(state.rows.get('new-link')).toMatchObject(created());
  });
  it.each([undefined, 'another-user'])('allows members to edit existing links regardless of legacy ownership (%s)', async owner => {
    state.rows.set(legacy.id, { ...legacy, user_id: owner });
    await updateRecords(request({ community: '수정 동호회', url: 'https://example.com/edited' }, { filters: filter(legacy.id) }), response());
    expect(state.rows.get(legacy.id)).toMatchObject({ ...legacy, community: '수정 동호회', url: 'https://example.com/edited', ...(owner ? { user_id: owner } : {}) });
  });
  it('rejects repeated insert without overwriting the stored logo or existing record', async () => {
    await expect(insertRecords(request({ ...created(), id: legacy.id }), response())).rejects.toMatchObject({ statusCode: 409 });
    expect(state.rows.get(legacy.id)).toEqual(legacy); expect(state.writes).toHaveLength(0);
  });
  it.each([insertRecords, updateRecords, upsertRecords, deleteRecords])('blocks anonymous mutations before storage', async handler => {
    state.user = null;
    await expect(handler(request(created(), { filters: filter(legacy.id) }), response())).rejects.toMatchObject({ statusCode: 401 });
    expect(state.execute).not.toHaveBeenCalled(); expect(state.query).not.toHaveBeenCalled();
  });
  it.each([upsertRecords, deleteRecords])('keeps replacement and deletion administrator-only', async handler => {
    await expect(handler(request({ id: legacy.id }, { filters: filter(legacy.id) }), response())).rejects.toMatchObject({ statusCode: 403 });
    expect(state.execute).not.toHaveBeenCalled(); expect(state.query).not.toHaveBeenCalled();
  });
  it.each([{ is_active: false }, { logo_full: null }, { id: 'different' }, { created_at: '2026-01-01' }])('prevents destructive metadata changes: %j', async values => {
    await expect(updateRecords(request(values, { filters: filter(legacy.id) }), response())).rejects.toMatchObject({ statusCode: 403 });
    expect(state.writes).toHaveLength(0);
  });
  it('rejects an untargeted bulk update and unsafe link schemes', async () => {
    await expect(updateRecords(request({ community: 'all' }), response())).rejects.toMatchObject({ statusCode: 400 });
    await expect(insertRecords(request({ ...created(), url: 'javascript:alert(1)' }), response())).rejects.toMatchObject({ statusCode: 400 });
    expect(state.writes).toHaveLength(0);
  });
  it('preserves administrator update and deletion', async () => {
    state.user.is_admin = true;
    await updateRecords(request({ is_active: false }, { filters: filter(legacy.id) }), response());
    expect(state.rows.get(legacy.id).is_active).toBe(false);
    await deleteRecords(request({}, { filters: filter(legacy.id) }), response());
    expect(state.rows.has(legacy.id)).toBe(false);
  });
  it('keeps public queries available', async () => {
    state.user = null; const res = response();
    await queryRecords(request({}, { single: false }), res);
    expect(res.json.mock.calls[0][0].data).toEqual([legacy]);
    expect(state.writes).toHaveLength(0);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('one-day logos', () => {
  it('allows automatic logo discovery and keeps the old logo after a discovery failure', async () => {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '<meta property="og:image" content="https://example.com/logo.png">' })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => buffer });
    vi.stubGlobal('fetch', fetchMock);
    await cafe24OneDayRecruitLogo({ body: { action: 'discoverAndSave', linkId: legacy.id } }, response());
    const saved = { ...state.rows.get(legacy.id) };
    expect(saved.logo_full).toContain('/uploads/images/oneday-recruit-logos/');
    fetchMock.mockRejectedValue(new Error('network failure'));
    const res = response();
    await cafe24OneDayRecruitLogo({ body: { action: 'discoverAndSave', linkId: legacy.id } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(state.rows.get(legacy.id)).toEqual(saved);
  });
  it('allows a member to upload an image for a legacy link and preserves its contents', async () => {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const res = response();
    await cafe24OneDayRecruitLogo({ body: { action: 'uploadLogo', linkId: legacy.id, fileName: 'logo.png', imageBase64: buffer.toString('base64') } }, res);
    const row = state.rows.get(legacy.id);
    expect(row).toMatchObject({ community: legacy.community, url: legacy.url, is_active: true });
    expect(row.logo_full).toMatch(/\.webp$/);
    expect((await sharp(await fs.readFile(path.join(temporaryUploads, row.logo_full.replace('/uploads/', '')))).metadata()).format).toBe('webp');
  });
  it('rejects non-image data without changing the existing logo', async () => {
    await expect(cafe24OneDayRecruitLogo({ body: { action: 'uploadLogo', linkId: legacy.id, imageBase64: Buffer.from('<html>bad</html>').toString('base64') } }, response())).rejects.toMatchObject({ statusCode: 400 });
    expect(state.rows.get(legacy.id)).toEqual(legacy); expect(state.writes).toHaveLength(0);
  });
  it.each(['uploadLogo', 'discoverAndSave', 'deleteLogo', 'deleteLink'])('denies anonymous logo action %s before storage', async action => {
    state.user = null;
    await expect(cafe24OneDayRecruitLogo({ body: { action, linkId: legacy.id } }, response())).rejects.toMatchObject({ statusCode: 401 });
    expect(state.execute).not.toHaveBeenCalled();
  });
  it.each(['deleteLogo', 'deleteLink'])('denies member deletion action %s', async action => {
    await expect(cafe24OneDayRecruitLogo({ body: { action, linkId: legacy.id } }, response())).rejects.toMatchObject({ statusCode: 403 });
    expect(state.execute).not.toHaveBeenCalled();
  });
  it('allows administrator logo deletion', async () => {
    state.user.is_admin = true;
    await cafe24OneDayRecruitLogo({ body: { action: 'deleteLogo', linkId: legacy.id } }, response());
    expect(state.rows.get(legacy.id).logo_full).toBeNull();
  });
});
