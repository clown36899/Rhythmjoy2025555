#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const APPLY = process.argv.includes('--apply');
const INCIDENT = {
  boardPost: {
    id: '8ca978c6-cb7b-4ba9-aaac-bc8f11c9512f',
    title: '경성홀 입장료변경안내',
  },
  prefix: {
    id: 'b8e2e936-f6c6-487e-8880-3fa0c1ae0d5a',
    name: '뉴스',
  },
  event: {
    id: '4cc850cb-3d38-458c-9ef2-3d30b7baa221',
    title: '대전 피버 토 졸파',
    sourceUrl: 'https://www.instagram.com/daejeon.swingfever/p/Db7HnyuE_fr',
  },
  candidate: {
    id: '3e37414b5bf363f2',
  },
};

function parseJson(value, label) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function isGeneralBenefit(data) {
  return data?.benefit_eligible === false && data?.benefit_kind === null;
}

function isIncidentDiscount(data) {
  return data?.benefit_eligible === true && data?.benefit_kind === 'discount_event';
}

function assertIncidentRecords({ post, prefix, event, candidate }) {
  if (
    post?.id !== INCIDENT.boardPost.id
    || post?.title !== INCIDENT.boardPost.title
    || post?.category !== 'free'
  ) {
    throw new Error('The board post no longer matches the incident contract.');
  }
  if (
    prefix?.id !== INCIDENT.prefix.id
    || prefix?.name !== INCIDENT.prefix.name
    || prefix?.board_category_code !== 'free'
  ) {
    throw new Error('The board prefix no longer matches the incident contract.');
  }
  if (
    event?.id !== INCIDENT.event.id
    || event?.title !== INCIDENT.event.title
    || event?.link1 !== INCIDENT.event.sourceUrl
  ) {
    throw new Error('The event no longer matches the incident contract.');
  }
  if (
    candidate?.id !== INCIDENT.candidate.id
    || candidate?.source_url !== INCIDENT.event.sourceUrl
    || String(candidate?.registered_event_id || candidate?.structured_data?.registered_event_id || '') !== INCIDENT.event.id
  ) {
    throw new Error('The collected candidate no longer matches the incident contract.');
  }

  if (post.prefix_id !== null && post.prefix_id !== INCIDENT.prefix.id) {
    throw new Error('The board post now has a different prefix; manual review is required.');
  }
  if (!isGeneralBenefit(event) && !isIncidentDiscount(event)) {
    throw new Error('The event benefit state changed after the incident; manual review is required.');
  }
  if (
    candidate.structured_data?.benefit_eligible !== undefined
    && candidate.structured_data?.benefit_eligible !== true
  ) {
    throw new Error('The candidate has an unexpected benefit eligibility state.');
  }
  if (
    candidate.structured_data?.benefit_kind !== undefined
    && candidate.structured_data?.benefit_kind !== 'discount_event'
  ) {
    throw new Error('The candidate has an unexpected benefit kind.');
  }
}

const { getMysqlPool } = await import('../server/cafe24/mysql-pool.js');
const pool = getMysqlPool();
const connection = await pool.getConnection();
let transactionOpen = false;

try {
  await connection.beginTransaction();
  transactionOpen = true;

  const [genericRows] = await connection.execute(
    `SELECT table_name, record_id, data_json, created_at, updated_at, imported_at
       FROM generic_records
      WHERE (table_name = 'board_posts' AND record_id = ?)
         OR (table_name = 'board_prefixes' AND record_id = ?)
         OR (table_name = 'scraped_events' AND record_id = ?)
      FOR UPDATE`,
    [INCIDENT.boardPost.id, INCIDENT.prefix.id, INCIDENT.candidate.id],
  );
  const findGeneric = (tableName, recordId) => genericRows.find((row) => (
    row.table_name === tableName && String(row.record_id) === recordId
  ));
  const postRecord = findGeneric('board_posts', INCIDENT.boardPost.id);
  const prefixRecord = findGeneric('board_prefixes', INCIDENT.prefix.id);
  const candidateRecord = findGeneric('scraped_events', INCIDENT.candidate.id);
  if (!postRecord || !prefixRecord || !candidateRecord) {
    throw new Error('One or more incident generic records are missing.');
  }

  const [eventRows] = await connection.execute(
    'SELECT id, raw_json, created_at, updated_at, imported_at FROM events WHERE id = ? FOR UPDATE',
    [INCIDENT.event.id],
  );
  const eventRecord = eventRows[0];
  if (!eventRecord) throw new Error('The incident event is missing.');

  const post = parseJson(postRecord.data_json, 'Board post');
  const prefix = parseJson(prefixRecord.data_json, 'Board prefix');
  const event = parseJson(eventRecord.raw_json, 'Event');
  const candidate = parseJson(candidateRecord.data_json, 'Collected candidate');
  assertIncidentRecords({ post, prefix, event, candidate });

  const alreadyApplied = post.prefix_id === INCIDENT.prefix.id
    && isGeneralBenefit(event)
    && candidate.structured_data?.benefit_eligible === undefined
    && candidate.structured_data?.benefit_kind === undefined
    && candidate.structured_data?.benefit_lifecycle === undefined;
  if (alreadyApplied) {
    await connection.rollback();
    transactionOpen = false;
    console.log(JSON.stringify({ ok: true, applied: false, alreadyApplied: true }, null, 2));
  } else {
    const now = new Date().toISOString();
    const nextPost = {
      ...post,
      prefix_id: INCIDENT.prefix.id,
      updated_at: now,
    };
    const nextEvent = {
      ...event,
      benefit_eligible: false,
      benefit_kind: null,
      updated_at: now,
    };
    const nextStructuredData = { ...(candidate.structured_data || {}) };
    delete nextStructuredData.benefit_eligible;
    delete nextStructuredData.benefit_kind;
    delete nextStructuredData.benefit_lifecycle;
    const nextCandidate = {
      ...candidate,
      structured_data: nextStructuredData,
      updated_at: now,
    };
    const summary = {
      ok: true,
      applied: APPLY,
      alreadyApplied: false,
      boardPost: {
        id: nextPost.id,
        title: nextPost.title,
        prefixBefore: post.prefix_id,
        prefixAfter: nextPost.prefix_id,
      },
      event: {
        id: nextEvent.id,
        title: nextEvent.title,
        benefitBefore: event.benefit_kind,
        benefitAfter: nextEvent.benefit_kind,
      },
      candidate: {
        id: nextCandidate.id,
        status: nextCandidate.status,
        benefitBefore: candidate.structured_data?.benefit_kind || null,
        benefitAfter: nextCandidate.structured_data?.benefit_kind || null,
      },
    };

    if (!APPLY) {
      await connection.rollback();
      transactionOpen = false;
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const backupRoot = path.resolve(
        process.env.CAFE24_BACKUP_DIR || path.join(process.cwd(), 'backups', 'data-fixes'),
      );
      await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
      const backupPath = path.join(
        backupRoot,
        `2026-08-13-prefix-benefit-${now.replace(/[:.]/g, '-')}.json`,
      );
      await fs.writeFile(backupPath, `${JSON.stringify({
        createdAt: now,
        reason: '2026-08-13 board prefix and event benefit remediation',
        postRecord,
        prefixRecord,
        eventRecord,
        candidateRecord,
      }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

      const mysqlNow = toMysqlDateTime(now);
      const [postUpdate] = await connection.execute(
        `UPDATE generic_records
            SET data_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE table_name = 'board_posts' AND record_id = ?`,
        [JSON.stringify(nextPost), mysqlNow, INCIDENT.boardPost.id],
      );
      const [eventUpdate] = await connection.execute(
        `UPDATE events
            SET raw_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [JSON.stringify(nextEvent), mysqlNow, INCIDENT.event.id],
      );
      const [candidateUpdate] = await connection.execute(
        `UPDATE generic_records
            SET data_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE table_name = 'scraped_events' AND record_id = ?`,
        [JSON.stringify(nextCandidate), mysqlNow, INCIDENT.candidate.id],
      );
      for (const [label, result] of [
        ['board post', postUpdate],
        ['event', eventUpdate],
        ['candidate', candidateUpdate],
      ]) {
        if (Number(result.affectedRows || 0) !== 1) {
          throw new Error(`Expected one ${label} update, received ${result.affectedRows || 0}.`);
        }
      }

      const [verifiedGenericRows] = await connection.execute(
        `SELECT table_name, record_id, data_json
           FROM generic_records
          WHERE (table_name = 'board_posts' AND record_id = ?)
             OR (table_name = 'scraped_events' AND record_id = ?)
          FOR UPDATE`,
        [INCIDENT.boardPost.id, INCIDENT.candidate.id],
      );
      const verifiedPost = parseJson(
        verifiedGenericRows.find((row) => row.table_name === 'board_posts')?.data_json,
        'Verified board post',
      );
      const verifiedCandidate = parseJson(
        verifiedGenericRows.find((row) => row.table_name === 'scraped_events')?.data_json,
        'Verified candidate',
      );
      const [verifiedEventRows] = await connection.execute(
        'SELECT raw_json FROM events WHERE id = ? FOR UPDATE',
        [INCIDENT.event.id],
      );
      const verifiedEvent = parseJson(verifiedEventRows[0]?.raw_json, 'Verified event');
      if (
        verifiedPost.prefix_id !== INCIDENT.prefix.id
        || !isGeneralBenefit(verifiedEvent)
        || verifiedCandidate.structured_data?.benefit_eligible !== undefined
        || verifiedCandidate.structured_data?.benefit_kind !== undefined
        || verifiedCandidate.structured_data?.benefit_lifecycle !== undefined
      ) {
        throw new Error('Incident repair verification failed before commit.');
      }

      await connection.commit();
      transactionOpen = false;
      console.log(JSON.stringify({ ...summary, backupPath }, null, 2));
    }
  }
} catch (error) {
  if (transactionOpen) await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
