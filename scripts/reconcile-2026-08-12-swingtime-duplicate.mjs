import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

// Optional reviewed plan reuses the original backup/transaction/ownership safeguards.
const planPath = process.argv.find((arg) => arg.startsWith('--plan='))?.slice(7);
const plan = planPath ? JSON.parse(await fs.readFile(planPath, 'utf8')) : {};
if (planPath && (!plan.keeperEventId || !plan.duplicateEventId || !plan.duplicateCandidateId || !plan.reviewedReason
  || plan.keeperEventId === plan.duplicateEventId)) throw new Error('Reviewed plan requires distinct event IDs, candidate ID, and source review reason.');
const KEEPER_EVENT_ID = plan.keeperEventId || '88469596-4057-44f2-af77-f3885fd2109e';
const DUPLICATE_EVENT_ID = plan.duplicateEventId || 'aeb67f2f-7b87-47a2-84f4-b980427beb16';
const DUPLICATE_CANDIDATE_ID = plan.duplicateCandidateId || '425656913055dbe5';
const DUPLICATE_NOTIFICATION_SOURCE_ID = `event-created:${DUPLICATE_EVENT_ID}`;
const APPLY = process.argv.includes('--apply');

function parseJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function backupFilename(now) {
  return `social-duplicate-${DUPLICATE_EVENT_ID}-${now.replace(/[:.]/g, '-')}.json`;
}

const { getMysqlPool } = await import('../server/cafe24/mysql-pool.js');
const {
  buildDuplicateScrapedEventRow,
  isHighConfidenceSocialDuplicate,
  findSocialOccurrenceConflict,
} = await import('../server/cafe24/function-api.js');

const { acquireEventMutationLock, releaseEventMutationLock } = await import('../server/cafe24/admin-event-deletion.js');
const pool = getMysqlPool();
const connection = await pool.getConnection();
let transactionOpen = false;
let mutationLocked = false;

try {
  if (APPLY) {
    await acquireEventMutationLock(connection);
    mutationLocked = true;
    await connection.beginTransaction();
    transactionOpen = true;
  }

  const lockSuffix = APPLY ? ' FOR UPDATE' : '';
  const [eventRows] = await connection.execute(
    `SELECT id, raw_json
       FROM events
      WHERE id IN (?, ?)${lockSuffix}`,
    [KEEPER_EVENT_ID, DUPLICATE_EVENT_ID],
  );
  const events = eventRows.map((row) => parseJson(row.raw_json, {}));
  const keeperEvent = events.find((row) => String(row.id) === KEEPER_EVENT_ID) || null;
  const duplicateEvent = events.find((row) => String(row.id) === DUPLICATE_EVENT_ID) || null;

  const [candidateRows] = await connection.execute(
    `SELECT record_id, data_json, created_at, updated_at
       FROM generic_records
      WHERE table_name = 'scraped_events' AND record_id = ?${lockSuffix}`,
    [DUPLICATE_CANDIDATE_ID],
  );
  const candidateRecord = candidateRows[0] || null;
  const candidate = parseJson(candidateRecord?.data_json, null);

  const [queueRows] = await connection.execute(
    `SELECT record_id, data_json, created_at, updated_at
       FROM generic_records
      WHERE table_name = 'notification_queue' AND record_id = ?${lockSuffix}`,
    [DUPLICATE_NOTIFICATION_SOURCE_ID],
  );
  const [notificationRows] = await connection.execute(
    `SELECT id, user_id, title, body, url, kind, source_id, data_json,
            is_read, read_at, created_at
       FROM user_notifications
      WHERE kind = 'new_event' AND source_id = ?${lockSuffix}`,
    [DUPLICATE_NOTIFICATION_SOURCE_ID],
  );
  const [favoriteRows] = await connection.execute(
    `SELECT record_id, data_json
       FROM generic_records
      WHERE table_name = 'event_favorites' AND data_json LIKE ?${lockSuffix}`,
    [`%${DUPLICATE_EVENT_ID}%`],
  );

  const [relatedCandidateRecords] = await connection.execute(
    `SELECT record_id, data_json, created_at, updated_at FROM generic_records
     WHERE table_name = 'scraped_events' AND (data_json LIKE ? OR record_id = ?)${lockSuffix}`,
    [`%${DUPLICATE_EVENT_ID}%`, plan.keeperCandidateId || ''],
  );
  const keeperCandidateRecord = relatedCandidateRecords.find((row) => row.record_id === plan.keeperCandidateId);
  const keeperCandidate = parseJson(keeperCandidateRecord?.data_json, null);

  const alreadyApplied = !duplicateEvent
    && candidate?.status === 'duplicate'
    && candidate?.is_collected === false
    && !candidate?.registered_event_id
    && !candidate?.structured_data?.registered_event_id;

  if (alreadyApplied) {
    if (APPLY && transactionOpen) {
      await connection.rollback();
      transactionOpen = false;
    }
    console.log(JSON.stringify({
      ok: true,
      applied: false,
      alreadyApplied: true,
      keeperEventId: KEEPER_EVENT_ID,
      duplicateEventId: DUPLICATE_EVENT_ID,
      candidateId: DUPLICATE_CANDIDATE_ID,
    }, null, 2));
    process.exitCode = 0;
  } else {
    if (!keeperEvent || !duplicateEvent || !candidateRecord || !candidate) {
      throw new Error('Expected keeper event, duplicate event, and collected candidate were not all found.');
    }
    if (plan.reviewedReason) {
      if (!findSocialOccurrenceConflict(duplicateEvent, [keeperEvent])
        || !findSocialOccurrenceConflict(candidate, [keeperEvent])) {
        throw new Error('Reviewed events no longer share a social occurrence date and venue.');
      }
    } else if (!isHighConfidenceSocialDuplicate(keeperEvent, candidate)
      || !isHighConfidenceSocialDuplicate(keeperEvent, duplicateEvent)) {
      throw new Error('Events no longer satisfy the high-confidence duplicate contract.');
    }
    if (plan.keeperTitle && (!keeperCandidate
      || String(keeperCandidate.registered_event_id || keeperCandidate.structured_data?.registered_event_id) !== KEEPER_EVENT_ID)) {
      throw new Error('Keeper correction requires its exact registered candidate.');
    }
    if (String(candidate.registered_event_id || candidate.structured_data?.registered_event_id || '') !== DUPLICATE_EVENT_ID) {
      throw new Error('Candidate registration link does not point to the exact duplicate event.');
    }
    if (favoriteRows.length > 0) {
      throw new Error('Duplicate event has favorites; manual ownership review is required before deletion.');
    }

    const duplicateDescriptor = {
      target: 'events',
      existingId: KEEPER_EVENT_ID,
      existingTitle: plan.keeperTitle || keeperEvent.title,
      existingDate: String(keeperEvent.start_date || keeperEvent.date || '').slice(0, 10),
      existingSourceUrl: keeperEvent.link1 || null,
      reason: plan.reviewedReason || '같은 날짜·장소·활동·DJ의 소셜',
    };
    const now = new Date().toISOString();
    const duplicateCandidate = buildDuplicateScrapedEventRow({
      scrapedEvent: candidate,
      duplicate: duplicateDescriptor,
      now,
    });
    const preview = {
      ok: true,
      applied: APPLY,
      alreadyApplied: false,
      keeperEvent: {
        id: keeperEvent.id,
        title: plan.keeperTitle || keeperEvent.title,
        sourceUrl: keeperEvent.link1 || null,
      },
      duplicateEvent: {
        id: duplicateEvent.id,
        title: duplicateEvent.title,
        sourceUrl: duplicateEvent.link1 || null,
      },
      candidateTransition: {
        id: candidate.id,
        from: candidate.status || (candidate.is_collected ? 'collected' : 'pending'),
        to: 'duplicate',
        duplicateOf: KEEPER_EVENT_ID,
      },
      preservedQueueRecords: queueRows.length,
      removableInboxRecords: notificationRows.length,
      favoriteRecords: favoriteRows.length,
    };

    if (!APPLY) {
      console.log(JSON.stringify(preview, null, 2));
    } else {
      const backupRoot = path.resolve(
        process.env.CAFE24_BACKUP_DIR || path.join(process.cwd(), 'backups', 'data-fixes'),
      );
      await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
      const backupPath = path.join(backupRoot, backupFilename(now));
      await fs.writeFile(backupPath, `${JSON.stringify({
        createdAt: now,
        reason: plan.reviewedReason || 'Swingtime cross-source social duplicate remediation',
        relatedCandidateRecords,
        candidateRecord,
        keeperEvent,
        duplicateEvent,
        candidate,
        notificationQueueRows: queueRows,
        userNotificationRows: notificationRows,
        favoriteRows,
      }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

      if (plan.keeperTitle) {
        const correctedEvent = { ...keeperEvent, title: plan.keeperTitle, updated_at: now };
        await connection.execute('UPDATE events SET title = ?, raw_json = ?, updated_at = ? WHERE id = ?',
          [correctedEvent.title, JSON.stringify(correctedEvent), toMysqlDateTime(now), KEEPER_EVENT_ID]);
        const correctedCandidate = {
          ...keeperCandidate,
          structured_data: { ...keeperCandidate.structured_data, title: plan.keeperTitle,
            ...(Array.isArray(plan.keeperDjs) ? { djs: plan.keeperDjs } : {}) },
          updated_at: now,
        };
        await connection.execute("UPDATE generic_records SET data_json = ?, updated_at = ? WHERE table_name = 'scraped_events' AND record_id = ?",
          [JSON.stringify(correctedCandidate), toMysqlDateTime(now), plan.keeperCandidateId]);
      }
      // Retarget existing duplicate evidence instead of leaving links to a removed event.
      for (const record of relatedCandidateRecords) {
        const related = parseJson(record.data_json, {});
        if (record.record_id === DUPLICATE_CANDIDATE_ID || related.status !== 'duplicate'
          || related.structured_data?._duplicate?.target !== 'events'
          || String(related.structured_data._duplicate.existingId) !== DUPLICATE_EVENT_ID) continue;
        const repaired = buildDuplicateScrapedEventRow({ scrapedEvent: related, duplicate: duplicateDescriptor, now });
        await connection.execute("UPDATE generic_records SET data_json = ?, updated_at = ? WHERE table_name = 'scraped_events' AND record_id = ?",
          [JSON.stringify(repaired), toMysqlDateTime(now), record.record_id]);
      }

      await connection.execute(
        `UPDATE generic_records
            SET data_json = ?, updated_at = ?, imported_at = CURRENT_TIMESTAMP
          WHERE table_name = 'scraped_events' AND record_id = ?`,
        [JSON.stringify(duplicateCandidate), toMysqlDateTime(now), DUPLICATE_CANDIDATE_ID],
      );
      const [notificationDelete] = await connection.execute(
        `DELETE FROM user_notifications
          WHERE kind = 'new_event' AND source_id = ?`,
        [DUPLICATE_NOTIFICATION_SOURCE_ID],
      );
      const [eventDelete] = await connection.execute(
        'DELETE FROM events WHERE id = ?',
        [DUPLICATE_EVENT_ID],
      );
      if (Number(eventDelete.affectedRows || 0) !== 1) {
        throw new Error(`Expected to delete one duplicate event, deleted ${eventDelete.affectedRows || 0}.`);
      }

      await connection.commit();
      transactionOpen = false;
      console.log(JSON.stringify({
        ...preview,
        backupPath,
        deletedEventRows: Number(eventDelete.affectedRows || 0),
        deletedInboxRows: Number(notificationDelete.affectedRows || 0),
        preservedCandidateImage: candidate.poster_url || null,
      }, null, 2));
    }
  }
} catch (error) {
  if (transactionOpen) await connection.rollback();
  throw error;
} finally {
  if (mutationLocked) await releaseEventMutationLock(connection);
  connection.release();
  await pool.end();
}
