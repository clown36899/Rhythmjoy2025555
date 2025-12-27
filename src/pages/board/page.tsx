
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../hooks/useModal';
import type { UserData } from './components/UserRegistrationModal';
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
  is_hidden?: boolean;
  category?: string; // Added for category management
  prefix_id?: number;
  prefix?: {
    id: number;
    name: string;
    color: string;
    admin_only: boolean;
  };
  created_at: string;
  updated_at: string;
  image?: string;
  image_thumbnail?: string;
  comment_count?: number;
  likes: number; // Heart count
  favorites: number; // Star count (Migrated from old likes)
  dislikes?: number; // Added for anonymous board
  display_order?: number; // Added for pinning/sorting
}

export default function BoardPage() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const postEditorModal = useModal('postEditor');

  const boardUserManagementModal = useModal('boardUserManagement');
  const boardPrefixManagementModal = useModal('boardPrefixManagement');
  const userRegistrationModal = useModal('userRegistration');


  const [userData, setUserData] = useState<UserData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 10;
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPosts();
  }, []);

  // Realtime subscription for board_posts
  useEffect(() => {
    console.log('[Realtime] Subscribing to board_posts');

    const channel = supabase
      .channel('board_posts_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'board_posts'
        },
        (payload) => {
          console.log(`[Realtime] ${payload.eventType} event received:`, payload);

          // Handle INSERT - add new post to top without reload
          if (payload.eventType === 'INSERT' && payload.new) {
            const newPost = payload.new as any;

            setPosts(prevPosts => [
              {
                ...newPost,
                prefix: null,
                author_profile_image: null,
                comment_count: 0
              } as BoardPost,
              ...prevPosts
            ]);

            console.log('[Realtime] Added new post without reload');
            return;
          }

          // Handle UPDATE - update specific post without reload
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newData = payload.new as any;

            console.log('[Realtime] Attempting to update post:', newData.id);

            setPosts(prevPosts =>
              prevPosts.map(post =>
                String(post.id) === String(newData.id)
                  ? {
                    ...post,
                    ...newData, // Updates title, content, etc.
                    likes: newData.likes || 0,
                    dislikes: newData.dislikes || 0,
                    views: newData.views || post.views,
                    comment_count: newData.comment_count !== undefined ? newData.comment_count : post.comment_count
                  }
                  : post
              )
            );

            console.log('[Realtime] Updated post without reload');
            return;
          }

          // Handle DELETE - remove post from list without reload
          if (payload.eventType === 'DELETE' && payload.old) {
            const deletedPost = payload.old as any;

            console.log('[Realtime] Attempting to delete post:', deletedPost.id);

            setPosts(prevPosts =>
              prevPosts.filter(post => String(post.id) !== String(deletedPost.id))
            );

            console.log('[Realtime] Removed post without reload');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Successfully subscribed to board_posts');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error occurred');
        } else if (status === 'TIMED_OUT') {
          console.error('[Realtime] Subscription timed out');
        }
      });

    return () => {
      console.log('[Realtime] Unsubscribing from board_posts');
      supabase.removeChannel(channel);
    };
  }, []);

  // 세션 타임아웃 및 활동 추적
  useEffect(() => {
    if (!user) return;

    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30분
    let lastActivity = Date.now();
    let hasLoggedOut = false; // 로그아웃 중복 방지

    // 활동 감지 함수
    const updateActivity = () => {
      lastActivity = Date.now();
    };

    // 이벤트 리스너 등록
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    // 타임아웃 체크
    const checkTimeout = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;

      // 30분 후 자동 로그아웃 (경고 없이)
      if (inactiveTime >= SESSION_TIMEOUT && !hasLoggedOut) {
        hasLoggedOut = true;
        clearInterval(checkTimeout);
        alert('30분 동안 활동이 없어 자동 로그아웃됩니다.');
        handleLogout();
      }
    }, 5000); // 5초마다 체크 (1초는 너무 자주 체크)

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(checkTimeout);
    };
  }, [user]); // user만 의존성으로 설정

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

  useEffect(() => {
    if (user) {
      // checkUserRegistration handled by loadUserData effect
    }
  }, [user]);

  useEffect(() => {
    const handleOpenUserManagement = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      boardUserManagementModal.open();
    };

    const handleOpenRegistrationPreview = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      userRegistrationModal.open({
        onClose: () => {
          const returnPath = sessionStorage.getItem('previewReturnPath');
          if (returnPath && returnPath !== '/board') {
            navigate(returnPath);
          }
          sessionStorage.removeItem('previewReturnPath');
        },
        onRegistered: () => { }
      });
    };

    const handleOpenPrefixManagement = () => {
      if (!isAdmin) {
        console.warn('관리자 권한이 필요합니다.');
        return;
      }
      boardPrefixManagementModal.open();
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



  const loadPosts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
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
          comment_count,
          created_at, 
          updated_at,
          category,
          likes,
          dislikes
        `)
        .order('is_notice', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('SUPABASE ERROR:', error);
        throw error;
      }

      console.log('--- SUPABASE RAW DATA ---');
      if (data && data.length > 0) {
        console.log('Sample Post [0]:', data[0]);
        console.log('Has comment_count?', 'comment_count' in data[0]);
        console.log('Value of comment_count:', data[0].comment_count);
      } else {
        console.log('No data returned');
      }
      console.log('-------------------------');

      // Fetch profile images for posts with user_id
      const postsWithProfiles = await Promise.all(
        (data || []).map(async (post: any) => {
          let profileImage = null;
          if (post.user_id) {
            const { data: userData } = await supabase
              .from('board_users')
              .select('profile_image')
              .eq('user_id', post.user_id)
              .maybeSingle();
            profileImage = userData?.profile_image || null;
          }
          return {
            ...post,
            prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
            author_profile_image: profileImage,
            comment_count: post.comment_count || 0
          };
        })
      );

      setPosts(postsWithProfiles as BoardPost[]);
    } catch (error) {
      console.error('게시글 로딩 실패:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handlePostClick = (post: BoardPost) => {
    navigate(`/board/${post.id}`);
  };

  const handlePostCreated = () => {
    // Pure Optimistic Update (Realtime) - No reload
    // loadPosts();
    // setCurrentPage(1);
    console.log('[BoardPage] Post created/updated. Waiting for Realtime update...');
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
    const handleBoardWriteClick = () => {
      // Dispatch event to MobileShell to handle auth/reg flow
      window.dispatchEvent(new CustomEvent('requestProtectedAction', {
        detail: {
          action: () => {
            postEditorModal.open({
              post: null,
              userNickname: userData?.nickname,
              onPostCreated: handlePostCreated
            });
          }
        }
      }));
    };

    window.addEventListener('boardWriteClick', handleBoardWriteClick);
    return () => {
      window.removeEventListener('boardWriteClick', handleBoardWriteClick);
    };
  }, [user, userData]);

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
      {/* GlobalLoadingOverlay is handled by MobileShell */}

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



      {/* Modals are now handled by ModalRegistry */}


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
