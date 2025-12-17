
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import PostEditorModal from './components/PostEditorModal';

import UserRegistrationModal, { type UserData } from './components/UserRegistrationModal';
import ProfileEditModal from './components/ProfileEditModal';
import BoardUserManagementModal from '../../components/BoardUserManagementModal';
import BoardPrefixManagementModal from '../../components/BoardPrefixManagementModal';
import GlobalLoadingOverlay from '../../components/GlobalLoadingOverlay';
import './board.css';

export interface BoardPost {
  id: number;
  title: string;
  content: string;
  author_name: string;
  author_nickname?: string;
  author_profile_image?: string;
  password?: string;
  user_id?: string;
  views: number;
  is_notice?: boolean;
  prefix_id?: number;
  prefix?: {
    id: number;
    name: string;
    color: string;
    admin_only: boolean;
  };
  created_at: string;
  updated_at: string;
}

export default function BoardPage() {
  const { user, isAdmin, signInWithKakao, signOut } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);

  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showRegistrationPreview, setShowRegistrationPreview] = useState(false);
  const [showPrefixManagementModal, setShowPrefixManagementModal] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [warningShown, setWarningShown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 10;
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPosts();
  }, []);

  // 세션 타임아웃 및 활동 추적
  useEffect(() => {
    if (!user) return;

    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30분
    const WARNING_TIME = 5 * 60 * 1000; // 5분 전 경고

    // 활동 감지 함수
    const updateActivity = () => {
      setLastActivityTime(Date.now());
      setWarningShown(false); // 활동 시 경고 플래그 리셋
    };

    // 이벤트 리스너 등록
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    // 타임아웃 체크
    const checkTimeout = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityTime;

      // 25분 후 경고 (5분 남음) - 한 번만 표시
      if (inactiveTime >= SESSION_TIMEOUT - WARNING_TIME && !warningShown) {
        setWarningShown(true);
        alert('5분 후 자동 로그아웃됩니다. 활동하시면 연장됩니다.');
      }

      // 30분 후 자동 로그아웃
      if (inactiveTime >= SESSION_TIMEOUT) {
        alert('30분 동안 활동이 없어 자동 로그아웃됩니다.');
        handleLogout();
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(checkTimeout);
    };
  }, [user, lastActivityTime, warningShown]);

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

    const handleOpenPrefixManagement = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      setShowPrefixManagementModal(true);
    };

    window.addEventListener('openBoardUserManagement', handleOpenUserManagement);
    window.addEventListener('openRegistrationFormPreview', handleOpenRegistrationPreview);
    window.addEventListener('openPrefixManagement', handleOpenPrefixManagement);

    return () => {
      window.removeEventListener('openBoardUserManagement', handleOpenUserManagement);
      window.removeEventListener('openRegistrationFormPreview', handleOpenRegistrationPreview);
      window.removeEventListener('openPrefixManagement', handleOpenPrefixManagement);
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
          gender: data.gender,
          profile_image: data.profile_image || undefined
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
        .order('is_notice', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profile images for posts with user_id
      const postsWithProfiles = await Promise.all(
        (data || []).map(async (post: any) => {
          let profileImage = null;
          if (post.user_id) {
            const { data: userData } = await supabase
              .from('board_users')
              .select('profile_image')
              .eq('user_id', post.user_id)
              .single();
            profileImage = userData?.profile_image || null;
          }
          return {
            ...post,
            prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
            author_profile_image: profileImage
          };
        })
      );

      setPosts(postsWithProfiles as BoardPost[]);
    } catch (error) {
      console.error('게시글 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = (post: BoardPost) => {
    navigate(`/board/${post.id}`);
  };

  const handlePostCreated = () => {
    loadPosts();
    setCurrentPage(1); // 새 글 작성 시 첫 페이지로
  };





  // 페이지네이션 계산
  const totalPages = Math.ceil(posts.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = posts.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUserData(null);
      alert('로그아웃되었습니다.');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
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

  // Global Header Event Listener for Write Button
  useEffect(() => {
    const handleBoardWriteClick = async () => {
      // 1. Check Login
      if (!user) {
        if (window.confirm('로그인이 필요한 서비스입니다.\n카카오 로그인을 하시겠습니까?')) {
          try {
            setIsLoggingIn(true);
            await signInWithKakao();
          } catch (error: any) {
            alert('로그인 중 오류가 발생했습니다.');
          } finally {
            setIsLoggingIn(false);
          }
        }
        return;
      }

      // 2. Check Registration (Nickname)
      if (!userData) {
        setShowRegistrationModal(true);
        return;
      }

      // 3. Open Editor
      setSelectedPost(null);
      setShowEditorModal(true);
    };

    window.addEventListener('boardWriteClick', handleBoardWriteClick);
    return () => {
      window.removeEventListener('boardWriteClick', handleBoardWriteClick);
    };
  }, [user, userData, signInWithKakao]);

  // Search from header
  useEffect(() => {
    const handleOpenSearch = () => setShowSearchModal(true);
    window.addEventListener('openEventSearch', handleOpenSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenSearch);
  }, []);

  // Filter posts based on search query
  const filteredPosts = searchQuery.trim()
    ? posts.filter(post => {
      const query = searchQuery.toLowerCase();
      return (
        post.title?.toLowerCase().includes(query) ||
        post.content?.toLowerCase().includes(query) ||
        post.author_name?.toLowerCase().includes(query) ||
        post.author_nickname?.toLowerCase().includes(query)
      );
    })
    : posts;

  return (
    <div className="board-page-container">
      <GlobalLoadingOverlay isLoading={isLoggingIn} message="로그인 중입니다..." />

      {/* Header removed - now using Global Header */}


      {/* Post List */}
      <div className="board-posts-container">
        {loading ? (
          <div className="board-loading-container">
            <i className="ri-loader-4-line board-loading-spinner"></i>
            <p className="board-loading-text">로딩 중...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="board-empty-container">
            <i className="ri-chat-3-line board-empty-icon"></i>
            <p className="board-empty-text">첫 번째 게시글을 작성해보세요!</p>
          </div>
        ) : (
          <>
            <div className="board-posts-list">
              {currentPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => handlePostClick(post)}
                  className={`board-post-card ${post.is_notice
                    ? 'board-post-card-notice'
                    : 'board-post-card-normal'
                    }`}
                >
                  <div className="board-post-header">
                    {post.prefix && (
                      <span
                        className="board-post-prefix"
                        style={{ backgroundColor: post.prefix.color }}
                      >
                        {post.prefix.name}
                      </span>
                    )}
                    <h3
                      className={`board-post-title ${post.is_notice
                        ? 'board-post-title-notice'
                        : 'board-post-title-normal'
                        }`}
                    >
                      {post.title}
                    </h3>
                  </div>
                  <p className="board-post-content">{post.content}</p>
                  <div className="board-post-meta">
                    <div className="board-post-meta-left">
                      <span className="board-post-meta-item">
                        {post.author_profile_image ? (
                          <img
                            src={post.author_profile_image}
                            alt="Profile"
                            className="board-post-author-avatar"
                          />
                        ) : (
                          <i className="ri-user-line board-post-meta-icon"></i>
                        )}
                        {post.author_nickname || post.author_name}
                      </span>
                      <span className="board-post-meta-item">
                        <i className="ri-eye-line board-post-meta-icon"></i>
                        {post.views}
                      </span>
                    </div>
                    <span>{formatDate(post.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="board-pagination">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="board-page-btn"
                >
                  <i className="ri-arrow-left-s-line"></i>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
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
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="board-page-btn"
                >
                  <i className="ri-arrow-right-s-line"></i>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Registration Modal */}
      {
        showRegistrationModal && user && (
          <UserRegistrationModal
            isOpen={showRegistrationModal}
            onClose={() => setShowRegistrationModal(false)}
            onRegistered={handleUserRegistered}
            userId={user.id}
          />
        )
      }

      {/* Profile Edit Modal */}
      {
        showProfileEditModal && userData && user && (
          <ProfileEditModal
            isOpen={showProfileEditModal}
            onClose={() => setShowProfileEditModal(false)}
            currentUser={{
              nickname: userData.nickname,
              profile_image: userData.profile_image
            }}
            onProfileUpdated={checkUserRegistration}
            userId={user.id}
          />
        )
      }

      {/* User Management Modal (Admin Only) */}
      {
        showUserManagementModal && isAdmin && (
          <BoardUserManagementModal
            isOpen={showUserManagementModal}
            onClose={() => setShowUserManagementModal(false)}
          />
        )
      }

      {/* Registration Form Preview (Admin Only) */}
      {
        showRegistrationPreview && isAdmin && (
          <UserRegistrationModal
            isOpen={showRegistrationPreview}
            onClose={() => setShowRegistrationPreview(false)}
            onRegistered={() => { }}
            userId="preview"
            previewMode={true}
          />
        )
      }

      {/* Prefix Management Modal (Admin Only) */}
      {
        showPrefixManagementModal && isAdmin && (
          <BoardPrefixManagementModal
            isOpen={showPrefixManagementModal}
            onClose={() => setShowPrefixManagementModal(false)}
          />
        )
      }

      {/* Editor Modal */}
      {
        showEditorModal && userData && (
          <PostEditorModal
            isOpen={showEditorModal}
            onClose={() => setShowEditorModal(false)}
            onPostCreated={handlePostCreated}
            post={selectedPost}
            userNickname={userData.nickname}
          />
        )
      }


      {/* Search Modal */}
      {showSearchModal && (
        <div className="board-search-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="board-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="board-search-header">
              <input
                type="text"
                className="board-search-input"
                placeholder="게시물 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button className="board-search-close" onClick={() => setShowSearchModal(false)}>
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="board-search-results">
              {searchQuery.trim() === '' ? (
                <div className="board-search-empty">검색어를 입력하세요</div>
              ) : filteredPosts.length === 0 ? (
                <div className="board-search-empty">검색 결과가 없습니다</div>
              ) : (
                filteredPosts.map(post => (
                  <div
                    key={post.id}
                    className="board-search-item"
                    onClick={() => {
                      setShowSearchModal(false);
                      setSearchQuery('');
                      handlePostClick(post);
                    }}
                  >
                    <div className="board-search-item-content">
                      {post.prefix && (
                        <span
                          className="board-search-item-prefix"
                          style={{ backgroundColor: post.prefix.color }}
                        >
                          {post.prefix.name}
                        </span>
                      )}
                      <div className="board-search-item-title">{post.title}</div>
                      <div className="board-search-item-preview">{post.content}</div>
                      <div className="board-search-item-meta">
                        <span>
                          {post.author_profile_image ? (
                            <img
                              src={post.author_profile_image}
                              alt="Profile"
                              className="board-search-author-avatar"
                            />
                          ) : (
                            <i className="ri-user-line"></i>
                          )}
                          {post.author_nickname || post.author_name}
                        </span>
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
