import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../hooks/useModal';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { usePageAction } from '../contexts/PageActionContext';
import { BottomNavigation } from './BottomNavigation';
import SideDrawer from '../components/SideDrawer';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { logUserInteraction } from '../lib/analytics';
import GlobalLoadingOverlay from '../components/GlobalLoadingOverlay';
import GlobalNoticePopup from '../components/GlobalNoticePopup';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { PlaylistModal } from '../pages/learning/components/PlaylistModal';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import { ThemeToggle } from '../components/ThemeToggle';
import { useLoading } from '../contexts/LoadingContext';
import '../styles/components/MobileShell.css';

interface MobileShellProps {
  isAdmin?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({ isAdmin: isAdminProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, isAdmin: authIsAdmin, isAuthProcessing, isLoggingOut, cancelAuth, isAuthCheckComplete } = useAuth();
  const { i18n } = useTranslation();
  const onlineUsersData = useOnlineUsers();
  const { action: pageAction } = usePageAction();
  const { activeResource, isMinimized, closePlayer, minimizePlayer, restorePlayer } = useGlobalPlayer();


  // Modals

  const userRegistrationModal = useModal('userRegistration');
  const loginModal = useModal('login');

  const siteAnalyticsModal = useModal('siteAnalytics');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const notificationSettingsModal = useModal('notificationSettings');
  const { isGlobalLoading, globalLoadingMessage } = useLoading();
  const [calendarView, setCalendarView] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  // unused state removed
  const [totalUserCount, setTotalUserCount] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || 'all'; // Derived from URL query

  const currentPath = location.pathname;
  const isEventsPage = currentPath === '/v2' || currentPath === '/';
  const isBoardPage = currentPath.startsWith('/board');
  const isSocialPage = currentPath.startsWith('/social');
  const isPracticePage = currentPath.startsWith('/practice');
  const isShoppingPage = currentPath.startsWith('/shopping');
  const isGuidePage = currentPath.startsWith('/guide');
  const isCalendarPage = currentPath === '/calendar';
  const isMyActivitiesPage = currentPath === '/my-activities';
  const isArchivePage = currentPath.startsWith('/learning') || currentPath.startsWith('/history') || (currentPath === '/board' && category === 'history');
  const isLearningDetailPage = currentPath.startsWith('/learning/') && currentPath !== '/learning';

  const isAdmin = isAdminProp || authIsAdmin;

  // Fetch total registered users count
  useEffect(() => {
    const fetchTotalUserCount = async () => {
      try {
        const { count, error } = await supabase
          .from('board_users')
          .select('*', { count: 'exact', head: true });

        if (!error && count !== null) {
          setTotalUserCount(count);
        }
      } catch (err) {
        console.error('Error fetching total user count:', err);
      }
    };

    fetchTotalUserCount();

    // 🔥 실시간 가입자 수 동기화 개정
    // INSERT(신규 가입) 및 DELETE(탈퇴 등) 감지 시 카운트 즉시 갱신
    const channel = supabase
      .channel('registered-users-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_users' },
        (payload) => {
          console.log('[Realtime] board_users change detected:', payload.eventType);
          // 가입(INSERT) 또는 삭제(DELETE) 발생 시에만 DB에서 최신 카운트 재조회
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            fetchTotalUserCount();
          }
        }
      )
      .subscribe((status) => {
        // console.log('[Realtime] Subscriber count subscription status:', status);
        if (status === 'SUBSCRIBED') {
          fetchTotalUserCount(); // 연결 시점에 다시 한 번 동기화
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Show login modal on first visit if not logged in
  useEffect(() => {
    // Only run on main pages (not on specific detail pages)
    if (!isEventsPage) return;

    // Wait for auth check to complete
    if (!isAuthCheckComplete) return;

    // Check if user is not logged in
    if (user) return;

    // [Standard Fix] Logout guard: Don't show login prompt immediately after logging out
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    const storagePrefix = isPWA ? 'pwa-' : '';
    const isLoggingOut = localStorage.getItem(`${storagePrefix}isLoggingOut`) === 'true';

    if (isLoggingOut) {
      // Consume the flag and mark as shown to prevent popup for this session
      localStorage.removeItem(`${storagePrefix}isLoggingOut`);
      sessionStorage.setItem('hasShownLoginPrompt', 'true');
      return;
    }

    // Check if we've already shown the modal in this session
    const hasShownLoginPrompt = sessionStorage.getItem('hasShownLoginPrompt');
    if (hasShownLoginPrompt) return;

    // [Fix] Already open check to prevent flicker on redundant calls
    if (loginModal.isOpen) return;

    // Show login modal immediately
    loginModal.open({ message: '댄스빌보드 로그인' });
    sessionStorage.setItem('hasShownLoginPrompt', 'true');
  }, [user, isEventsPage, loginModal.isOpen, loginModal.open, isAuthCheckComplete]);

  // 🔄 Global Scroll Reset on Route Change
  useEffect(() => {
    // 1. Reset Window Scroll (Standard Mode)
    window.scrollTo(0, 0);

    // 2. Reset Container Scroll (Wide Mode / Custom Layouts)
    const shellContainer = document.querySelector('.shell-container');
    if (shellContainer) {
      shellContainer.scrollTop = 0;
    }
  }, [location.pathname]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleToggleDrawer = () => setIsDrawerOpen(prev => !prev);
    const handleUpdateCalendarView = (e: any) => {
      if (e.detail) {
        setCalendarView({ year: e.detail.year, month: e.detail.month });
      }
    };
    const handleToggleFullscreen = () => setIsFullscreen(prev => !prev);

    window.addEventListener('toggleDrawer', handleToggleDrawer);
    window.addEventListener('updateCalendarView', handleUpdateCalendarView);
    window.addEventListener('toggleFullscreen', handleToggleFullscreen);

    return () => {
      window.removeEventListener('toggleDrawer', handleToggleDrawer);
      window.removeEventListener('updateCalendarView', handleUpdateCalendarView);
      window.removeEventListener('toggleFullscreen', handleToggleFullscreen);
    };
  }, []);

  // Login & Profile Modal Handlers
  useEffect(() => {
    const handleOpenUserProfile = () => {
      if (user) {
        setIsDrawerOpen(true);
      } else {
        setIsDrawerOpen(true);
      }
    };



    const handleProtectedAction = (e: any) => {
      const { message } = e.detail || {};
      loginModal.open({
        message: message || '댄스빌보드 로그인'
      });
    };

    // Standardized Login Modal Event
    const handleOpenLoginModal = (e: any) => {
      const { message } = e.detail || {};
      loginModal.open({
        message: message || '댄스빌보드 로그인'
      });
    };

    window.addEventListener('openUserProfile', handleOpenUserProfile);
    window.addEventListener('requestProtectedAction', handleProtectedAction);
    window.addEventListener('openLoginModal', handleOpenLoginModal);

    return () => {
      window.removeEventListener('openUserProfile', handleOpenUserProfile);
      window.removeEventListener('requestProtectedAction', handleProtectedAction);
      window.removeEventListener('openLoginModal', handleOpenLoginModal);
    };
  }, [user, userRegistrationModal, loginModal]);

  const changeLanguage = (lng: string) => {
    // Google Translate 호출
    if (typeof window !== 'undefined' && (window as any).changeLanguage) {
      (window as any).changeLanguage(lng);
    }

    // i18next도 함께 업데이트
    i18n.changeLanguage(lng);
    logUserInteraction('Language', 'Change', lng);
  };

  const adminStats = useMemo(() => {
    if (!isAdmin) return null;
    const loggedInCount = onlineUsersData.loggedInUsers?.length || 0;
    const anonymousCount = onlineUsersData.anonymousCount || 0;

    return (
      <span
        className="admin-stats-badge"
        onClick={(e) => {
          e.stopPropagation();
          siteAnalyticsModal.open();
        }}
        title="운영 통계 리포트 보기"
      >
        <span key={`logged-in-${loggedInCount}`} className="stat-logged-count">{loggedInCount}</span>
        <span key="separator" className="stat-separator">/</span>
        <span key={`anonymous-${anonymousCount}`} className="stat-anon-count">{anonymousCount}</span>

        {totalUserCount !== null && (
          <span key={`total-count-${totalUserCount}`} className="stat-total-count">
            ({totalUserCount})
          </span>
        )}
      </span>
    );
  }, [isAdmin, onlineUsersData.loggedInUsers?.length, onlineUsersData.anonymousCount, totalUserCount, siteAnalyticsModal]);

  // Layout Mode: Determine if we need wide layout (for full-screen features like Swinpedia)
  const isWideLayout = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const category = searchParams.get('category');
    return currentPath.startsWith('/learning') || currentPath.startsWith('/history') || (currentPath === '/board' && category === 'history');
  }, [currentPath, location.search]);

  // Apply global layout class to html (to override index.css max-width constraint on html & body)
  useEffect(() => {
    if (isWideLayout) {
      document.documentElement.classList.add('layout-wide-mode');
    } else {
      document.documentElement.classList.remove('layout-wide-mode');
    }
    return () => {
      document.documentElement.classList.remove('layout-wide-mode');
    };
  }, [isWideLayout]);

  const handlePageAction = () => {
    if (!pageAction) return;

    if (pageAction.requireAuth && !user) {
      window.dispatchEvent(new CustomEvent('requestProtectedAction', {
        detail: {
          message: '댄스빌보드 로그인',
          callback: () => {
            // 로그인 성공 후 실행할 동작
            pageAction.onClick();
          }
        }
      }));
      return;
    }

    pageAction.onClick();
  };

  return (
    <div className={`shell-container ${isWideLayout ? 'layout-wide' : 'layout-compact'} ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      {/* Global Fixed Header */}
      {!isFullscreen && (
        <header className="shell-header global-header-fixed">
          <div className="header-content-inner">
            {/* Left/Center Content based on Route */}
            <div className="header-left-content">

              {/* 1. Events Page, Archive, Board, Social, etc - 통합 렌더링 */}
              {!isCalendarPage && (
                <div
                  className={`header-events-content ${isLearningDetailPage ? 'with-back' : ''}`}
                >
                  {isLearningDetailPage ? (
                    <button
                      className="header-back-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/learning');
                      }}
                    >
                      <i className="ri-arrow-left-line"></i>
                    </button>
                  ) : (
                    <button
                      className="header-hamburger-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDrawerOpen(true);
                      }}
                      data-analytics-id="header_hamburger"
                      data-analytics-type="action"
                      data-analytics-title="사이드 메뉴"
                      data-analytics-section="header"
                    >
                      <i className="ri-menu-line"></i>
                    </button>
                  )}

                  {isEventsPage ? (
                    /* Main Page: Logo + Detailed Title - Wrapped for clickable area */
                    <div
                      onClick={() => window.location.reload()}
                      className="header-logo-container"
                      data-analytics-id="logo_home"
                      data-analytics-type="nav_item"
                      data-analytics-title="댄스빌보드 로고"
                      data-analytics-section="header"
                    >
                      {/* <img src="/logo.png" alt="Dance Billboard Logo" className="header-logo" referrerPolicy="no-referrer" /> */}
                      <div className="header-logo-text-wrapper">
                        <div className="header-logo-title-row">
                          <h1 className="header-logo-title">
                            댄스빌보드
                          </h1>
                          <span className="header-logo-tag">
                            korea
                          </span>
                        </div>
                        <span className="header-logo-domain">
                          {'swingenjoy.com'.split('').map((char, i) => (
                            <span key={`char-${i}-${char}`}>{char}</span>
                          ))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Other Pages: Simple Title Text */
                    <h1 className="header-title-simple">
                      {(() => {
                        if (isSocialPage) return '소셜';
                        if (isBoardPage) return '포럼';
                        if (isPracticePage) return '연습실';
                        if (isShoppingPage) return '쇼핑';
                        if (isGuidePage) return '안내';
                        if (isArchivePage) return '자료실';
                        if (isMyActivitiesPage) return '내 활동';
                        return '댄스빌보드';
                      })()}
                    </h1>
                  )}

                  {/* 이벤트·활동 페이지에 adminStats 표시 (Optional: Keep specifically for events page or strictly follow logic) */}
                  {/* User said "Header Title changes". Doesn't explicitely say remove stats. Keeping stats if relevant. */}
                  {(isEventsPage || isMyActivitiesPage) && (
                    <div className="admin-stats-wrapper">{adminStats}</div>
                  )}
                </div>
              )}
              {/* 2. Calendar Page (Full Screen) */}
              {isCalendarPage && (
                <div className="calendar-header-nav">
                  {/* Month Navigation Buttons */}
                  <div className="calendar-month-nav">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('prevMonth'))}
                      className="calendar-month-btn"
                    >
                      <i className="ri-arrow-left-s-line"></i>
                    </button>
                    <span
                      className="calendar-month-label calendar-month-label-clickable"
                      onClick={() => window.dispatchEvent(new CustomEvent('goToToday'))}
                    >
                      {String(calendarView.year).slice(-2)}년 {String(calendarView.month + 1).padStart(2, '0')}
                    </span>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('nextMonth'))}
                      className="calendar-month-btn"
                    >
                      <i className="ri-arrow-right-s-line"></i>
                    </button>
                    <button
                      className="calendar-today-header-btn"
                      onClick={() => window.dispatchEvent(new CustomEvent('goToToday'))}
                    >
                      오늘
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="header-right-buttons">
              <ThemeToggle />
              <button
                onClick={() => {
                  const nextLang = i18n.language === 'ko' ? 'en' : 'ko';
                  changeLanguage(nextLang);
                }}
                className="header-translate-btn"
                title={i18n.language === 'ko' ? 'Switch to English' : '한국어로 전환'}
                data-analytics-id="header_translate"
                data-analytics-type="action"
                data-analytics-title="번역 토글"
                data-analytics-section="header"
              >
                <div className="translate-icon-custom" translate="no">
                  <span className="ko-char">가</span>
                  <span className="divider">/</span>
                  <span className="en-char">A</span>
                </div>
              </button>

              {/* Search button - only visible when logged in */}
              {user && (
                <button
                  className="header-search-btn"
                  onClick={() => {
                    if (isCalendarPage) {
                      window.dispatchEvent(new CustomEvent('openCalendarSearch'));
                    } else {
                      window.dispatchEvent(new CustomEvent('openGlobalSearch'));
                    }
                  }}
                  data-analytics-id="header_search"
                  data-analytics-type="action"
                  data-analytics-title="검색"
                  data-analytics-section="header"
                >
                  <i className="ri-search-line"></i>
                </button>
              )}

              {/* User/Login button */}
              {user ? (
                <button
                  className="header-user-btn"
                  onClick={() => setIsDrawerOpen(true)}
                  title="프로필"
                  data-analytics-id="header_user"
                  data-analytics-type="action"
                  data-analytics-title="프로필"
                  data-analytics-section="header"
                >
                  {userProfile?.profile_image ? (
                    <img src={userProfile.profile_image} alt="프로필" title={userProfile?.nickname} className="header-user-avatar" />
                  ) : (
                    <i className="ri-user-3-fill"></i>
                  )}
                </button>
              ) : (
                <button
                  className="header-login-btn"
                  onClick={() => loginModal.open({ message: '댄스빌보드 로그인' })}
                  title="로그인"
                  data-analytics-id="header_login"
                  data-analytics-type="action"
                  data-analytics-title="로그인"
                  data-analytics-section="header"
                >
                  로그인
                </button>
              )}
            </div>
          </div>
        </header >
      )}

      <Outlet context={{ category, isFullscreen }} />

      {/* Bottom Navigation */}
      {!isFullscreen && (
        <div data-id="bottom-nav" className="shell-bottom-nav">
          {/* Top Bar Removed - Replaced by FAB Logic */}
          <BottomNavigation pageAction={pageAction} onPageActionClick={handlePageAction} />
        </div>
      )}

      {/* Organic FAB */}

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onLoginClick={() => {
          setIsDrawerOpen(false);
          loginModal.open({
            message: '댄스빌보드 로그인'
          });
        }}
      />

      <NotificationSettingsModal
        isOpen={notificationSettingsModal.isOpen}
        onClose={notificationSettingsModal.close}
      />

      {/* Global Playlist Player */}
      {activeResource && (
        <PlaylistModal
          playlistId={activeResource.id}
          onClose={closePlayer}
          minimized={isMinimized}
          onMinimize={minimizePlayer}
          onRestore={restorePlayer}
          isEditMode={false} // Global player usually view-only, or derived from context if needed
        />
      )}

      {/* Login Modal removed here - handled by global ModalRegistry */}

      <GlobalLoadingOverlay
        isLoading={isAuthProcessing || isGlobalLoading}
        message={isAuthProcessing ? (isLoggingOut ? "로그아웃 중..." : "로그인 중...") : globalLoadingMessage}
        onCancel={isAuthProcessing ? cancelAuth : undefined}
      />
      <GlobalNoticePopup />
    </div >
  );
};
