#!/usr/bin/env node
import 'dotenv/config';
import { getMysqlPool } from '../../server/cafe24/mysql-pool.js';
import {
  classifyConfirmedBenefitEvent,
  isEvergreenBenefitCandidate,
} from './candidate-utils.mjs';

const apply = process.argv.includes('--apply');
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
  const evergreen = Boolean(benefitKind) && isEvergreenBenefitCandidate(candidate);

  if (benefitKind) {
    structuredData.benefit_eligible = true;
    structuredData.benefit_kind = benefitKind;
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
    benefit_eligible: left.benefit_eligible,
    benefit_kind: left.benefit_kind,
    benefit_lifecycle: left.benefit_lifecycle,
    ongoing_sale: left.ongoing_sale,
    source_post_date: left.source_post_date,
  }) !== JSON.stringify({
    benefit_eligible: right.benefit_eligible,
    benefit_kind: right.benefit_kind,
    benefit_lifecycle: right.benefit_lifecycle,
    ongoing_sale: right.ongoing_sale,
    source_post_date: right.source_post_date,
  });
}

try {
  const [records] = await pool.execute(
    `SELECT record_id, data_json
       FROM generic_records
      WHERE table_name = 'scraped_events'
      ORDER BY created_at, record_id`,
  );
  const rows = records
    .map(record => ({ record, row: parseJson(record.data_json) }))
    .filter(item => item.row);
  const updates = rows
    .map(item => ({ ...item, next: classifyRow(item.row) }))
    .filter(item => changed(item.row, item.next));

  const counts = {};
  for (const item of updates) {
    const kind = item.next.structured_data?.benefit_kind || 'not_benefit';
    const lifecycle = item.next.structured_data?.benefit_lifecycle || 'none';
    const key = `${kind}:${lifecycle}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  if (apply) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of updates) {
        item.next.updated_at = new Date().toISOString();
        await connection.execute(
          `UPDATE generic_records
              SET data_json = ?, updated_at = CURRENT_TIMESTAMP, imported_at = CURRENT_TIMESTAMP
            WHERE table_name = 'scraped_events' AND record_id = ?`,
          [JSON.stringify(item.next), item.record.record_id],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned: rows.length,
    changed: updates.length,
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
