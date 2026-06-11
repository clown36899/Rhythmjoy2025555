import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const IMAGE_FIELDS = ['image', 'image_micro', 'image_thumbnail', 'image_medium', 'image_full'];
const COLUMN_BY_FIELD = {
  image: 'image_url',
  image_thumbnail: 'image_thumbnail',
  image_medium: 'image_medium',
};
const EXT_BY_TYPE = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);
const SUPABASE_STORAGE_PATTERN = 'supabase.co/storage';
const tableName = /^[a-z0-9_]+$/i.test(process.env.MYSQL_EVENTS_TABLE || '')
  ? process.env.MYSQL_EVENTS_TABLE
  : 'events';

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

function isMigratableUrl(value) {
  return typeof value === 'string'
    && value.startsWith('http')
    && value.includes(SUPABASE_STORAGE_PATTERN);
}

function guessExt(url, contentType) {
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_TYPE.has(normalizedType)) return EXT_BY_TYPE.get(normalizedType);

  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    // Ignore URL parsing here; the fetch step reports unusable URLs.
  }

  return 'webp';
}

async function downloadImage(url, uploadRoot, migratedUrlCache) {
  if (migratedUrlCache.has(url)) return migratedUrlCache.get(url);

  const hash = crypto.createHash('sha256').update(url).digest('hex');
  const shard = hash.slice(0, 2);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CAFE24_IMAGE_MIGRATION_TIMEOUT_MS || 20000));

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
        'User-Agent': 'swingenjoy-cafe24-image-migrator/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`download failed ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const ext = guessExt(url, contentType);
    const relativePath = path.join('migrated-events', shard, `${hash}.${ext}`);
    const filePath = path.join(uploadRoot, relativePath);
    const publicUrl = `/uploads/${relativePath.split(path.sep).join('/')}`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    try {
      await fs.access(filePath);
    } catch {
      const buffer = Buffer.from(await response.arrayBuffer());
      const maxBytes = Number(process.env.CAFE24_IMAGE_MIGRATION_MAX_BYTES || 25 * 1024 * 1024);
      if (!buffer.length || buffer.length > maxBytes) {
        throw new Error(`invalid image size ${buffer.length}`);
      }
      await fs.writeFile(filePath, buffer);
    }

    migratedUrlCache.set(url, publicUrl);
    return publicUrl;
  } finally {
    clearTimeout(timeout);
  }
}

function collectImageUrls(row, raw) {
  const urls = new Map();
  for (const field of IMAGE_FIELDS) {
    const column = COLUMN_BY_FIELD[field];
    const value = raw[field] || (column ? row[column] : null);
    if (isMigratableUrl(value)) urls.set(field, value);
  }
  return urls;
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

  const [rows] = await pool.execute(
    `SELECT id, raw_json, image_url, image_thumbnail, image_medium
       FROM ${tableName}
      WHERE raw_json LIKE ?
         OR COALESCE(image_url, '') LIKE ?
         OR COALESCE(image_thumbnail, '') LIKE ?
         OR COALESCE(image_medium, '') LIKE ?
      ORDER BY id ASC`,
    Array.from({ length: 4 }, () => `%${SUPABASE_STORAGE_PATTERN}%`),
  );

  const migratedUrlCache = new Map();
  let updatedRows = 0;
  let failedUrls = 0;
  let migratedFields = 0;

  for (const row of rows) {
    const raw = parseJson(row.raw_json);
    let changed = false;
    const urls = collectImageUrls(row, raw);

    for (const [field, originalUrl] of urls) {
      try {
        const nextUrl = await downloadImage(originalUrl, uploadRoot, migratedUrlCache);
        if (nextUrl && nextUrl !== originalUrl) {
          raw[field] = nextUrl;
          changed = true;
          migratedFields += 1;
        }
      } catch (error) {
        failedUrls += 1;
        console.warn(`[image-migration] ${row.id} ${field}: ${error.message}`);
      }
    }

    if (!changed) continue;

    await pool.execute(
      `UPDATE ${tableName}
          SET raw_json = ?,
              image_url = ?,
              image_thumbnail = ?,
              image_medium = ?
        WHERE id = ?`,
      [
        JSON.stringify(raw),
        raw.image || null,
        raw.image_thumbnail || null,
        raw.image_medium || null,
        String(row.id),
      ],
    );
    updatedRows += 1;
  }

  await pool.end();

  console.log(JSON.stringify({
    ok: true,
    scannedRows: rows.length,
    updatedRows,
    migratedFields,
    uniqueDownloadedUrls: migratedUrlCache.size,
    failedUrls,
    uploadRoot,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
