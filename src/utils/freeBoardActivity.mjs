// Shared by the member API and guest UI so both count the same public activity.
export const FREE_BOARD_RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isHiddenBoardActivity(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function parseReadCommentIds(value) {
    try {
        const ids = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(ids) ? ids.map(String) : [];
    } catch {
        return [];
    }
}

export function getFreeBoardUnreadActivity(posts, comments, readPostIds, readCommentIds, userIds = [], now = Date.now()) {
    const ownIds = new Set(userIds.map(String));
    const cutoff = now - FREE_BOARD_RECENT_WINDOW_MS;
    const isRecent = row => {
        const created = Date.parse(row.created_at || '');
        return Number.isFinite(created) && created >= cutoff && created <= now;
    };
    const visiblePosts = posts.filter(post => post.category === 'free' && !isHiddenBoardActivity(post.is_hidden));
    const visiblePostIds = new Set(visiblePosts.map(post => String(post.id)));
    const unreadPostIds = visiblePosts.filter(post => isRecent(post)
        && !ownIds.has(String(post.user_id)) && !readPostIds.has(String(post.id))).map(post => String(post.id));
    const unreadCommentCounts = {};
    for (const comment of comments) {
        const postId = String(comment.post_id);
        if (!visiblePostIds.has(postId) || isHiddenBoardActivity(comment.is_hidden) || !isRecent(comment)
            || ownIds.has(String(comment.user_id)) || readCommentIds.has(String(comment.id))) continue;
        unreadCommentCounts[postId] = (unreadCommentCounts[postId] || 0) + 1;
    }
    const commentCount = Object.values(unreadCommentCounts).reduce((sum, count) => sum + count, 0);
    return { count: unreadPostIds.length + commentCount, unreadPostIds, unreadCommentCounts };
}
