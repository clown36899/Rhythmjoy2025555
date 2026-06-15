#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  loadCafe24TableRows,
  saveCafe24TableRow,
} from '../server/cafe24/generic-data-api.js';
import {
  analyticsClientIp,
  analyticsConfiguredExcludedIpHashes,
  analyticsIpHash,
} from '../server/cafe24/analytics-purity.js';
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

function rowTime(row = {}) {
  return Date.parse(row.session_start || row.created_at || row.timestamp || row.date || '') || 0;
}

function rowInWindow(row, days) {
  if (!Number.isFinite(days) || days <= 0) return true;
  const time = rowTime(row);
  return time > 0 && time >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{24}$/.test(hash) ? hash : null;
}

function targetHashes() {
  const hashes = new Set(analyticsConfiguredExcludedIpHashes());
  const explicitHash = normalizeHash(optionValue('--ip-hash'));
  const explicitIp = optionValue('--ip');

  if (explicitHash) hashes.add(explicitHash);
  if (explicitIp) hashes.add(analyticsIpHash(explicitIp));

  return hashes;
}

function rowIpHash(row = {}) {
  return normalizeHash(row.ip_hash || row.ipHash) || analyticsIpHash(analyticsClientIp(row));
}

function nextExcludedRow(row, now) {
  return {
    ...row,
    analytics_excluded: true,
    analytics_exclusion_reason: 'matched_kiosk_network_ip',
    updated_at: now,
  };
}

function rowChanged(before, after) {
  return [
    'analytics_excluded',
    'analytics_exclusion_reason',
  ].some((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
}

async function main() {
  const days = Number(optionValue('--days', '0'));
  const hashes = targetHashes();
  if (hashes.size === 0) {
    throw new Error('No target IP hashes configured. Pass --ip, --ip-hash, ANALYTICS_EXCLUDED_IP_HASHES, or ANALYTICS_KIOSK_IP_HASHES.');
  }

  const [sessions, logs, itemViews] = await Promise.all([
    loadCafe24TableRows('session_logs').catch(() => []),
    loadCafe24TableRows('site_analytics_logs').catch(() => []),
    loadCafe24TableRows('item_views').catch(() => []),
  ]);
  const now = new Date().toISOString();
  const rows = [
    ...sessions.map((row) => ({ table: 'session_logs', row })),
    ...logs.map((row) => ({ table: 'site_analytics_logs', row })),
    ...itemViews.map((row) => ({ table: 'item_views', row })),
  ];
  const targets = [];

  for (const item of rows) {
    if (!rowInWindow(item.row, days)) continue;
    const hash = rowIpHash(item.row);
    if (!hash || !hashes.has(hash)) continue;
    if (asBool(item.row.analytics_excluded, false)) continue;

    const nextRow = nextExcludedRow(item.row, now);
    if (!rowChanged(item.row, nextRow)) continue;
    targets.push({ ...item, hash, nextRow });
  }

  const targetsByTable = targets.reduce((acc, item) => {
    acc[item.table] = (acc[item.table] || 0) + 1;
    return acc;
  }, {});
  const result = {
    apply,
    days: Number.isFinite(days) && days > 0 ? days : null,
    targetHashCount: hashes.size,
    sessionLogsTotal: sessions.length,
    analyticsLogsTotal: logs.length,
    itemViewsTotal: itemViews.length,
    targetsTotal: targets.length,
    targetsByTable,
    backupFile: null,
    applied: 0,
  };

  if (apply && targets.length > 0) {
    const backupDir = optionValue('--backup-dir', process.env.ANALYTICS_REPAIR_BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `analytics-kiosk-network-exclusion-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    await fs.writeFile(
      backupFile,
      targets.map((item) => JSON.stringify({ table: item.table, row: item.row, nextRow: item.nextRow })).join('\n') + '\n',
      'utf8',
    );
    result.backupFile = backupFile;

    for (const target of targets) {
      await saveCafe24TableRow(target.table, target.nextRow, target.table === 'session_logs' ? ['session_id'] : []);
      result.applied += 1;
    }
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[analytics-kiosk-network] days: ${result.days ?? 'all'}, apply: ${result.apply}`);
    console.log(`[analytics-kiosk-network] targets: ${result.targetsTotal} ${JSON.stringify(result.targetsByTable)}`);
    if (result.backupFile) console.log(`[analytics-kiosk-network] backup: ${result.backupFile}`);
    if (apply) console.log(`[analytics-kiosk-network] applied: ${result.applied}`);
  }
}

try {
  mysqlPool = getMysqlPool();
  await main();
} finally {
  if (mysqlPool) await mysqlPool.end().catch(() => {});
}
