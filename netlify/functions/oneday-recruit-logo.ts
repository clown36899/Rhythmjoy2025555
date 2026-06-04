import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const IMAGE_BUCKET = 'images';
const LINKS_TABLE = 'swing_oneday_recruit_links';
const AUDIT_TABLE = 'swing_oneday_recruit_link_audit_logs';
const STORAGE_PREFIX = 'oneday-recruit-logos';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || '';
const supabaseAdmins = new Map<string, SupabaseClient>();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const variants = [
  { key: 'micro', name: 'micro', width: 64, quality: 70 },
  { key: 'thumbnail', name: 'thumbnail', width: 128, quality: 78 },
  { key: 'medium', name: 'medium', width: 256, quality: 82 },
  { key: 'full', name: 'full', width: 512, quality: 86 },
] as const;

type OneDayLogo = {
  sourceUrl?: string;
  micro?: string;
  thumbnail?: string;
  medium?: string;
  full?: string;
  storagePath?: string;
  updatedAt?: string;
};

type OneDayRecruitLinkRow = {
  id: string;
  url: string;
  logo_source_url?: string | null;
  logo_micro?: string | null;
  logo_thumbnail?: string | null;
  logo_medium?: string | null;
  logo_full?: string | null;
  logo_storage_path?: string | null;
  logo_updated_at?: string | null;
};

type AuthenticatedActor = {
  id: string;
  email: string | null;
  isAdmin: boolean;
};

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function withStatus(error: Error, statusCode: number) {
  return Object.assign(error, { statusCode });
}

function isLocalHost(value?: string | null) {
  if (!value) return false;
  return /(^|\/\/|\.)localhost(?::|\/|$)|(^|\/\/)127\.0\.0\.1(?::|\/|$)|(^|\/\/)0\.0\.0\.0(?::|\/|$)/i.test(value);
}

function isLocalRequest(event: Parameters<Handler>[0]) {
  if (process.env.VITE_FORCE_PROD_SUPABASE === 'true') return false;
  const host = event.headers.host || event.headers.Host || '';
  const origin = event.headers.origin || event.headers.Origin || '';
  const referer = event.headers.referer || event.headers.Referer || '';
  return [host, origin, referer].some((value) => isLocalHost(String(value || '')));
}

function getSupabaseAdmin(event: Parameters<Handler>[0]) {
  const useLocalSupabase = isLocalRequest(event);
  const supabaseUrl = useLocalSupabase
    ? LOCAL_SUPABASE_URL
    : process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = useLocalSupabase
    ? LOCAL_SUPABASE_SERVICE_KEY
    : process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 관리자 환경변수가 설정되지 않았습니다.');
  }

  const cacheKey = `${supabaseUrl}:${supabaseServiceKey.slice(0, 12)}`;
  const cached = supabaseAdmins.get(cacheKey);
  if (cached) return cached;

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  supabaseAdmins.set(cacheKey, client);
  return client;
}

function getBearerToken(event: Parameters<Handler>[0]) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const match = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function requireAuthenticatedActor(
  supabaseAdmin: SupabaseClient,
  event: Parameters<Handler>[0],
): Promise<AuthenticatedActor> {
  const token = getBearerToken(event);
  if (!token) {
    throw withStatus(new Error('로그인 후 수정할 수 있습니다.'), 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw withStatus(new Error('로그인 세션을 확인할 수 없습니다.'), 401);
  }

  const metadataAdmin = data.user.app_metadata?.is_admin === true
    || data.user.app_metadata?.role === 'admin';
  let isBoardAdmin = false;

  if (!metadataAdmin) {
    const { data: adminRow, error: adminError } = await supabaseAdmin
      .from('board_admins')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (adminError) {
      throw new Error(`관리자 권한 확인 실패: ${adminError.message}`);
    }
    isBoardAdmin = Boolean(adminRow?.user_id);
  }

  return {
    id: data.user.id,
    email: data.user.email || null,
    isAdmin: metadataAdmin || isBoardAdmin,
  };
}

function requireLinkId(value: unknown) {
  const linkId = String(value || '').trim();
  if (!/^[a-z0-9_-]{3,80}$/i.test(linkId)) {
    throw new Error('유효하지 않은 원데이 링크 ID입니다.');
  }
  return linkId;
}

function normalizeHttpUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL 형식이 올바르지 않습니다.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('http 또는 https URL만 사용할 수 있습니다.');
  }
  return url.toString();
}

function decodeExtractedUrl(value: string) {
  return value
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .trim();
}

function isGenericPlaceholderImage(url: string) {
  return [
    /cafe_meta_image_/i,
    /static\.xx\.fbcdn\.net\/rsrc/i,
    /static\.cdninstagram\.com\/rsrc/i,
    /\/image\/og\/new_og_image_/i,
  ].some((pattern) => pattern.test(url));
}

function extractMetaImage(html: string) {
  const patterns = [
    /<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] ? decodeExtractedUrl(match[1]) : '';
    if (candidate && /^https?:\/\//i.test(candidate) && !isGenericPlaceholderImage(candidate)) return candidate;
  }
  return '';
}

function extractLinktreeProfileImage(html: string) {
  const patterns = [
    /"profilePictureUrl"\s*:\s*"([^"]+)"/i,
    /\\"profilePictureUrl\\"\s*:\s*\\"([^"]+)\\"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] ? decodeExtractedUrl(match[1]) : '';
    if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  }
  return '';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function discoverLogoSourceUrl(linkUrl: string) {
  const normalizedLinkUrl = normalizeHttpUrl(linkUrl);
  const response = await fetchWithTimeout(normalizedLinkUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyLogoCollector/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }, 9000);

  if (!response.ok) {
    throw new Error(`링크 페이지 확인 실패: ${response.status}`);
  }

  const html = await response.text();
  const linktreeImage = /linktr\.ee/i.test(normalizedLinkUrl) ? extractLinktreeProfileImage(html) : '';
  const metaImage = extractMetaImage(html);
  const sourceUrl = linktreeImage || metaImage;
  if (!sourceUrl) {
    throw new Error('링크 페이지에서 로고 이미지를 찾지 못했습니다.');
  }
  return sourceUrl;
}

async function fetchImageBuffer(imageUrl: string) {
  const normalizedImageUrl = normalizeHttpUrl(imageUrl);
  const response = await fetchWithTimeout(normalizedImageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyLogoCollector/1.0)',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  }, 12000);

  if (!response.ok) {
    throw new Error(`로고 이미지 다운로드 실패: ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('로고 이미지 용량이 너무 큽니다.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('image/')) {
    throw new Error('이미지 파일만 저장할 수 있습니다.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('로고 이미지 용량이 너무 큽니다.');
  }
  return { buffer, sourceUrl: normalizedImageUrl };
}

function decodeUploadedImage(body: Record<string, unknown>) {
  const contentType = String(body.contentType || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  const rawBase64 = String(body.imageBase64 || '').replace(/^data:[^;]+;base64,/i, '').trim();
  if (!rawBase64) {
    throw new Error('업로드할 로고 이미지가 없습니다.');
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (!buffer.byteLength) {
    throw new Error('업로드 이미지 데이터를 읽지 못했습니다.');
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('로고 이미지 용량이 너무 큽니다.');
  }

  return buffer;
}

async function ensureImagesBucket(supabaseAdmin: SupabaseClient) {
  const { error } = await supabaseAdmin.storage.getBucket(IMAGE_BUCKET);
  if (!error) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`이미지 버킷 준비 실패: ${createError.message}`);
  }
}

function getPublicImageUrl(supabaseAdmin: SupabaseClient, path: string) {
  return supabaseAdmin.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStorageFolder(supabaseAdmin: SupabaseClient, storagePath?: string | null) {
  if (!storagePath || !storagePath.startsWith(`${STORAGE_PREFIX}/`)) return;

  const { data: files, error: listError } = await supabaseAdmin.storage.from(IMAGE_BUCKET).list(storagePath);
  if (listError) return;
  if (!files?.length) return;

  const paths = files.map((file) => `${storagePath}/${file.name}`);
  await supabaseAdmin.storage.from(IMAGE_BUCKET).remove(paths);
}

function extractImagePath(url?: string | null) {
  if (!url) return null;
  try {
    if (!url.includes(`/${IMAGE_BUCKET}/`)) return null;
    return decodeURIComponent(url.split(`/${IMAGE_BUCKET}/`)[1]?.split('?')[0] || '');
  } catch {
    return null;
  }
}

async function removeLogoFiles(supabaseAdmin: SupabaseClient, logo?: OneDayLogo) {
  if (!logo) return;
  await removeStorageFolder(supabaseAdmin, logo.storagePath);

  const paths = [logo.micro, logo.thumbnail, logo.medium, logo.full]
    .map(extractImagePath)
    .filter((path): path is string => Boolean(path && path.startsWith(`${STORAGE_PREFIX}/`)));

  if (paths.length) {
    await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([...new Set(paths)]);
  }
}

function logoFromRow(row?: OneDayRecruitLinkRow | null): OneDayLogo | undefined {
  if (!row?.logo_storage_path && !row?.logo_micro && !row?.logo_thumbnail && !row?.logo_medium && !row?.logo_full) {
    return undefined;
  }

  return {
    sourceUrl: row.logo_source_url || undefined,
    micro: row.logo_micro || undefined,
    thumbnail: row.logo_thumbnail || undefined,
    medium: row.logo_medium || undefined,
    full: row.logo_full || undefined,
    storagePath: row.logo_storage_path || undefined,
    updatedAt: row.logo_updated_at || undefined,
  };
}

async function createStoredLogoFromBuffer(
  supabaseAdmin: SupabaseClient,
  linkId: string,
  buffer: Buffer,
  sourceUrl = '',
): Promise<OneDayLogo> {
  await ensureImagesBucket(supabaseAdmin);
  const safeId = linkId.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'oneday';
  const storagePath = `${STORAGE_PREFIX}/${safeId}_${Date.now()}`;
  const uploaded: Record<string, string> = {};

  await Promise.all(variants.map(async (variant) => {
    const resized = await sharp(buffer)
      .rotate()
      .resize({
        width: variant.width,
        height: variant.width,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true,
      })
      .webp({ quality: variant.quality })
      .toBuffer();

    const path = `${storagePath}/${variant.name}.webp`;
    const { error } = await supabaseAdmin.storage
      .from(IMAGE_BUCKET)
      .upload(path, resized, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(`로고 업로드 실패(${variant.name}): ${error.message}`);
    uploaded[variant.key] = getPublicImageUrl(supabaseAdmin, path);
  }));

  return {
    sourceUrl,
    micro: uploaded.micro,
    thumbnail: uploaded.thumbnail,
    medium: uploaded.medium,
    full: uploaded.full,
    storagePath,
    updatedAt: new Date().toISOString(),
  };
}

async function createStoredLogoFromUrl(supabaseAdmin: SupabaseClient, linkId: string, sourceUrl: string): Promise<OneDayLogo> {
  const { buffer, sourceUrl: normalizedSourceUrl } = await fetchImageBuffer(sourceUrl);
  return createStoredLogoFromBuffer(supabaseAdmin, linkId, buffer, normalizedSourceUrl);
}

async function loadLinkRow(supabaseAdmin: SupabaseClient, linkId: string): Promise<OneDayRecruitLinkRow> {
  const { data, error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .select('*')
    .eq('id', linkId)
    .maybeSingle();

  if (error) throw new Error(`원데이 링크 조회 실패: ${error.message}`);
  if (!data) throw new Error('원데이 링크 DB 행을 찾지 못했습니다.');
  return data as OneDayRecruitLinkRow;
}

function pickChangedFields(beforeData: Record<string, unknown>, afterData: Record<string, unknown>) {
  const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
  return [...keys]
    .filter((key) => key !== 'updated_at' && JSON.stringify(beforeData[key] ?? null) !== JSON.stringify(afterData[key] ?? null))
    .sort();
}

async function recordAuditLog(
  supabaseAdmin: SupabaseClient,
  actor: AuthenticatedActor,
  linkId: string,
  beforeData: Record<string, unknown>,
  afterData: Record<string, unknown> | null,
) {
  const changedFields = afterData ? pickChangedFields(beforeData, afterData) : Object.keys(beforeData).sort();
  if (afterData && changedFields.length === 0) return;

  const { error } = await supabaseAdmin
    .from(AUDIT_TABLE)
    .insert({
      link_id: linkId,
      action: afterData ? 'update' : 'delete',
      actor_user_id: actor.id,
      actor_email: actor.email,
      changed_fields: changedFields,
      before_data: beforeData,
      after_data: afterData,
    });

  if (error) {
    throw new Error(`원데이 링크 수정 기록 저장 실패: ${error.message}`);
  }
}

async function saveLogoForLink(
  supabaseAdmin: SupabaseClient,
  actor: AuthenticatedActor,
  linkId: string,
  logoInput: { sourceUrl: string } | { buffer: Buffer; sourceUrl?: string },
) {
  const previous = await loadLinkRow(supabaseAdmin, linkId);
  const logo = 'buffer' in logoInput
    ? await createStoredLogoFromBuffer(supabaseAdmin, linkId, logoInput.buffer, logoInput.sourceUrl || '')
    : await createStoredLogoFromUrl(supabaseAdmin, linkId, logoInput.sourceUrl);
  await removeLogoFiles(supabaseAdmin, logoFromRow(previous));

  const { data, error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .update({
      logo_source_url: logo.sourceUrl || '',
      logo_micro: logo.micro,
      logo_thumbnail: logo.thumbnail,
      logo_medium: logo.medium,
      logo_full: logo.full,
      logo_storage_path: logo.storagePath,
      logo_updated_at: logo.updatedAt,
    })
    .eq('id', linkId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`원데이 링크 로고 저장 실패: ${error.message}`);
  if (!data) throw new Error('원데이 링크 로고 저장 결과를 찾지 못했습니다.');
  await recordAuditLog(supabaseAdmin, actor, linkId, previous as Record<string, unknown>, data as Record<string, unknown>);
  return { logo, link: data as OneDayRecruitLinkRow };
}

async function deleteRecruitLink(
  supabaseAdmin: SupabaseClient,
  actor: AuthenticatedActor,
  linkId: string,
) {
  if (!actor.isAdmin) {
    throw withStatus(new Error('삭제는 관리자만 가능합니다.'), 403);
  }

  const previous = await loadLinkRow(supabaseAdmin, linkId);
  await removeLogoFiles(supabaseAdmin, logoFromRow(previous));

  const { error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .delete()
    .eq('id', linkId);

  if (error) throw new Error(`원데이 링크 삭제 실패: ${error.message}`);

  await recordAuditLog(
    supabaseAdmin,
    actor,
    linkId,
    previous as Record<string, unknown>,
    null,
  );

  return { linkId };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '').trim();
    const linkId = requireLinkId(body.linkId);
    const supabaseAdmin = getSupabaseAdmin(event);
    const actor = await requireAuthenticatedActor(supabaseAdmin, event);

    if (action === 'saveFromUrl') {
      const sourceUrl = normalizeHttpUrl(body.imageUrl);
      const result = await saveLogoForLink(supabaseAdmin, actor, linkId, { sourceUrl });
      return json(200, { ok: true, sourceUrl: result.logo.sourceUrl, ...result });
    }

    if (action === 'discoverAndSave') {
      const link = await loadLinkRow(supabaseAdmin, linkId);
      const sourceUrl = await discoverLogoSourceUrl(String(body.linkUrl || link.url));
      const result = await saveLogoForLink(supabaseAdmin, actor, linkId, { sourceUrl });
      return json(200, { ok: true, sourceUrl: result.logo.sourceUrl, ...result });
    }

    if (action === 'uploadLogo') {
      const buffer = decodeUploadedImage(body);
      const result = await saveLogoForLink(supabaseAdmin, actor, linkId, { buffer, sourceUrl: '' });
      return json(200, { ok: true, sourceUrl: result.logo.sourceUrl, ...result });
    }

    if (action === 'deleteLogo') {
      if (!actor.isAdmin) {
        throw withStatus(new Error('삭제는 관리자만 가능합니다.'), 403);
      }

      const previous = await loadLinkRow(supabaseAdmin, linkId);
      await removeLogoFiles(supabaseAdmin, logoFromRow(previous));
      const { data, error } = await supabaseAdmin
        .from(LINKS_TABLE)
        .update({
          logo_source_url: '',
          logo_micro: null,
          logo_thumbnail: null,
          logo_medium: null,
          logo_full: null,
          logo_storage_path: null,
          logo_updated_at: null,
        })
        .eq('id', linkId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(`원데이 링크 로고 삭제 실패: ${error.message}`);
      if (data) {
        await recordAuditLog(supabaseAdmin, actor, linkId, previous as Record<string, unknown>, data as Record<string, unknown>);
      }
      return json(200, { ok: true, link: data });
    }

    if (action === 'deleteLink') {
      const result = await deleteRecruitLink(supabaseAdmin, actor, linkId);
      return json(200, { ok: true, deleted: true, ...result });
    }

    return json(400, { error: '지원하지 않는 로고 작업입니다.' });
  } catch (error: any) {
    return json(Number(error?.statusCode || 500), { error: error?.message || '로고 처리 중 오류가 발생했습니다.' });
  }
};
