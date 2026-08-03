import { getCurrentUser } from './auth-api.js';
import { loadCafe24TableRows } from './generic-data-api.js';
import { getMysqlPool } from './mysql-pool.js';

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function isTrue(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function recentVisibleFreePosts(rows, userId) {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return rows.filter((row) => {
    const createdAt = Date.parse(String(row.created_at || ''));
    return row.category === 'free'
      && !isTrue(row.is_hidden)
      && String(row.user_id || '') !== String(userId)
      && Number.isFinite(createdAt)
      && createdAt >= cutoff;
  });
}

export async function listUnreadFreeBoardPosts(req, res) {
  res.set?.('Cache-Control', 'no-store');
  const user = await getCurrentUser(req);
  if (!user?.id) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const recentPosts = recentVisibleFreePosts(await loadCafe24TableRows('board_posts'), user.id);
  if (recentPosts.length === 0) {
    res.json({ count: 0, unreadPostIds: [] });
    return;
  }

  const pool = getMysqlPool();
  const ids = recentPosts.map((post) => String(post.id));
  const placeholders = ids.map(() => '?').join(',');
  const [readRows] = await pool.execute(
    `SELECT post_id
       FROM user_board_post_reads
      WHERE user_id = ? AND post_id IN (${placeholders})`,
    [String(user.id), ...ids],
  );
  const readIds = new Set(readRows.map((row) => String(row.post_id)));
  const unreadPostIds = ids.filter((id) => !readIds.has(id));
  res.json({ count: unreadPostIds.length, unreadPostIds });
}

export async function markFreeBoardPostRead(req, res) {
  res.set?.('Cache-Control', 'no-store');
  const user = await getCurrentUser(req);
  if (!user?.id) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const postId = String(req.body?.postId || '').trim();
  if (!postId) {
    res.status(400).json({ error: 'postId is required' });
    return;
  }

  const post = (await loadCafe24TableRows('board_posts'))
    .find((row) => String(row.id) === postId && row.category === 'free');
  if (!post) {
    res.status(404).json({ error: '자유게시판 글을 찾을 수 없습니다.' });
    return;
  }

  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO user_board_post_reads (user_id, post_id, read_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [String(user.id), postId],
  );
  res.json({ ok: true, postId });
}
