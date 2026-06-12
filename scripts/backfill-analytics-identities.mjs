#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  loadCafe24TableRows,
  saveCafe24TableRow,
} from '../server/cafe24/generic-data-api.js';
import { analyticsGuestNetworkIdentity } from '../server/cafe24/analytics-purity.js';
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

function rowTime(row = {}) {
  return Date.parse(row.session_start || row.created_at || row.timestamp || row.date || '') || 0;
}

function rowInWindow(row, days) {
  if (!Number.isFinite(days) || days <= 0) return true;
  const time = rowTime(row);
  return time > 0 && time >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function addSetValue(set, value) {
  if (value !== undefined && value !== null && value !== '') set.add(String(value));
}

function buildCanonicalizer(boardUsers = [], users = []) {
  const canonicalById = new Map();
  const userIdByEmail = new Map();

  for (const user of users) {
    if (!user?.id) continue;
    const userId = String(user.id);
    const email = normalizeEmail(user.email);
    canonicalById.set(userId, userId);
    if (email && !userIdByEmail.has(email)) userIdByEmail.set(email, userId);
  }

  for (const boardUser of boardUsers) {
    if (!boardUser?.user_id) continue;
    const boardUserId = String(boardUser.user_id);
    const email = normalizeEmail(boardUser.email || boardUser.admin_email);
    canonicalById.set(
      boardUserId,
      email && userIdByEmail.has(email) ? userIdByEmail.get(email) : boardUserId,
    );
  }

  return (value) => {
    if (value === undefined || value === null || value === '') return null;
    const userId = String(value);
    return canonicalById.get(userId) || userId;
  };
}

function buildNicknameMap(boardUsers = [], users = [], canonicalizeUserId) {
  const nicknameByUser = new Map();

  for (const boardUser of boardUsers) {
    if (!boardUser?.user_id) continue;
    const userId = String(boardUser.user_id);
    const canonicalUserId = canonicalizeUserId(userId);
    const nickname = boardUser.nickname || boardUser.name || normalizeEmail(boardUser.email) || userId;
    if (!nicknameByUser.has(userId)) nicknameByUser.set(userId, nickname);
    if (canonicalUserId && !nicknameByUser.has(canonicalUserId)) {
      nicknameByUser.set(canonicalUserId, nickname);
    }
  }

  for (const user of users) {
    if (!user?.id) continue;
    const userId = String(user.id);
    if (!nicknameByUser.has(userId)) {
      nicknameByUser.set(userId, user.nickname || normalizeEmail(user.email) || userId);
    }
  }

  return nicknameByUser;
}

function buildAdminUserIds({ admins, users, boardUsers, canonicalizeUserId }) {
  const adminEmails = new Set(configuredAdminEmails());
  const userIdByEmail = new Map();
  const adminIds = new Set();

  const addAdminId = (value) => {
    if (value === undefined || value === null || value === '') return;
    const userId = String(value);
    adminIds.add(userId);
    addSetValue(adminIds, canonicalizeUserId(userId));
  };

  for (const user of users) {
    const email = normalizeEmail(user?.email);
    if (email && !userIdByEmail.has(email)) userIdByEmail.set(email, String(user.id));
    if (asBool(user?.is_admin, false)) {
      addAdminId(user?.id);
      if (email) adminEmails.add(email);
    }
  }

  for (const admin of admins) {
    addAdminId(admin?.user_id || admin?.admin_user_id);
    const email = normalizeEmail(admin?.email || admin?.admin_email);
    if (!email) continue;
    adminEmails.add(email);
    if (userIdByEmail.has(email)) addAdminId(userIdByEmail.get(email));
  }

  for (const user of users) {
    const email = normalizeEmail(user?.email);
    if (email && adminEmails.has(email)) addAdminId(user?.id);
  }

  for (const boardUser of boardUsers) {
    const email = normalizeEmail(boardUser?.email || boardUser?.admin_email);
    if (asBool(boardUser?.is_admin, false) || (email && adminEmails.has(email))) {
      addAdminId(boardUser?.user_id);
      if (email) adminEmails.add(email);
    }
  }

  return { adminEmails, adminIds };
}

function addIdentity(map, key, userId) {
  if (!key || !userId) return;
  const values = map.get(String(key)) || new Set();
  values.add(String(userId));
  map.set(String(key), values);
}

function singleValue(values) {
  if (!values || values.size !== 1) return null;
  return Array.from(values)[0];
}

function buildIdentityMaps(rows, canonicalizeUserId) {
  const sessionToUser = new Map();
  const fingerprintToUser = new Map();

  for (const { row } of rows) {
    const canonicalUserId = canonicalizeUserId(row?.user_id);
    if (!canonicalUserId) continue;
    addIdentity(sessionToUser, row.session_id, canonicalUserId);
    addIdentity(fingerprintToUser, row.fingerprint, canonicalUserId);
  }

  return { sessionToUser, fingerprintToUser };
}

function resolveRowUser(row, identityMaps, canonicalizeUserId) {
  const directUserId = canonicalizeUserId(row?.user_id);
  if (directUserId) {
    return {
      userId: directUserId,
      method: row.user_id && directUserId !== String(row.user_id) ? 'canonical_user_id' : 'existing_user_id',
    };
  }

  if (row?.session_id) {
    const userId = singleValue(identityMaps.sessionToUser.get(String(row.session_id)));
    if (userId) return { userId, method: 'session_id' };
  }

  if (row?.fingerprint) {
    const userId = singleValue(identityMaps.fingerprintToUser.get(String(row.fingerprint)));
    if (userId) return { userId, method: 'fingerprint' };
  }

  return null;
}

function buildAdminDeviceClosure(rows, adminUserIds, identityMaps) {
  const sessionIds = new Set();
  const fingerprints = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const { row } of rows) {
      const sessionUsers = row?.session_id ? identityMaps.sessionToUser.get(String(row.session_id)) : null;
      const fingerprintUsers = row?.fingerprint ? identityMaps.fingerprintToUser.get(String(row.fingerprint)) : null;
      const directAdmin = asBool(row?.is_admin, false)
        || (row?.user_id && adminUserIds.has(String(row.user_id)))
        || Array.from(sessionUsers || []).some((userId) => adminUserIds.has(String(userId)))
        || Array.from(fingerprintUsers || []).some((userId) => adminUserIds.has(String(userId)));
      const linkedAdminDevice = Boolean(
        (row?.session_id && sessionIds.has(String(row.session_id))) ||
        (row?.fingerprint && fingerprints.has(String(row.fingerprint)))
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
    }
  }

  return { sessionIds, fingerprints, networkDeviceIds: new Set() };
}

function isAdminDeviceRow(row, deviceIds) {
  return Boolean(
    (row?.session_id && deviceIds.sessionIds.has(String(row.session_id))) ||
    (row?.fingerprint && deviceIds.fingerprints.has(String(row.fingerprint)))
  );
}

function buildNextRow(row, { resolvedUser, isAdmin, now }) {
  const nextRow = { ...row };
  const method = resolvedUser?.method || (isAdmin ? 'admin_device' : null);

  if (resolvedUser?.userId) nextRow.user_id = resolvedUser.userId;
  if (method) {
    nextRow.identity_resolution_method = nextRow.identity_resolution_method || method;
    nextRow.identity_resolved_at = nextRow.identity_resolved_at || now;
  }
  if (isAdmin) {
    nextRow.is_admin = true;
    nextRow.analytics_excluded = true;
    nextRow.analytics_exclusion_reason = 'matched_admin_identity';
  } else if (resolvedUser?.userId && !asBool(nextRow.analytics_excluded, false)) {
    nextRow.is_admin = false;
  }
  nextRow.updated_at = now;

  return nextRow;
}

function rowChanged(before, after) {
  return [
    'user_id',
    'is_admin',
    'analytics_excluded',
    'analytics_exclusion_reason',
    'identity_resolution_method',
    'identity_resolved_at',
  ].some((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

async function loadSqlUsers() {
  mysqlPool = getMysqlPool();
  const [rows] = await mysqlPool.execute('SELECT id, email, nickname, is_admin FROM users');
  return rows;
}

async function main() {
  const days = Number(optionValue('--days', '30'));
  const [admins, users, boardUsers, sessionLogs, analyticsLogs] = await Promise.all([
    loadCafe24TableRows('board_admins').catch(() => []),
    loadSqlUsers(),
    loadCafe24TableRows('board_users').catch(() => []),
    loadCafe24TableRows('session_logs').catch(() => []),
    loadCafe24TableRows('site_analytics_logs').catch(() => []),
  ]);

  const canonicalizeUserId = buildCanonicalizer(boardUsers, users);
  const nicknameByUser = buildNicknameMap(boardUsers, users, canonicalizeUserId);
  const { adminEmails, adminIds } = buildAdminUserIds({
    admins,
    users,
    boardUsers,
    canonicalizeUserId,
  });
  const rows = [
    ...sessionLogs.map((row) => ({ table: 'session_logs', row })),
    ...analyticsLogs.map((row) => ({ table: 'site_analytics_logs', row })),
  ];
  const identityMaps = buildIdentityMaps(rows, canonicalizeUserId);
  const adminDevices = buildAdminDeviceClosure(rows, adminIds, identityMaps);
  const now = new Date().toISOString();
  const targets = [];
  const ambiguous = {
    session_id: 0,
    fingerprint: 0,
  };

  for (const item of rows) {
    if (!rowInWindow(item.row, days)) continue;

    const directUserId = canonicalizeUserId(item.row?.user_id);
    const sessionCandidates = item.row?.session_id ? identityMaps.sessionToUser.get(String(item.row.session_id)) : null;
    const fingerprintCandidates = item.row?.fingerprint ? identityMaps.fingerprintToUser.get(String(item.row.fingerprint)) : null;
    if (!directUserId && sessionCandidates?.size > 1) ambiguous.session_id += 1;
    if (!directUserId && fingerprintCandidates?.size > 1) ambiguous.fingerprint += 1;

    const resolvedUser = resolveRowUser(item.row, identityMaps, canonicalizeUserId);
    const isAdmin = asBool(item.row?.is_admin, false)
      || (resolvedUser?.userId && adminIds.has(String(resolvedUser.userId)))
      || isAdminDeviceRow(item.row, adminDevices);

    if (!resolvedUser?.userId && !isAdmin) continue;
    if (
      resolvedUser?.method === 'existing_user_id' &&
      !isAdmin
    ) continue;
    const nextRow = buildNextRow(item.row, { resolvedUser, isAdmin, now });
    if (!rowChanged(item.row, nextRow)) continue;
    targets.push({ ...item, nextRow, resolvedUser, isAdmin });
  }

  const targetsByUser = new Map();
  const targetsByTable = { session_logs: 0, site_analytics_logs: 0 };
  const targetsByMethod = new Map();
  let guestPromotions = 0;
  let adminExclusions = 0;
  let canonicalizedRows = 0;

  for (const target of targets) {
    targetsByTable[target.table] = (targetsByTable[target.table] || 0) + 1;
    incrementMap(targetsByMethod, target.resolvedUser?.method || 'admin_device');
    if (!target.row.user_id && target.nextRow.user_id && !target.isAdmin) guestPromotions += 1;
    if (!asBool(target.row.analytics_excluded, false) && asBool(target.nextRow.analytics_excluded, false)) adminExclusions += 1;
    if (target.row.user_id && target.nextRow.user_id && String(target.row.user_id) !== String(target.nextRow.user_id)) {
      canonicalizedRows += 1;
    }
    const displayKey = target.nextRow.user_id
      ? nicknameByUser.get(String(target.nextRow.user_id)) || `회원 ${String(target.nextRow.user_id).slice(0, 8)}`
      : '관리자 기기';
    incrementMap(targetsByUser, displayKey);
  }

  const result = {
    apply,
    days: Number.isFinite(days) && days > 0 ? days : null,
    admins: admins.length,
    adminUsers: adminIds.size,
    adminEmails: adminEmails.size,
    adminSessions: adminDevices.sessionIds.size,
    adminFingerprints: adminDevices.fingerprints.size,
    adminNetworkDevices: adminDevices.networkDeviceIds.size,
    sessionLogsTotal: sessionLogs.length,
    analyticsLogsTotal: analyticsLogs.length,
    targetsTotal: targets.length,
    targetsByTable,
    targetsByMethod: Object.fromEntries(Array.from(targetsByMethod.entries()).sort((a, b) => b[1] - a[1])),
    targetsByUser: Object.fromEntries(Array.from(targetsByUser.entries()).sort((a, b) => b[1] - a[1])),
    guestPromotions,
    adminExclusions,
    canonicalizedRows,
    ambiguous,
    backupFile: null,
    applied: 0,
  };

  if (apply && targets.length > 0) {
    const backupDir = optionValue('--backup-dir', process.env.ANALYTICS_REPAIR_BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `analytics-identity-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
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
    console.log(`[analytics-identities] days: ${result.days ?? 'all'}, apply: ${result.apply}`);
    console.log(`[analytics-identities] targets: ${result.targetsTotal} (session_logs ${result.targetsByTable.session_logs}, site_analytics_logs ${result.targetsByTable.site_analytics_logs})`);
    console.log(`[analytics-identities] guest promotions: ${result.guestPromotions}, admin exclusions: ${result.adminExclusions}, canonicalized rows: ${result.canonicalizedRows}`);
    console.log(`[analytics-identities] methods: ${JSON.stringify(result.targetsByMethod)}`);
    console.log(`[analytics-identities] users: ${JSON.stringify(result.targetsByUser)}`);
    if (result.backupFile) console.log(`[analytics-identities] backup: ${result.backupFile}`);
    if (apply) console.log(`[analytics-identities] applied: ${result.applied}`);
  }
}

try {
  await main();
} finally {
  if (mysqlPool) await mysqlPool.end().catch(() => {});
}
