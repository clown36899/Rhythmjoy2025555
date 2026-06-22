#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const sharp = (await import('sharp')).default;

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : Infinity;

function parseEnvText(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function loadEnv() {
  const files = ['.env', '.env.local'];
  const merged = {};
  for (const file of files) {
    const text = await fs.readFile(path.resolve(process.cwd(), file), 'utf8').catch(() => '');
    Object.assign(merged, parseEnvText(text));
  }
  return { ...merged, ...process.env };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function kstStamp() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return [
    now.getUTCFullYear(),
    pad2(now.getUTCMonth() + 1),
    pad2(now.getUTCDate()),
    pad2(now.getUTCHours()),
    pad2(now.getUTCMinutes()),
    pad2(now.getUTCSeconds()),
  ].join('');
}

function safeSegment(value, fallback = 'event') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function normalizeUrl(value) {
  return String(value || '').trim();
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uploadRoot(env) {
  return path.resolve(process.cwd(), env.CAFE24_UPLOADS_DIR || 'uploads');
}

function publicUploadPath(relative) {
  return `/uploads/${relative.split(path.sep).join('/')}`;
}

function resolveLocalUpload(value, env) {
  const url = normalizeUrl(value);
  if (!url.startsWith('/uploads/')) return null;
  const root = uploadRoot(env);
  const relative = decodeURIComponent(url.split('?')[0].replace(/^\/uploads\/?/, ''));
  const target = path.resolve(root, relative);
  return target.startsWith(root) ? target : null;
}

function sourceImageFor(row, raw) {
  return normalizeUrl(raw.image_full)
    || normalizeUrl(raw.image)
    || normalizeUrl(row.image_url)
    || normalizeUrl(raw.image_medium)
    || normalizeUrl(row.image_medium)
    || normalizeUrl(raw.image_thumbnail)
    || normalizeUrl(row.image_thumbnail);
}

function storagePathFromSource(row, raw, source) {
  const rawStorage = normalizeUrl(raw.storage_path).replace(/^\/+|\/+$/g, '');
  if (rawStorage) return `images/${rawStorage.replace(/^images\//, '')}`;

  const local = normalizeUrl(source);
  const currentVariantMatch = local.match(/^\/uploads\/images\/((?:event-posters|ingestor-events)\/[^/]+)\/(?:micro|thumbnail|medium|full)\.webp(?:\?.*)?$/);
  if (currentVariantMatch) return `images/${currentVariantMatch[1]}`;

  const ingestorFolderMatch = local.match(/^\/uploads\/images\/(ingestor-events\/[^/]+)\//);
  if (ingestorFolderMatch) return `images/${ingestorFolderMatch[1]}`;

  return `images/ingestor-events/backfill-${safeSegment(row.id)}-${kstStamp()}`;
}

function isAliasedToSource(value, source) {
  const normalizedValue = normalizeUrl(value);
  const normalizedSource = normalizeUrl(source);
  return Boolean(normalizedValue && normalizedSource && normalizedValue === normalizedSource);
}

async function localUploadExists(value, env) {
  const target = resolveLocalUpload(value, env);
  if (!target) return Boolean(normalizeUrl(value));
  try {
    const stat = await fs.stat(target);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function needsBackfill(row, raw, source, env) {
  if (!source) return false;

  const micro = normalizeUrl(raw.image_micro);
  const thumbnail = normalizeUrl(raw.image_thumbnail || row.image_thumbnail);
  const medium = normalizeUrl(raw.image_medium || row.image_medium);
  const full = normalizeUrl(raw.image_full || raw.image || row.image_url);

  if (!micro || isAliasedToSource(micro, source) || !(await localUploadExists(micro, env))) return true;
  if (!thumbnail || isAliasedToSource(thumbnail, source) || !(await localUploadExists(thumbnail, env))) return true;
  if (!medium || isAliasedToSource(medium, source) || !(await localUploadExists(medium, env))) return true;
  if (!full || !(await localUploadExists(full, env))) return true;

  return false;
}

async function readImageBuffer(source, env) {
  if (!source) return null;

  if (source.startsWith('/uploads/')) {
    const target = resolveLocalUpload(source, env);
    if (!target) return null;
    try {
      return await fs.readFile(target);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const dir = path.dirname(target);
      const basename = path.basename(target);
      const prefix = basename.replace(/-\d+(\.[^.]+)$/, '');
      if (!prefix || prefix === basename) throw error;

      const candidates = await fs.readdir(dir).catch(() => []);
      const siblingStats = await Promise.all(candidates
        .filter((name) => name.startsWith(prefix))
        .map(async (name) => {
          const candidatePath = path.join(dir, name);
          const stat = await fs.stat(candidatePath).catch(() => null);
          return stat?.isFile() ? { path: candidatePath, mtimeMs: stat.mtimeMs } : null;
        }));
      const sibling = siblingStats
        .filter(Boolean)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (!sibling) throw error;
      console.warn(`[fallback-source] ${source} -> ${publicUploadPath(path.relative(uploadRoot(env), sibling.path))}`);
      return fs.readFile(sibling.path);
    }
  }

  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(source, {
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent': 'SwingEnjoyCafe24Backfill/1.0',
        },
      });
      if (!response.ok) throw new Error(`download failed ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

async function createVariant(buffer, width, quality) {
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function writeVariant(folder, filename, buffer, env) {
  const root = uploadRoot(env);
  const relative = path.join(folder, filename);
  const target = path.resolve(root, relative.replace(/^images\//, 'images/'));
  if (!target.startsWith(root)) throw new Error(`Invalid upload path: ${folder}/${filename}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return publicUploadPath(path.relative(root, target));
}

async function generateVariants(row, raw, source, env) {
  const buffer = await readImageBuffer(source, env);
  if (!buffer?.length) throw new Error('source image not readable');

  const folder = storagePathFromSource(row, raw, source);
  const [microBuffer, thumbnailBuffer, mediumBuffer, fullBuffer] = await Promise.all([
    createVariant(buffer, 100, 70),
    createVariant(buffer, 300, 75),
    createVariant(buffer, 650, 90),
    createVariant(buffer, 1300, 85),
  ]);

  const [micro, thumbnail, medium, full] = await Promise.all([
    writeVariant(folder, 'micro.webp', microBuffer, env),
    writeVariant(folder, 'thumbnail.webp', thumbnailBuffer, env),
    writeVariant(folder, 'medium.webp', mediumBuffer, env),
    writeVariant(folder, 'full.webp', fullBuffer, env),
  ]);

  return {
    image: full,
    image_micro: micro,
    image_thumbnail: thumbnail,
    image_medium: medium,
    image_full: full,
    storage_path: folder.replace(/^images\//, ''),
  };
}

function quoteIdentifier(value) {
  if (!/^[a-z0-9_]+$/i.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `\`${value}\``;
}

const env = await loadEnv();
const table = env.MYSQL_EVENTS_TABLE || 'events';
const connection = await mysql.createConnection({
  host: env.MYSQL_HOST || '127.0.0.1',
  port: Number(env.MYSQL_PORT || 3306),
  database: env.MYSQL_DATABASE || 'swingenjoy_app',
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
});

const [rows] = await connection.query(
  `SELECT id, title, image_url, image_thumbnail, image_medium, raw_json FROM ${quoteIdentifier(table)} ORDER BY COALESCE(start_date, date_value) DESC, id DESC`,
);

let scanned = 0;
let candidates = 0;
let updated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  scanned += 1;
  const raw = parseJson(row.raw_json, {});
  const source = sourceImageFor(row, raw);
  if (!(await needsBackfill(row, raw, source, env))) {
    skipped += 1;
    continue;
  }

  candidates += 1;
  if (candidates > limit) break;
  const label = `${row.id} ${String(row.title || '').slice(0, 60)}`;
  if (!applyChanges) {
    console.log(`[dry-run] ${label} <- ${source}`);
    continue;
  }

  try {
    const variants = await generateVariants(row, raw, source, env);
    const nextRaw = {
      ...raw,
      image: variants.image,
      image_micro: variants.image_micro,
      image_thumbnail: variants.image_thumbnail,
      image_medium: variants.image_medium,
      image_full: variants.image_full,
      storage_path: variants.storage_path,
    };

    await connection.execute(
      `UPDATE ${quoteIdentifier(table)}
       SET image_url = ?, image_thumbnail = ?, image_medium = ?, raw_json = ?, updated_at = COALESCE(updated_at, NOW())
       WHERE id = ?`,
      [
        variants.image,
        variants.image_thumbnail,
        variants.image_medium,
        JSON.stringify(nextRaw),
        String(row.id),
      ],
    );
    updated += 1;
    console.log(`[updated] ${label} -> ${variants.storage_path}`);
  } catch (error) {
    failed += 1;
    console.warn(`[failed] ${label}: ${error?.message || error}`);
  }
}

await connection.end();

console.log(JSON.stringify({
  mode: applyChanges ? 'apply' : 'dry-run',
  scanned,
  candidates,
  updated,
  skipped,
  failed,
}, null, 2));
