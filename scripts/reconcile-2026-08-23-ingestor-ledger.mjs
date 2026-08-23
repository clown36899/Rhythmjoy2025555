#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const APPLY = process.argv.includes('--apply');
const BOARD_CHROME_ERROR = 'event date context looks like board chrome, notice, or non-event metadata';

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseJson(value, label) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function isPending(row = {}) {
  return row.is_collected !== true
    && !['collected', 'duplicate', 'excluded'].includes(String(row.status || '').toLowerCase());
}

function isCollected(row = {}) {
  return row.is_collected === true || String(row.status || '').toLowerCase() === 'collected';
}

function compactTransition({ before, after, reason, match = null }) {
  return {
    id: before.id,
    title: before.title || before.structured_data?.title || null,
    date: before.date || before.structured_data?.date || null,
    from: before.status || 'pending',
    to: after.status,
    reason,
    duplicateOf: match?.existingId || null,
  };
}

const { getMysqlPool } = await import('../server/cafe24/mysql-pool.js');
const {
  buildDuplicateScrapedEventRow,
  buildExcludedScrapedEventRow,
  findBlockingAutomaticRegistrationDuplicate,
  findPublishedBoardPostDuplicate,
  findScrapedCandidateDuplicate,
} = await import('../server/cafe24/function-api.js');
const { getIngestionCandidateExclusionReason } = await import('../server/cafe24/ingestion-candidate-policy.js');
const { validateCandidate } = await import('./ingestion/candidate-utils.mjs');

const todayArg = process.argv.find((arg) => arg.startsWith('--today='));
const today = todayArg ? todayArg.slice('--today='.length) : kstToday();
const pool = getMysqlPool();
const connection = await pool.getConnection();
let transactionOpen = false;

try {
  if (APPLY) {
    await connection.beginTransaction();
    transactionOpen = true;
  }

  const lockSuffix = APPLY ? ' FOR UPDATE' : '';
  const [candidateRecords] = await connection.execute(
    `SELECT record_id, data_json, created_at, updated_at, imported_at
       FROM generic_records
      WHERE table_name = 'scraped_events'${lockSuffix}`,
  );
  const [eventRecords] = await connection.execute('SELECT id, raw_json FROM events');
  const [boardRecords] = await connection.execute(
    `SELECT record_id, data_json
       FROM generic_records
      WHERE table_name = 'board_posts'`,
  );
  const candidates = candidateRecords.map((record) => ({
    record,
    row: parseJson(record.data_json, `scraped_events/${record.record_id}`),
  }));
  const events = eventRecords.map((record) => parseJson(record.raw_json, `events/${record.id}`));
  const boardPosts = boardRecords.map((record) => parseJson(record.data_json, `board_posts/${record.record_id}`));
  const pending = candidates
    .filter(({ row }) => isPending(row))
    .sort((left, right) => (
      String(left.row.created_at || left.record.created_at || '').localeCompare(
        String(right.row.created_at || right.record.created_at || ''),
      ) || String(left.row.id || '').localeCompare(String(right.row.id || ''))
    ));
  const candidatePrimaries = candidates.filter(({ row }) => isCollected(row)).map(({ row }) => row);
  const transitions = [];
  const publishedImageCache = new Map();
  const now = new Date().toISOString();

  for (const item of pending) {
    const { row } = item;
    const policyReason = getIngestionCandidateExclusionReason(row, { today });
    if (policyReason) {
      transitions.push({
        ...item,
        after: buildExcludedScrapedEventRow({ scrapedEvent: row, reason: policyReason, now }),
        reason: policyReason,
        match: null,
      });
      continue;
    }

    const validation = validateCandidate(row, { today });
    if (validation.errors.includes(BOARD_CHROME_ERROR)) {
      transitions.push({
        ...item,
        after: buildExcludedScrapedEventRow({
          scrapedEvent: row,
          reason: BOARD_CHROME_ERROR,
          stage: 'candidate_validation',
          now,
        }),
        reason: BOARD_CHROME_ERROR,
        match: null,
      });
      continue;
    }

    const operationalDuplicate = findBlockingAutomaticRegistrationDuplicate(row, events);
    if (operationalDuplicate) {
      transitions.push({
        ...item,
        after: buildDuplicateScrapedEventRow({ scrapedEvent: row, duplicate: operationalDuplicate, now }),
        reason: operationalDuplicate.reason,
        match: operationalDuplicate,
      });
      continue;
    }

    const publishedDuplicate = await findPublishedBoardPostDuplicate(row, boardPosts, {
      imageCache: publishedImageCache,
    });
    if (publishedDuplicate) {
      transitions.push({
        ...item,
        after: buildDuplicateScrapedEventRow({ scrapedEvent: row, duplicate: publishedDuplicate, now }),
        reason: publishedDuplicate.reason,
        match: publishedDuplicate,
      });
      continue;
    }

    const candidateDuplicate = findScrapedCandidateDuplicate(row, candidatePrimaries);
    if (candidateDuplicate) {
      transitions.push({
        ...item,
        after: buildDuplicateScrapedEventRow({ scrapedEvent: row, duplicate: candidateDuplicate, now }),
        reason: candidateDuplicate.reason,
        match: candidateDuplicate,
      });
      continue;
    }

    candidatePrimaries.push(row);
  }

  const summary = {
    ok: true,
    applied: APPLY,
    today,
    pendingInspected: pending.length,
    transitions: transitions.length,
    duplicates: transitions.filter((item) => item.after.status === 'duplicate').length,
    excluded: transitions.filter((item) => item.after.status === 'excluded').length,
    rows: transitions.map(({ row, after, reason, match }) => compactTransition({
      before: row,
      after,
      reason,
      match,
    })),
  };

  if (!APPLY || transitions.length === 0) {
    if (transactionOpen) {
      await connection.rollback();
      transactionOpen = false;
    }
    console.log(JSON.stringify({ ...summary, alreadyReconciled: transitions.length === 0 }, null, 2));
  } else {
    const backupRoot = path.resolve(
      process.env.CAFE24_BACKUP_DIR || path.join(process.cwd(), 'backups', 'data-fixes'),
    );
    await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const backupPath = path.join(
      backupRoot,
      `2026-08-23-ingestor-ledger-${now.replace(/[:.]/g, '-')}.json`,
    );
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: now,
      reason: '2026-08-23 pending ingestor policy and composite duplicate reconciliation',
      today,
      records: transitions.map(({ record, row }) => ({ record, row })),
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

    let updatedRows = 0;
    for (const { record, after } of transitions) {
      const [result] = await connection.execute(
        `UPDATE generic_records
            SET data_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE table_name = 'scraped_events' AND record_id = ?`,
        [JSON.stringify(after), toMysqlDateTime(now), record.record_id],
      );
      updatedRows += Number(result.affectedRows || 0);
    }
    if (updatedRows !== transitions.length) {
      throw new Error(`Expected ${transitions.length} candidate updates, wrote ${updatedRows}.`);
    }

    const ids = transitions.map(({ record }) => record.record_id);
    const placeholders = ids.map(() => '?').join(', ');
    const [verifiedRecords] = await connection.execute(
      `SELECT record_id, data_json
         FROM generic_records
        WHERE table_name = 'scraped_events' AND record_id IN (${placeholders})`,
      ids,
    );
    const verified = new Map(verifiedRecords.map((record) => [
      String(record.record_id),
      parseJson(record.data_json, `verified scraped_events/${record.record_id}`),
    ]));
    for (const { record, after } of transitions) {
      const saved = verified.get(String(record.record_id));
      if (saved?.status !== after.status) {
        throw new Error(`Candidate ${record.record_id} failed status verification.`);
      }
    }

    await connection.commit();
    transactionOpen = false;
    console.log(JSON.stringify({ ...summary, backupPath, updatedRows }, null, 2));
  }
} catch (error) {
  if (transactionOpen) await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
