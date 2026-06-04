#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const IMAGE_BUCKET = 'images';
const LINKS_TABLE = 'swing_oneday_recruit_links';
const STORAGE_PREFIX = 'oneday-recruit-logos';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const LOCAL_URL = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const LOCAL_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY;

const variants = [
  { key: 'micro', name: 'micro', width: 64, quality: 70 },
  { key: 'thumbnail', name: 'thumbnail', width: 128, quality: 78 },
  { key: 'medium', name: 'medium', width: 256, quality: 82 },
  { key: 'full', name: 'full', width: 512, quality: 86 },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    ids: [],
    limit: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--limit') {
      options.limit = Number(args[i + 1]);
      i += 1;
    }
    if (arg.startsWith('--limit=')) options.limit = Number(arg.split('=')[1]);
    if (arg === '--ids') {
      options.ids = args[i + 1].split(',').map((id) => id.trim()).filter(Boolean);
      i += 1;
    }
    if (arg.startsWith('--ids=')) {
      options.ids = arg.split('=')[1].split(',').map((id) => id.trim()).filter(Boolean);
    }
  }

  return options;
}

function assertLocalOnly() {
  if (!LOCAL_SERVICE_KEY) {
    throw new Error('LOCAL_SUPABASE_SERVICE_KEY가 필요합니다. 운영 service key는 사용하지 마세요.');
  }

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\b/.test(LOCAL_URL)) {
    throw new Error(`로컬 Supabase URL만 허용됩니다: ${LOCAL_URL}`);
  }
}

function decodeExtractedUrl(value) {
  return String(value || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .trim();
}

function isGenericPlaceholderImage(url) {
  return [
    /cafe_meta_image_/i,
    /static\.xx\.fbcdn\.net\/rsrc/i,
    /static\.cdninstagram\.com\/rsrc/i,
    /\/image\/og\/new_og_image_/i,
  ].some((pattern) => pattern.test(url));
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`http(s) URL이 아닙니다: ${raw}`);
  }
  return url.toString();
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMetaImage(html) {
  const patterns = [
    /<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] ? decodeExtractedUrl(match[1]) : '';
    if (/^https?:\/\//i.test(candidate) && !isGenericPlaceholderImage(candidate)) return candidate;
  }
  return '';
}

function extractLinktreeProfileImage(html) {
  const patterns = [
    /"profilePictureUrl"\s*:\s*"([^"]+)"/i,
    /\\"profilePictureUrl\\"\s*:\s*\\"([^"]+)\\"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] ? decodeExtractedUrl(match[1]) : '';
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return '';
}

async function discoverLogoSourceUrl(linkUrl) {
  const normalizedLinkUrl = normalizeHttpUrl(linkUrl);
  const response = await fetchWithTimeout(normalizedLinkUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyLocalLogoSync/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }, 9000);

  if (!response.ok) throw new Error(`page ${response.status}`);
  const html = await response.text();
  return (/linktr\.ee/i.test(normalizedLinkUrl) ? extractLinktreeProfileImage(html) : '') || extractMetaImage(html);
}

async function fetchImageBuffer(sourceUrl) {
  const imageUrl = normalizeHttpUrl(sourceUrl);
  const response = await fetchWithTimeout(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyLocalLogoSync/1.0)',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  }, 12000);

  if (!response.ok) throw new Error(`image ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('image too large');
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('image/')) throw new Error(`not image: ${contentType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image too large');
  return { buffer, sourceUrl: imageUrl };
}

async function ensureImagesBucket(supabase) {
  const { error } = await supabase.storage.getBucket(IMAGE_BUCKET);
  if (!error) return;
  const { error: createError } = await supabase.storage.createBucket(IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  });
  if (createError && !/already exists/i.test(createError.message)) throw createError;
}

function linkToBaseRow(link, index) {
  return {
    id: link.id,
    community: link.community,
    venue: link.venue || null,
    region: link.region,
    area: link.area,
    lat: link.coordinates.lat,
    lng: link.coordinates.lng,
    url: link.url,
    logo_source_url: link.logoSourceUrl || null,
    sort_order: (index + 1) * 10,
    is_active: true,
  };
}

function logoFromRow(row) {
  if (!row?.logo_storage_path && !row?.logo_micro && !row?.logo_thumbnail && !row?.logo_medium && !row?.logo_full) {
    return null;
  }

  return {
    sourceUrl: row.logo_source_url,
    micro: row.logo_micro,
    thumbnail: row.logo_thumbnail,
    medium: row.logo_medium,
    full: row.logo_full,
    storagePath: row.logo_storage_path,
    updatedAt: row.logo_updated_at,
  };
}

async function upsertBaseRows(supabase, links) {
  if (!links.length) return;
  const { error } = await supabase
    .from(LINKS_TABLE)
    .upsert(links.map(linkToBaseRow), { onConflict: 'id' });
  if (error) throw error;
}

async function loadExistingRow(supabase, linkId) {
  const { data, error } = await supabase
    .from(LINKS_TABLE)
    .select('id,logo_source_url,logo_micro,logo_thumbnail,logo_medium,logo_full,logo_storage_path,logo_updated_at')
    .eq('id', linkId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function publicUrl(supabase, path) {
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStorageFolder(supabase, storagePath) {
  if (!storagePath || !storagePath.startsWith(`${STORAGE_PREFIX}/`)) return;
  const { data: files } = await supabase.storage.from(IMAGE_BUCKET).list(storagePath);
  if (!files?.length) return;
  await supabase.storage.from(IMAGE_BUCKET).remove(files.map((file) => `${storagePath}/${file.name}`));
}

function extractImagePath(url) {
  if (!url || !url.includes(`/${IMAGE_BUCKET}/`)) return null;
  return decodeURIComponent(url.split(`/${IMAGE_BUCKET}/`)[1]?.split('?')[0] || '') || null;
}

async function removeLogoFiles(supabase, logo) {
  if (!logo) return;
  await removeStorageFolder(supabase, logo.storagePath);
  const paths = [logo.micro, logo.thumbnail, logo.medium, logo.full]
    .map(extractImagePath)
    .filter((path) => path?.startsWith(`${STORAGE_PREFIX}/`));
  if (paths.length) await supabase.storage.from(IMAGE_BUCKET).remove([...new Set(paths)]);
}

async function createStoredLogo(supabase, linkId, sourceUrl) {
  const { buffer, sourceUrl: normalizedSourceUrl } = await fetchImageBuffer(sourceUrl);
  const safeId = linkId.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'oneday';
  const storagePath = `${STORAGE_PREFIX}/${safeId}_${Date.now()}`;
  const uploaded = {};

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
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, resized, { contentType: 'image/webp', upsert: true });
    if (error) throw error;
    uploaded[variant.key] = publicUrl(supabase, path);
  }));

  return {
    sourceUrl: normalizedSourceUrl,
    micro: uploaded.micro,
    thumbnail: uploaded.thumbnail,
    medium: uploaded.medium,
    full: uploaded.full,
    storagePath,
    updatedAt: new Date().toISOString(),
  };
}

async function saveLogoRow(supabase, linkId, logo) {
  const { error } = await supabase
    .from(LINKS_TABLE)
    .update({
      logo_source_url: logo.sourceUrl,
      logo_micro: logo.micro,
      logo_thumbnail: logo.thumbnail,
      logo_medium: logo.medium,
      logo_full: logo.full,
      logo_storage_path: logo.storagePath,
      logo_updated_at: logo.updatedAt,
    })
    .eq('id', linkId);
  if (error) throw error;
}

async function main() {
  assertLocalOnly();
  const options = parseArgs();
  const { swingOneDayRecruitLinks } = await import('../src/data/swingOneDayRecruitLinks.ts');
  const supabase = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await ensureImagesBucket(supabase);
  let links = swingOneDayRecruitLinks;
  if (options.ids.length) links = links.filter((link) => options.ids.includes(link.id));
  if (Number.isFinite(options.limit) && options.limit > 0) links = links.slice(0, options.limit);
  if (!options.dryRun) await upsertBaseRows(supabase, links);

  const summary = {
    saved: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const link of links) {
    try {
      const sourceUrl = link.logoSourceUrl || await discoverLogoSourceUrl(link.url);
      if (!sourceUrl) {
        summary.skipped += 1;
        summary.details.push({ id: link.id, status: 'skipped', reason: 'logo not found' });
        continue;
      }

      if (options.dryRun) {
        summary.saved += 1;
        summary.details.push({ id: link.id, status: 'dry-run', sourceUrl });
        continue;
      }

      const previous = await loadExistingRow(supabase, link.id);
      const logo = await createStoredLogo(supabase, link.id, sourceUrl);
      await removeLogoFiles(supabase, logoFromRow(previous));
      await saveLogoRow(supabase, link.id, logo);
      summary.saved += 1;
      summary.details.push({ id: link.id, status: 'saved', storagePath: logo.storagePath });
      console.log(`[saved] ${link.id} -> ${logo.storagePath}`);
    } catch (error) {
      summary.failed += 1;
      summary.details.push({ id: link.id, status: 'failed', reason: error.message });
      console.warn(`[failed] ${link.id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
