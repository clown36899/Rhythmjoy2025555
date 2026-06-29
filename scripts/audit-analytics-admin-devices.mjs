#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  loadCafe24TableRows,
} from '../server/cafe24/generic-data-api.js';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import { analyticsGuestNetworkIdentity } from '../server/cafe24/analytics-purity.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const repair = args.includes('--repair');
const json = args.includes('--json');
let mysqlPool = null;

function getPool() {
  if (!mysqlPool) mysqlPool = getMysqlPool();
  return mysqlPool;
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

function optionValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return fallback;
  return args[index + 1];
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function configuredAdminEmails() {
  return String(`${process.env.VITE_ADMIN_EMAIL || ''},${process.env.ADMIN_EMAIL || ''}`)
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

function rowTime(row) {
  return Date.parse(row.session_start || row.created_at || row.timestamp || row.date || '') || 0;
}

function isMobile(row) {
  return /Android|iPhone|iPad|Mobile/i.test(String(row.user_agent || ''));
}

function count(rows, predicate) {
  return rows.filter(predicate).length;
}

function addAdminId(set, value) {
  if (value !== undefined && value !== null && value !== '') set.add(String(value));
}

function buildAdminIdentity({ admins, users, boardUsers }) {
  const adminEmails = new Set(configuredAdminEmails());
  const userIds = new Set();

  for (const admin of admins) {
    addAdminId(userIds, admin?.user_id || admin?.admin_user_id);
    const email = normalizeEmail(admin?.email || admin?.admin_email);
    if (email) adminEmails.add(email);
  }

  for (const user of users) {
    const email = normalizeEmail(user?.email);
    if (asBool(user?.is_admin, false) || (email && adminEmails.has(email))) {
      addAdminId(userIds, user?.id);
      if (email) adminEmails.add(email);
    }
  }

  for (const boardUser of boardUsers) {
    const email = normalizeEmail(boardUser?.email || boardUser?.admin_email);
    if (asBool(boardUser?.is_admin, false) || (email && adminEmails.has(email))) {
      addAdminId(userIds, boardUser?.user_id);
      if (email) adminEmails.add(email);
    }
  }

  return { adminEmails, userIds };
}

function buildAdminDeviceClosure(rows, userIds) {
  const sessionIds = new Set();
  const fingerprints = new Set();
  const networkDeviceIds = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const { row } of rows) {
      const networkDeviceId = analyticsGuestNetworkIdentity(row);
      const directAdmin = asBool(row?.is_admin, false)
        || (row?.user_id && userIds.has(String(row.user_id)));
      const linkedAdminDevice = Boolean(
        (row?.session_id && sessionIds.has(String(row.session_id))) ||
        (row?.fingerprint && fingerprints.has(String(row.fingerprint))) ||
        (networkDeviceId && networkDeviceIds.has(networkDeviceId))
      );
      if (!directAdmin && !linkedAdminDevice) continue;

      if (row?.session_id && !sessionIds.has(String(row.session_id))) {
        sessionIds.add(String(row.session_id));
        changed = true;
      }
      if (row?.fingerprint && !fingerprints.has(String(row.fingerprint))) {
        fingerprints.add(String(row.fingerprint));
        changed = true;
      }
      if (networkDeviceId && !networkDeviceIds.has(networkDeviceId)) {
        networkDeviceIds.add(networkDeviceId);
        changed = true;
      }
    }
  }

  return { sessionIds, fingerprints, networkDeviceIds };
}

function isAdminDeviceRow(row, deviceIds) {
  const networkDeviceId = analyticsGuestNetworkIdentity(row);
  return Boolean(
    (row?.session_id && deviceIds.sessionIds.has(String(row.session_id))) ||
    (row?.fingerprint && deviceIds.fingerprints.has(String(row.fingerprint))) ||
    (networkDeviceId && deviceIds.networkDeviceIds.has(networkDeviceId))
  );
}

async function loadSqlUsers() {
  const [rows] = await getPool().execute('SELECT id, email, is_admin FROM users');
  return rows;
}

async function loadGenericRowsWithRecordIds(table) {
  const [records] = await getPool().execute(
    'SELECT record_id, data_json FROM generic_records WHERE table_name = ?',
    [table],
  );
  return records.map((record) => ({
    recordId: String(record.record_id),
    row: parseJson(record.data_json, {}),
  }));
}

async function updateGenericRowByRecordId(table, recordId, row) {
  const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();
  const [result] = await getPool().execute(
    `UPDATE generic_records
        SET data_json = ?,
            updated_at = ?,
            imported_at = CURRENT_TIMESTAMP
      WHERE table_name = ?
        AND record_id = ?`,
    [JSON.stringify(row), updatedAt, table, recordId],
  );
  if (!result.affectedRows) {
    throw new Error(`Failed to update ${table}:${recordId}`);
  }
}

async function main() {
  const [admins, users, boardUsers, sessionLogRecords, analyticsLogRecords] = await Promise.all([
    loadCafe24TableRows('board_admins'),
    loadSqlUsers(),
    loadCafe24TableRows('board_users').catch(() => []),
    loadGenericRowsWithRecordIds('session_logs'),
    loadGenericRowsWithRecordIds('site_analytics_logs'),
  ]);

  const identity = buildAdminIdentity({ admins, users, boardUsers });
  const rows = [
    ...sessionLogRecords.map(({ recordId, row }) => ({ table: 'session_logs', recordId, row })),
    ...analyticsLogRecords.map(({ recordId, row }) => ({ table: 'site_analytics_logs', recordId, row })),
  ];
  const deviceIds = buildAdminDeviceClosure(rows, identity.userIds);
  const targets = rows.filter(({ row }) => (
    isAdminDeviceRow(row, deviceIds) &&
    (
      !asBool(row?.is_admin, false) ||
      !asBool(row?.analytics_excluded, false) ||
      !row?.analytics_exclusion_reason
    )
  ));
  const now = Date.now();
  const recentRows = (days) => rows.filter(({ row }) => rowTime(row) >= now - days * 24 * 60 * 60 * 1000);
  const targetRows = targets.map(({ row }) => row);
  const result = {
    repair,
    admins: admins.length,
    adminUsers: identity.userIds.size,
    adminEmails: identity.adminEmails.size,
    adminSessions: deviceIds.sessionIds.size,
    adminFingerprints: deviceIds.fingerprints.size,
    adminNetworkDevices: deviceIds.networkDeviceIds.size,
    sessionLogsTotal: sessionLogRecords.length,
    analyticsLogsTotal: analyticsLogRecords.length,
    targetsTotal: targets.length,
    targetsByTable: {
      session_logs: count(targets, (item) => item.table === 'session_logs'),
      site_analytics_logs: count(targets, (item) => item.table === 'site_analytics_logs'),
    },
    mobileTargets: count(targetRows, isMobile),
    last1dTargets: count(recentRows(1), (item) => targets.includes(item)),
    last7dTargets: count(recentRows(7), (item) => targets.includes(item)),
    last30dTargets: count(recentRows(30), (item) => targets.includes(item)),
    backupFile: null,
    repaired: 0,
  };

  if (repair && targets.length > 0) {
    const backupDir = optionValue('--backup-dir', process.env.ANALYTICS_REPAIR_BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `analytics-admin-device-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    await fs.writeFile(
      backupFile,
      targets.map((item) => JSON.stringify({ table: item.table, row: item.row })).join('\n') + '\n',
      'utf8',
    );
    result.backupFile = backupFile;

    const repairedAt = new Date().toISOString();
    for (const { table, recordId, row } of targets) {
      const nextRow = {
        ...row,
        is_admin: true,
        analytics_excluded: true,
        analytics_exclusion_reason: row.analytics_exclusion_reason || 'audit_admin_device_repair',
        updated_at: repairedAt,
      };
      await updateGenericRowByRecordId(table, recordId, nextRow);
      result.repaired += 1;
    }
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[analytics-admin-devices] admin users: ${result.adminUsers}, sessions: ${result.adminSessions}, fingerprints: ${result.adminFingerprints}, network devices: ${result.adminNetworkDevices}`);
    console.log(`[analytics-admin-devices] targets: ${result.targetsTotal} (session_logs ${result.targetsByTable.session_logs}, site_analytics_logs ${result.targetsByTable.site_analytics_logs})`);
    console.log(`[analytics-admin-devices] mobile targets: ${result.mobileTargets}, last1d: ${result.last1dTargets}, last7d: ${result.last7dTargets}, last30d: ${result.last30dTargets}`);
    if (result.backupFile) console.log(`[analytics-admin-devices] backup: ${result.backupFile}`);
    if (repair) console.log(`[analytics-admin-devices] repaired: ${result.repaired}`);
  }

  if (!repair && targets.length > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  if (mysqlPool) await mysqlPool.end().catch(() => {});
}
