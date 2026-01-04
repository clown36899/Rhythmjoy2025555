import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { BottomNavigation } from './BottomNavigation';
import SideDrawer from '../components/SideDrawer';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { logUserInteraction } from '../lib/analytics';
import '../styles/components/MobileShell.css';

interface MobileShellProps {
  isAdmin?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({ isAdmin: isAdminProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, isAdmin: authIsAdmin } = useAuth();
  const { i18n } = useTranslation();
  const onlineUsersData = useOnlineUsers();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'collapsed' | 'fullscreen'>('collapsed');
  const [calendarView, setCalendarView] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [isCurrentMonthVisible, setIsCurrentMonthVisible] = useState(true);
  const [totalUserCount, setTotalUserCount] = useState<number | null>(null);
  const [category] = useState<string>('all'); // Added for Outlet context support

  const currentPath = location.pathname;
  const isEventsPage = currentPath === '/v2' || currentPath === '/';
  const isBoardPage = currentPath.startsWith('/board');
  const isSocialPage = currentPath.startsWith('/social');
  const isPracticePage = currentPath.startsWith('/practice');
  const isShoppingPage = currentPath.startsWith('/shopping');
  const isGuidePage = currentPath.startsWith('/guide');
  const isCalendarPage = currentPath === '/calendar';
  const isMyActivitiesPage = currentPath === '/my-activities';
  const isArchivePage = currentPath.startsWith('/learning') || currentPath.startsWith('/history');
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
  }, []);

  useEffect(() => {
    const handleToggleDrawer = () => setIsDrawerOpen(prev => !prev);
    const handleUpdateCalendarView = (e: any) => {
      if (e.detail) {
        setCalendarView({ year: e.detail.year, month: e.detail.month });
      }
    };
    const handleMonthVisibility = (e: any) => {
      if (e.detail !== undefined) {
        setIsCurrentMonthVisible(e.detail.isCurrentMonth);
      }
    };

    window.addEventListener('toggleDrawer', handleToggleDrawer);
    window.addEventListener('updateCalendarView', handleUpdateCalendarView);
    window.addEventListener('monthVisibilityChange', handleMonthVisibility);

    return () => {
      window.removeEventListener('toggleDrawer', handleToggleDrawer);
      window.removeEventListener('updateCalendarView', handleUpdateCalendarView);
      window.removeEventListener('monthVisibilityChange', handleMonthVisibility);
    };
  }, []);

  const changeLanguage = (lng: string) => {
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'min(0.5vw, 4px)',
          fontSize: 'min(2.2vw, 0.8rem)',
          fontWeight: 600,
          background: 'rgba(255, 255, 255, 0.08)',
          padding: '2px 6px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginLeft: '4px',
          color: '#e5e7eb',
          flexShrink: 1
        }}
      >
        <span key={`logged-in-${loggedInCount}`} style={{ color: '#00ddff' }}>{loggedInCount}</span>
        <span key="separator" style={{ color: '#888', opacity: 0.6 }}>/</span>
        <span key={`anonymous-${anonymousCount}`} style={{ color: '#ffaa00' }}>{anonymousCount}</span>

        {totalUserCount !== null && (
          <span key={`total-count-${totalUserCount}`} style={{ fontSize: 'min(0.85em, 10px)', color: '#aaa', fontWeight: 'normal', marginLeft: 'min(0.3vw, 2px)' }}>
            ({totalUserCount})
          </span>
        )}
      </span>
    );
  }, [isAdmin, onlineUsersData.loggedInUsers?.length, onlineUsersData.anonymousCount, totalUserCount]);

  return (
    <div className="shell-container">
      {/* Global Fixed Header */}
      <header className="shell-header global-header-fixed">
        <div className="header-content-inner">
          {/* Left/Center Content based on Route */}
          <div className="header-left-content">

            {/* 1. Events Page, Archive, Board, Social, etc - 통합 렌더링 */}
            {!isCalendarPage && (
              <div
                className={`header-events-content ${isLearningDetailPage ? 'with-back' : ''}`}
                onClick={isEventsPage ? () => window.location.reload() : undefined}
                style={{ cursor: isEventsPage ? 'pointer' : 'default' }}
                data-analytics-id="logo_home"
                data-analytics-type="nav_item"
                data-analytics-title="댄스빌보드 로고"
                data-analytics-section="header"
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
                  <img src="/logo.png" alt="RhythmJoy Logo" className="header-logo" />
                )}

                {/* 콘텐츠 분기 처리 */}
                {isEventsPage || isMyActivitiesPage ? (
                  /* 홈(이벤트) 페이지 및 내 활동 페이지 콘텐츠 */
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1', minWidth: 0, overflow: 'hidden', width: 'fit-content' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'min(0.8vw, 6px)', flexWrap: 'nowrap', minWidth: 0 }}>
                      <h1 className="header-title" style={{ margin: 0, fontSize: 'min(4vw, 1.45rem)', minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
                        댄스빌보드
                      </h1>
                      <span style={{ fontSize: 'min(2.2vw, 0.8rem)', color: '#9ca3af', fontWeight: 400, whiteSpace: 'nowrap' }}>korea</span>
                      {adminStats}
                    </div>
                    <span style={{ fontSize: 'min(2.5vw, 11px)', width: '100%', display: 'flex', justifyContent: 'space-between', color: '#ffffffcc', marginTop: 'min(0.3vw, 2px)', fontWeight: 500 }}>
                      {'swingenjoy.com'.split('').map((char, i) => (
                        <span key={`char-${i}-${char}`}>{char}</span>
                      ))}
                    </span>
                  </div>
                ) : (
                  /* 그 외 페이지 타이틀 (브레드크럼 적용) */
                  <h1 className="header-title" style={{ fontSize: 'min(3.8vw, 1.35rem)', margin: 0, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(isBoardPage || isArchivePage) && (
                      <>
                        <span
                          className="header-breadcrumb-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/board');
                          }}
                        >
                          포럼
                        </span>
                        {isArchivePage && (
                          <>
                            <span className="header-breadcrumb-separator">&lt;</span>
                            <span className="header-breadcrumb-current">스윙피디아</span>
                          </>
                        )}
                      </>
                    )}
                    {isSocialPage && <span>소셜 이벤트</span>}
                    {isPracticePage && <span>연습실</span>}
                    {isShoppingPage && <span>쇼핑</span>}
                    {isGuidePage && <span>이용가이드</span>}
                  </h1>
                )}
              </div>
            )}

            {/* 2. Calendar Page (Full Screen) */}
            {isCalendarPage && (
              <div className="calendar-header-nav">
                <button
                  onClick={() => {
                    setCalendarMode('collapsed');
                    navigate('/');
                  }}
                  className="calendar-back-btn"
                >
                  <i className="ri-arrow-left-line"></i>
                </button>
                {/* Month Navigation Buttons */}
                <div className="calendar-month-nav">
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('prevMonth'))}
                    className="calendar-month-btn"
                  >
                    <i className="ri-arrow-left-s-line"></i>
                  </button>
                  <span className="calendar-month-label">
                    {calendarView.year}.{String(calendarView.month + 1).padStart(2, '0')}
                  </span>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('nextMonth'))}
                    className="calendar-month-btn"
                  >
                    <i className="ri-arrow-right-s-line"></i>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="header-right-buttons">
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
              <span style={{ fontSize: 'min(2.5vw, 12px)', fontWeight: 600 }}>{i18n.language.toUpperCase()}</span>
            </button>

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

            <button
              className="header-user-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('openUserProfile'))}
              title={user ? "프로필" : "로그인"}
              data-analytics-id="header_user"
              data-analytics-type="action"
              data-analytics-title={user ? "프로필" : "로그인"}
              data-analytics-section="header"
            >
              {user ? (
                userProfile?.profile_image ? (
                  <img src={userProfile.profile_image} alt="프로필" title={userProfile?.nickname} className="header-user-avatar" />
                ) : (
                  <i className="ri-user-3-fill"></i>
                )
              ) : (
                <i className="ri-login-box-line"></i>
              )}
            </button>

            <button
              className="header-hamburger-btn"
              onClick={() => setIsDrawerOpen(true)}
              data-analytics-id="header_hamburger"
              data-analytics-type="action"
              data-analytics-title="사이드 메뉴"
              data-analytics-section="header"
            >
              <i className="ri-menu-line"></i>
            </button>
          </div>
        </div>
      </header>

      <Outlet context={{ category, calendarMode }} />

      {/* Bottom Navigation */}
      <div data-id="bottom-nav" className="shell-bottom-nav">
        {isEventsPage && (
          <div className="shell-top-bar" style={{ minHeight: '32px' }}>
            <div className="shell-top-bar-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {calendarMode === "fullscreen" && (
                  <button
                    onClick={() => {
                      logUserInteraction('Button', 'Click', 'CalendarSearch');
                      window.dispatchEvent(new CustomEvent('openCalendarSearch'));
                    }}
                    className="shell-top-bar-btn"
                    style={{
                      backgroundColor: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '0 4px', height: '24px', color: '#fff'
                    }}
                  >
                    <i className="ri-search-line shell-icon-sm"></i>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>검색</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isCurrentMonthVisible && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('goToToday'))}
                    style={{
                      backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px',
                      padding: '2px 8px', fontSize: '10px', height: '24px', display: 'flex', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span className="manual-label-wrapper">
                      <span className="translated-part">Today</span>
                      <span className="fixed-part ko" translate="no">오늘</span>
                      <span className="fixed-part en" translate="no">Today</span>
                    </span>
                    <i className="ri-calendar-check-line" style={{ fontSize: '10px' }}></i>
                  </button>
                )}

                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('createEventForDate', { detail: { source: 'floatingBtn', calendarMode } }))}
                  className="shell-btn-register-topbar"
                  data-analytics-id="register_event"
                  data-analytics-type="action"
                  data-analytics-title="이벤트 등록"
                  data-analytics-section="top_bar"
                >
                  <i className="ri-add-line"></i>
                  <span className="manual-label-wrapper">
                    <span className="translated-part">Register</span>
                    <span className="fixed-part ko" translate="no">이벤트 등록</span>
                    <span className="fixed-part en" translate="no">Register</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNavigation />
      </div>

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onLoginClick={() => {
          setIsDrawerOpen(false);
          window.dispatchEvent(new CustomEvent('openUserProfile'));
        }}
      />
    </div>
  );
};
