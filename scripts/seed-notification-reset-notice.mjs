import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';

export const NOTIFICATION_RESET_NOTICE = Object.freeze({
  title: '알림 기능 재설정 안내',
  body: '알람기능이 재설정되었습니다. 사용하기위해서는 재설정 저장해주세요',
  sourceId: 'notification-settings-reset-20260803',
});

export async function seedNotificationResetNotice() {
  const pool = getMysqlPool();
  const [result] = await pool.execute(
    `INSERT IGNORE INTO user_notifications (
       user_id, title, body, url, kind, source_id, data_json, is_read
     )
     SELECT id, ?, ?, '/', 'system_notice', ?, ?, 0
       FROM users`,
    [
      NOTIFICATION_RESET_NOTICE.title,
      NOTIFICATION_RESET_NOTICE.body,
      NOTIFICATION_RESET_NOTICE.sourceId,
      JSON.stringify({ action: 'open-notification-settings' }),
    ],
  );
  return {
    status: 'ok',
    insertedNotices: Number(result?.affectedRows || 0),
    sourceId: NOTIFICATION_RESET_NOTICE.sourceId,
    pushTargets: 0,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    console.log(JSON.stringify(await seedNotificationResetNotice()));
  } finally {
    await getMysqlPool().end();
  }
}
