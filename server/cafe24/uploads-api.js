import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAdmin } from './auth-api.js';

const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export async function uploadEventImage(req, res) {
  await requireAdmin(req);

  const { dataBase64, mimeType } = req.body || {};
  const ext = allowedTypes.get(mimeType);

  if (!dataBase64 || !ext) {
    res.status(400).json({ error: '지원하지 않는 이미지 형식입니다.' });
    return;
  }

  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  const maxBytes = Number(process.env.CAFE24_UPLOAD_MAX_BYTES || 8 * 1024 * 1024);

  if (!buffer.length || buffer.length > maxBytes) {
    res.status(400).json({ error: '이미지 용량이 너무 큽니다.' });
    return;
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const uploadDir = path.join(uploadRoot, 'events', yyyy, mm);
  const filePath = path.join(uploadDir, fileName);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, buffer);

  res.json({
    ok: true,
    url: `/uploads/events/${yyyy}/${mm}/${fileName}`,
  });
}
