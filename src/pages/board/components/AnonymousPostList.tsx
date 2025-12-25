import { useState } from 'react';
import type { AnonymousBoardPost } from '../../../types/board';
import QuickMemoEditor from './QuickMemoEditor';
import CommentSection from './CommentSection';
import './BoardPostList.css';

interface AnonymousPostListProps {
    posts: AnonymousBoardPost[];
    onPostClick: (post: AnonymousBoardPost) => void;
    // currentUserId?: string; // Not strictly needed if handled by parent/context
    onPostCreated: () => void;
    isAdmin: boolean;
    likedPostIds?: Set<number>;
    onToggleLike?: (postId: number) => void;
    dislikedPostIds?: Set<number>;
    onToggleDislike?: (postId: number) => void;
}

export default function AnonymousPostList({
    posts,
    onPostClick,
    onPostCreated,
    isAdmin,
    likedPostIds,
    onToggleLike,
    dislikedPostIds,
    onToggleDislike
}: AnonymousPostListProps) {
    const [editingPostId, setEditingPostId] = useState<number | null>(null);
    const [editPassword, setEditPassword] = useState('');
    const [expandedCommentPostId, setExpandedCommentPostId] = useState<number | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const handleEditClick = (post: AnonymousBoardPost) => {
        if (isAdmin) {
            setEditingPostId(post.id);
            setEditPassword('');
        } else {
            const input = prompt('비밀번호를 입력해주세요:');
            if (input) {
                setEditPassword(input);
                setEditingPostId(post.id);
            }
        }
    };

    const handleCancelEdit = () => {
        setEditingPostId(null);
        setEditPassword('');
    };

    const toggleComments = (postId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCommentPostId(prev => (prev === postId ? null : postId));
    };

    return (
        <div className="board-post-list anonymous-mode">
            <div className="anonymous-view">
                {posts.map((post) => {
                    const isEditing = editingPostId === post.id;
                    const isBlind = (post.dislikes || 0) >= 20;
                    const isCommentsOpen = expandedCommentPostId === post.id;

                    if (isEditing) {
                        return (
                            <QuickMemoEditor
                                key={post.id}
                                category="anonymous"
                                editData={post}
                                onPostCreated={() => {
                                    onPostCreated();
                                    setEditingPostId(null);
                                }}
                                onCancelEdit={handleCancelEdit}
                                providedPassword={editPassword}
                                className="inline-editor"
                                isAdmin={isAdmin}
                            />
                        );
                    }

                    return (
                        <div key={post.id} className={`board-post-card is-memo ${isBlind ? 'blinded' : ''}`}>
                            {/* Main Content Body */}
                            <div className="board-post-body">
                                {/* Title (Optional) */}
                                {post.title && (
                                    <div className="board-post-title-row">
                                        <h3 className="board-post-title">{post.title}</h3>
                                    </div>
                                )}

                                {/* Blind Warning */}
                                {isBlind && (
                                    <div className="blind-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: '0.9rem' }}>
                                        <i className="ri-alarm-warning-fill"></i>
                                        <span>신고 20회 누적으로 가려진 글입니다.</span>
                                    </div>
                                )}

                                {/* Content - Hidden if blinded by reports */}
                                {!isBlind && (
                                    <div className="board-post-content">
                                        <div onClick={() => onPostClick(post)} style={{ cursor: 'pointer' }}>
                                            {post.content}
                                        </div>

                                        {post.image && (
                                            <div
                                                className="memo-thumbnail-wrapper"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedImage(post.image || null);
                                                }}
                                            >
                                                <img
                                                    src={post.image_thumbnail || post.image}
                                                    alt="Memo attachment"
                                                    loading="lazy"
                                                />
                                                <div className="thumbnail-zoom-overlay">
                                                    <i className="ri-zoom-in-line"></i>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Meta Info (Bottom) */}
                            <div className="board-post-meta">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {/* Anonymous Avatar */}
                                    <div className="anonymous-avatar" style={{ background: '#333', color: '#ccc' }}>
                                        <i className="ri-user-3-fill"></i>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                                        <span className="board-post-meta-nickname">
                                            {post.author_nickname || '익명'}
                                            {post.is_notice && (
                                                <i className="ri-megaphone-fill" style={{ marginLeft: '4px', color: '#fbbf24', verticalAlign: 'middle' }} title="공지사항"></i>
                                            )}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                            {new Date(post.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Interaction Bar */}
                            <div className="memo-interaction-bar">
                                <button
                                    className={`memo-comment-toggle ${isCommentsOpen ? 'active' : ''}`}
                                    onClick={(e) => toggleComments(post.id, e)}
                                >
                                    <i className="ri-chat-3-line"></i>
                                    <span className="comment-label">댓글</span>
                                    <span className="comment-count">{post.comment_count || 0}</span>
                                </button>

                                <div className="memo-btns">
                                    {onToggleLike && (
                                        <button
                                            className={`memo-btn like-btn ${likedPostIds?.has(post.id) ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleLike(post.id);
                                            }}
                                        >
                                            <i className={likedPostIds?.has(post.id) ? "ri-thumb-up-fill" : "ri-thumb-up-line"}></i>
                                            <span>{post.likes || 0}</span>
                                        </button>
                                    )}
                                    {!post.is_notice && onToggleDislike && (
                                        <button
                                            className={`memo-btn dislike-btn ${dislikedPostIds?.has(post.id) ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleDislike(post.id);
                                            }}
                                        >
                                            <i className={dislikedPostIds?.has(post.id) ? "ri-thumb-down-fill" : "ri-thumb-down-line"}></i>
                                            <span>{post.dislikes || 0}</span>
                                        </button>
                                    )}

                                    {/* Edit Button moved here */}
                                    <button
                                        className="memo-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditClick(post);
                                        }}
                                        style={{ color: '#9ca3af' }}
                                    >
                                        <i className="ri-pencil-line"></i>
                                        <span>수정</span>
                                    </button>
                                </div>
                            </div>

                            {/* Inline Comment Section */}
                            {isCommentsOpen && (
                                <div className="inline-comment-section">
                                    <div className="inline-comment-section-dot"></div>
                                    <CommentSection
                                        postId={post.id}
                                        category="anonymous"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Lightbox Overlay */}
            {selectedImage && (
                <div
                    className="memo-lightbox-overlay"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="memo-lightbox-content">
                        <img src={selectedImage} alt="Enlarged view" />
                        <button
                            className="lightbox-close-btn"
                            onClick={() => setSelectedImage(null)}
                            style={{
                                position: 'absolute', top: '20px', right: '20px',
                                background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white',
                                borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer',
                                fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <i className="ri-close-line"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
