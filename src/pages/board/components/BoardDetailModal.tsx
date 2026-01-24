import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardDetail } from '../hooks/useBoardDetail';
import UniversalPostEditor from './UniversalPostEditor';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import CommentSection from './CommentSection';
import { type UserData } from './UserRegistrationModal';
import '../board.css';
import '../detail/detail.css';
import './BoardDetailModal.css';
import '../../../components/UniversalEditor/Core/UniversalEditor.css'; // [New] Import Editor Styles

interface BoardDetailModalProps {
    postId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function BoardDetailModal({ postId, isOpen, onClose }: BoardDetailModalProps) {
    const { user, isAdmin } = useAuth();
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);

    const {
        post,
        updating,
        handleDelete: deletePost,
        handleToggleHidden,
        refreshPost
    } = useBoardDetail({
        postId,
        onPostDeleted: onClose,
        isAdmin,
        userId: user?.id
    });

    useEffect(() => {
        const loadUserData = async () => {
            if (!user) {
                setUserData(null);
                return;
            }
            try {
                const { data } = await supabase
                    .from('board_users')
                    .select('nickname, profile_image')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (data) {
                    setUserData(data);
                }
            } catch (error) {
                console.error('사용자 정보 로드 실패:', error);
            }
        };
        loadUserData();
    }, [user]);

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

    if (!isOpen) return null;

    return (
        <div className="board-detail-modal-overlay" onClick={onClose}>
            <div className="board-detail-modal-container" onClick={(e) => e.stopPropagation()}>
                <GlobalLoadingOverlay isLoading={updating} message="처리 중입니다..." />

                {/* Modal Header */}
                <div className="board-detail-modal-header">
                    <button onClick={onClose} className="board-detail-modal-close">
                        <i className="ri-arrow-left-line"></i>
                    </button>
                </div>

                {/* Content */}
                {!post ? (
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
                                            className="board-detail-prefix manual-label-wrapper"
                                            style={{ backgroundColor: (post as any).prefix.color }}
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
                                    {(post as any).author_profile_image ? (
                                        <img
                                            src={(post as any).author_profile_image}
                                            alt="Profile"
                                            className="board-detail-author-avatar"
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

                            <div
                                dangerouslySetInnerHTML={{ __html: post.content || '' }}
                                style={{ width: '100%' }}
                            />
                        </div>

                        {/* Comment Section */}
                        <CommentSection postId={post.id} category={(post as any).category || 'free'} />
                    </div>
                )}

                {/* Post Editor Modal for Editing */}
                {showEditorModal && post && (
                    <UniversalPostEditor
                        isOpen={showEditorModal}
                        onClose={() => setShowEditorModal(false)}
                        onPostCreated={handlePostUpdated}
                        post={post}
                        userNickname={userData?.nickname || post.author_nickname || "익명"}
                        category={(post as any).category || 'free'}
                    />
                )}
            </div>
        </div>
    );
}
