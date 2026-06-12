#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const json = args.includes('--json');
let mysqlPool = null;

function optionValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return fallback;
  return args[index + 1];
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function timeValue(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : 0;
}

function newerDate(a, b) {
  return timeValue(a) >= timeValue(b) ? a : b;
}

function olderDate(a, b) {
  if (!a) return b || a;
  if (!b) return a;
  return timeValue(a) <= timeValue(b) ? a : b;
}

function maxNumber(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left)) return Number.isFinite(right) ? right : a;
  if (!Number.isFinite(right)) return left;
  return Math.max(left, right);
}

function mergeRows(items) {
  const sorted = [...items].sort((a, b) => timeValue(a.row.updated_at) - timeValue(b.row.updated_at));
  const merged = {};

  for (const item of sorted) {
    for (const [key, value] of Object.entries(item.row)) {
      if (value === undefined || value === null || value === '') continue;
      merged[key] = value;
    }
  }

  for (const item of sorted) {
    const row = item.row;
    merged.created_at = olderDate(merged.created_at, row.created_at);
    merged.session_start = olderDate(merged.session_start, row.session_start);
    merged.updated_at = newerDate(merged.updated_at, row.updated_at);
    merged.session_end = newerDate(merged.session_end, row.session_end);
    merged.identity_resolved_at = newerDate(merged.identity_resolved_at, row.identity_resolved_at);
    merged.page_views = maxNumber(merged.page_views, row.page_views);
    merged.total_clicks = maxNumber(merged.total_clicks, row.total_clicks);
    merged.duration_seconds = maxNumber(merged.duration_seconds, row.duration_seconds);
    merged.is_admin = Boolean(merged.is_admin || row.is_admin);
    merged.analytics_excluded = Boolean(merged.analytics_excluded || row.analytics_excluded);
  }

  const canonical = sorted.find((item) => item.record_id === item.sessionId) || sorted[sorted.length - 1];
  if (canonical?.row?.user_id) merged.user_id = canonical.row.user_id;
  if (canonical?.row?.id) merged.id = canonical.row.id;
  merged.session_id = canonical?.sessionId || merged.session_id;
  merged.updated_at = merged.updated_at || new Date().toISOString();

  return merged;
}

async function main() {
  mysqlPool = getMysqlPool();
  const [records] = await mysqlPool.execute(
    'SELECT record_id, data_json, created_at, updated_at FROM generic_records WHERE table_name = ?',
    ['session_logs'],
  );
  const groups = new Map();

  for (const record of records) {
    const row = parseJson(record.data_json);
    const sessionId = row?.session_id ? String(row.session_id) : null;
    if (!sessionId) continue;
    const items = groups.get(sessionId) || [];
    items.push({
      record_id: String(record.record_id),
      row,
      sessionId,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
    groups.set(sessionId, items);
  }

  const duplicateGroups = Array.from(groups.values()).filter((items) => items.length > 1);
  const repairs = duplicateGroups.map((items) => {
    const sessionId = items[0].sessionId;
    const merged = mergeRows(items);
    const removeRecordIds = items
      .map((item) => item.record_id)
      .filter((recordId) => recordId !== sessionId);
    return {
      sessionId,
      before: items.map((item) => ({ record_id: item.record_id, row: item.row })),
      merged,
      removeRecordIds,
    };
  });

  const result = {
    apply,
    totalRecords: records.length,
    distinctSessions: groups.size,
    duplicateGroups: duplicateGroups.length,
    duplicateRows: records.length - groups.size,
    repairs: repairs.length,
    backupFile: null,
    applied: 0,
    deleted: 0,
  };

  if (apply && repairs.length > 0) {
    const backupDir = optionValue('--backup-dir', process.env.ANALYTICS_REPAIR_BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `session-log-dedupe-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    await fs.writeFile(backupFile, repairs.map((repair) => JSON.stringify(repair)).join('\n') + '\n', 'utf8');
    result.backupFile = backupFile;

    for (const repair of repairs) {
      const now = new Date().toISOString();
      await mysqlPool.execute(
        `INSERT INTO generic_records (table_name, record_id, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           data_json = VALUES(data_json),
           created_at = LEAST(created_at, VALUES(created_at)),
           updated_at = VALUES(updated_at),
           imported_at = CURRENT_TIMESTAMP`,
        [
          'session_logs',
          repair.sessionId,
          JSON.stringify(repair.merged),
          repair.merged.created_at ? new Date(repair.merged.created_at) : new Date(now),
          repair.merged.updated_at ? new Date(repair.merged.updated_at) : new Date(now),
        ],
      );
      result.applied += 1;

      if (repair.removeRecordIds.length > 0) {
        await mysqlPool.query(
          `DELETE FROM generic_records WHERE table_name = ? AND record_id IN (${repair.removeRecordIds.map(() => '?').join(',')})`,
          ['session_logs', ...repair.removeRecordIds],
        );
        result.deleted += repair.removeRecordIds.length;
      }
    }
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[session-log-dedupe] duplicate groups: ${result.duplicateGroups}, duplicate rows: ${result.duplicateRows}`);
    if (result.backupFile) console.log(`[session-log-dedupe] backup: ${result.backupFile}`);
    if (apply) console.log(`[session-log-dedupe] applied: ${result.applied}, deleted: ${result.deleted}`);
  }
}

try {
  await main();
} finally {
  if (mysqlPool) await mysqlPool.end().catch(() => {});
}
