import { userMatchesId } from './event-security.js';

const NEVER_EXPOSE_BOARD_POST_FIELDS = [
  'password',
  'password_hash',
  'access_token',
  'refresh_token',
  'token',
];

// Hidden rows stay in list pagination, but their author, title, body and media
// must never leave the server for anyone except the author and administrators.
const HIDDEN_BOARD_POST_PLACEHOLDER_FIELDS = [
  'id',
  'is_hidden',
  'created_at',
  'is_notice',
  'display_order',
  'category',
  'prefix_id',
  'prefix',
  'views',
  'comment_count',
  'likes',
  'favorites',
  'dislikes',
];

const ANONYMOUS_BOARD_POST_AUTHOR_FIELDS = [
  'author_profile_image',
  'board_users',
];

function isTrue(value) {
  return value === true
    || value === 1
    || value === '1'
    || String(value || '').toLowerCase() === 'true';
}

export function canViewHiddenBoardPost(post, user = null) {
  return Boolean(
    !isTrue(post?.is_hidden)
    || user?.is_admin
    || userMatchesId(user, post?.user_id)
  );
}

export function sanitizeBoardPostForViewer(post, user = null) {
  if (!post) return post;

  const next = { ...post };
  for (const field of NEVER_EXPOSE_BOARD_POST_FIELDS) delete next[field];

  if (!canViewHiddenBoardPost(next, user)) {
    const placeholder = {};
    for (const field of HIDDEN_BOARD_POST_PLACEHOLDER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(next, field)) {
        placeholder[field] = next[field];
      }
    }
    placeholder.is_hidden = true;
    return placeholder;
  }

  if (isTrue(next.is_anonymous) && !isTrue(user?.is_admin)) {
    const isAuthor = userMatchesId(user, next.user_id);
    next.author_name = '익명';
    next.author_nickname = '익명';
    for (const field of ANONYMOUS_BOARD_POST_AUTHOR_FIELDS) delete next[field];
    if (!isAuthor) delete next.user_id;
  }

  return next;
}

export function sanitizeBoardPostsForViewer(posts, user = null) {
  return (posts || []).map((post) => sanitizeBoardPostForViewer(post, user));
}
