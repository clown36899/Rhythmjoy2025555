import { lazy, Suspense, useEffect, useState } from 'react';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardDetail } from '../hooks/useBoardDetail';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import { type UserData } from './UserRegistrationModal';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import '../board.css';
import '../detail/detail.css';
import './BoardDetailModal.css';

const CommentSection = lazy(() => import('./CommentSection'));
const UniversalPostEditor = lazy(() => import('./UniversalPostEditor'));

interface BoardDetailModalProps {
    postId: string;
    category?: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function BoardDetailModal({ postId, category, isOpen, onClose }: BoardDetailModalProps) {
    const { user, isAdmin, userProfile } = useAuth();
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);

    const {
        post,
        loading,
        error,
        updating,
        handleDelete: deletePost,
        handleToggleHidden,
        refreshPost
    } = useBoardDetail({
        postId,
        category,
        onPostDeleted: onClose,
        isAdmin
    });

    useEffect(() => {
        if (!post?.id) {
            setShowComments(false);
            return;
        }

        setShowComments(false);
        const timerId = window.setTimeout(() => {
            setShowComments(true);
        }, 80);

        return () => window.clearTimeout(timerId);
    }, [post?.id]);

    useEffect(() => {
        const loadUserData = async () => {
            if (!user) {
                setUserData(null);
                return;
            }
            if (userProfile) {
                setUserData({
                    nickname: userProfile.nickname,
                    profile_image: userProfile.profile_image || undefined
                });
                return;
            }
            try {
                const { data, error } = await cafe24
                    .from('board_users')
                    .select('nickname, profile_image')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (error) throw error;
                if (data) {
                    setUserData(data);
                } else {
                    setUserData(null);
                }
            } catch (error) {
                console.error('사용자 정보 로드 실패:', error);
                setUserData(null);
            }
        };
        loadUserData();
    }, [user, userProfile]);

    const handleDelete = async () => {
        await deletePost();
    };

    const handleEdit = () => {
        if (!isAdmin && (post as any)?.user_id !== user?.id) {
            alert('본인이 작성한 글만 수정할 수 있습니다.');
            return;
        }
        setShowEditorModal(true);
    };

    const handlePostUpdated = () => {
        refreshPost();
        setShowEditorModal(false);
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getPrefixTone = (name?: string) => {
        if (!name) return 'slate';
        if (name.includes('질문') || name.includes('건의')) return 'blue';
        if (name.includes('후기')) return 'violet';
        if (name.includes('정보')) return 'cyan';
        if (name.includes('잡담')) return 'green';
        return 'slate';
    };

    if (!isOpen) return null;

    return (
        <div className="board-detail-modal-overlay" onClick={onClose}>
            <div className="board-detail-modal-container" onClick={(e) => e.stopPropagation()}>
                <GlobalLoadingOverlay isLoading={updating} message="처리 중입니다..." />

                {/* Modal Header */}
                <div className="board-detail-modal-header">
                    <button 
                        onClick={onClose} 
                        className="board-detail-modal-close"
                        data-analytics-id="board_detail_close"
                        data-analytics-type="action"
                        data-analytics-title="게시물 상세 닫기"
                        data-analytics-section="board_detail"
                    >
                        <i className="ri-arrow-left-line"></i>
                    </button>
                </div>

                {/* Content */}
                {loading && !post ? (
                    <div className="board-detail-loading">
                        <i className="ri-loader-4-line"></i>
                        <p>게시글을 불러오는 중입니다.</p>
                    </div>
                ) : error && !post ? (
                    <div className="board-detail-error">
                        <i className="ri-error-warning-line"></i>
                        <p>게시글을 불러오지 못했습니다.</p>
                        <button type="button" className="board-detail-retry-btn" onClick={refreshPost}>
                            다시 시도
                        </button>
                    </div>
                ) : !post ? (
                    <div className="board-detail-error">
                        <i className="ri-error-warning-line"></i>
                        <p>게시글을 찾을 수 없습니다.</p>
                    </div>
                ) : (
                    <div className="board-detail-modal-content">
                        {/* Header Section */}
                        {/* Header Section */}
                        <div className="board-detail-header">
                            <div className="board-detail-header-top">
                                <div className="board-detail-title-section">
                                    {(post as any).prefix && (
                                        <span
                                            className={`board-detail-prefix board-detail-prefix--${getPrefixTone((post as any).prefix.name)} manual-label-wrapper`}
                                        >
                                            <span className="translated-part">{
                                                (post as any).prefix.name === '잡담' ? 'Discussion' :
                                                    (post as any).prefix.name === '질문' ? 'Question' :
                                                        (post as any).prefix.name === '정보' ? 'Info' :
                                                            (post as any).prefix.name === '후기' ? 'Review' :
                                                                (post as any).prefix.name
                                            }</span>
                                            <span className="fixed-part ko" translate="no">{(post as any).prefix.name}</span>
                                            <span className="fixed-part en" translate="no">{
                                                (post as any).prefix.name === '잡담' ? 'Discussion' :
                                                    (post as any).prefix.name === '질문' ? 'Question' :
                                                        (post as any).prefix.name === '정보' ? 'Info' :
                                                            (post as any).prefix.name === '후기' ? 'Review' :
                                                                (post as any).prefix.name
                                            }</span>
                                        </span>
                                    )}
                                    {post.is_hidden && (
                                        <span className="board-detail-hidden-badge">🔒 숨김처리됨</span>
                                    )}
                                </div>

                                {(isAdmin || (post as any).user_id === user?.id) && (
                                    <div className="board-detail-top-actions">
                                        <button 
                                            onClick={handleEdit} 
                                            className="top-action-btn edit" 
                                            title="수정"
                                            data-analytics-id="board_detail_edit"
                                            data-analytics-type="action"
                                            data-analytics-title="게시물 수정"
                                            data-analytics-section="board_detail"
                                        >
                                            <i className="ri-edit-line"></i>
                                        </button>
                                        <button 
                                            onClick={handleDelete} 
                                            className="top-action-btn delete" 
                                            title="삭제"
                                            data-analytics-id="board_detail_delete"
                                            data-analytics-type="action"
                                            data-analytics-title="게시물 삭제"
                                            data-analytics-section="board_detail"
                                        >
                                            <i className="ri-delete-bin-line"></i>
                                        </button>
                                        {isAdmin && (
                                            <button
                                                onClick={handleToggleHidden}
                                                className={`top-action-btn ${post.is_hidden ? 'unhide' : 'hide'}`}
                                                title={post.is_hidden ? '숨김 해제' : '숨기기'}
                                                data-analytics-id="board_detail_toggle_hidden"
                                                data-analytics-type="action"
                                                data-analytics-title={post.is_hidden ? "게시물 숨김 해제" : "게시물 숨기기"}
                                                data-analytics-section="board_detail"
                                            >
                                                <i className={`ri-${post.is_hidden ? 'eye-line' : 'eye-off-line'}`}></i>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <h1 className="board-detail-title" style={{ opacity: post.is_hidden ? 0.6 : 1 }}>
                                {post.title}
                            </h1>

                            <div className="board-detail-meta">
                                <div className="board-detail-meta-item">
                                    {(post as any).author_profile_image ? (
                                        <img
                                            src={(post as any).author_profile_image}
                                            alt="Profile"
                                            className="board-detail-author-avatar"
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <i className="ri-user-line"></i>
                                    )}
                                    {post.author_nickname || post.author_name}
                                </div>
                                <div className="board-detail-meta-divider"></div>
                                <div className="board-detail-meta-item">
                                    <i className="ri-time-line"></i>
                                    {formatDate(post.created_at)}
                                </div>
                                <div className="board-detail-meta-divider"></div>
                                <div className="board-detail-meta-item">
                                    <i className="ri-eye-line"></i>
                                    {post.views}
                                </div>
                                <div className="board-detail-meta-divider"></div>
                                <div className="board-detail-meta-item">
                                    <i className="ri-thumb-up-line"></i>
                                    {(post as any).likes || 0}
                                </div>
                                {(post as any).category === 'anonymous' && (
                                    <>
                                        <div className="board-detail-meta-divider"></div>
                                        <div className="board-detail-meta-item">
                                            <i className="ri-thumb-down-line"></i>
                                            {(post as any).dislikes || 0}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Body Section */}
                        <div className="board-detail-body universal-editor-content">
                            {/* [NEW] Render featured image if not already present in content HTML */}
                            {(post as any).image && !(post.content || '').includes((post as any).image) && (
                                <div className="board-detail-featured-image">
                                    <img src={(post as any).image} alt="Featured" draggable={false} />
                                </div>
                            )}

                            <div
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content || '') }}
                                style={{ width: '100%' }}
                            />
                        </div>

                        {/* Comment Section */}
                        {showComments && (
                            <Suspense fallback={null}>
                                <CommentSection postId={post.id} category={(post as any).category || 'free'} />
                            </Suspense>
                        )}
                    </div>
                )}

                {/* Post Editor Modal for Editing */}
                {showEditorModal && post && (
                    <Suspense fallback={null}>
                        <UniversalPostEditor
                            isOpen={showEditorModal}
                            onClose={() => setShowEditorModal(false)}
                            onPostCreated={handlePostUpdated}
                            post={post}
                            userNickname={userData?.nickname || post.author_nickname || "익명"}
                            category={(post as any).category || 'free'}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    );
}
