// import { useNavigate } from 'react-router-dom';
// import { supabase } from '../../../lib/supabase';
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
    return { backgroundColor: color, color: '#fff' };
};

interface StandardPostListProps {
    posts: StandardBoardPost[];
    onPostClick: (post: StandardBoardPost) => void;
    category: BoardCategory;
    likedPostIds?: Set<number>;
    onToggleLike?: (postId: number) => void;
    // Standard posts might not use dislikes heavily but let's keep it generally or omit if not needed.
    // BoardMainContainer has handleToggleDislike.
    dislikedPostIds?: Set<number>;
    onToggleDislike?: (postId: number) => void;
    isAdmin?: boolean;
}

export default function StandardPostList({
    posts,
    onPostClick,
    // category,
    likedPostIds,
    onToggleLike,
    // dislikedPostIds,
    // onToggleDislike
    isAdmin
}: StandardPostListProps) {
    // const navigate = useNavigate();
    // const { isAdmin } = useAuth();

    const truncateText = (text: string, maxLength: number) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className="board-posts-list standard-mode">
            <div className="standard-view">
                {posts.map((post) => (
                    <div
                        key={post.id}
                        onClick={() => onPostClick(post)}
                        className={`board-post-card ${post.is_notice ? 'board-post-card-notice' : 'board-post-card-normal'}`}
                        style={{ opacity: (isAdmin && post.is_hidden) ? 0.6 : 1 }}
                    >
                        {/* Top Row: Thumbnail + Main Content */}
                        <div className="board-post-top-row">
                            {/* Thumbnail (Left) */}
                            {post.image_thumbnail && (
                                <div className="board-post-thumbnail">
                                    <img
                                        src={post.image_thumbnail}
                                        alt="thumbnail"
                                        loading="lazy"
                                    />
                                </div>
                            )}

                            {/* Main Content (Right) */}
                            <div className="board-post-main-content">
                                {/* Header: Prefix + Title */}
                                <div className="board-post-header">
                                    {post.is_notice && (
                                        <span className="board-notice-badge">공지</span>
                                    )}
                                    {/* Hidden Badge for Admin */}
                                    {isAdmin && post.is_hidden && (
                                        <span className="board-hidden-badge" style={{
                                            backgroundColor: '#6c757d',
                                            color: 'white',
                                            fontSize: '11px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            marginRight: '6px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <i className="ri-eye-off-line" style={{ fontSize: '12px' }}></i>
                                            숨김
                                        </span>
                                    )}
                                    {/* Display Prefix if available & not notice (or both) */}
                                    {post.prefix && !post.is_notice && (
                                        <span
                                            className="board-post-prefix"
                                            style={{ color: post.prefix.color || '#fff' }}
                                        >
                                            {post.prefix.name}
                                        </span>
                                    )}
                                    <h3 className={`board-post-title ${post.is_notice ? 'board-post-title-notice' : 'board-post-title-normal'}`}>
                                        {post.title}
                                    </h3>
                                </div>

                                {/* Preview Content */}
                                <p className="board-post-content">
                                    {truncateText((post.content || '').replace(/<[^>]*>?/gm, ''), 100)}
                                </p>
                            </div>
                        </div>

                        {/* Meta Info (Bottom Row) */}
                        <div className="board-post-meta">
                            <div className="board-post-meta-left">
                                {/* Avatar */}
                                <div
                                    className="board-post-author-avatar-container"
                                    style={{
                                        width: '18px', height: '18px', borderRadius: '50%', overflow: 'hidden',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px',
                                        ...getAvatarStyle(post.user_id, post.author_nickname || post.author_name)
                                    }}
                                >
                                    {post.author_profile_image ? (
                                        <img
                                            src={post.author_profile_image}
                                            alt="author"
                                            className="board-post-author-avatar"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
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

                                {onToggleLike && (
                                    <button
                                        className={`board-post-like-btn ${likedPostIds?.has(post.id) ? 'liked' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleLike(post.id);
                                        }}
                                        style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }}
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
                    </div>
                ))}
            </div >
        </div >
    );
}
