import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import PostEditorModal from '../components/PostEditorModal'; // Reusing the editor modal
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import CommentSection from '../components/CommentSection';
import UserRegistrationModal, { type UserData } from '../components/UserRegistrationModal';
import '../board.css';
import './detail.css';
import type { BoardPost } from '../page';

export default function BoardDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isAdmin, signInWithKakao } = useAuth();
    const [post, setPost] = useState<BoardPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
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
                    .select('nickname, real_name, phone, gender, profile_image')
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

    const handleUserRegistered = (newUserData: UserData) => {
        setUserData({
            ...newUserData,
            gender: 'other'
        });
    };

    const loadPost = async (postId: string) => {
        try {
            setLoading(true);
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
                    prefix_id,
                    prefix:board_prefixes(id, name, color, admin_only),
                    created_at, 
                    updated_at
                `)
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                setPost(null);
                setLoading(false);
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
                author_profile_image: profileImage
            };

            setPost(transformedPost as BoardPost);

            // Increment views
            incrementViews(postId, data.views);

        } catch (error) {
            console.error('게시글 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const incrementViews = async (postId: string, currentViews: number) => {
        // Check if user has already viewed this post
        const viewedPosts = JSON.parse(localStorage.getItem('viewedPosts') || '[]');

        if (!viewedPosts.includes(postId)) {
            // User hasn't viewed this post yet, increment view count
            await supabase
                .from('board_posts')
                .update({ views: currentViews + 1 })
                .eq('id', postId);

            // Mark this post as viewed
            viewedPosts.push(postId);
            localStorage.setItem('viewedPosts', JSON.stringify(viewedPosts));
        }
    };

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

    if (loading) {
        return (
            <div className="board-detail-container">
                <div className="board-detail-loading">
                    <i className="ri-loader-4-line"></i>
                    <p>게시글을 불러오는 중...</p>
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
                <div className="board-header-content" style={{ justifyContent: 'flex-start' }}>
                    <button
                        onClick={() => navigate('/board')}
                        className="board-header-back-btn"
                    >
                        <span>❮ 돌아가기</span>
                    </button>
                </div>
            </div>

            <div className="board-detail-content-wrapper">
                {/* Header Section */}
                <div className="board-detail-header">
                    <div className="board-detail-title-section">
                        {post.prefix && (
                            <span
                                className="board-detail-prefix"
                                style={{ backgroundColor: post.prefix.color }}
                            >
                                {post.prefix.name}
                            </span>
                        )}
                        <h1 className="board-detail-title">{post.title}</h1>
                    </div>

                    <div className="board-detail-meta">
                        <div className="board-detail-meta-item">
                            {post.author_profile_image ? (
                                <img
                                    src={post.author_profile_image}
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
                    </div>
                </div>

                {/* Body Section */}
                <div className="board-detail-body">
                    {post.content}
                </div>

                {/* Comment Section */}
                <CommentSection postId={post.id} />

                {/* Actions Section */}
                <div className="board-detail-actions">
                    <button
                        onClick={() => navigate('/board')}
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
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Post Editor Modal for Editing */}
            {showEditorModal && (
                <PostEditorModal
                    isOpen={showEditorModal}
                    onClose={() => setShowEditorModal(false)}
                    onPostCreated={handlePostUpdated} // It's actually updated
                    post={post}
                    userNickname={userData?.nickname || post.author_nickname || "익명"} // Use current nickname if available
                />
            )}

            {/* Registration Modal */}
            {
                showRegistrationModal && (
                    <UserRegistrationModal
                        isOpen={showRegistrationModal}
                        onClose={() => setShowRegistrationModal(false)}
                        onRegistered={async (newUserData) => {
                            try {
                                let currentUserId = user?.id;

                                if (!currentUserId) {
                                    await signInWithKakao();
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    const { data: { user: newUser } } = await supabase.auth.getUser();
                                    if (newUser) currentUserId = newUser.id;
                                }

                                if (currentUserId) {
                                    // Check if nickname taken by ANOTHER user
                                    const { data: nameTakenByOther } = await supabase
                                        .from('board_users')
                                        .select('user_id')
                                        .eq('nickname', newUserData.nickname)
                                        .neq('user_id', currentUserId)
                                        .maybeSingle();

                                    if (nameTakenByOther) {
                                        alert(`'${newUserData.nickname}'은(는) 이미 다른 사용자가 사용 중인 닉네임입니다. 다른 닉네임을 선택해주세요.`);
                                        return;
                                    }

                                    // Save to DB
                                    const { error } = await supabase.from('board_users').upsert({
                                        user_id: currentUserId,
                                        nickname: newUserData.nickname,
                                        gender: 'other',
                                        updated_at: new Date().toISOString()
                                    }, { onConflict: 'user_id' });

                                    if (error) {
                                        console.error('가입 저장 실패:', error);
                                        alert(`가입 저장 실패: ${error.message}`);
                                        return;
                                    }

                                    localStorage.setItem('is_registered', 'true');
                                    handleUserRegistered({
                                        ...newUserData,
                                        gender: 'other'
                                    });
                                }
                                setShowRegistrationModal(false);
                            } catch (error) {
                                console.error('가입 중 오류:', error);
                            }
                        }}
                        userId={user?.id}
                    />
                )
            }
        </div>
    );
}
