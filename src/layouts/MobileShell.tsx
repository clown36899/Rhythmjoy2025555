import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import '../styles/components/MobileShell.css';
import { BottomNavigation } from "./BottomNavigation";
import { logUserInteraction } from "../lib/analytics";
import ProfileEditModal from "../pages/board/components/ProfileEditModal"; // Global Modal
import UserRegistrationModal from "../pages/board/components/UserRegistrationModal";
import SideDrawer from "../components/SideDrawer";
import GlobalLoadingOverlay from "../components/GlobalLoadingOverlay";
import ColorSettingsModal from "../components/ColorSettingsModal";
import DefaultThumbnailSettingsModal from "../components/DefaultThumbnailSettingsModal";
import BillboardUserManagementModal from "../components/BillboardUserManagementModal";
import InvitationManagementModal from "../components/InvitationManagementModal";

export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, user, signInWithKakao, isAuthProcessing, cancelAuth, billboardUserId, userProfile, refreshUserProfile } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [eventCounts, setEventCounts] = useState({ class: 0, event: 0 });
  const [calendarView, setCalendarView] = useState<{ year: number; month: number; viewMode: 'month' | 'year' }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    viewMode: 'month'
  });
  const [calendarMode, setCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen'>('collapsed');
  const [isCurrentMonthVisible, setIsCurrentMonthVisible] = useState(true);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showPreLoginRegistrationModal, setShowPreLoginRegistrationModal] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);

  // Admin Modal States
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showDefaultThumbnailSettings, setShowDefaultThumbnailSettings] = useState(false);
  const [showBillboardUserManagement, setShowBillboardUserManagement] = useState(false);
  const [showInvitationManagement, setShowInvitationManagement] = useState(false);
  const [showCopySuccessModal, setShowCopySuccessModal] = useState(false);

  // Helper for login guard
  const handleProtectedAction = async (action: () => void) => {
    if (!user) {
      console.log('[handleProtectedAction] Guest entry, showing welcome modal');
      setShowPreLoginRegistrationModal(true);
      (window as any)._pendingAction = action;
      return;
    }

    // Already logged in: check if still needs registration (safety check)
    // Optimization: Check userProfile first if available, otherwise fallback to DB check
    // Actually, AuthContext should ensure userProfile is loaded if user exists.
    // For safety, we keep the DB check here only if really critical, but board_users existence IS the check.
    // If userProfile is present, it means board_users record exists (or we created a fake one from metadata).
    // Wait, refreshUserProfile creates a fallback from metadata even if no DB record.
    // So userProfile != null doesn't guarantee DB record exists?
    // Let's look at refreshUserProfile again.
    // "if (data) ... else if (user) ... fallback to metadata"
    // So yes, userProfile exists even if not in DB.
    // We need to check if the user is TRULY registered.
    // For now, let's keep the explicitly safety check on board_users for protected actions.
    const { data: boardUser } = await supabase
      .from('board_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!boardUser) {
      setShowPreLoginRegistrationModal(true);
      (window as any)._pendingAction = action;
      return;
    }

    action();
  };

  // Profile Edit Modal Listener
  useEffect(() => {
    const handleOpenProfileEdit = () => {
      if (!user) return;
      setShowProfileEditModal(true);
    };
    window.addEventListener('openProfileEdit', handleOpenProfileEdit);
    return () => {
      window.removeEventListener('openProfileEdit', handleOpenProfileEdit);
    };
  }, [user]);

  // Global Protected Action Listener
  useEffect(() => {
    const handleRequest = (e: any) => {
      const { action } = e.detail || {};
      if (action) {
        console.log('[MobileShell] Protected action requested');
        handleProtectedAction(action);
      }
    };
    window.addEventListener('requestProtectedAction' as any, handleRequest);
    return () => window.removeEventListener('requestProtectedAction' as any, handleRequest);
  }, [user]);

  // Reopen Admin Settings Listener
  useEffect(() => {
    const handleReopenAdminSettings = () => setTimeout(() => setShowAdminPanel(true), 100);
    window.addEventListener('reopenAdminSettings', handleReopenAdminSettings);
    return () => window.removeEventListener('reopenAdminSettings', handleReopenAdminSettings);
  }, []);

  // Side Drawer Listener
  useEffect(() => {
    const handleOpenDrawer = () => setIsDrawerOpen(true);
    window.addEventListener('openSideDrawer', handleOpenDrawer);
    return () => {
      window.removeEventListener('openSideDrawer', handleOpenDrawer);
    };
  }, []);







  // 달력 월/뷰모드 변경 감지
  useEffect(() => {
    const handleCalendarMonthChanged = (e: CustomEvent) => {
      setCalendarView(e.detail);
    };

    window.addEventListener('calendarMonthChanged', handleCalendarMonthChanged as EventListener);

    return () => {
      window.removeEventListener('calendarMonthChanged', handleCalendarMonthChanged as EventListener);
    };
  }, []);

  // 필터 초기화 이벤트 감지 ('전체 일정 보기' 카드 클릭 시)
  useEffect(() => {
    const handleClearAllFilters = () => {
      navigate('/'); // URL에서 카테고리 파라미터 제거
      window.dispatchEvent(new CustomEvent('clearSelectedDate')); // 날짜 선택 해제
    };
    window.addEventListener('clearAllFilters', handleClearAllFilters);
    return () => {
      window.removeEventListener('clearAllFilters', handleClearAllFilters);
    };
  }, [navigate]);

  // Page State Synchronization
  useEffect(() => {
    const handleCalendarModeChanged = (e: CustomEvent) => setCalendarMode(e.detail);
    const handleIsCurrentMonthVisibleChanged = (e: CustomEvent) => setIsCurrentMonthVisible(e.detail);

    window.addEventListener('calendarModeChanged', handleCalendarModeChanged as EventListener);
    window.addEventListener('isCurrentMonthVisibleChanged', handleIsCurrentMonthVisibleChanged as EventListener);

    return () => {
      window.removeEventListener('calendarModeChanged', handleCalendarModeChanged as EventListener);
      window.removeEventListener('isCurrentMonthVisibleChanged', handleIsCurrentMonthVisibleChanged as EventListener);
    };
  }, []);

  // Sync calendarMode from URL parameters (for direct URL access)
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/v2') {
      const urlCalendarMode = searchParams.get('calendar');
      if (urlCalendarMode === 'fullscreen') {
        setCalendarMode('fullscreen');
      } else if (!urlCalendarMode && calendarMode === 'fullscreen') {
        setCalendarMode('collapsed');
      }
    }
  }, [searchParams, location.pathname]);

  // 이벤트 개수 로드 (현재 달력 월/년 기준)
  useEffect(() => {
    const loadEventCounts = async () => {
      try {
        const { data: events } = await supabase
          .from('events')
          .select('category, date, start_date, end_date');

        if (events) {
          // 현재 달력에 표시된 월/년에 해당하는 이벤트만 필터링
          const filteredEvents = events.filter(event => {
            const eventDate = new Date(event.start_date || event.date);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth();

            if (calendarView.viewMode === 'year') {
              // 년 단위 표시: 해당 년도의 모든 이벤트
              return eventYear === calendarView.year;
            } else {
              // 월 단위 표시: 해당 월의 이벤트만
              return eventYear === calendarView.year && eventMonth === calendarView.month;
            }
          });

          const classCount = filteredEvents.filter(e => e.category === 'class').length;
          const eventCount = filteredEvents.filter(e => e.category === 'event').length;
          setEventCounts({ class: classCount, event: eventCount });
        }
      } catch (error) {
        console.error('이벤트 개수 로드 실패:', error);
      }
    };

    if (location.pathname === '/') {
      loadEventCounts();

      // 이벤트 변경 시 개수 업데이트
      const handleEventChange = () => {
        loadEventCounts();
      };

      window.addEventListener('eventCreated', handleEventChange);
      window.addEventListener('eventUpdated', handleEventChange);
      window.addEventListener('eventDeleted', handleEventChange);

      return () => {
        window.removeEventListener('eventCreated', handleEventChange);
        window.removeEventListener('eventUpdated', handleEventChange);
        window.removeEventListener('eventDeleted', handleEventChange);
      };
    }
  }, [location.pathname, calendarView]);

  // 테마 색상 로드 (DB 최우선, index.css는 폴백)
  useEffect(() => {
    const loadThemeColors = async () => {
      try {
        const { data, error } = await supabase
          .from("theme_settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (error || !data) {
          return;
        }

        // CSS 변수 업데이트 (DB 색상으로 덮어씀)
        document.documentElement.style.setProperty("--bg-color", data.background_color);
        document.documentElement.style.setProperty("--header-bg-color", data.header_bg_color || "#1f2937");
        document.documentElement.style.setProperty("--calendar-bg-color", data.calendar_bg_color);
        document.documentElement.style.setProperty("--event-list-bg-color", data.event_list_bg_color);
        document.documentElement.style.setProperty("--event-list-outer-bg-color", data.event_list_outer_bg_color);
        document.documentElement.style.setProperty("--page-bg-color", data.page_bg_color || "#111827");
      } catch (err) {
        // 기본 색상 사용 (index.css)
      }
    };

    loadThemeColors();
  }, []);


  // 현재 페이지와 카테고리 파악
  const isEventsPage = location.pathname === '/' || location.pathname === '/v2';
  const isCalendarPage = location.pathname === '/calendar';
  const isSocialPage = location.pathname.startsWith('/social');
  const isPracticePage = location.pathname === '/practice';
  const isBoardPage = location.pathname.startsWith('/board'); // Changed to startsWith to include detail pages
  const isShoppingPage = location.pathname.startsWith('/shopping');
  const isGuidePage = location.pathname === '/guide';
  const category = searchParams.get('category') || 'all';


  // SideDrawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // SideDrawer Event Listener
  useEffect(() => {
    const handleOpenSideDrawer = () => setIsDrawerOpen(true);
    window.addEventListener('openSideDrawer', handleOpenSideDrawer);
    return () => window.removeEventListener('openSideDrawer', handleOpenSideDrawer);
  }, []);

  return (
    <div className="shell-container">
      {/* Global Fixed Header */}
      <header className="shell-header global-header-fixed">
        {/* ... existing header content ... */}
        {/* Left/Center Content based on Route */}
        <div className="header-left-content">

          {/* 1. Events Page (Home) */}
          {isEventsPage && (
            <div
              className="header-events-content"
              onClick={() => window.location.reload()}
              style={{ cursor: 'pointer' }}
            >
              <img src="/logo.png" alt="RhythmJoy Logo" className="header-logo" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1' }}>
                <h1 className="header-title" style={{ margin: 0, fontSize: '1.6rem' }}>
                  댄스빌보드
                </h1>
                <span style={{ fontSize: '9px', width: '100%', display: 'flex', justifyContent: 'space-between', color: '#ffffffcc' }}>
                  {'swingenjoy.com'.split('').map((char, i) => (
                    <span key={i}>{char}</span>
                  ))}
                </span>
              </div>
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

          {/* 3. Board Page */}
          {isBoardPage && (
            <div className="header-events-content">
              <img src="/logo.png" alt="Logo" className="header-logo" />
              <h1 className="header-title">
                자유게시판
              </h1>
            </div>)}

          {/* 4. Other Pages (Social, Practice, Shopping, Guide) */}
          {(!isEventsPage && !isCalendarPage && !isBoardPage) && (
            <div className="header-events-content">
              <img src="/logo.png" alt="Logo" className="header-logo" />
              <h1 className="header-title">
                {isSocialPage && '소셜 이벤트'}
                {isPracticePage && '연습실'}
                {isShoppingPage && '쇼핑'}
                {isGuidePage && '이용가이드'}
              </h1>
            </div>
          )}
        </div>

        {/* Right Side - Always Visible Buttons */}
        <div className="header-right-buttons">
          {/* Search Button - Always Visible */}
          <button
            onClick={() => {
              console.log('[MobileShell] Search button clicked, isCalendarPage:', isCalendarPage);
              if (isCalendarPage) {
                console.log('[MobileShell] Dispatching openCalendarSearch');
                window.dispatchEvent(new CustomEvent('openCalendarSearch'));
              } else {
                console.log('[MobileShell] Dispatching openEventSearch');
                window.dispatchEvent(new CustomEvent('openEventSearch'));
              }
            }}
            className="header-search-btn"
          >
            <i className="ri-search-line"></i>
          </button>

          {/* User Profile Button - Shows login status */}
          <button
            onClick={async () => {
              console.log('[MobileShell] Header Login Button Clicked');
              if (user) {
                setIsDrawerOpen(true);
              } else {
                setShowPreLoginRegistrationModal(true);
              }
            }}
            className="header-user-btn"
            title={user ? "프로필" : "로그인"}
          >
            {user ? (
              userProfile?.profile_image ? (
                <img
                  src={userProfile.profile_image}
                  alt="프로필"
                  className="header-user-avatar"
                />
              ) : (
                <i className="ri-user-3-fill"></i>
              )
            ) : (
              <i className="ri-login-box-line"></i>
            )}
          </button>

          {/* Hamburger Menu Button - Always Visible */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="header-hamburger-btn"
          >
            <i className="ri-menu-line"></i>
          </button>
        </div>
      </header>


      {/* <div className="shell-header global-header-fixed-bottom">

      </div> */}
      <Outlet context={{ category, eventCounts }} />
      {/* Main Content (with padding for fixed header) */}


      {/* Bottom Navigation - 모든 페이지 공통 */}
      <div data-id="bottom-nav" className="shell-bottom-nav">
        {/* Category Filter Badges - 홈 페이지에서만 표시 */}
        {isEventsPage && (
          <div
            className="shell-top-bar"
            style={{
              minHeight: '32px'
            }}
          >
            <div className="shell-top-bar-content">
              {/* Left Side: Admin Button + Calendar Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {/* Admin Button - 이벤트 페이지에서만 표시 */}
                {isAdmin && (
                  <button
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="shell-admin-btn-topbar"
                  >
                    <i className={`${showAdminPanel ? 'ri-close-line' : 'ri-settings-3-line'}`}></i>
                    <span>{showAdminPanel ? '닫기' : '관리'}</span>
                  </button>
                )}

                {/* Calendar Search Button - 전체 달력 모드에서만 표시 */}
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

              {/* Right Side: Tools (Today, Sort, Search, Register, Admin) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* 1. Today Button (Conditional) */}
                {!isCurrentMonthVisible && (
                  <button
                    onClick={() => {
                      logUserInteraction('Button', 'Click', 'GoToToday');
                      window.dispatchEvent(new CustomEvent('goToToday'));
                    }}
                    style={{
                      backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px',
                      padding: '2px 8px', fontSize: '10px', height: '24px', display: 'flex', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span>오늘</span>
                    <i className="ri-calendar-check-line" style={{ fontSize: '10px' }}></i>
                  </button>
                )}



                {/* 3. Event Registration Button */}
                <button
                  onClick={() => handleProtectedAction(() => {
                    logUserInteraction('Button', 'Click', 'EventRegistration-TopBar');
                    window.dispatchEvent(new CustomEvent('createEventForDate', { detail: { source: 'floatingBtn', calendarMode } }));
                  })}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-add-line"></i>
                  <span>이벤트 등록</span>
                </button>



                {/* Date-specific register button removed - no longer needed */}
              </div>
            </div>
          </div>
        )}

        {/* Calendar Page - Show search button */}
        {isCalendarPage && (
          <div
            className="shell-top-bar"
            style={{
              minHeight: '32px'
            }}
          >
            <div className="shell-top-bar-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {/* Calendar Search Button */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openCalendarSearch'))}
                  className="shell-top-bar-btn"
                  style={{
                    backgroundColor: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '0 4px', height: '24px', color: '#fff'
                  }}
                >
                  <i className="ri-search-line shell-icon-sm"></i>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>검색</span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Event Registration Button */}
                <button
                  onClick={() => handleProtectedAction(() => window.dispatchEvent(new CustomEvent('openCalendarRegistration')))}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-add-line"></i>
                  <span>이벤트 등록</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Board Page Top Bar - 글쓰기 버튼 */}
        {isBoardPage && (
          <div className="shell-top-bar" style={{ minHeight: '32px' }}>
            <div className="shell-top-bar-content">
              <div style={{ flex: 1 }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Write Button */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('boardWriteClick'))}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-pencil-line"></i>
                  <span>글쓰기</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 관리자 상태 표시 - 모든 페이지 공통 (이벤트, 캘린더, 보드 제외) */}
        {!isEventsPage && !isCalendarPage && !isBoardPage && (
          <div
            className="shell-top-bar"
            style={{
              minHeight: '32px'
            }}
          >
            {isShoppingPage ? (
              <div className="shell-top-bar-content" style={{ justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleProtectedAction(() => {
                    logUserInteraction('Button', 'Click', 'ShopRegistration');
                    window.dispatchEvent(new CustomEvent('openShopRegistration'));
                  })}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-add-line"></i>
                  <span>쇼핑몰 등록</span>
                </button>
              </div>
            ) : (
              <span className="shell-text-label no-select">
                {isSocialPage && '소셜'}
                {isPracticePage && '연습실'}
                {isBoardPage && '자유게시판'}
                {isShoppingPage && '쇼핑'}
                {isGuidePage && '안내'}
              </span>
            )}
            <div className="shell-flex-center shell-gap-2">

              {/* Social: Register Button */}
              {isSocialPage && (
                <button
                  onClick={() => handleProtectedAction(() => {
                    logUserInteraction('Button', 'Click', 'SocialRegistration');
                    window.dispatchEvent(new CustomEvent('openSocialRegistration'));
                  })}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-add-line"></i>
                  <span>등록</span>
                </button>
              )}

              {/* Practice List: Register Button */}
              {/* {isPracticePage && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('practiceRoomRegister'));
                  }}
                  className="shell-btn-register-topbar"
                >
                  <i className="ri-add-line"></i>
                  <span>등록</span>
                </button>
              )} */}
            </div>
          </div>
        )}

        <BottomNavigation />

        {/* 관리자 패널 - 빠른 접근 */}
        {isAdmin && showAdminPanel && (
          <div className="shell-admin-panel">
            <div className="shell-admin-panel-title">관리자 패널</div>



            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('openBillboardSettings'));
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-image-2-line"></i>
              댄스빌보드 설정
            </button>

            <button
              onClick={() => {
                setShowDefaultThumbnailSettings(true);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-image-line"></i>
              기본 썸네일 설정
            </button>

            <button
              onClick={() => {
                setShowColorSettings(true);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-palette-line"></i>
              색상 설정
            </button>

            {isAdmin && !billboardUserId && (
              <>
                <button
                  onClick={() => {
                    setShowBillboardUserManagement(true);
                  }}
                  className="shell-admin-panel-btn"
                >
                  <i className="ri-user-settings-line"></i>
                  빌보드 회원 관리
                </button>

                <button
                  onClick={() => {
                    setShowInvitationManagement(true);
                  }}
                  className="shell-admin-panel-btn"
                >
                  <i className="ri-mail-send-line"></i>
                  초대 관리
                </button>
              </>
            )}

            <button
              onClick={() => {
                navigate('/board');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openBoardUserManagement'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-group-line"></i>
              게시판 회원 관리
            </button>

            <button
              onClick={() => {
                navigate('/board');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openPrefixManagement'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-price-tag-3-line"></i>
              머릿말 관리
            </button>

            {/* Sub Admin specific actions like Copy/Share can be added here if needed */}
            {billboardUserId && (
              <button
                onClick={() => {
                  const billboardUrl = `https://swingenjoy.com/billboard/${billboardUserId}`;
                  navigator.clipboard.writeText(billboardUrl);
                  setShowCopySuccessModal(true);
                  setTimeout(() => setShowCopySuccessModal(false), 1500);
                  setShowAdminPanel(false);
                }}
                className="shell-admin-panel-btn"
              >
                <i className="ri-link"></i>
                내 빌보드 주소 복사
              </button>
            )}

          </div>
        )}
      </div>
      {/* Global Profile Edit Modal */}
      {showProfileEditModal && user && userProfile && (
        <ProfileEditModal
          isOpen={showProfileEditModal}
          onClose={() => setShowProfileEditModal(false)}
          currentUser={{
            ...userProfile,
            profile_image: userProfile.profile_image
          }}
          onProfileUpdated={() => {
            // Refresh user profile in global state instead of reloading page
            refreshUserProfile();
          }}
          userId={user!.id}
        />
      )}

      {/* Pre-Login Registration Modal */}
      {showPreLoginRegistrationModal && (
        <UserRegistrationModal
          isOpen={showPreLoginRegistrationModal}
          onClose={() => setShowPreLoginRegistrationModal(false)}
          onRegistered={async () => {
            setIsProcessing(true);
            try {
              // 1. If not logged in, trigger Kakao Login first
              if (!user) {
                await signInWithKakao();
                return;
              }

              // 2. Already logged in but needs registration record
              const kakaoNickname = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';
              // Check for kakao_id in metadata (provider_id might be used by Supabase Auth)
              const kakaoId = user.user_metadata?.kakao_id || user.user_metadata?.provider_id || null;

              const { data: existingUser } = await supabase
                .from('board_users')
                .select('nickname')
                .eq('user_id', user.id)
                .maybeSingle();

              if (!existingUser) {
                const { error } = await supabase.from('board_users').upsert({
                  user_id: user.id,
                  nickname: kakaoNickname,
                  kakao_id: kakaoId, // Include kakao_id in client-side repair
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

                if (error) throw error;
              }

              localStorage.setItem('is_registered', 'true');

              if ((window as any)._pendingAction) {
                (window as any)._pendingAction();
                (window as any)._pendingAction = null;
              }
            } catch (error: any) {
              console.error('Registration failed:', error);
            } finally {
              setIsProcessing(false);
              setShowPreLoginRegistrationModal(false);
            }
          }}
        />
      )}

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onLoginClick={async () => {
          if (user) return;
          console.log('[SideDrawer] Login clicked, showing welcome modal');
          setShowPreLoginRegistrationModal(true);
        }}
      />

      {/* Admin Modals */}
      <ColorSettingsModal
        isOpen={showColorSettings}
        onClose={() => setShowColorSettings(false)}
      />

      <DefaultThumbnailSettingsModal
        isOpen={showDefaultThumbnailSettings}
        onClose={() => setShowDefaultThumbnailSettings(false)}
      />

      <BillboardUserManagementModal
        isOpen={showBillboardUserManagement}
        onClose={() => setShowBillboardUserManagement(false)}
      />

      <InvitationManagementModal
        isOpen={showInvitationManagement}
        onClose={() => setShowInvitationManagement(false)}
      />

      {/* Copy Success Modal */}
      {showCopySuccessModal && (
        <div className="header-modal-overlay-super" style={{ zIndex: 9999 }}>
          <div className="header-modal header-modal-shadow">
            <div className="header-success-container">
              <div className="header-success-icon-wrapper">
                <div className="header-success-icon-circle header-success-icon-green">
                  <i className="ri-check-line header-icon-3xl" style={{ color: 'white' }}></i>
                </div>
              </div>
              <p className="header-success-text-lg">
                빌보드 주소가 복사되었습니다!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Global Auth Loading Overlay (Blocks entire UI) */}
      <GlobalLoadingOverlay
        isLoading={isAuthProcessing || isProcessing}
        message={isAuthProcessing ? "로그인 중..." : "사용자 정보 저장 중..."}
        onCancel={() => {
          if (isAuthProcessing) cancelAuth();
          if (isProcessing) setIsProcessing(false);
        }}
      />
    </div>
  );
}
