import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadCafe24TableRows: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('./auth-api.js', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('./generic-data-api.js', () => ({ loadCafe24TableRows: mocks.loadCafe24TableRows }));
vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: mocks.execute }) }));

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

describe('free board per-user read state', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 'reader-a' });
    mocks.loadCafe24TableRows.mockResolvedValue([
      { id: 'post-unread', category: 'free', user_id: 'author-a', created_at: new Date().toISOString(), is_hidden: false },
      { id: 'post-read', category: 'free', user_id: 'author-b', created_at: new Date().toISOString(), is_hidden: false },
      { id: 'post-own', category: 'free', user_id: 'reader-a', created_at: new Date().toISOString(), is_hidden: false },
      { id: 'post-hidden', category: 'free', user_id: 'author-c', created_at: new Date().toISOString(), is_hidden: 1 },
    ]);
  });

  it('returns only posts that the current user has not read', async () => {
    mocks.execute.mockResolvedValueOnce([[{ post_id: 'post-read' }]]);
    const { listUnreadFreeBoardPosts } = await import('./board-read-api.js');
    const res = response();

    await listUnreadFreeBoardPosts({}, res);

    expect(res.json).toHaveBeenCalledWith({ count: 1, unreadPostIds: ['post-unread'] });
  });

  it('marks a post read only for the signed-in user', async () => {
    mocks.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { markFreeBoardPostRead } = await import('./board-read-api.js');
    const res = response();

    await markFreeBoardPostRead({ body: { postId: 'post-unread' } }, res);

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_board_post_reads'),
      ['reader-a', 'post-unread'],
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, postId: 'post-unread' });
  });
});
