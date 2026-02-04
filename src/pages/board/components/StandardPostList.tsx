// import { useAuth } from '../../../contexts/AuthContext';
// import { getAvatarStyle } from '../../../utils/avatarUtils'; // Removed due to resolution issue
import type { StandardBoardPost } from '../../../types/board';
import { type BoardCategory } from './BoardTabBar';
import './BoardPostList.css'; // Keep just in case, though board.css covers most
import '../board.css'; // CRITICAL: Import main board styles for standard-view classes

// Helper function inlined to avoid import issues
const getAvatarStyle = (userId: string | number | undefined, name: string) => {
    // Determine seed for consistency
    const seed = userId ? String(userId) : name;

    const colors = [
        '#FF8A65', '#9575CD', '#4DB6AC', '#64B5F6', '#AED581',
        '#FFD54F', '#A1887F', '#90A4AE', '#f06292', '#ba68c8'
    ];

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    const color = colors[Math.abs(hash) % colors.length];
    return { backgroundColor: color, color: 'var(--color-white)' };
};

interface StandardPostListProps {
    posts: StandardBoardPost[];
    onPostClick: (post: StandardBoardPost) => void;
    category: BoardCategory;
    likedPostIds?: Set<number | string>;
    onToggleLike?: (postId: number) => void;
    // Standard posts might not use dislikes heavily but let's keep it generally or omit if not needed.
    // BoardMainContainer has handleToggleDislike.
    dislikedPostIds?: Set<number | string>;
    onToggleDislike?: (postId: number) => void;
    favoritedPostIds?: Set<number | string>; // Added for favorites
    onToggleFavorite?: (postId: number) => void;
    isAdmin: boolean;
    selectedPrefixId?: number | null;
    onPrefixChange?: (prefixId: number | null) => void;
}

export default function StandardPostList({
    posts,
    onPostClick,
    likedPostIds,
    favoritedPostIds,
    onToggleLike,
    onToggleFavorite,
    isAdmin,
}: StandardPostListProps) {

    const truncateText = (text: string, maxLength: number) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    const notices = posts.filter(post => post.is_notice);
    const regularPosts = posts.filter(post => !post.is_notice);

    const renderPost = (post: StandardBoardPost) => (
        <div
            key={post.id}
            onClick={() => onPostClick(post)}
            className={`board-post-card ${post.is_notice ? 'board-post-card-notice' : 'board-post-card-normal'}`}
            style={{ opacity: (isAdmin && post.is_hidden) ? 0.6 : 1 }}
        >
            <div className="board-post-top-row">
                {post.image_thumbnail && (
                    <div className="board-post-thumbnail">
                        <img src={post.image_thumbnail} alt="thumbnail" loading="lazy" draggable={false} />
                    </div>
                )}

                <div className="board-post-main-content">
                    <div className="board-post-header">
                        {post.is_notice && (
                            <span className="board-notice-badge manual-label-wrapper">
                                <span className="translated-part">Notice</span>
                                <span className="fixed-part ko" translate="no">공지</span>
                                <span className="fixed-part en" translate="no">Notice</span>
                            </span>
                        )}
                        {isAdmin && post.is_hidden && (
                            <span className="board-hidden-badge" style={{
                                backgroundColor: '#6c757d', color: 'white', fontSize: '11px', padding: '2px 6px',
                                borderRadius: '4px', marginRight: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px'
                            }}>
                                <i className="ri-eye-off-line" style={{ fontSize: '12px' }}></i> 숨김
                            </span>
                        )}
                        {post.prefix && !post.is_notice && (
                            <span className="board-post-prefix manual-label-wrapper" style={{ color: post.prefix.color || '#fff' }}>
                                <span className="translated-part">{
                                    post.prefix.name === '잡담' ? 'Discussion' :
                                        post.prefix.name === '질문' ? 'Question' :
                                            post.prefix.name === '정보' ? 'Info' :
                                                post.prefix.name === '후기' ? 'Review' :
                                                    post.prefix.name === '건의/신청' ? 'Suggestion' :
                                                        post.prefix.name === '기타' ? 'Other' :
                                                            post.prefix.name
                                }</span>
                                <span className="fixed-part ko" translate="no">{post.prefix.name}</span>
                                <span className="fixed-part en" translate="no">{
                                    post.prefix.name === '잡담' ? 'Discussion' :
                                        post.prefix.name === '질문' ? 'Question' :
                                            post.prefix.name === '정보' ? 'Info' :
                                                post.prefix.name === '후기' ? 'Review' :
                                                    post.prefix.name === '건의/신청' ? 'Suggestion' :
                                                        post.prefix.name === '기타' ? 'Other' :
                                                            post.prefix.name
                                }</span>
                            </span>
                        )}
                        <h3 className={`board-post-title ${post.is_notice ? 'board-post-title-notice' : 'board-post-title-normal'}`}>
                            {post.title}
                        </h3>
                    </div>

                    {!post.is_notice && (
                        <p className="board-post-content">
                            {truncateText((post.content || '').replace(/<[^>]*>?/gm, ''), 100)}
                        </p>
                    )}
                </div>
            </div>

            <div className="board-post-meta">
                <div className="board-post-meta-left">
                    <div
                        className="board-post-author-avatar-container"
                        style={{
                            width: '10px', height: '10px', borderRadius: '50%', overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px',
                            ...getAvatarStyle(post.user_id, post.author_nickname || post.author_name)
                        }}
                    >
                        {post.author_profile_image ? (
                            <img src={post.author_profile_image} alt="author" className="board-post-author-avatar" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                        ) : (
                            <span style={{ fontSize: '9px', fontWeight: 'bold' }}>
                                {(post.author_nickname || post.author_name || '?').charAt(0)}
                            </span>
                        )}
                    </div>
                    <span className="board-post-meta-nickname">
                        {post.author_nickname || post.author_name || '알 수 없음'}
                    </span>
                    <span className="board-post-meta-separator">•</span>
                    <span className="board-post-meta-item">
                        {new Date(post.created_at).toLocaleDateString()}
                    </span>
                </div>

                <div className="board-post-meta-right">
                    <span className="board-post-meta-item">
                        <i className="ri-eye-line board-post-meta-icon"></i>
                        {post.views || 0}
                    </span>

                    {onToggleFavorite && (
                        <button
                            className={`board-post-like-btn ${favoritedPostIds?.has(post.id) ? 'liked' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(post.id); }}
                            style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }}
                            title="즐겨찾기"
                        >
                            <i className={favoritedPostIds?.has(post.id) ? "ri-star-fill board-post-meta-icon" : "ri-star-line board-post-meta-icon"}></i>
                            <span style={{ marginLeft: '4px' }}>{post.favorites || 0}</span>
                        </button>
                    )}
                    {onToggleLike && (
                        <button
                            className={`board-post-heart-btn ${likedPostIds?.has(post.id) ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onToggleLike(post.id); }}
                            style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }}
                            title="좋아요"
                        >
                            <i className={likedPostIds?.has(post.id) ? "ri-heart-fill board-post-meta-icon" : "ri-heart-line board-post-meta-icon"}></i>
                            <span style={{ marginLeft: '4px' }}>{post.likes || 0}</span>
                        </button>
                    )}

                    <span className="board-post-meta-item">
                        <i className="ri-chat-3-line board-post-meta-icon"></i>
                        {post.comment_count || 0}
                    </span>
                </div>
            </div>
        </div >
    );

    const isEmpty = posts.length === 0;

    const handleWriteClick = () => {
        window.dispatchEvent(new CustomEvent('boardWriteClick'));
    };

    if (isEmpty) {
        return (
            <div className="board-posts-list standard-mode">
                <div className="board-empty-state" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '60px 20px',
                    color: '#888',
                    gap: '16px'
                }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <i className="ri-chat-1-line" style={{ fontSize: '28px', opacity: 0.7 }}></i>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>게시글이 없습니다.</p>
                    <button
                        onClick={handleWriteClick}
                        className="board-empty-write-btn"
                        style={{
                            padding: '10px 20px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '8px',
                            transition: 'background 0.2s'
                        }}
                    >
                        <i className="ri-pencil-line"></i>
                        첫 글 쓰기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="board-posts-list standard-mode">
            <div className="standard-view">
                {notices.map(renderPost)}
                {regularPosts.map(renderPost)}
            </div>
        </div>
    );
}
