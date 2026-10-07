#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { acquireEventMutationLock, releaseEventMutationLock } from '../../server/cafe24/admin-event-deletion.js';
import { benefitFieldsFromStructuredData } from '../../server/cafe24/ingestion-benefit-fields.js';
import { getMysqlPool } from '../../server/cafe24/mysql-pool.js';
import {
  classifyConfirmedBenefitEvent,
  getCandidateBenefitDescription,
  getCandidateBenefitDetails,
  isEvergreenBenefitCandidate,
} from './candidate-utils.mjs';

const apply = process.argv.includes('--apply');
const ids = (process.argv.find(arg => arg.startsWith('--ids=')) || '').slice(6).split(',').filter(Boolean);
const syncEvents = process.argv.includes('--sync-events');
if (syncEvents && !ids.length) throw new Error('--sync-events requires reviewed --ids');
const pool = getMysqlPool();

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function classifyRow(row) {
  const structuredData = { ...(row.structured_data || {}) };
  const candidate = { ...row, structured_data: structuredData };
  const benefitKind = classifyConfirmedBenefitEvent(candidate);
  const details = getCandidateBenefitDetails(candidate);
  if (details) structuredData.benefit_details = details;
  else delete structuredData.benefit_details;
  const evergreen = Boolean(benefitKind) && isEvergreenBenefitCandidate(candidate);

  if (benefitKind) {
    structuredData.benefit_eligible = true;
    structuredData.benefit_kind = benefitKind;
    if (benefitKind === 'free_event') structuredData.description = getCandidateBenefitDescription(candidate);
    structuredData.benefit_lifecycle = evergreen ? 'evergreen' : 'date_bound';
    if (evergreen) {
      structuredData.ongoing_sale = true;
      const sourceDate = String(structuredData.source_post_date || structuredData.date || '').slice(0, 10);
      if (sourceDate) structuredData.source_post_date = sourceDate;
    } else {
      delete structuredData.ongoing_sale;
    }
  } else {
    delete structuredData.benefit_eligible;
    delete structuredData.benefit_kind;
    delete structuredData.benefit_lifecycle;
    delete structuredData.ongoing_sale;
  }

  return { ...row, structured_data: structuredData };
}

function changed(before, after) {
  const left = before.structured_data || {};
  const right = after.structured_data || {};
  return JSON.stringify({
    description: left.description,
    benefit_details: left.benefit_details,
    benefit_eligible: left.benefit_eligible,
    benefit_kind: left.benefit_kind,
    benefit_lifecycle: left.benefit_lifecycle,
    ongoing_sale: left.ongoing_sale,
    source_post_date: left.source_post_date,
  }) !== JSON.stringify({
    description: right.description,
    benefit_details: right.benefit_details,
    benefit_eligible: right.benefit_eligible,
    benefit_kind: right.benefit_kind,
    benefit_lifecycle: right.benefit_lifecycle,
    ongoing_sale: right.ongoing_sale,
    source_post_date: right.source_post_date,
  });
}

try {
  const [records] = await pool.execute(
    `SELECT *
       FROM generic_records
      WHERE table_name = 'scraped_events'${ids.length ? ` AND record_id IN (${ids.map(() => '?').join(',')})` : ''}
      ORDER BY created_at, record_id`,
    ids,
  );
  if (ids.length && records.length !== new Set(ids).size) throw new Error('A selected candidate is missing');
  const rows = records
    .map(record => ({ record, row: parseJson(record.data_json) }))
    .filter(item => item.row);
  assert.equal(rows.length, records.length, 'Invalid candidate JSON; refusing partial repair');
  const classified = rows
    .map(item => ({ ...item, next: classifyRow(item.row) }));
  const updates = classified.filter(item => changed(item.row, item.next));
  const eventUpdates = [];
  if (syncEvents) {
    for (const item of classified) {
      const id = item.row.registered_event_id || item.row.structured_data?.registered_event_id;
      if (!id) continue;
      assert.equal(item.row.status, 'collected');
      assert.equal(item.row.is_collected, true);
      const [eventRows] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
      assert.equal(eventRows.length, 1);
      const record = eventRows[0];
      const event = parseJson(record.raw_json);
      assert.equal(event.link1, item.row.source_url, 'Source link changed; review required');
      assert.equal(String(event.date).slice(0, 10), item.row.structured_data.date);
      const next = { ...event, ...benefitFieldsFromStructuredData(item.next.structured_data) };
      if (item.next.structured_data.benefit_kind === 'free_event') {
        next.description = getCandidateBenefitDescription({ ...item.row,
          structured_data: { ...item.next.structured_data, description: event.description } });
      }
      if (JSON.stringify(event) !== JSON.stringify(next)) eventUpdates.push({ record, event, next });
    }
  }

  const counts = {};
  for (const item of updates) {
    const kind = item.next.structured_data?.benefit_kind || 'not_benefit';
    const lifecycle = item.next.structured_data?.benefit_lifecycle || 'none';
    const key = `${kind}:${lifecycle}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  let backupPath = null;
  if (apply && (updates.length || eventUpdates.length)) {
    const connection = await pool.getConnection();
    let locked = false;
    try {
      await acquireEventMutationLock(connection);
      locked = true;
      await connection.beginTransaction();
      // Refuse concurrent source/manual changes rather than overwriting them.
      for (const item of classified) {
        const [current] = await connection.execute("SELECT data_json FROM generic_records WHERE table_name = 'scraped_events' AND record_id = ? FOR UPDATE", [item.record.record_id]);
        assert.deepEqual(parseJson(current[0]?.data_json), item.row);
      }
      for (const item of eventUpdates) {
        const [current] = await connection.execute('SELECT raw_json FROM events WHERE id = ? FOR UPDATE', [item.event.id]);
        assert.deepEqual(parseJson(current[0]?.raw_json), item.event);
      }
      const now = new Date().toISOString();
      const backupRoot = path.resolve(process.env.CAFE24_BACKUP_DIR || 'backups/data-fixes');
      await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
      backupPath = path.join(backupRoot, `benefit-scope-${now.replace(/[:.]/g, '-')}.json`);
      await fs.writeFile(backupPath, JSON.stringify({ createdAt: now,
        candidates: updates.map(item => item.record), events: eventUpdates.map(item => item.record) }, null, 2), { flag: 'wx', mode: 0o600 });
      for (const item of updates) {
        item.next.updated_at = now;
        const [result] = await connection.execute(
          `UPDATE generic_records SET data_json = ?, updated_at = CURRENT_TIMESTAMP, imported_at = CURRENT_TIMESTAMP
           WHERE table_name = 'scraped_events' AND record_id = ?`,
          [JSON.stringify(item.next), item.record.record_id]);
        assert.equal(result.affectedRows, 1);
        const [check] = await connection.execute("SELECT data_json FROM generic_records WHERE table_name = 'scraped_events' AND record_id = ?", [item.record.record_id]);
        assert.deepEqual(parseJson(check[0].data_json), item.next);
      }
      for (const item of eventUpdates) {
        item.next.updated_at = now;
        const [result] = await connection.execute(
          'UPDATE events SET raw_json = ?, updated_at = CURRENT_TIMESTAMP, imported_at = CURRENT_TIMESTAMP WHERE id = ?',
          [JSON.stringify(item.next), item.event.id]);
        assert.equal(result.affectedRows, 1);
        const [check] = await connection.execute('SELECT raw_json FROM events WHERE id = ?', [item.event.id]);
        assert.deepEqual(parseJson(check[0].raw_json), item.next);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      if (locked) await releaseEventMutationLock(connection);
      connection.release();
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned: rows.length,
    changed: updates.length,
    eventChanges: eventUpdates.map(item => ({ id: item.event.id, before: item.event.benefit_kind,
      after: item.next.benefit_kind, descriptionChanged: item.event.description !== item.next.description })),
    backupPath,
    counts,
    samples: updates.slice(0, 20).map(item => ({
      id: item.record.record_id,
      date: item.next.structured_data?.date || '',
      title: item.next.structured_data?.title || '',
      benefitKind: item.next.structured_data?.benefit_kind || null,
      lifecycle: item.next.structured_data?.benefit_lifecycle || null,
    })),
  }, null, 2));
} finally {
  await pool.end();
}
