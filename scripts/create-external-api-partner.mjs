import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import { SITE_GENRES_BY_CATEGORY } from '../server/cafe24/external-events-api.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const name = String(readArg('name') || '').trim();
const category = String(readArg('category') || '').trim();
const genre = String(readArg('genre') || '').trim();
const ownerUserId = String(readArg('owner-user-id') || '').trim();
const perMinuteLimit = Number(readArg('per-minute-limit') || 10);
const dailyLimit = Number(readArg('daily-limit') || 200);

if (!name || !ownerUserId) {
  fail('사용법: npm run external-api:create-partner -- --name "파트너명" --owner-user-id "연결할 회원 ID" [--category class --genre "린디합"]');
} else if (Boolean(category) !== Boolean(genre)) {
  fail('기본 분류를 지정하려면 category와 genre를 함께 입력해야 합니다.');
} else if (category && !SITE_GENRES_BY_CATEGORY[category]) {
  fail(`category는 ${Object.keys(SITE_GENRES_BY_CATEGORY).join(', ')} 중 하나여야 합니다.`);
} else if (category && !SITE_GENRES_BY_CATEGORY[category].includes(genre)) {
  fail(`${category}에서 사용할 수 있는 genre는 ${SITE_GENRES_BY_CATEGORY[category].join(', ')}입니다.`);
} else if (!Number.isInteger(perMinuteLimit) || perMinuteLimit < 1 || !Number.isInteger(dailyLimit) || dailyLimit < 1) {
  fail('호출 한도는 1 이상의 정수여야 합니다.');
} else {
  const pool = getMysqlPool();
  const id = crypto.randomUUID();
  const prefix = crypto.randomBytes(6).toString('hex');
  const apiKey = `rj_live_${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  try {
    const [ownerRows] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [ownerUserId]);
    if (!ownerRows[0]) throw new Error('연결할 회원 ID를 찾을 수 없습니다.');
    await pool.execute(
      `INSERT INTO external_api_partners
         (id, name, key_prefix, key_hash, default_category, default_genre,
          owner_user_id, per_minute_limit, daily_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, prefix, keyHash, category, genre, ownerUserId, perMinuteLimit, dailyLimit],
    );
    console.log(JSON.stringify({
      partner_id: id,
      name,
      owner_user_id: ownerUserId,
      default_category: category || null,
      default_genre: genre || null,
      api_key: apiKey,
      warning: '이 API Key는 다시 조회할 수 없습니다. 안전한 비밀 저장소에 보관하세요.',
    }, null, 2));
  } finally {
    await pool.end();
  }
}
