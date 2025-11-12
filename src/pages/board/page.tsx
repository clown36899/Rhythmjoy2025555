import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import PostEditorModal from './components/PostEditorModal';
import PostDetailModal from './components/PostDetailModal';
import UserRegistrationModal, { type UserData } from './components/UserRegistrationModal';
import BoardUserManagementModal from '../../components/BoardUserManagementModal';

export interface BoardPost {
  id: number;
  title: string;
  content: string;
  author_name: string;
  author_nickname?: string;
  password?: string;
  user_id?: string;
  views: number;
  created_at: string;
  updated_at: string;
}

export default function BoardPage() {
  const { user, isAdmin, signInWithKakao } = useAuth();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showRegistrationPreview, setShowRegistrationPreview] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    if (user) {
      checkUserRegistration();
    }
  }, [user]);

  useEffect(() => {
    const handleOpenUserManagement = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      setShowUserManagementModal(true);
    };

    const handleOpenRegistrationPreview = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      setShowRegistrationPreview(true);
    };

    window.addEventListener('openBoardUserManagement', handleOpenUserManagement);
    window.addEventListener('openRegistrationFormPreview', handleOpenRegistrationPreview);

    return () => {
      window.removeEventListener('openBoardUserManagement', handleOpenUserManagement);
      window.removeEventListener('openRegistrationFormPreview', handleOpenRegistrationPreview);
    };
  }, [isAdmin]);

  const checkUserRegistration = async () => {
    if (!user?.id) return;
    
    // 관리자는 회원가입 없이 바로 사용 가능
    if (isAdmin) {
      console.log('[게시판] 관리자 모드 - 회원가입 불필요');
      setUserData({
        nickname: '관리자',
        real_name: '관리자',
        phone: '',
        gender: 'other'
      });
      return;
    }

    try {
      // RPC 함수로 본인 정보 조회
      const { data, error } = await supabase.rpc('get_my_board_user', {
        p_user_id: user.id
      });

      if (error) {
        console.error('회원 정보 조회 실패:', error);
        return;
      }

      if (data) {
        setUserData({
          nickname: data.nickname,
          real_name: data.real_name,
          phone: data.phone,
          gender: data.gender
        });
      } else {
        // 일반 사용자만 회원가입 모달 표시
        setShowRegistrationModal(true);
      }
    } catch (error) {
      console.error('회원 정보 확인 실패:', error);
    }
  };

  const handleUserRegistered = (newUserData: UserData) => {
    setUserData(newUserData);
  };

  const loadPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('board_posts')
        .select('id, title, content, author_name, author_nickname, user_id, views, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('게시글 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = async (post: BoardPost) => {
    try {
      // 조회수 증가
      await supabase
        .from('board_posts')
        .update({ views: post.views + 1 })
        .eq('id', post.id);

      // 업데이트된 데이터로 상세보기 열기
      setSelectedPost({ ...post, views: post.views + 1 });
      setShowDetailModal(true);
    } catch (error) {
      console.error('조회수 증가 실패:', error);
      setSelectedPost(post);
      setShowDetailModal(true);
    }
  };

  const handlePostCreated = () => {
    loadPosts();
  };

  const handlePostUpdated = () => {
    loadPosts();
  };

  const handlePostDeleted = () => {
    loadPosts();
    setShowDetailModal(false);
  };

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

  return (
    <div className="min-h-screen bg-gray-900 pb-32">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">자유게시판</h1>
          {user && userData ? (
            <button
              onClick={() => {
                setSelectedPost(null);
                setShowEditorModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <i className="ri-add-line"></i>
              글쓰기
            </button>
          ) : !user ? (
            <button
              onClick={async () => {
                try {
                  await signInWithKakao();
                } catch (error) {
                  console.error('로그인 실패:', error);
                  alert('로그인에 실패했습니다. 다시 시도해주세요.');
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <i className="ri-kakao-talk-fill"></i>
              카카오 로그인
            </button>
          ) : (
            <button
              disabled
              className="bg-gray-600 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 cursor-not-allowed"
            >
              <i className="ri-add-line"></i>
              회원가입 중...
            </button>
          )}
        </div>
      </div>

      {/* Post List */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="text-center py-12">
            <i className="ri-loader-4-line text-3xl text-blue-500 animate-spin"></i>
            <p className="text-gray-400 mt-2">로딩 중...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <i className="ri-chat-3-line text-5xl text-gray-600 mb-4"></i>
            <p className="text-gray-400">첫 번째 게시글을 작성해보세요!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => handlePostClick(post)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:bg-gray-750 transition-colors cursor-pointer"
              >
                <h3 className="text-white font-medium mb-2 line-clamp-1">
                  {post.title}
                </h3>
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                  {post.content}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <i className="ri-user-line"></i>
                      {post.author_nickname || post.author_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="ri-eye-line"></i>
                      {post.views}
                    </span>
                  </div>
                  <span>{formatDate(post.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registration Modal */}
      {showRegistrationModal && user && (
        <UserRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onRegistered={handleUserRegistered}
          userId={user.id}
        />
      )}

      {/* User Management Modal (Admin Only) */}
      {showUserManagementModal && isAdmin && (
        <BoardUserManagementModal
          isOpen={showUserManagementModal}
          onClose={() => setShowUserManagementModal(false)}
        />
      )}

      {/* Registration Form Preview (Admin Only) */}
      {showRegistrationPreview && isAdmin && (
        <UserRegistrationModal
          isOpen={showRegistrationPreview}
          onClose={() => setShowRegistrationPreview(false)}
          onRegistered={() => {}}
          userId="preview"
          previewMode={true}
        />
      )}

      {/* Editor Modal */}
      {showEditorModal && userData && (
        <PostEditorModal
          isOpen={showEditorModal}
          onClose={() => setShowEditorModal(false)}
          onPostCreated={handlePostCreated}
          post={selectedPost}
          userNickname={userData.nickname}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedPost && (
        <PostDetailModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          post={selectedPost}
          onEdit={(post) => {
            setSelectedPost(post);
            setShowDetailModal(false);
            setShowEditorModal(true);
          }}
          onDelete={handlePostDeleted}
          onUpdate={handlePostUpdated}
        />
      )}
    </div>
  );
}
