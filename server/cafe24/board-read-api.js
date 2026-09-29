import { getCurrentUser } from './auth-api.js';
import { loadCafe24TableRows } from './generic-data-api.js';
import { getMysqlPool } from './mysql-pool.js';
import { canViewHiddenBoardPost } from './board-post-security.js';
import { userIdentitySet } from './event-security.js';
import { FREE_BOARD_RECENT_WINDOW_MS, getFreeBoardUnreadActivity, isHiddenBoardActivity, parseReadCommentIds } from '../../src/utils/freeBoardActivity.mjs';

// Legacy rows used read_at for the whole displayed detail. Once a snapshot exists,
// body-only reads must never advance comment reads.
function savedCommentIds(row, comments) {
  if (row?.read_comment_ids != null) return parseReadCommentIds(row.read_comment_ids);
  const readAt = row?.read_at_unix != null ? Number(row.read_at_unix) * 1000 : new Date(row?.read_at || 0).getTime();
  return comments.filter(comment => String(comment.post_id) === String(row?.post_id)
    && Date.parse(comment.created_at || '') <= readAt).map(comment => String(comment.id));
}

export async function listUnreadFreeBoardPosts(req, res) {
  res.set?.('Cache-Control', 'no-store');
  const user = await getCurrentUser(req);
  if (!user?.id) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const posts = (await loadCafe24TableRows('board_posts')).filter(post => post.category === 'free' && !isHiddenBoardActivity(post.is_hidden));
  if (posts.length === 0) {
    res.json({ count: 0, unreadPostIds: [], unreadCommentCounts: {} });
    return;
  }

  const pool = getMysqlPool();
  const ids = posts.map((post) => String(post.id));
  const placeholders = ids.map(() => '?').join(',');
  const [readRows] = await pool.execute(
    `SELECT post_id, UNIX_TIMESTAMP(read_at) AS read_at_unix, read_comment_ids
       FROM user_board_post_reads
      WHERE user_id = ? AND post_id IN (${placeholders})`,
    [String(user.id), ...ids],
  );
  const readIds = new Set(readRows.map((row) => String(row.post_id)));
  const comments = await loadCafe24TableRows('board_comments');
  const readCommentIds = new Set(readRows.flatMap(row => savedCommentIds(row, comments)));
  res.json(getFreeBoardUnreadActivity(posts, comments, readIds, readCommentIds, [...userIdentitySet(user)]));
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
  if (!canViewHiddenBoardPost(post, user)) {
    res.status(403).json({ error: '이 글을 읽을 수 없습니다.' });
    return;
  }

  if (req.body?.commentIds !== undefined && (!Array.isArray(req.body.commentIds)
      || req.body.commentIds.some(id => typeof id !== 'string' && typeof id !== 'number'))) {
    res.status(400).json({ error: 'commentIds must be an array of IDs' });
    return;
  }
  const now = Date.now();
  const comments = (await loadCafe24TableRows('board_comments'))
    .filter(comment => String(comment.post_id) === postId && !isHiddenBoardActivity(comment.is_hidden));
  const validIds = new Set(comments.filter(comment => {
    const createdAt = Date.parse(comment.created_at || '');
    return createdAt >= now - FREE_BOARD_RECENT_WINDOW_MS && createdAt <= now;
  }).map(comment => String(comment.id)));
  const requestedIds = (req.body?.commentIds || []).map(String).filter(id => validIds.has(id));
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    // Serialize concurrent tabs without moving a legacy read_at before snapshotting it.
    await connection.execute(
      `INSERT INTO user_board_post_reads (user_id, post_id, read_at, read_comment_ids)
       VALUES (?, ?, CURRENT_TIMESTAMP, '[]') ON DUPLICATE KEY UPDATE post_id = VALUES(post_id)`,
      [String(user.id), postId]);
    const [rows] = await connection.execute(
      'SELECT post_id, UNIX_TIMESTAMP(read_at) AS read_at_unix, read_comment_ids FROM user_board_post_reads WHERE user_id = ? AND post_id = ? FOR UPDATE',
      [String(user.id), postId]);
    const merged = [...new Set([...savedCommentIds(rows[0], comments), ...requestedIds])];
    await connection.execute(
      'UPDATE user_board_post_reads SET read_at = CURRENT_TIMESTAMP, read_comment_ids = ? WHERE user_id = ? AND post_id = ?',
      [JSON.stringify(merged), String(user.id), postId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ ok: true, postId });
}
