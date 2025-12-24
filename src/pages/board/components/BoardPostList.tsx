import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import type { BoardPost } from '../page';
import { type BoardCategory } from './BoardTabBar';
import CommentSection from './CommentSection';
import QuickMemoEditor from './QuickMemoEditor';
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
    dislikedPostIds?: Set<number>;
    onToggleLike: (postId: number) => void;
    onToggleDislike?: (postId: number) => void;
    onDeletePost: (postId: number, password?: string) => Promise<boolean>;
    onPostStartEdit?: () => void;
    onPostEndEdit?: () => void;
    onPostUpdate?: () => void;
    isAdmin?: boolean;
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
    onDeletePost,
    onPostUpdate,
    isAdmin: isAdminProp
}: BoardPostListProps) {
    const { isAdmin: isAuthAdmin } = useAuth();
    const isAdmin = isAdminProp || isAuthAdmin;
    const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Inline Edit State
    const [editingPostId, setEditingPostId] = useState<number | null>(null);
    const [editPassword, setEditPassword] = useState<string>('');

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
                <p className="board-empty-text">게시글이 없습니다.</p>
            </div>
        );
    }

    return (
        <>
            <div className={`board-posts-list ${category === 'market' ? 'market-view' : ''} ${isAnonymousView ? 'anonymous-view' : ''}`}>
                {posts.map((post) => {
                    const postDislikes = (post as any).dislikes || 0;
                    const isDislikeLocked = isAnonymousView && postDislikes >= 2;
                    const isManualHidden = post.is_hidden === true;
                    const isLocked = isManualHidden || isDislikeLocked;

                    // 관리자가 아니고 익명게시판에서 싫어요 누적 시에만 텍스트 치환
                    const shouldSubstitute = isAnonymousView && isDislikeLocked && !isAdmin;

                    if (editingPostId === post.id) {
                        return (
                            <div key={post.id} className="board-post-card is-memo editing-mode" style={{ cursor: 'default' }}>
                                <QuickMemoEditor
                                    category="anonymous"
                                    editData={{
                                        id: post.id,
                                        title: post.title,
                                        content: post.content,
                                        nickname: post.author_nickname || post.author_name,
                                        password: editPassword
                                    }}
                                    onCancelEdit={() => {
                                        setEditingPostId(null);
                                        setEditPassword('');
                                    }}
                                    onPostCreated={() => {
                                        setEditingPostId(null);
                                        setEditPassword('');
                                        onPostUpdate?.();
                                    }}
                                />
                            </div>
                        );
                    }

                    {/* Simplified flat structure for Anonymous Board (Memo) */ }
                    if (isAnonymousView) {
                        return (
                            <div
                                key={post.id}
                                className={`board-post-card is-memo ${isLocked ? 'is-locked-status' : ''} ${isAdmin ? 'is-admin-view' : ''}`}
                                style={{ cursor: 'default' }}
                            >
                                {/* Header: Icons, Admin Badges, Title Row */}
                                <div className={`board-post-title-row ${isLocked ? 'deactivated-header' : ''}`}>
                                    {isLocked && (
                                        <i className={`ri-lock-2-fill locked-icon ${isDislikeLocked ? 'blind-warning' : ''}`}></i>
                                    )}
                                    {isAdmin && isLocked && (
                                        <span className="admin-status-badge">
                                            {isManualHidden ? "숨김" : "블라인드"}
                                        </span>
                                    )}
                                    <h3 className="board-post-title">
                                        {shouldSubstitute ? "블라인드 처리된 게시물입니다." : post.title}
                                    </h3>
                                </div>

                                {/* Content & Media Area */}
                                {!shouldSubstitute && (
                                    <div className={`board-post-body ${isLocked && !isAdmin ? 'content-obscured' : ''}`}>
                                        {post.content && <p className="board-post-content">{post.content}</p>}

                                        {((post as any).image_thumbnail || (post as any).image) && (
                                            <div
                                                className="memo-thumbnail-wrapper"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedImage((post as any).image || (post as any).image_thumbnail);
                                                }}
                                            >
                                                <img src={(post as any).image_thumbnail || (post as any).image} alt="Thumbnail" />
                                                <div className="thumbnail-zoom-overlay">
                                                    <i className="ri-zoom-in-line"></i>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Meta Information (Nickname, Avatar, Date) */}
                                <div className="board-post-meta">
                                    <div className={`board-post-meta-left ${isLocked ? 'deactivated-header' : ''}`}>
                                        <div
                                            className="board-post-author-avatar anonymous-avatar"
                                            style={getAvatarStyle(post.author_nickname || post.author_name)}
                                        >
                                            {shouldSubstitute ? "?" : (post.author_nickname || post.author_name).substring(0, 1)}
                                        </div>
                                        <span className="board-post-meta-nickname">
                                            {shouldSubstitute ? "블라인드" : (post.author_nickname || post.author_name)}
                                        </span>
                                        <span className="board-post-meta-separator">·</span>
                                        <span className="board-post-meta-item">
                                            {formatDate(post.created_at)}
                                        </span>
                                    </div>
                                </div>

                                {/* Interaction Bar (Likes, Dislikes, Edit, Delete, Comments) */}
                                <div className="memo-interaction-bar">
                                    <div className="memo-comment-toggle-wrapper">
                                        <button
                                            className={`memo-comment-toggle ${expandedComments.has(post.id) ? 'active' : ''}`}
                                            onClick={(e) => toggleComments(post.id, e)}
                                        >
                                            <span className="comment-label">댓글</span>
                                            <span className="comment-count">{post.comment_count || 0}</span>
                                        </button>
                                    </div>
                                    <div className="memo-btns">
                                        <button
                                            className={`memo-btn like-btn ${likedPostIds.has(post.id) ? 'active' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); onToggleLike(post.id); }}
                                        >
                                            <i className={likedPostIds.has(post.id) ? "ri-thumb-up-fill" : "ri-thumb-up-line"}></i>
                                            <span>{post.likes || 0}</span>
                                        </button>
                                        <button
                                            className={`memo-btn dislike-btn ${dislikedPostIds?.has(post.id) ? 'active' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); onToggleDislike?.(post.id); }}
                                        >
                                            <i className={dislikedPostIds?.has(post.id) ? "ri-thumb-down-fill" : "ri-thumb-down-line"}></i>
                                            <span>{(post as any).dislikes || 0}</span>
                                        </button>
                                        <button
                                            className="memo-btn edit-btn"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const pwd = window.prompt("게시물 수정을 위한 비밀번호를 입력해주세요.");
                                                if (pwd) {
                                                    const trimmedPwd = pwd.trim();
                                                    try {
                                                        const { data: isValid } = await supabase.rpc('verify_anonymous_post_password', {
                                                            p_post_id: post.id,
                                                            p_password: trimmedPwd
                                                        });
                                                        if (isValid) {
                                                            setEditPassword(trimmedPwd);
                                                            setEditingPostId(post.id);
                                                        } else {
                                                            alert("비밀번호가 일치하지 않습니다.");
                                                        }
                                                    } catch (err) {
                                                        console.error("Password verification failed:", err);
                                                    }
                                                }
                                            }}
                                        >
                                            <i className="ri-edit-line"></i>
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
                                                        inputPassword = pwd.trim();
                                                        isConfirmed = true;
                                                    }
                                                }
                                                if (isConfirmed) {
                                                    const success = await onDeletePost(post.id, isAdmin ? undefined : inputPassword);
                                                    if (success) {
                                                        alert("게시물이 삭제되었습니다.");
                                                    }
                                                }
                                            }}
                                        >
                                            <i className="ri-delete-bin-line"></i>
                                        </button>
                                    </div>
                                </div>

                                {/* Inline Comments Section */}
                                {expandedComments.has(post.id) && (
                                    <div className="inline-comment-section" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-comment-section-dot"></div>
                                        <CommentSection
                                            postId={post.id}
                                            category={category}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // Original complex structure for standard view
                    return (
                        <div
                            key={post.id}
                            onClick={() => onPostClick(post)}
                            className={`board-post-card ${post.is_notice ? 'board-post-card-notice' : 'board-post-card-normal'} ${isLocked ? 'is-locked-status' : ''} ${isAdmin ? 'is-admin-view' : ''}`}
                            style={{ cursor: 'pointer' }}
                        >

                            <div className="board-post-meta">
                                <div className={`board-post-meta-left ${isLocked ? 'deactivated-header' : ''}`}>
                                    <span className="board-post-meta-item">
                                        {post.author_profile_image ? (
                                            <img src={post.author_profile_image} alt="Profile" className="board-post-author-avatar" />
                                        ) : (
                                            <i className="ri-user-line board-post-meta-icon"></i>
                                        )}
                                        <span className="board-post-meta-nickname">
                                            {shouldSubstitute ? "블라인드" : (post.author_nickname || post.author_name)}
                                        </span>
                                    </span>
                                    <span className="board-post-meta-separator">·</span>
                                    <span className="board-post-meta-item">
                                        {formatDate(post.created_at)}
                                    </span>
                                </div>

                                <div className="board-post-meta-right">
                                    <div className="board-post-interaction-btns">
                                        <span className="board-post-interaction-item">
                                            <i className="ri-eye-line board-post-meta-icon"></i>
                                            {post.views || 0}
                                        </span>
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
                            </div>
                        </div>
                    );
                })}
            </div>

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

            {totalPages > 1 && (
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
            )}
        </>
    );
}
