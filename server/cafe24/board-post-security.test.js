import { describe, expect, it } from 'vitest';
import {
  canViewHiddenBoardPost,
  sanitizeBoardPostForViewer,
} from './board-post-security.js';

const hiddenPost = {
  id: 'hidden-post',
  title: '작성자만 볼 제목',
  content: '<p>작성자만 볼 내용</p>',
  author_name: '비공개 작성자',
  author_nickname: '비공개 작성자',
  user_id: 'author-1',
  category: 'free',
  prefix_id: 'prefix-request',
  prefix: { id: 'prefix-request', name: '건의', color: '#f59e0b' },
  image: 'https://example.com/private.jpg',
  image_thumbnail: 'https://example.com/private-thumb.jpg',
  is_hidden: true,
  created_at: '2026-08-13T04:49:00.000Z',
  views: 3,
  comment_count: 1,
};

describe('hidden board post privacy', () => {
  it('returns only placeholder metadata to guests and other users', () => {
    for (const viewer of [null, { id: 'other-user' }]) {
      const result = sanitizeBoardPostForViewer(hiddenPost, viewer);

      expect(result).toMatchObject({
        id: 'hidden-post',
        is_hidden: true,
        category: 'free',
        prefix_id: 'prefix-request',
      });
      expect(result).not.toHaveProperty('title');
      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('author_name');
      expect(result).not.toHaveProperty('author_nickname');
      expect(result).not.toHaveProperty('user_id');
      expect(result).not.toHaveProperty('image');
      expect(result).not.toHaveProperty('image_thumbnail');
    }
  });

  it('returns the complete post only to its author and administrators', () => {
    expect(canViewHiddenBoardPost(hiddenPost, { id: 'author-1' })).toBe(true);
    expect(canViewHiddenBoardPost(hiddenPost, { id: 'admin-1', is_admin: true })).toBe(true);
    expect(sanitizeBoardPostForViewer(hiddenPost, { id: 'author-1' })).toMatchObject({
      title: hiddenPost.title,
      content: hiddenPost.content,
      user_id: 'author-1',
    });
    expect(sanitizeBoardPostForViewer(hiddenPost, { id: 'admin-1', is_admin: true })).toMatchObject({
      title: hiddenPost.title,
      content: hiddenPost.content,
      user_id: 'author-1',
    });
  });

  it('keeps public posts visible while stripping secret-like fields', () => {
    const result = sanitizeBoardPostForViewer({
      ...hiddenPost,
      is_hidden: false,
      token: 'never-return-this',
    });

    expect(result.title).toBe(hiddenPost.title);
    expect(result.content).toBe(hiddenPost.content);
    expect(result).not.toHaveProperty('token');
  });
});
