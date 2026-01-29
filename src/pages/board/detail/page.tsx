import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import UniversalPostEditor from '../components/UniversalPostEditor';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import CommentSection from '../components/CommentSection';
import { type UserData } from '../components/UserRegistrationModal';
import '../board.css';
import './detail.css';
import type { BoardPost } from '../hooks/useBoardPosts';

export default function BoardDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isAdmin } = useAuth();
    const [post, setPost] = useState<BoardPost | null>(null);
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);


    useEffect(() => {
        if (id) {
            loadPost(id);
        }
    }, [id]);

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

    // Realtime Subscription for updates
    useEffect(() => {
        if (!post?.id || !post?.category) return;

        const table = post.category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';

        const channel = supabase
            .channel(`post_detail:${post.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: `id=eq.${post.id}`
                },
                (payload) => {
                    console.log('[Realtime Detail] Event received:', payload);

                    if (payload.eventType === 'UPDATE' && payload.new) {
                        const newPost = payload.new as any;

                        // Handle Soft Delete
                        if (newPost.is_hidden && !isAdmin && post.user_id !== user?.id) {
                            alert('삭제된 게시글입니다.');
                            navigate('/board');
                            return;
                        }

                        setPost(prev => prev ? { ...prev, ...newPost } : null);
                    }

                    if (payload.eventType === 'DELETE') {
                        alert('삭제된 게시글입니다.');
                        navigate('/board');
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [post?.id, post?.category, isAdmin, user?.id, navigate]);



    const loadPost = async (postId: string) => {
        try {
            const { data, error } = await supabase
                .from('board_posts')
                .select(`
                    id, 
                    title, 
                    content, 
                    author_name, 
                    author_nickname, 
                    user_id, 
                    views, 
                    is_notice,
                    is_hidden, 
                    prefix_id,
                    prefix:board_prefixes(id, name, color, admin_only),
                    created_at, 
                    updated_at,
                    category,
                    image,
                    image_thumbnail,
                    likes,
                    dislikes,
                    display_order
                `)
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                setPost(null);
                return;
            }

            // Fetch profile image if user_id exists
            let profileImage = null;
            if (data.user_id) {
                const { data: userData } = await supabase
                    .from('board_users')
                    .select('profile_image')
                    .eq('user_id', data.user_id)
                    .maybeSingle();
                profileImage = userData?.profile_image || null;
            }

            const transformedPost = {
                ...data,
                prefix: Array.isArray(data.prefix) ? data.prefix[0] : data.prefix,
                author_profile_image: profileImage,
                likes: data.likes || 0,
                dislikes: data.dislikes || 0
            };

            setPost(transformedPost as BoardPost);

            // NOTE: View counting is handled by useBoardDetail hook

        } catch (error) {
            console.error('게시글 로딩 실패:', error);
        }
    };

    // NOTE: incrementViews is now handled by useBoardDetail hook
    // Removed duplicate logic to prevent double-counting

    const handleDelete = async () => {
        if (!post) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            setUpdating(true);
            const { error } = await supabase
                .from('board_posts')
                .delete()
                .eq('id', post.id);

            if (error) throw error;

            alert('게시글이 삭제되었습니다.');
            navigate('/board');
        } catch (error) {
            console.error('게시글 삭제 실패:', error);
            alert('게시글 삭제 중 오류가 발생했습니다.');
        } finally {
            setUpdating(false);
        }
    };

    const handleEdit = () => {
        // Permission check
        if (!isAdmin && post?.user_id !== user?.id) {
            alert('본인이 작성한 글만 수정할 수 있습니다.');
            return;
        }
        setShowEditorModal(true);
    };

    const handleToggleHidden = async () => {
        if (!post || !isAdmin) return;

        try {
            const newHiddenState = !post.is_hidden;
            const { error } = await supabase
                .from('board_posts')
                .update({ is_hidden: newHiddenState })
                .eq('id', post.id);

            if (error) throw error;

            setPost(prev => prev ? { ...prev, is_hidden: newHiddenState } : null);
            alert(`게시글이 ${newHiddenState ? '숨김' : '공개'} 처리되었습니다.`);
        } catch (error) {
            console.error('숨김 처리 실패:', error);
            alert('오류가 발생했습니다.');
        }
    };

    const handlePostUpdated = () => {
        if (id) loadPost(id);
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
                                    className="board-detail-prefix"
                                    style={{ backgroundColor: post.prefix.color }}
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
                <div className="board-detail-body">
                    {/* Image Display in Detail View (Moved here) */}
                    {(post as any).image && (
                        <div className="board-detail-image-container" style={{ marginBottom: '20px' }}>
                            <img
                                src={(post as any).image}
                                alt="Post Image"
                                style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '500px', objectFit: 'contain' }}
                            />
                        </div>
                    )}
                    {post.content}
                </div>

                {/* Comment Section */}
                <CommentSection postId={post.id} category={post.category || 'free'} />

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
    );
}
