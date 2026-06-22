import fs from 'node:fs/promises';
import path from 'node:path';

function uploadRoot() {
  return path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveUploadRelativePath(relativePath) {
  const root = uploadRoot();
  const safeRelative = String(relativePath || '').replace(/^\/+/, '');
  const target = path.resolve(root, safeRelative);
  return isInside(root, target) ? target : null;
}

export function resolveLocalUpload(value) {
  const source = String(value || '').trim();
  if (!source.startsWith('/uploads/')) return null;
  const relative = decodeURIComponent(source.split('?')[0].replace(/^\/uploads\/?/, ''));
  return resolveUploadRelativePath(relative);
}

export async function removeLocalUpload(value) {
  const target = resolveLocalUpload(value);
  if (!target) return false;
  await fs.rm(target, { force: true, recursive: true }).catch(() => {});
  return true;
}

export async function removeEventUploads(event = {}) {
  const urls = new Set([
    event.image,
    event.image_micro,
    event.image_thumbnail,
    event.image_medium,
    event.image_full,
  ].filter(Boolean));
  const removedUrls = [];

  for (const url of urls) {
    if (await removeLocalUpload(url)) removedUrls.push(url);
  }

  let removedStoragePath = null;
  const storagePath = String(event.storage_path || '').replace(/^\/+|\/+$/g, '');
  if (storagePath) {
    const target = resolveUploadRelativePath(path.join('images', storagePath));
    if (target) {
      await fs.rm(target, { force: true, recursive: true }).catch(() => {});
      removedStoragePath = storagePath;
    }
  }

  return {
    count: removedUrls.length + (removedStoragePath ? 1 : 0),
    urls: removedUrls,
    storagePath: removedStoragePath,
  };
}
