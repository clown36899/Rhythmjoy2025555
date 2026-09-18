import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), loadCafe24TableRows: vi.fn(), execute: vi.fn(),
  getConnection: vi.fn(), txExecute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
}));
vi.mock('./auth-api.js', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('./generic-data-api.js', () => ({ loadCafe24TableRows: mocks.loadCafe24TableRows }));
vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: mocks.execute, getConnection: mocks.getConnection }) }));
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() });
let posts;
let comments;
const recent = () => new Date(Date.now() - 1000).toISOString();

describe('free board per-user read state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 'reader-a' });
    posts = [
      { id: 'post-unread', category: 'free', user_id: 'author-a', created_at: recent(), is_hidden: false },
      { id: 'post-read', category: 'free', user_id: 'author-b', created_at: recent(), is_hidden: false },
      { id: 'post-own', category: 'free', user_id: 'reader-a', created_at: recent(), is_hidden: false },
      { id: 'post-hidden', category: 'free', user_id: 'author-c', created_at: recent(), is_hidden: 1 },
    ];
    comments = [];
    mocks.loadCafe24TableRows.mockImplementation(async table => table === 'board_posts' ? posts : comments);
    mocks.execute.mockReset().mockResolvedValue([[{ post_id: 'post-read', read_comment_ids: '[]' }]]);
    mocks.txExecute.mockReset().mockImplementation(async sql => sql.startsWith('SELECT')
      ? [[{ post_id: 'post-unread', read_comment_ids: '[]' }]] : [{ affectedRows: 1 }]);
    mocks.getConnection.mockResolvedValue({ execute: mocks.txExecute, beginTransaction: mocks.beginTransaction,
      commit: mocks.commit, rollback: mocks.rollback, release: mocks.release });
  });

  it('returns only posts that the current user has not read', async () => {
    const { listUnreadFreeBoardPosts } = await import('./board-read-api.js');
    const res = response();
    await listUnreadFreeBoardPosts({}, res);
    expect(res.json).toHaveBeenCalledWith({ count: 1, unreadPostIds: ['post-unread'], unreadCommentCounts: {} });
  });

  it('marks a post read only for the signed-in user without consuming unseen comments', async () => {
    comments = [{ id: 'new-comment', post_id: 'post-unread', user_id: 'other', created_at: recent() }];
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    const res = response();
    await markFreeBoardPostRead({ body: { postId: 'post-unread' } }, res);
    expect(mocks.txExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_board_post_reads'), ['reader-a', 'post-unread']);
    expect(mocks.txExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_board_post_reads SET'), ['[]', 'reader-a', 'post-unread']);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ ok: true, postId: 'post-unread' });
  });

  it('counts recent replies on old and own posts, excluding own, hidden, deleted and expired replies', async () => {
    posts[1].created_at = '2020-01-01';
    comments = [
      { id: 'c1', post_id: 'post-read', user_id: 'other', created_at: recent() },
      { id: 'c2', post_id: 'post-read', user_id: 'other', created_at: recent() },
      { id: 'c3', post_id: 'post-own', user_id: 'other', created_at: recent() },
      { id: 'own', post_id: 'post-own', user_id: 'reader-a', created_at: recent() },
      { id: 'hidden', post_id: 'post-hidden', user_id: 'other', created_at: recent() },
      { id: 'hidden-comment', post_id: 'post-read', is_hidden: '1', created_at: recent() },
      { id: 'orphan', post_id: 'deleted-post', created_at: recent() },
      { id: 'old', post_id: 'post-read', created_at: '2020-01-01' },
    ];
    mocks.execute.mockResolvedValue([[{ post_id: 'post-read', read_comment_ids: '["c1"]' }]]);
    const { listUnreadFreeBoardPosts } = await import('./board-read-api.js');
    const res = response();
    await listUnreadFreeBoardPosts({}, res);
    expect(res.json).toHaveBeenCalledWith({ count: 3, unreadPostIds: ['post-unread'], unreadCommentCounts: { 'post-read': 1, 'post-own': 1 } });
  });

  it('preserves legacy read_at for comments already read before this feature', async () => {
    const before = new Date(Date.now() - 5000).toISOString();
    comments = [{ id: 'old-seen', post_id: 'post-read', created_at: before }, { id: 'new', post_id: 'post-read', created_at: recent() }];
    mocks.execute.mockResolvedValue([[{ post_id: 'post-read', read_comment_ids: null, read_at: new Date(Date.now() - 3000) }]]);
    const { listUnreadFreeBoardPosts } = await import('./board-read-api.js');
    const res = response();
    await listUnreadFreeBoardPosts({}, res);
    expect(res.json.mock.calls[0][0].unreadCommentCounts).toEqual({ 'post-read': 1 });
  });

  it('merges exact rendered IDs with concurrent reads and leaves later comments unread', async () => {
    comments = ['seen-in-other-tab', 'rendered', 'arrived-later'].map(id => ({ id, post_id: 'post-unread', created_at: recent() }));
    comments.push({ id: 'another-post', post_id: 'post-own', created_at: recent() });
    mocks.txExecute.mockImplementation(async sql => sql.startsWith('SELECT')
      ? [[{ post_id: 'post-unread', read_comment_ids: '["seen-in-other-tab"]' }]] : [{}]);
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    await markFreeBoardPostRead({ body: { postId: 'post-unread', commentIds: ['rendered', 'another-post', 'fake'] } }, response());
    expect(mocks.txExecute).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['reader-a', 'post-unread']);
    expect(mocks.txExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_board_post_reads SET'),
      ['["seen-in-other-tab","rendered"]', 'reader-a', 'post-unread']);
  });

  it('preserves a legacy comment baseline before moving the body read timestamp', async () => {
    comments = [{ id: 'old-seen', post_id: 'post-unread', created_at: new Date(Date.now() - 5000).toISOString() },
      { id: 'not-rendered', post_id: 'post-unread', created_at: recent() }];
    mocks.txExecute.mockImplementation(async sql => sql.startsWith('SELECT')
      ? [[{ post_id: 'post-unread', read_comment_ids: null, read_at: new Date(Date.now() - 3000) }]] : [{}]);
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    await markFreeBoardPostRead({ body: { postId: 'post-unread' } }, response());
    expect(mocks.txExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_board_post_reads SET'),
      ['["old-seen"]', 'reader-a', 'post-unread']);
  });

  it('rolls back failed snapshots and releases the connection for retry', async () => {
    mocks.txExecute.mockRejectedValueOnce(new Error('db unavailable'));
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    await expect(markFreeBoardPostRead({ body: { postId: 'post-unread', commentIds: [] } }, response())).rejects.toThrow('db unavailable');
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('rejects unauthorized hidden posts and invalid comment ID lists', async () => {
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    const hidden = response();
    await markFreeBoardPostRead({ body: { postId: 'post-hidden', commentIds: [] } }, hidden);
    expect(hidden.status).toHaveBeenCalledWith(403);
    const invalid = response();
    await markFreeBoardPostRead({ body: { postId: 'post-unread', commentIds: {} } }, invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
});
