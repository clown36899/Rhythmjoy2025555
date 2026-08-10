import crypto from 'node:crypto';

const PUSH_SUBSCRIPTION_KEY_PREFIX = 'push:';

export function getPushSubscriptionRecordId(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  return `${PUSH_SUBSCRIPTION_KEY_PREFIX}${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function isPushSubscriptionRecordId(value) {
  return /^push:[a-f0-9]{64}$/i.test(String(value || ''));
}

function rowTimestamp(row) {
  const candidates = [row?.updated_at, row?.created_at, row?.imported_at]
    .map((value) => value ? new Date(value).getTime() : 0)
    .filter(Number.isFinite);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function parseSubscriptionRow(row) {
  try {
    const data = typeof row?.data_json === 'string'
      ? JSON.parse(row.data_json)
      : row?.data_json;
    const endpoint = String(data?.endpoint || '').trim();
    return endpoint ? { ...row, data, endpoint } : null;
  } catch {
    return null;
  }
}

/**
 * Migrate legacy raw/truncated endpoint record IDs without relying on MySQL JSON
 * functions. Cafe24's production MySQL version does not provide JSON_UNQUOTE.
 */
export async function migratePushSubscriptionRecordKeys(pool) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rawRows] = await connection.execute(
      `SELECT record_id, data_json, created_at, updated_at, imported_at
         FROM generic_records
        WHERE table_name = ?
        FOR UPDATE`,
      ['user_push_subscriptions'],
    );

    const endpointGroups = new Map();
    let invalidRows = 0;
    for (const rawRow of rawRows) {
      const row = parseSubscriptionRow(rawRow);
      if (!row) {
        invalidRows += 1;
        continue;
      }
      const group = endpointGroups.get(row.endpoint) || [];
      group.push(row);
      endpointGroups.set(row.endpoint, group);
    }

    let canonicalWritten = 0;
    let legacyDeleted = 0;
    for (const [endpoint, rows] of endpointGroups) {
      const canonicalId = getPushSubscriptionRecordId(endpoint);
      const sourceRow = [...rows].sort((left, right) => {
        const timestampDiff = rowTimestamp(right) - rowTimestamp(left);
        if (timestampDiff !== 0) return timestampDiff;
        return Number(right.record_id === canonicalId) - Number(left.record_id === canonicalId);
      })[0];

      await connection.execute(
        `INSERT INTO generic_records (
           table_name, record_id, data_json, created_at, updated_at, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           data_json = VALUES(data_json),
           created_at = VALUES(created_at),
           updated_at = VALUES(updated_at),
           imported_at = VALUES(imported_at)`,
        [
          'user_push_subscriptions',
          canonicalId,
          JSON.stringify(sourceRow.data),
          sourceRow.created_at || null,
          sourceRow.updated_at || null,
          sourceRow.imported_at || new Date(),
        ],
      );
      canonicalWritten += 1;

      const legacyIds = rows
        .map((row) => String(row.record_id || ''))
        .filter((recordId) => recordId && recordId !== canonicalId);
      if (legacyIds.length > 0) {
        const [deleteResult] = await connection.query(
          `DELETE FROM generic_records
            WHERE table_name = ?
              AND record_id IN (${legacyIds.map(() => '?').join(',')})`,
          ['user_push_subscriptions', ...legacyIds],
        );
        legacyDeleted += Number(deleteResult?.affectedRows || 0);
      }
    }

    await connection.commit();
    transactionStarted = false;
    return {
      scanned: rawRows.length,
      endpoints: endpointGroups.size,
      canonicalWritten,
      legacyDeleted,
      invalidRows,
    };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
