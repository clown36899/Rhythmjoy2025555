#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const INCIDENT = {
  sharedRecordId: '5d7fe39c-4172-4247-9188-a15366cf033b',
  userId: '5d7fe39c-4172-4247-9188-a15366cf033b',
  current: {
    title: '경성홀 입장료변경안내',
    createdAt: '2026-08-13T01:21:23.459Z',
  },
  jeju: {
    title: '제주스윙캠프 2026 취소소식',
    createdAt: '2026-08-05T11:41:05.583Z',
  },
  rules: {
    title: '이벤트수집 규칙',
    createdAt: '2026-06-25T17:03:40.388Z',
  },
};

const RELATED_TABLES = [
  'board_comments',
  'board_post_dislikes',
  'board_post_favorites',
  'board_post_likes',
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function optionValue(name) {
  const index = args.indexOf(name);
  if (index < 0 || index === args.length - 1) return null;
  return args[index + 1];
}

function requiredOption(name) {
  const value = optionValue(name);
  if (!value) throw new Error(`Missing required option: ${name}`);
  return path.resolve(value);
}

function decodeSqlEscape(value) {
  const escapes = {
    0: '\0',
    b: '\b',
    n: '\n',
    r: '\r',
    t: '\t',
    Z: '\x1a',
    '\\': '\\',
    "'": "'",
    '"': '"',
  };
  return Object.prototype.hasOwnProperty.call(escapes, value) ? escapes[value] : value;
}

function parseSqlValue(source, start) {
  let index = start;
  if (source[index] === "'") {
    index += 1;
    let value = '';
    while (index < source.length) {
      const character = source[index++];
      if (character === "'") return { value, index };
      if (character !== '\\') {
        value += character;
        continue;
      }
      if (index >= source.length) throw new Error('Dangling SQL escape sequence.');
      value += decodeSqlEscape(source[index++]);
    }
    throw new Error('Unterminated SQL string.');
  }

  const comma = source.indexOf(',', index);
  const close = source.indexOf(')', index);
  const end = comma < 0 ? close : (close < 0 ? comma : Math.min(comma, close));
  if (end < 0) throw new Error('Unterminated SQL value.');
  const raw = source.slice(index, end);
  return { value: raw === 'NULL' ? null : raw, index: end };
}

function parseSqlTuple(source, start) {
  if (source[start] !== '(') throw new Error(`Expected SQL tuple at offset ${start}.`);
  const values = [];
  let index = start + 1;

  while (index < source.length) {
    const parsed = parseSqlValue(source, index);
    values.push(parsed.value);
    index = parsed.index;
    if (source[index] === ',') {
      index += 1;
      continue;
    }
    if (source[index] === ')') return { values, index: index + 1 };
    throw new Error(`Unexpected SQL tuple delimiter at offset ${index}.`);
  }

  throw new Error('Unterminated SQL tuple.');
}

function parseInsertRows(line) {
  const valuesMarker = ' VALUES ';
  let index = line.indexOf(valuesMarker);
  if (index < 0) return [];
  index += valuesMarker.length;
  const rows = [];

  while (index < line.length && line[index] === '(') {
    const parsed = parseSqlTuple(line, index);
    rows.push(parsed.values);
    index = parsed.index;
    if (line[index] !== ',') break;
    index += 1;
  }

  return rows;
}

async function extractSnapshot(dumpPath) {
  const input = fs.createReadStream(dumpPath).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const tupleMarker = `('board_posts','${INCIDENT.sharedRecordId}',`;
  let postRecord = null;
  const readRows = [];

  for await (const line of lines) {
    if (line.startsWith('INSERT INTO `generic_records` VALUES ')) {
      const tupleOffset = line.indexOf(tupleMarker);
      if (tupleOffset >= 0) {
        const values = parseSqlTuple(line, tupleOffset).values;
        if (values.length !== 6) throw new Error(`Unexpected generic_records tuple width in ${dumpPath}.`);
        postRecord = {
          tableName: values[0],
          recordId: values[1],
          dataJson: values[2],
          data: JSON.parse(values[2]),
          createdAt: values[3],
          updatedAt: values[4],
          importedAt: values[5],
        };
      }
    }

    if (line.startsWith('INSERT INTO `user_board_post_reads` VALUES ')) {
      for (const values of parseInsertRows(line)) {
        if (String(values[1]) !== INCIDENT.sharedRecordId) continue;
        readRows.push({
          userId: values[0],
          postId: values[1],
          readAt: values[2],
        });
      }
    }
  }

  if (!postRecord) throw new Error(`Incident board post was not found in ${dumpPath}.`);
  return { dumpPath, postRecord, readRows };
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function assertPost(record, expected, label) {
  const data = record?.data;
  if (
    record?.tableName !== 'board_posts'
    || record?.recordId !== INCIDENT.sharedRecordId
    || data?.id !== INCIDENT.sharedRecordId
    || data?.user_id !== INCIDENT.userId
    || data?.category !== 'free'
    || data?.title !== expected.title
    || data?.created_at !== expected.createdAt
  ) {
    throw new Error(`${label} post no longer matches the incident contract.`);
  }
}

function readKey(row) {
  return `${String(row.userId)}\u0000${String(row.readAt)}`;
}

function assertSameReadRows(liveRows, backupRows) {
  const liveKeys = liveRows.map(readKey).sort();
  const backupKeys = backupRows.map(readKey).sort();
  if (JSON.stringify(liveKeys) !== JSON.stringify(backupKeys)) {
    throw new Error('Board read state changed after the recovery preview; manual reconciliation is required.');
  }
}

function summarizeRecord(record) {
  return {
    recordId: record.recordId,
    title: record.data.title,
    createdAt: record.data.created_at,
    updatedAt: record.data.updated_at,
    contentLength: String(record.data.content || '').length,
  };
}

function parseLiveRecord(row) {
  const dataJson = String(row.data_json);
  return {
    tableName: 'board_posts',
    recordId: String(row.record_id),
    dataJson,
    data: JSON.parse(dataJson),
    createdAt: row.created_at_text,
    updatedAt: row.updated_at_text,
    importedAt: row.imported_at_text,
  };
}

const rulesDump = requiredOption('--rules-dump');
const jejuDump = requiredOption('--jeju-dump');
const backupDir = apply ? requiredOption('--backup-dir') : optionValue('--backup-dir');
const [rulesSnapshot, jejuSnapshot, rulesDumpSha256, jejuDumpSha256] = await Promise.all([
  extractSnapshot(rulesDump),
  extractSnapshot(jejuDump),
  sha256File(rulesDump),
  sha256File(jejuDump),
]);

assertPost(rulesSnapshot.postRecord, INCIDENT.rules, 'Rules backup');
assertPost(jejuSnapshot.postRecord, INCIDENT.jeju, 'Jeju backup');
if (rulesSnapshot.readRows.length !== 0) {
  throw new Error('The rules snapshot unexpectedly contains board read rows.');
}

const { getMysqlPool } = await import('../server/cafe24/mysql-pool.js');
const pool = getMysqlPool();
const connection = await pool.getConnection();
let transactionOpen = false;

try {
  // The SQL snapshots were dumped with TIME_ZONE='+00:00'. Use the same
  // session timezone so TIMESTAMP fields (read_at/imported_at) compare and
  // restore byte-for-byte by their dumped wall-clock values.
  await connection.query("SET time_zone = '+00:00'");
  await connection.beginTransaction();
  transactionOpen = true;

  const [livePostRows] = await connection.execute(
    `SELECT record_id, data_json,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
            DATE_FORMAT(imported_at, '%Y-%m-%d %H:%i:%s') AS imported_at_text
       FROM generic_records
      WHERE table_name = 'board_posts' AND record_id = ?
      FOR UPDATE`,
    [INCIDENT.sharedRecordId],
  );

  if (livePostRows.length !== 1) throw new Error('Expected exactly one live incident record.');
  const currentRecord = parseLiveRecord(livePostRows[0]);

  const [allPostRows] = await connection.execute(
    `SELECT record_id, data_json
       FROM generic_records
      WHERE table_name = 'board_posts'`,
  );
  const existingPosts = allPostRows.map((row) => ({
    recordId: String(row.record_id),
    data: JSON.parse(String(row.data_json)),
  }));
  const restoredTitles = new Set(existingPosts.map((row) => row.data.title));
  const alreadyApplied = currentRecord.data.title === INCIDENT.jeju.title
    && restoredTitles.has(INCIDENT.current.title)
    && restoredTitles.has(INCIDENT.rules.title);

  if (alreadyApplied) {
    await connection.rollback();
    transactionOpen = false;
    console.log(JSON.stringify({
      ok: true,
      applied: false,
      alreadyApplied: true,
      posts: existingPosts
        .filter((row) => [INCIDENT.current.title, INCIDENT.jeju.title, INCIDENT.rules.title].includes(row.data.title))
        .map((row) => ({ recordId: row.recordId, title: row.data.title, createdAt: row.data.created_at })),
    }, null, 2));
    process.exitCode = 0;
  } else {
    assertPost(currentRecord, INCIDENT.current, 'Current live');

    const [relatedRows] = await connection.execute(
      `SELECT table_name, record_id, data_json
         FROM generic_records
        WHERE table_name IN (${RELATED_TABLES.map(() => '?').join(',')})
        FOR UPDATE`,
      RELATED_TABLES,
    );
    const incidentRelatedRows = relatedRows.filter((row) => {
      try {
        return String(JSON.parse(String(row.data_json)).post_id || '') === INCIDENT.sharedRecordId;
      } catch {
        return false;
      }
    });
    if (incidentRelatedRows.length > 0) {
      throw new Error('Comments or interactions appeared on the live post; manual reconciliation is required.');
    }

    const [liveReadRows] = await connection.execute(
      `SELECT user_id AS userId, post_id AS postId,
              DATE_FORMAT(read_at, '%Y-%m-%d %H:%i:%s') AS readAt
         FROM user_board_post_reads
        WHERE post_id = ?
        ORDER BY user_id
        FOR UPDATE`,
      [INCIDENT.sharedRecordId],
    );
    assertSameReadRows(liveReadRows, jejuSnapshot.readRows);

    const beforeCount = existingPosts.length;
    const currentRecordId = crypto.randomUUID();
    const rulesRecordId = crypto.randomUUID();
    const destinationIds = [currentRecordId, rulesRecordId];
    const [collisionRows] = await connection.query(
      `SELECT record_id
         FROM generic_records
        WHERE table_name = 'board_posts' AND record_id IN (${destinationIds.map(() => '?').join(',')})
        FOR UPDATE`,
      destinationIds,
    );
    if (collisionRows.length > 0) throw new Error('Generated recovery ID unexpectedly collided with an existing post.');

    const currentData = { ...currentRecord.data, id: currentRecordId };
    const jejuData = { ...jejuSnapshot.postRecord.data, id: INCIDENT.sharedRecordId };
    const rulesData = { ...rulesSnapshot.postRecord.data, id: rulesRecordId };
    const recoveryStartedAt = new Date().toISOString();
    const backupFilename = `2026-08-13-board-post-overwrite-${recoveryStartedAt.replace(/[:.]/g, '-')}.json`;
    const backupPath = apply ? path.join(backupDir, backupFilename) : null;

    if (apply) {
      await fsPromises.mkdir(backupDir, { recursive: true, mode: 0o700 });
      await fsPromises.writeFile(backupPath, `${JSON.stringify({
        createdAt: recoveryStartedAt,
        reason: '2026-08-13 board post record identity overwrite recovery',
        sourceDumps: {
          rules: { path: rulesDump, sha256: rulesDumpSha256 },
          jeju: { path: jejuDump, sha256: jejuDumpSha256 },
        },
        currentRecord,
        rulesBackupRecord: rulesSnapshot.postRecord,
        jejuBackupRecord: jejuSnapshot.postRecord,
        liveReadRows,
        jejuBackupReadRows: jejuSnapshot.readRows,
        assignedIds: { currentRecordId, jejuRecordId: INCIDENT.sharedRecordId, rulesRecordId },
      }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    }

    await connection.execute(
      `INSERT INTO generic_records
         (table_name, record_id, data_json, created_at, updated_at, imported_at)
       VALUES ('board_posts', ?, ?, ?, ?, ?)`,
      [
        currentRecordId,
        JSON.stringify(currentData),
        currentRecord.createdAt,
        currentRecord.updatedAt,
        currentRecord.importedAt,
      ],
    );
    const [jejuUpdate] = await connection.execute(
      `UPDATE generic_records
          SET data_json = ?, created_at = ?, updated_at = ?, imported_at = ?
        WHERE table_name = 'board_posts' AND record_id = ?`,
      [
        JSON.stringify(jejuData),
        jejuSnapshot.postRecord.createdAt,
        jejuSnapshot.postRecord.updatedAt,
        jejuSnapshot.postRecord.importedAt,
        INCIDENT.sharedRecordId,
      ],
    );
    if (Number(jejuUpdate.affectedRows || 0) !== 1) {
      throw new Error(`Expected one Jeju post update, received ${jejuUpdate.affectedRows || 0}.`);
    }
    await connection.execute(
      `INSERT INTO generic_records
         (table_name, record_id, data_json, created_at, updated_at, imported_at)
       VALUES ('board_posts', ?, ?, ?, ?, ?)`,
      [
        rulesRecordId,
        JSON.stringify(rulesData),
        rulesSnapshot.postRecord.createdAt,
        rulesSnapshot.postRecord.updatedAt,
        rulesSnapshot.postRecord.importedAt,
      ],
    );

    const [verificationRows] = await connection.query(
      `SELECT record_id, data_json
         FROM generic_records
        WHERE table_name = 'board_posts' AND record_id IN (${[INCIDENT.sharedRecordId, ...destinationIds].map(() => '?').join(',')})
        FOR UPDATE`,
      [INCIDENT.sharedRecordId, ...destinationIds],
    );
    const verifiedPosts = verificationRows.map((row) => {
      const data = JSON.parse(String(row.data_json));
      if (String(row.record_id) !== String(data.id)) {
        throw new Error(`Physical and JSON IDs differ for ${row.record_id}.`);
      }
      return { recordId: String(row.record_id), title: data.title, createdAt: data.created_at };
    });
    const expectedTitles = [INCIDENT.current.title, INCIDENT.jeju.title, INCIDENT.rules.title].sort();
    if (
      verifiedPosts.length !== 3
      || JSON.stringify(verifiedPosts.map((row) => row.title).sort()) !== JSON.stringify(expectedTitles)
    ) {
      throw new Error('Recovered post verification failed before commit.');
    }

    const [countRows] = await connection.execute(
      "SELECT COUNT(*) AS count FROM generic_records WHERE table_name = 'board_posts'",
    );
    const afterCount = Number(countRows[0]?.count || 0);
    if (afterCount !== beforeCount + 2) {
      throw new Error(`Expected board post count ${beforeCount + 2}, received ${afterCount}.`);
    }

    if (apply) {
      await connection.commit();
      transactionOpen = false;
    } else {
      await connection.rollback();
      transactionOpen = false;
    }

    console.log(JSON.stringify({
      ok: true,
      applied: apply,
      alreadyApplied: false,
      beforeCount,
      afterCount,
      backupPath,
      sourceDumpSha256: { rules: rulesDumpSha256, jeju: jejuDumpSha256 },
      sourcePosts: {
        rules: summarizeRecord(rulesSnapshot.postRecord),
        jeju: summarizeRecord(jejuSnapshot.postRecord),
      },
      posts: verifiedPosts.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))),
      preservedReadRows: liveReadRows.length,
    }, null, 2));
  }
} catch (error) {
  if (transactionOpen) await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
