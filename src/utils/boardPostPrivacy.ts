type BoardPostAuthor = {
    is_anonymous?: boolean;
    author_name?: string | null;
    author_nickname?: string | null;
};

export function getBoardPostAuthorLabel(
    post: BoardPostAuthor,
    isAdmin: boolean,
    fallback = '알 수 없음',
) {
    if (post.is_anonymous && !isAdmin) return '익명';
    return post.author_nickname || post.author_name || fallback;
}

export function canShowBoardPostAuthorProfile(post: BoardPostAuthor, isAdmin: boolean) {
    return !post.is_anonymous || isAdmin;
}
