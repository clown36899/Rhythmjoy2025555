import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function progressFileForPriority(priority, directory = '') {
  const baseDirectory = directory || path.join(os.homedir(), 'ingestion-runs', 'state');
  return path.join(baseDirectory, `swing-daily-priority-${Number(priority)}.json`);
}

export async function loadIngestionProgress(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return {
      remainingSources: Array.isArray(parsed.remainingSources)
        ? parsed.remainingSources.map(String).filter(Boolean)
        : [],
      lastCompletedAt: typeof parsed.lastCompletedAt === 'string' ? parsed.lastCompletedAt : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { remainingSources: [], lastCompletedAt: '', updatedAt: '' };
    throw error;
  }
}

export async function saveIngestionProgress(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export function reorderSourcesForResume(sources = [], remainingSources = []) {
  const priority = new Map(remainingSources.map((id, index) => [String(id), index]));
  return [...sources].sort((left, right) => {
    const leftIndex = priority.has(String(left.id)) ? priority.get(String(left.id)) : Number.MAX_SAFE_INTEGER;
    const rightIndex = priority.has(String(right.id)) ? priority.get(String(right.id)) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export function catchupInstagramPostLimit(baseLimit, lastCompletedAt, now = new Date()) {
  const base = Math.max(1, Number(baseLimit) || 1);
  if (!lastCompletedAt) return Math.min(8, Math.max(base, 4));
  const completedAt = new Date(lastCompletedAt);
  if (Number.isNaN(completedAt.getTime())) return Math.min(8, Math.max(base, 4));
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 86_400_000));
  if (elapsedDays <= 1) return base;
  return Math.min(8, Math.max(base, base + ((elapsedDays - 1) * 2)));
}

export function buildIngestionProgressState({ remainingSources = [], lastCompletedAt = '', completed = false, now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    remainingSources: remainingSources.map(String).filter(Boolean),
    lastCompletedAt: completed ? timestamp : lastCompletedAt,
    updatedAt: timestamp,
  };
}
