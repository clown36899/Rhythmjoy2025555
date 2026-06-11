import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
import { canManageEvent } from './event-security.js';

const allowedScopes = new Set(['swing', 'salsa', 'bachata', 'tango', 'street']);
const imageExtByMime = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

function uploadRoot() {
  return path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
}

function publicUploadPath(...parts) {
  return `/uploads/${parts.map((part) => String(part || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
}

function safeSegment(value, fallback = 'file') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function extensionFrom(value = '', mimeType = '') {
  const byMime = imageExtByMime[String(mimeType || '').split(';')[0].toLowerCase()];
  if (byMime) return byMime;
  const ext = path.extname(String(value || '').split('?')[0]).toLowerCase();
  return ext && ext.length <= 8 ? ext : '.webp';
}

function decodeBase64Payload(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1],
    };
  }
  return {
    buffer: Buffer.from(value, 'base64'),
    mimeType: '',
  };
}

async function writeUploadFile(folder, filename, buffer) {
  const root = uploadRoot();
  const relative = path.join(folder, filename);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root)) throw new Error('Invalid upload path');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return publicUploadPath(relative);
}

async function storeDataImage(dataUrl, folder, filenameHint = 'image') {
  const { buffer, mimeType } = decodeBase64Payload(dataUrl);
  if (!buffer.length) return null;
  const filename = `${safeSegment(filenameHint)}-${Date.now()}${extensionFrom('', mimeType)}`;
  return writeUploadFile(folder, filename, buffer);
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'SwingEnjoyCafe24/1.0',
      },
    });
    if (!response.ok) throw new Error(`download failed ${response.status}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function localizeImageUrl(url, folder, filenameHint = 'image') {
  const value = String(url || '').trim();
  if (!value) return null;
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('data:image')) return storeDataImage(value, folder, filenameHint);
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const { buffer, mimeType } = await fetchBuffer(value);
    const filename = `${safeSegment(filenameHint)}-${Date.now()}${extensionFrom(value, mimeType)}`;
    return await writeUploadFile(folder, filename, buffer);
  } catch (error) {
    console.warn('[cafe24:function-api] image localization skipped:', error?.message || error);
    return value.includes('supabase.co') ? null : value;
  }
}

function isLocalUpload(value) {
  return String(value || '').startsWith('/uploads/');
}

function resolveLocalUpload(value) {
  if (!isLocalUpload(value)) return null;
  const root = uploadRoot();
  const relative = decodeURIComponent(String(value).split('?')[0].replace(/^\/uploads\/?/, ''));
  const target = path.resolve(root, relative);
  return target.startsWith(root) ? target : null;
}

async function removeLocalUpload(value) {
  const target = resolveLocalUpload(value);
  if (!target) return false;
  await fs.rm(target, { force: true, recursive: true }).catch(() => {});
  return true;
}

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sortDescCreatedAt(rows) {
  return [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function filterScrapedRows(rows, req) {
  const tab = String(req.query.tab || '').toLowerCase();
  const type = String(req.query.type || '').toLowerCase();
  const scope = String(req.query.scope || '').toLowerCase();
  const today = kstToday();

  return rows.filter((row) => {
    const sd = row.structured_data || {};
    if (scope && allowedScopes.has(scope) && String(sd.dance_scope || '').toLowerCase() !== scope) return false;
    if (type === 'lessons' && !['class', 'lesson'].includes(String(sd.activity_type || row.activity_type || '').toLowerCase())) return false;
    if (type === 'social' && String(sd.activity_type || row.activity_type || '').toLowerCase() === 'class') return false;

    const date = String(sd.date || row.date || '').slice(0, 10);
    if (date && date < today && tab !== 'collected') return false;

    if (tab === 'collected') return row.is_collected === true || row.status === 'collected';
    if (tab === 'duplicate') return row.status === 'duplicate' || Boolean(sd._duplicate);
    if (tab === 'new') {
      return row.is_collected !== true
        && row.status !== 'collected'
        && row.status !== 'duplicate'
        && row.status !== 'excluded';
    }
    return row.status !== 'excluded';
  });
}

async function upsertScrapedItem(item) {
  const row = { ...(item || {}) };
  row.id = String(row.id || crypto.randomUUID());
  row.created_at = row.created_at || new Date().toISOString();
  row.updated_at = new Date().toISOString();
  if (row.is_collected === true && !row.status) row.status = 'collected';

  if (row.imageData) {
    const stored = await storeDataImage(row.imageData, 'scraped', row.id);
    if (stored) row.poster_url = stored;
    delete row.imageData;
  }

  if (String(row.poster_url || '').includes('supabase.co')) {
    row.poster_url = await localizeImageUrl(row.poster_url, 'scraped', row.id);
  }

  return saveCafe24TableRow('scraped_events', row);
}

export async function cafe24ScrapedEvents(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    await requireAdmin(req);
    const allRows = await loadCafe24TableRows('scraped_events');
    const filtered = sortDescCreatedAt(filterScrapedRows(allRows, req));
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || req.query.limit || 100), 1), 500);
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    if (req.query.tab) {
      res.json({ data, total: filtered.length, page, pageSize });
      return;
    }
    res.json(data);
    return;
  }

  if (req.method === 'POST') {
    await requireAdmin(req);
    const values = Array.isArray(req.body) ? req.body : [req.body || {}];
    const saved = [];
    for (const value of values) saved.push(await upsertScrapedItem(value));
    res.json(Array.isArray(req.body) ? saved : saved[0]);
    return;
  }

  if (req.method === 'DELETE') {
    await requireAdmin(req);
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(String)
      : [req.body?.id].filter(Boolean).map(String);
    const rows = (await loadCafe24TableRows('scraped_events')).filter((row) => ids.includes(String(row.id)));
    const deletedImages = [];
    for (const row of rows) {
      if (await removeLocalUpload(row.poster_url)) deletedImages.push(row.poster_url);
    }
    await deleteCafe24TableRows('scraped_events', rows);
    res.json({ ok: true, deleted: rows.length, deletedImages });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

function eventDate(eventData) {
  return String(eventData?.start_date || eventData?.date || '').slice(0, 10);
}

function sameEventDate(row, date) {
  if (!date) return false;
  const start = String(row.start_date || row.date || '').slice(0, 10);
  const end = String(row.end_date || row.start_date || row.date || '').slice(0, 10);
  return start === date || row.date === date || (start && end && start <= date && date <= end);
}

async function getOwnerUserId(req) {
  const admins = sortDescCreatedAt(await loadCafe24TableRows('board_admins')).reverse();
  return admins.find((row) => row.user_id)?.user_id || (await getCurrentUser(req))?.id || null;
}

function normalizeImageFields(eventData, fallbackImageUrl) {
  const primary = eventData.image_full || eventData.image_medium || eventData.image_thumbnail || eventData.image || fallbackImageUrl || null;
  return {
    image: eventData.image || primary,
    image_micro: eventData.image_micro || eventData.image_thumbnail || primary,
    image_thumbnail: eventData.image_thumbnail || eventData.image_medium || primary,
    image_medium: eventData.image_medium || eventData.image_full || primary,
    image_full: eventData.image_full || eventData.image || primary,
    storage_path: eventData.storage_path || null,
  };
}

export async function cafe24IngestorRegisterEvent(req, res) {
  await requireAdmin(req);
  const body = req.body || {};
  const scrapedEventId = String(body.scrapedEventId || '').trim();
  const eventData = body.eventData || {};
  const date = eventDate(eventData);

  if (!scrapedEventId) {
    res.status(400).json({ error: 'scrapedEventId가 필요합니다.' });
    return;
  }
  if (!eventData.title || !date) {
    res.status(400).json({ error: '이벤트 제목과 날짜가 필요합니다.' });
    return;
  }

  const scrapedRows = await loadCafe24TableRows('scraped_events');
  const scrapedEvent = scrapedRows.find((row) => String(row.id) === scrapedEventId);
  if (!scrapedEvent) {
    res.status(404).json({ error: '수집 후보를 찾을 수 없습니다.' });
    return;
  }
  if (scrapedEvent.status === 'excluded') {
    res.status(400).json({ error: '제외 처리된 후보는 등록할 수 없습니다.' });
    return;
  }

  const sourceUrl = String(scrapedEvent.source_url || eventData.link1 || '');
  const existingRows = await loadCafe24TableRows('events');
  const existing = existingRows.find((row) => String(row.id) === String(body.existingEventId || ''))
    || existingRows.find((row) => sourceUrl && row.link1 === sourceUrl && sameEventDate(row, date));

  let imageFields = normalizeImageFields(eventData, scrapedEvent.poster_url || eventData.image || eventData.image_full || null);
  const folder = `images/ingestor-events/${safeSegment(scrapedEventId)}`;
  const localized = await localizeImageUrl(
    imageFields.image_full || imageFields.image || scrapedEvent.poster_url,
    folder,
    'poster',
  );
  if (localized) {
    imageFields = {
      image: localized,
      image_micro: localized,
      image_thumbnail: localized,
      image_medium: localized,
      image_full: localized,
      storage_path: folder.replace(/^images\//, ''),
    };
  }

  const mergedStructuredData = {
    ...(scrapedEvent.structured_data || {}),
    ...(body.scrapedStructuredData || {}),
  };
  await saveCafe24TableRow('scraped_events', {
    ...scrapedEvent,
    is_collected: true,
    status: 'collected',
    structured_data: mergedStructuredData,
    updated_at: new Date().toISOString(),
  });

  if (body.dryRun === true) {
    res.json({ dryRun: true, wouldInsert: !existing, existing: existing || null });
    return;
  }

  if (existing) {
    const repaired = await saveCafe24TableRow('events', { ...existing, ...imageFields, updated_at: new Date().toISOString() });
    res.json({
      skipped: true,
      repaired: true,
      reason: '이미 등록된 이벤트가 있어 이미지/완료 상태만 보정했습니다.',
      event: repaired,
    });
    return;
  }

  const ownerUserId = await getOwnerUserId(req);
  const finalPayload = {
    ...eventData,
    ...imageFields,
    id: eventData.id || crypto.randomUUID(),
    date,
    start_date: String(eventData.start_date || date).slice(0, 10),
    end_date: String(eventData.end_date || eventData.start_date || date).slice(0, 10),
    link1: sourceUrl,
    organizer: eventData.organizer || 'Swing Enjoy',
    organizer_name: eventData.organizer_name || '관리자',
    user_id: ownerUserId,
    created_at: eventData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const inserted = await saveCafe24TableRow('events', finalPayload);
  res.status(201).json({ event: inserted, owner_user_id: ownerUserId });
}

function eventIdCandidates(eventId) {
  const stripped = String(eventId || '').replace(/^social-/, '').trim();
  const candidates = new Set();
  if (stripped) candidates.add(stripped);
  const numericId = Number(stripped);
  if (Number.isFinite(numericId) && numericId > 10000000) candidates.add(String(numericId - 10000000));
  return [...candidates];
}

async function removeEventUploads(event) {
  const values = [event.image, event.image_micro, event.image_thumbnail, event.image_medium, event.image_full].filter(Boolean);
  let count = 0;
  for (const value of values) {
    if (await removeLocalUpload(value)) count += 1;
  }
  if (event.storage_path) {
    const target = path.resolve(uploadRoot(), 'images', String(event.storage_path).replace(/^\/+/, ''));
    if (target.startsWith(uploadRoot())) {
      await fs.rm(target, { force: true, recursive: true }).catch(() => {});
    }
  }
  return count;
}

export async function cafe24DeleteEventFunction(req, res) {
  const ids = eventIdCandidates(req.body?.eventId);
  if (!ids.length) {
    res.status(400).json({ error: 'Event ID is required.' });
    return;
  }

  const rows = await loadCafe24TableRows('events');
  const target = rows.find((row) => ids.includes(String(row.id)));
  if (!target) {
    res.json({ success: true, message: 'Event not found or already deleted.' });
    return;
  }

  const user = await getCurrentUser(req);
  const authorized = canManageEvent(user, target);
  if (!authorized) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const deletedImages = await removeEventUploads(target);
  await deleteCafe24TableRows('events', [target]);
  res.json({ success: true, deletedImages, deletedEventId: target.id });
}

export async function cafe24DeleteSocialItem(req, res) {
  const { type, id, password } = req.body || {};
  const table = type === 'schedule' ? 'social_schedules' : 'social_groups';
  const rows = await loadCafe24TableRows(table);
  const target = rows.find((row) => String(row.id) === String(id));
  if (!target) {
    res.json({ success: true, message: 'Item not found or already deleted.' });
    return;
  }

  const user = await getCurrentUser(req);
  const authorized = Boolean(user?.is_admin || (target.user_id && user?.id === target.user_id) || (target.password && password && target.password === password));
  if (!authorized) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  if (type === 'group') {
    const schedules = (await loadCafe24TableRows('social_schedules')).filter((row) => String(row.group_id) === String(id));
    await deleteCafe24TableRows('social_schedules', schedules);
  }
  if (target.storage_path) await removeLocalUpload(`/uploads/images/${target.storage_path}`);
  await deleteCafe24TableRows(table, [target]);
  res.json({ success: true });
}

async function requireInvitationAdmin(req) {
  const user = await getCurrentUser(req);
  if (user?.is_admin) return user;
  const adminEmail = process.env.VITE_ADMIN_EMAIL || '';
  const requestEmail = req.headers['x-admin-email'] || req.body?.adminEmail;
  if (adminEmail && requestEmail === adminEmail) return user || { email: requestEmail, is_admin: true };
  const error = new Error('권한이 없습니다');
  error.statusCode = 403;
  throw error;
}

export async function cafe24Invitations(req, res) {
  if (req.method === 'GET') {
    await requireInvitationAdmin(req);
    const invitations = sortDescCreatedAt(await loadCafe24TableRows('invitations'));
    res.json({ invitations });
    return;
  }

  if (req.method === 'POST') {
    await requireInvitationAdmin(req);
    const email = String(req.body?.email || '').trim();
    if (!email) {
      res.status(400).json({ error: '이메일이 필요합니다' });
      return;
    }
    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitation = await saveCafe24TableRow('invitations', {
      id: crypto.randomUUID(),
      email,
      invited_by: req.body?.adminEmail || req.headers['x-admin-email'] || null,
      token,
      expires_at: expiresAt,
      used: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, invitation, inviteUrl: `${origin}/invite/${token}` });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function cafe24ValidateInvitation(req, res) {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    res.status(400).json({ error: '초대 코드가 필요합니다' });
    return;
  }
  const invitation = (await loadCafe24TableRows('invitations')).find((row) => row.token === token);
  if (!invitation) {
    res.status(404).json({ error: '유효하지 않은 초대 코드입니다' });
    return;
  }
  if (invitation.used) {
    res.status(400).json({ error: '이미 사용된 초대 코드입니다' });
    return;
  }
  if (new Date(invitation.expires_at) < new Date()) {
    res.status(400).json({ error: '만료된 초대 코드입니다' });
    return;
  }
  await saveCafe24TableRow('invitation_logs', {
    id: crypto.randomUUID(),
    invitation_token: token,
    email: invitation.email,
    action: 'validate',
    status: 'success',
    user_agent: req.headers['user-agent'] || 'unknown',
    ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    created_at: new Date().toISOString(),
  });
  res.json({ valid: true, email: invitation.email });
}

export async function cafe24DeleteInvitation(req, res) {
  await requireInvitationAdmin(req);
  const invitationId = String(req.body?.invitationId || req.params.id || '').trim();
  const rows = await loadCafe24TableRows('invitations');
  const target = rows.find((row) => String(row.id) === invitationId);
  if (!target) {
    res.status(404).json({ error: '초대를 찾을 수 없습니다' });
    return;
  }
  await deleteCafe24TableRows('invitations', [target]);
  res.json({ success: true });
}

export async function cafe24BillboardManifest(req, res) {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId가 필요합니다' });
    return;
  }
  const user = (await loadCafe24TableRows('billboard_users')).find((row) => String(row.id) === userId);
  if (!user) {
    res.status(404).json({ error: '빌보드 사용자를 찾을 수 없습니다' });
    return;
  }
  const name = user.name || user.nickname || '빌보드';
  res.type('application/manifest+json').json({
    name: `${name} 빌보드`,
    short_name: name,
    description: `${name} 이벤트 빌보드 디스플레이`,
    start_url: `/billboard/${userId}`,
    display: 'fullscreen',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait',
    scope: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
}

async function discoverImageUrl(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyCafe24/1.0)',
    },
  });
  if (!response.ok) return '';
  const html = await response.text();
  const match = html.match(/<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i);
  if (!match?.[1]) return '';
  return new URL(match[1].replace(/&amp;/g, '&'), targetUrl).toString();
}

function logoFromUrl(url, sourceUrl = '') {
  return {
    sourceUrl: sourceUrl || url,
    micro: url,
    thumbnail: url,
    medium: url,
    full: url,
    storagePath: url.startsWith('/uploads/images/') ? url.replace(/^\/uploads\/images\//, '').split('/').slice(0, -1).join('/') : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function cafe24OneDayRecruitLogo(req, res) {
  await requireAdmin(req);
  const body = req.body || {};
  const action = body.action;
  const linkId = String(body.linkId || '').trim();
  if (!linkId) {
    res.status(400).json({ error: '유효하지 않은 원데이 링크 ID입니다.' });
    return;
  }

  const links = await loadCafe24TableRows('swing_oneday_recruit_links');
  const link = links.find((row) => String(row.id) === linkId);
  if (!link) {
    res.status(404).json({ error: '원데이 링크를 찾을 수 없습니다.' });
    return;
  }

  if (action === 'deleteLogo') {
    await removeLocalUpload(link.logo_full || link.logo_medium || link.logo_thumbnail || link.logo_micro);
    const saved = await saveCafe24TableRow('swing_oneday_recruit_links', {
      ...link,
      logo_source_url: null,
      logo_micro: null,
      logo_thumbnail: null,
      logo_medium: null,
      logo_full: null,
      logo_storage_path: null,
      logo_updated_at: null,
    });
    res.json({ link: saved, logo: null });
    return;
  }

  let sourceUrl = '';
  if (action === 'uploadLogo') {
    if (!body.imageBase64) {
      res.status(400).json({ error: '이미지 데이터가 필요합니다.' });
      return;
    }
    const { buffer } = decodeBase64Payload(body.imageBase64);
    const filename = `${safeSegment(body.fileName || 'logo')}-${Date.now()}${extensionFrom(body.fileName, body.contentType)}`;
    sourceUrl = await writeUploadFile(`images/oneday-recruit-logos/${safeSegment(linkId)}`, filename, buffer);
  } else if (action === 'discoverAndSave') {
    const discovered = await discoverImageUrl(String(body.linkUrl || link.url || '')).catch(() => '');
    sourceUrl = discovered
      ? await localizeImageUrl(discovered, `images/oneday-recruit-logos/${safeSegment(linkId)}`, 'logo')
      : '';
  }

  if (!sourceUrl) {
    res.status(400).json({ error: '저장할 로고 이미지를 찾지 못했습니다.' });
    return;
  }
  const logo = logoFromUrl(sourceUrl, body.linkUrl || link.url || sourceUrl);
  const saved = await saveCafe24TableRow('swing_oneday_recruit_links', {
    ...link,
    logo_source_url: logo.sourceUrl,
    logo_micro: logo.micro,
    logo_thumbnail: logo.thumbnail,
    logo_medium: logo.medium,
    logo_full: logo.full,
    logo_storage_path: logo.storagePath || null,
    logo_updated_at: logo.updatedAt,
  });
  res.json({ link: saved, logo, sourceUrl: logo.sourceUrl });
}

export async function cafe24UnavailableFunction(req, res) {
  res.status(404).json({
    error: 'Cafe24 migration mode: this Netlify function is not enabled because Supabase runtime is disabled.',
    function: req.params?.name || null,
  });
}
