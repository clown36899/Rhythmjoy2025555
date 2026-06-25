import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardDetail } from '../hooks/useBoardDetail';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import { type UserData } from '../components/UserRegistrationModal';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import '../board.css';
import './detail.css';

const CommentSection = lazy(() => import('../components/CommentSection'));
const UniversalPostEditor = lazy(() => import('../components/UniversalPostEditor'));

export default function BoardDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isAdmin, userProfile } = useAuth();
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);

    const handlePostDeleted = useCallback(() => {
        navigate('/board');
    }, [navigate]);

    const {
        post,
        loading,
        error,
        updating,
        handleDelete: deletePost,
        handleToggleHidden,
        refreshPost
    } = useBoardDetail({
        postId: id,
        onPostDeleted: handlePostDeleted,
        isAdmin
    });

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

    // NOTE: incrementViews is now handled by useBoardDetail hook
    // Removed duplicate logic to prevent double-counting

    const handleDelete = async () => {
        await deletePost();
    };

    const handleEdit = () => {
        // Permission check
        if (!isAdmin && post?.user_id !== user?.id) {
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

    if (loading && !post) {
        return (
            <div className="board-detail-container">
                <div className="board-detail-loading">
                    <i className="ri-loader-4-line"></i>
                    <p>게시글을 불러오는 중입니다.</p>
                </div>
            </div>
        );
    }

    if (error && !post) {
        return (
            <div className="board-detail-container">
                <div className="board-detail-error">
                    <i className="ri-error-warning-line"></i>
                    <p>게시글을 불러오지 못했습니다.</p>
                    <button type="button" className="board-detail-retry-btn" onClick={refreshPost}>
                        다시 시도
                    </button>
                    <button onClick={() => navigate('/board')} className="board-detail-btn board-detail-btn-back">
                        목록으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="board-detail-container">
                <div className="board-detail-error">
                    <i className="ri-error-warning-line"></i>
                    <p>게시글을 찾을 수 없습니다.</p>
                    <button onClick={() => navigate('/board')} className="board-detail-btn board-detail-btn-back">
                        목록으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="board-detail-container">
            <GlobalLoadingOverlay isLoading={updating} message="처리 중입니다..." />

            <div className="board-header global-header">
                <div className="board-header-content">
                    <button
                        onClick={() => navigate(`/board?category=${(post as any)?.category || 'free'}`)}
                        className="board-header-back-btn"
                    >
                        <i className="ri-arrow-left-s-line"></i>
                        <span>돌아가기</span>
                    </button>
                </div>
            </div>

            <div className="board-detail-content-wrapper">
                {/* Header Section */}
                <div className="board-detail-header">
                    <div className="board-detail-header-top">
                        <div className="board-detail-title-section">
                            {post.prefix && (
                                <span
                                    className={`board-detail-prefix board-detail-prefix--${getPrefixTone(post.prefix.name)}`}
                                >
                                    {post.prefix.name}
                                </span>
                            )}
                            {post.is_hidden && (
                                <span className="board-detail-hidden-badge">🔒 숨김처리됨</span>
                            )}
                        </div>

                        {/* Top action buttons for convenience */}
                        {(isAdmin || post.user_id === user?.id) && (
                            <div className="board-detail-top-actions">
                                <button onClick={handleEdit} className="top-action-btn edit" title="수정">
                                    <i className="ri-edit-line"></i>
                                </button>
                                <button onClick={handleDelete} className="top-action-btn delete" title="삭제">
                                    <i className="ri-delete-bin-line"></i>
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={handleToggleHidden}
                                        className={`top-action-btn ${post.is_hidden ? 'unhide' : 'hide'}`}
                                        title={post.is_hidden ? '숨김 해제' : '숨기기'}
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
                            {post.author_profile_image ? (
                                <img
                                    src={post.author_profile_image}
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
                        {post.category === 'anonymous' && (
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

                    {/* [UPDATED] Use dangerouslySetInnerHTML for rich text & images */}
                    <div
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content || '') }}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Comment Section */}
                <Suspense fallback={null}>
                    <CommentSection postId={post.id} category={post.category || 'free'} />
                </Suspense>

                {/* Actions Section */}
                <div className="board-detail-actions">
                    <button
                        onClick={() => navigate(`/board?category=${(post as any)?.category || 'free'}`)}
                        className="board-detail-btn board-detail-btn-back"
                    >
                        <i className="ri-arrow-left-line"></i>
                        목록으로
                    </button>

                    <div className="board-detail-btn-group">
                        {(isAdmin || post.user_id === user?.id) && (
                            <>
                                <button
                                    onClick={handleEdit}
                                    className="board-detail-btn board-detail-btn-edit"
                                >
                                    <i className="ri-edit-line"></i>
                                    수정
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="board-detail-btn board-detail-btn-delete"
                                >
                                    <i className="ri-delete-bin-line"></i>
                                    삭제
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={handleToggleHidden}
                                        className={`board-detail-btn ${post.is_hidden ? 'board-detail-btn-unhide' : 'board-detail-btn-hide'}`}
                                        style={{ backgroundColor: post.is_hidden ? '#28a745' : '#6c757d', color: 'white' }}
                                    >
                                        <i className={`ri-${post.is_hidden ? 'eye-line' : 'eye-off-line'}`}></i>
                                        {post.is_hidden ? '숨김 해제' : '숨기기'}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Post Editor Modal for Editing */}
            {showEditorModal && (
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
    );
}
