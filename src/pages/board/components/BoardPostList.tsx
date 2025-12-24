import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardPost } from '../page';
import { type BoardCategory } from './BoardTabBar';
import CommentSection from './CommentSection';
import './BoardPostList.css';

interface BoardPostListProps {
    posts: BoardPost[];
    loading: boolean;
    category: BoardCategory;
    onPostClick: (post: BoardPost) => void;
    // Pagination props
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    likedPostIds: Set<number>;
    dislikedPostIds?: Set<number>; // Added
    onToggleLike: (postId: number) => void;
    onToggleDislike?: (postId: number) => void; // Added
    onDeletePost: (postId: number, password?: string) => Promise<boolean>;
}

export default function BoardPostList({
    posts,
    loading,
    category,
    onPostClick,
    currentPage,
    totalPages,
    onPageChange,
    likedPostIds,
    dislikedPostIds = new Set(),
    onToggleLike,
    onToggleDislike,
    onDeletePost
}: BoardPostListProps) {
    const { isAdmin } = useAuth(); // Admin check for deletion
    // State for expanded comments in anonymous view
    const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    if (loading) {
        return (
            <div className="board-loading-container">
                <i className="ri-loader-4-line board-loading-spinner"></i>
                <p className="board-loading-text">게시글을 불러오는 중...</p>
            </div>
        );
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (hours < 24) {
            return date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('ko-KR', {
                year: '2-digit',
                month: '2-digit',
                day: '2-digit'
            });
        }
    };

    const toggleComments = (postId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(expandedComments);
        if (next.has(postId)) next.delete(postId);
        else next.add(postId);
        setExpandedComments(next);
    };

    const isAnonymousView = category === 'anonymous';

    // Random effects for anonymous cards
    const getAnonymousStyle = () => {
        // All styles are now handled via CSS for a modern look
        return {} as React.CSSProperties;
    };

    // Deterministic avatar color based on nickname
    const getAvatarStyle = (name: string) => {
        const colors = [
            '#FF8A65', '#9575CD', '#4DB6AC', '#64B5F6', '#AED581',
            '#FFD54F', '#A1887F', '#90A4AE', '#f06292', '#ba68c8'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = colors[Math.abs(hash) % colors.length];
        return { backgroundColor: color, color: '#fff' };
    };

    if (posts.length === 0) {
        return (
            <div className="board-empty-container">
                <i className="ri-chat-3-line board-empty-icon"></i>
                <p className="board-empty-text">
                    {category === 'market'
                        ? '첫 번째 벼룩시장 매물을 올려보세요!'
                        : isAnonymousView
                            ? '익명 게시판에 첫 소식을 남겨보세요!'
                            : '첫 번째 게시글을 작성해보세요!'}
                </p>
            </div>
        );
    }

    return (
        <>
            <div className={`board-posts-list ${category === 'market' ? 'market-view' : ''} ${isAnonymousView ? 'anonymous-view' : ''}`}>
                {posts.map((post) => (
                    <div
                        key={post.id}
                        onClick={() => !isAnonymousView && onPostClick(post)}
                        className={`board-post-card ${post.is_notice ? 'board-post-card-notice' : 'board-post-card-normal'} ${isAnonymousView ? 'is-memo' : ''}`}
                        style={{
                            opacity: post.is_hidden ? 0.6 : 1,
                            cursor: isAnonymousView ? 'default' : 'pointer',
                            ...getAnonymousStyle()
                        }}
                    >

                        <div className="board-post-top-row">
                            <div className="board-post-main-content">
                                <div className="board-post-header">
                                    {post.prefix && (
                                        <span
                                            className="board-post-prefix"
                                            style={{ backgroundColor: post.prefix.color }}
                                        >
                                            {post.prefix.name}
                                        </span>
                                    )}
                                    {category === 'notice' && post.is_notice && (
                                        <span className="board-notice-badge">공지</span>
                                    )}

                                    <h3 className={`board-post-title ${post.is_notice ? 'board-post-title-notice' : 'board-post-title-normal'}`}>
                                        {post.is_hidden && <span className="post-hidden-badge">🔒</span>}
                                        {((post as any).display_order || 0) > 0 && !isAnonymousView && <i className="ri-pushpin-2-fill pin-icon"></i>}
                                        {post.title}
                                    </h3>
                                </div>
                                <p className="board-post-content">{post.content}</p>

                                {/* Small Thumbnail for anonymous, large for others */}
                                {isAnonymousView && ((post as any).image_thumbnail || (post as any).image) && (
                                    <div
                                        className="memo-thumbnail-wrapper"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedImage((post as any).image || (post as any).image_thumbnail);
                                        }}
                                    >
                                        <img src={(post as any).image_thumbnail || (post as any).image} alt="thumbnail" />
                                        <div className="thumbnail-zoom-overlay">
                                            <i className="ri-zoom-in-line"></i>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Standard Thumbnail for non-anonymous */}
                            {!isAnonymousView && ((post as any).image_thumbnail || (post as any).image) && (
                                <div className="board-post-thumbnail">
                                    <img src={(post as any).image_thumbnail || (post as any).image} alt="thumbnail" />
                                </div>
                            )}
                        </div>

                        {/* Meta Data Row (Bottom) */}
                        <div className="board-post-meta">
                            <div className="board-post-meta-left">
                                <span className="board-post-meta-item">
                                    {isAnonymousView ? (
                                        <div
                                            className="board-post-author-avatar anonymous-avatar"
                                            style={getAvatarStyle(post.author_nickname || post.author_name)}
                                        >
                                            {(post.author_nickname || post.author_name).substring(0, 1)}
                                        </div>
                                    ) : post.author_profile_image ? (
                                        <img src={post.author_profile_image} alt="Profile" className="board-post-author-avatar" />
                                    ) : (
                                        <i className="ri-user-line board-post-meta-icon"></i>
                                    )}
                                    <span className="board-post-meta-nickname">
                                        {post.author_nickname || post.author_name}
                                    </span>
                                </span>
                                <span className="board-post-meta-separator">·</span>
                                <span className="board-post-meta-item">
                                    {formatDate(post.created_at)}
                                </span>
                            </div>

                            {!isAnonymousView && (
                                <div className="board-post-meta-right">
                                    <div className="board-post-interaction-btns">
                                        <span
                                            className={`board-post-interaction-item board-post-like-btn ${likedPostIds.has(post.id) ? 'liked' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleLike(post.id);
                                            }}
                                        >
                                            <i className={`${likedPostIds.has(post.id) ? 'ri-heart-3-fill' : 'ri-heart-3-line'} board-post-meta-icon`}></i>
                                            {post.likes}
                                        </span>
                                        <span className="board-post-interaction-item">
                                            <i className="ri-chat-3-line board-post-meta-icon"></i>
                                            {post.comment_count}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Separate Interaction Row for Memo */}
                        {isAnonymousView && (
                            <div className="memo-interaction-bar">
                                <div className="memo-btns">
                                    <button
                                        className={`memo-btn like-btn ${likedPostIds.has(post.id) ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); onToggleLike(post.id); }}
                                    >
                                        <i className={likedPostIds.has(post.id) ? "ri-thumb-up-fill" : "ri-thumb-up-line"}></i>
                                        <span>{post.likes}</span>
                                    </button>
                                    <button
                                        className={`memo-btn dislike-btn ${dislikedPostIds.has(post.id) ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); onToggleDislike?.(post.id); }}
                                    >
                                        <i className={dislikedPostIds.has(post.id) ? "ri-thumb-down-fill" : "ri-thumb-down-line"}></i>
                                        <span>{(post as any).dislikes || 0}</span>
                                    </button>
                                    <button
                                        className="memo-btn delete-btn"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            let isConfirmed = false;
                                            let inputPassword = "";

                                            if (isAdmin) {
                                                isConfirmed = window.confirm("관리자 권한으로 이 게시물을 삭제하시겠습니까?");
                                            } else {
                                                const pwd = window.prompt("게시물 삭제를 위한 비밀번호를 입력해주세요.");
                                                if (pwd !== null) {
                                                    inputPassword = pwd;
                                                    isConfirmed = true;
                                                }
                                            }

                                            if (isConfirmed) {
                                                const success = await onDeletePost(post.id, isAdmin ? undefined : inputPassword);
                                                if (success) {
                                                    alert("게시물이 삭제되었습니다.");
                                                } else if (!isAdmin) {
                                                    alert("비밀번호가 틀렸거나 삭제에 실패했습니다.");
                                                }
                                            }
                                        }}
                                    >
                                        <i className="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                                <button className="memo-comment-toggle" onClick={(e) => toggleComments(post.id, e)}>
                                    <i className={expandedComments.has(post.id) ? "ri-message-3-fill" : "ri-message-3-line"}></i>
                                    <span>{post.comment_count || 0}</span>
                                </button>
                            </div>
                        )}

                        {/* Instagram-style Expandable Comments */}
                        {isAnonymousView && expandedComments.has(post.id) && (
                            <div className="inline-comment-section" onClick={(e) => e.stopPropagation()}>
                                <div className="comment-divider"></div>
                                <CommentSection postId={post.id} category={category} />
                            </div>
                        )}
                    </div>
                ))}
            </div >

            {/* Image Lightbox Overlay */}
            {selectedImage && (
                <div className="memo-lightbox-overlay" onClick={() => setSelectedImage(null)}>
                    <div className="memo-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <img src={selectedImage} alt="Expanded view" />
                        <button className="lightbox-close-btn" onClick={() => setSelectedImage(null)}>
                            <i className="ri-close-line"></i>
                        </button>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {
                totalPages > 1 && (
                    <div className="board-pagination">
                        <button
                            onClick={(e) => { e.stopPropagation(); onPageChange(currentPage - 1); }}
                            disabled={currentPage === 1}
                            className="board-page-btn"
                        >
                            <i className="ri-arrow-left-s-line"></i>
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={(e) => { e.stopPropagation(); onPageChange(page); }}
                                className={
                                    currentPage === page
                                        ? 'board-page-btn-active'
                                        : 'board-page-btn-inactive'
                                }
                            >
                                {page}
                            </button>
                        ))}

                        <button
                            onClick={(e) => { e.stopPropagation(); onPageChange(currentPage + 1); }}
                            disabled={currentPage === totalPages}
                            className="board-page-btn"
                        >
                            <i className="ri-arrow-right-s-line"></i>
                        </button>
                    </div>
                )
            }
        </>
    );
}

