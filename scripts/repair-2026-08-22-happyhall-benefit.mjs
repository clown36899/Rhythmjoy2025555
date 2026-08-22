#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const APPLY = process.argv.includes('--apply');
const INCIDENT = {
  eventId: '73a4c5d8-31a5-435e-b933-2741fa971fba',
  candidateId: 'd87841b70fcf84a0',
  sourceUrl: 'https://cafe.naver.com/f-e/cafes/10026855/articles/56188',
};

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

function isIncorrectFreeBenefit(data = {}) {
  return data.benefit_eligible === true && data.benefit_kind === 'free_event';
}

function isGeneralEvent(data = {}) {
  return data.benefit_eligible === false && data.benefit_kind === null;
}

function isGeneralCandidate(data = {}) {
  const structuredData = data.structured_data || {};
  return !Object.hasOwn(structuredData, 'benefit_eligible')
    && !Object.hasOwn(structuredData, 'benefit_kind')
    && !Object.hasOwn(structuredData, 'benefit_lifecycle');
}

function assertIncidentRecords(event, candidate) {
  if (
    String(event?.id || '') !== INCIDENT.eventId
    || String(event?.link1 || '') !== INCIDENT.sourceUrl
    || String(event?.activity_type || '') !== 'social'
  ) {
    throw new Error('The public event no longer matches the Happy Hall incident contract.');
  }
  if (
    String(candidate?.id || '') !== INCIDENT.candidateId
    || String(candidate?.source_url || '') !== INCIDENT.sourceUrl
    || String(candidate?.registered_event_id || candidate?.structured_data?.registered_event_id || '') !== INCIDENT.eventId
    || candidate?.status !== 'collected'
    || candidate?.is_collected !== true
  ) {
    throw new Error('The collected candidate no longer matches the Happy Hall incident contract.');
  }
  if (!isIncorrectFreeBenefit(event) && !isGeneralEvent(event)) {
    throw new Error('The public event has an unexpected benefit state.');
  }
  const candidateBenefit = candidate.structured_data || {};
  if (
    Object.hasOwn(candidateBenefit, 'benefit_eligible')
    && candidateBenefit.benefit_eligible !== true
  ) {
    throw new Error('The candidate has an unexpected benefit eligibility state.');
  }
  if (
    Object.hasOwn(candidateBenefit, 'benefit_kind')
    && candidateBenefit.benefit_kind !== 'free_event'
  ) {
    throw new Error('The candidate has an unexpected benefit kind.');
  }
  if (
    Object.hasOwn(candidateBenefit, 'benefit_lifecycle')
    && candidateBenefit.benefit_lifecycle !== 'date_bound'
  ) {
    throw new Error('The candidate has an unexpected benefit lifecycle.');
  }
}

const { getMysqlPool } = await import('../server/cafe24/mysql-pool.js');
const pool = getMysqlPool();
const connection = await pool.getConnection();
let transactionOpen = false;

try {
  if (APPLY) {
    await connection.beginTransaction();
    transactionOpen = true;
  }
  const lockSuffix = APPLY ? ' FOR UPDATE' : '';
  const [eventRows] = await connection.execute(
    `SELECT id, raw_json, created_at, updated_at, imported_at
       FROM events
      WHERE id = ?${lockSuffix}`,
    [INCIDENT.eventId],
  );
  const [candidateRows] = await connection.execute(
    `SELECT table_name, record_id, data_json, created_at, updated_at, imported_at
       FROM generic_records
      WHERE table_name = 'scraped_events' AND record_id = ?${lockSuffix}`,
    [INCIDENT.candidateId],
  );
  const eventRecord = eventRows[0];
  const candidateRecord = candidateRows[0];
  if (!eventRecord || !candidateRecord) {
    throw new Error('The Happy Hall event or collected candidate is missing.');
  }

  const event = parseJson(eventRecord.raw_json, 'Event');
  const candidate = parseJson(candidateRecord.data_json, 'Collected candidate');
  assertIncidentRecords(event, candidate);

  const alreadyApplied = isGeneralEvent(event) && isGeneralCandidate(candidate);
  if (alreadyApplied) {
    if (transactionOpen) {
      await connection.rollback();
      transactionOpen = false;
    }
    console.log(JSON.stringify({
      ok: true,
      applied: false,
      alreadyApplied: true,
      eventId: INCIDENT.eventId,
      candidateId: INCIDENT.candidateId,
    }, null, 2));
  } else {
    const now = new Date().toISOString();
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
    const preview = {
      ok: true,
      applied: APPLY,
      alreadyApplied: false,
      event: {
        id: nextEvent.id,
        title: nextEvent.title,
        benefitBefore: event.benefit_kind || null,
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
      console.log(JSON.stringify(preview, null, 2));
    } else {
      const backupRoot = path.resolve(
        process.env.CAFE24_BACKUP_DIR || path.join(process.cwd(), 'backups', 'data-fixes'),
      );
      await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
      const backupPath = path.join(
        backupRoot,
        `2026-08-22-happyhall-benefit-${now.replace(/[:.]/g, '-')}.json`,
      );
      await fs.writeFile(backupPath, `${JSON.stringify({
        createdAt: now,
        reason: '2026-08-22 Happy Hall negated free-class benefit remediation',
        eventRecord,
        candidateRecord,
      }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

      const mysqlNow = toMysqlDateTime(now);
      const [eventUpdate] = await connection.execute(
        `UPDATE events
            SET raw_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [JSON.stringify(nextEvent), mysqlNow, INCIDENT.eventId],
      );
      const [candidateUpdate] = await connection.execute(
        `UPDATE generic_records
            SET data_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE table_name = 'scraped_events' AND record_id = ?`,
        [JSON.stringify(nextCandidate), mysqlNow, INCIDENT.candidateId],
      );
      if (Number(eventUpdate.affectedRows || 0) !== 1 || Number(candidateUpdate.affectedRows || 0) !== 1) {
        throw new Error('Expected exactly one event row and one candidate row to be updated.');
      }

      const [verifiedEventRows] = await connection.execute(
        'SELECT raw_json FROM events WHERE id = ?',
        [INCIDENT.eventId],
      );
      const [verifiedCandidateRows] = await connection.execute(
        `SELECT data_json FROM generic_records
          WHERE table_name = 'scraped_events' AND record_id = ?`,
        [INCIDENT.candidateId],
      );
      const verifiedEvent = parseJson(verifiedEventRows[0]?.raw_json, 'Verified event');
      const verifiedCandidate = parseJson(verifiedCandidateRows[0]?.data_json, 'Verified candidate');
      if (!isGeneralEvent(verifiedEvent) || !isGeneralCandidate(verifiedCandidate)) {
        throw new Error('The repaired benefit state failed transaction verification.');
      }

      await connection.commit();
      transactionOpen = false;
      console.log(JSON.stringify({
        ...preview,
        backupPath,
        eventRowsUpdated: Number(eventUpdate.affectedRows || 0),
        candidateRowsUpdated: Number(candidateUpdate.affectedRows || 0),
      }, null, 2));
    }
  }
} catch (error) {
  if (transactionOpen) await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
