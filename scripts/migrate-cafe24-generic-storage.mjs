import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const STORAGE_URL_RE = /https:\/\/[a-z0-9.-]+\.supabase\.co\/storage\/v1\/object\/public\/[^"'`\s)<>]+/gi;
const EXT_BY_TYPE = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
  ['video/mp4', 'mp4'],
  ['application/pdf', 'pdf'],
]);
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function uniqueUrls(text) {
  return Array.from(new Set(String(text || '').match(STORAGE_URL_RE) || []));
}

function sanitizePathSegment(value) {
  return decodeURIComponent(String(value || ''))
    .replace(/\0/g, '')
    .replace(/\.\.+/g, '')
    .replace(/^\/+/, '');
}

function resolveStoragePath(originalUrl) {
  const url = new URL(originalUrl);
  const marker = '/storage/v1/object/public/';
  const index = url.pathname.indexOf(marker);
  if (index === -1) return null;

  const rest = url.pathname.slice(index + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;

  const bucket = sanitizePathSegment(rest.slice(0, slash));
  const filePath = sanitizePathSegment(rest.slice(slash + 1));
  if (!bucket || !filePath) return null;

  return { bucket, filePath };
}

function guessExt(filePath, contentType) {
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_TYPE.has(normalizedType)) return EXT_BY_TYPE.get(normalizedType);
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return ext || 'bin';
}

async function downloadUrl(originalUrl, uploadRoot, urlCache) {
  if (urlCache.has(originalUrl)) return urlCache.get(originalUrl);

  const parsed = resolveStoragePath(originalUrl);
  if (!parsed) {
    urlCache.set(originalUrl, originalUrl);
    return originalUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CAFE24_STORAGE_MIGRATION_TIMEOUT_MS || 20000));

  try {
    const response = await fetch(originalUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'swingenjoy-cafe24-storage-migrator/1.0',
      },
    });
    if (!response.ok) throw new Error(`download failed ${response.status}`);

    let filePath = parsed.filePath;
    if (!path.extname(filePath)) {
      filePath = `${filePath}.${guessExt(filePath, response.headers.get('content-type'))}`;
    }

    const targetPath = path.join(uploadRoot, parsed.bucket, filePath);
    const publicUrl = `/uploads/${parsed.bucket}/${filePath.split(path.sep).join('/')}`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    try {
      await fs.access(targetPath);
    } catch {
      const buffer = Buffer.from(await response.arrayBuffer());
      const maxBytes = Number(process.env.CAFE24_STORAGE_MIGRATION_MAX_BYTES || 50 * 1024 * 1024);
      if (!buffer.length || buffer.length > maxBytes) throw new Error(`invalid size ${buffer.length}`);
      await fs.writeFile(targetPath, buffer);
    }

    urlCache.set(originalUrl, publicUrl);
    return publicUrl;
  } catch (error) {
    const hash = crypto.createHash('sha256').update(originalUrl).digest('hex');
    const fallbackRelativePath = path.join('migrated-generic', `${hash}.png`);
    const fallbackDiskPath = path.join(uploadRoot, fallbackRelativePath);
    const fallbackUrl = `/uploads/${fallbackRelativePath.split(path.sep).join('/')}`;
    await fs.mkdir(path.dirname(fallbackDiskPath), { recursive: true });
    await fs.writeFile(fallbackDiskPath, TRANSPARENT_PNG);
    console.warn(`[storage-migration] replaced failed URL with placeholder: ${originalUrl} (${error.message})`);
    urlCache.set(originalUrl, fallbackUrl);
    return fallbackUrl;
  } finally {
    clearTimeout(timeout);
  }
}

async function rewriteJsonText(text, uploadRoot, urlCache) {
  let nextText = text;
  let changed = false;
  for (const url of uniqueUrls(text)) {
    const nextUrl = await downloadUrl(url, uploadRoot, urlCache);
    if (nextUrl !== url) {
      nextText = nextText.split(url).join(nextUrl);
      changed = true;
    }
  }
  return { text: nextText, changed };
}

async function main() {
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: requiredEnv('MYSQL_DATABASE'),
    user: requiredEnv('MYSQL_USER'),
    password: requiredEnv('MYSQL_PASSWORD'),
    waitForConnections: true,
    connectionLimit: 4,
  });

  const urlCache = new Map();
  let updatedGeneric = 0;
  let updatedEvents = 0;

  const [genericRows] = await pool.execute(
    "SELECT table_name, record_id, data_json FROM generic_records WHERE data_json LIKE '%supabase.co/storage%'",
  );

  for (const row of genericRows) {
    const { text, changed } = await rewriteJsonText(row.data_json, uploadRoot, urlCache);
    if (!changed) continue;
    await pool.execute(
      'UPDATE generic_records SET data_json = ?, imported_at = CURRENT_TIMESTAMP WHERE table_name = ? AND record_id = ?',
      [text, row.table_name, row.record_id],
    );
    updatedGeneric += 1;
  }

  const [eventRows] = await pool.execute(
    "SELECT id, raw_json FROM events WHERE raw_json LIKE '%supabase.co/storage%'",
  );

  for (const row of eventRows) {
    const { text, changed } = await rewriteJsonText(row.raw_json, uploadRoot, urlCache);
    if (!changed) continue;
    const raw = parseJson(text);
    await pool.execute(
      `UPDATE events
          SET raw_json = ?,
              image_url = ?,
              image_thumbnail = ?,
              image_medium = ?
        WHERE id = ?`,
      [
        text,
        raw.image || raw.image_url || null,
        raw.image_thumbnail || null,
        raw.image_medium || null,
        row.id,
      ],
    );
    updatedEvents += 1;
  }

  await pool.end();

  console.log(JSON.stringify({
    ok: true,
    updatedGeneric,
    updatedEvents,
    uniqueUrls: urlCache.size,
    uploadRoot,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
