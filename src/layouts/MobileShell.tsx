import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../hooks/useModal';
import { usePageAction } from '../contexts/PageActionContext';
import SideDrawer from '../components/SideDrawer';
import { useTranslation } from 'react-i18next';
import { logUserInteraction } from '../lib/analytics';
import GlobalLoadingOverlay from '../components/GlobalLoadingOverlay';
import GlobalNoticePopup from '../components/GlobalNoticePopup';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { PlaylistModal } from '../pages/learning/components/PlaylistModal';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import { useLoading } from '../contexts/LoadingContext';
import { HomeV2MenuPanel } from '../pages/v2/components/HomeV2MenuPanel';
import { isKioskModeEnabled, requestKioskMobileGuide } from '../lib/kioskMode';
import '../styles/components/MobileShell.css';

type CalendarHeaderDisplayMode = 'calendar' | 'list' | 'map';

const isCalendarHeaderDisplayMode = (value: unknown): value is CalendarHeaderDisplayMode => (
  value === 'calendar' || value === 'list' || value === 'map'
);

const getCalendarHeaderDisplayMode = (search: string): CalendarHeaderDisplayMode => {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  return isCalendarHeaderDisplayMode(view) ? view : 'calendar';
};

export const MobileShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, isAuthProcessing, isLoggingOut, cancelAuth } = useAuth();
  const { i18n } = useTranslation();
  const { action: pageAction } = usePageAction();
  const { activeResource, isMinimized, closePlayer, minimizePlayer, restorePlayer } = useGlobalPlayer();


  // Modals

  const userRegistrationModal = useModal('userRegistration');
  const loginModal = useModal('login');
  const globalSearchModal = useModal('globalSearch');

  const notificationSettingsModal = useModal('notificationSettings');
  const { isGlobalLoading, globalLoadingMessage } = useLoading();
  const [calendarView, setCalendarView] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [calendarHeaderDisplayMode, setCalendarHeaderDisplayMode] = useState<CalendarHeaderDisplayMode>(() => getCalendarHeaderDisplayMode(location.search));
  const [isTranslationPending, setIsTranslationPending] = useState(false);
  const [translationErrorMessage, setTranslationErrorMessage] = useState('');
  const [hasBrowserTranslation, setHasBrowserTranslation] = useState(false);
  const isTranslationPendingRef = useRef(false);
  const didAutoApplyInitialTranslationRef = useRef(false);
  const translateButtonRef = useRef<HTMLButtonElement | null>(null);
  const translationErrorTimerRef = useRef<number | null>(null);
  // unused state removed
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || 'all'; // Derived from URL query

  const currentPath = location.pathname;
  const isEventsPage = currentPath === '/v2' || currentPath === '/';
  const isCalendarPage = currentPath === '/calendar';
  const isLearningDetailPage = currentPath.startsWith('/learning/') && currentPath !== '/learning';
  const isMetronomePage = currentPath === '/metronome';
  const isPlacesPage = currentPath === '/places';
  const isAdminWebzinePage = currentPath.startsWith('/admin/webzine');
  const isAdminV2Ingestor = currentPath === '/admin/v2/ingestor';
  const isSwingFloorCouncilPage = currentPath === '/swing-floor-council';
  const isHomeMenuHubTestPage = currentPath === '/test/home-menu-hub' || currentPath === '/home-menu-hub-test';

  const handleCalendarHeaderDisplayMode = useCallback((mode: CalendarHeaderDisplayMode) => {
    setCalendarHeaderDisplayMode(mode);
    window.dispatchEvent(new CustomEvent('calendarDisplayModeRequest', {
      detail: { mode }
    }));
  }, []);

  useEffect(() => {
    if (!isCalendarPage) return;
    setCalendarHeaderDisplayMode(getCalendarHeaderDisplayMode(location.search));
  }, [isCalendarPage, location.search]);

  useEffect(() => {
    const handleDisplayModeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: unknown } | CalendarHeaderDisplayMode>).detail;
      const nextMode = typeof detail === 'string' ? detail : detail?.mode;
      if (isCalendarHeaderDisplayMode(nextMode)) {
        setCalendarHeaderDisplayMode(nextMode);
      }
    };

    window.addEventListener('calendarDisplayModeChanged', handleDisplayModeChanged as EventListener);
    return () => {
      window.removeEventListener('calendarDisplayModeChanged', handleDisplayModeChanged as EventListener);
    };
  }, []);

  // 첫 화면은 로그인 유도 모달을 자동으로 띄우지 않는다. 로그인은 메뉴/보호 액션에서만 호출한다.

  // 🔄 Global Scroll Reset on Route Change
  useEffect(() => {
    // console.log(`[MobileShell] 경로 변경 감지: ${location.pathname}`);

    // [Fix] /calendar 경로는 자체적인 스크롤 로직(오늘 날짜 이동)을 가지므로 초기화 제외
    if (location.pathname === '/calendar') {
      // console.log('[MobileShell] /calendar 경로이므로 전역 스크롤 리셋 건너뜀');
      return;
    }

    // console.log('[MobileShell] 전역 스크롤 리셋 실행 (0, 0)');
    // 1. Reset Window Scroll (Standard Mode)
    window.scrollTo(0, 0);

    // 2. Reset Container Scroll (Wide Mode / Custom Layouts)
    const shellContainer = document.querySelector('.shell-container');
    if (shellContainer) {
      shellContainer.scrollTop = 0;
    }

    // 3. Auth Spinner Cleanup on Landing: 인증 콜백 후 메인 페이지로 돌아왔을 때 잔류 스피너를 부드럽게 제거
    // AuthContext의 전역 훅(__SET_AUTH_PROCESSING_OFF)을 사용하여 안전하게 해제
    if (isAuthProcessing && !location.pathname.includes('/auth/')) {
      const cleanupTimer = setTimeout(() => {
        const win = window as any;
        if (win.__SET_AUTH_PROCESSING_OFF) {
          win.__SET_AUTH_PROCESSING_OFF();
        }
      }, 500);
      return () => clearTimeout(cleanupTimer);
    }
  }, [location.pathname, isAuthProcessing]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const openLoginOrKioskGuide = useCallback((message?: string) => {
    if (isKioskModeEnabled()) {
      requestKioskMobileGuide();
      return;
    }

    loginModal.open({
      message: message || '댄스빌보드 로그인'
    });
  }, [loginModal]);

  useEffect(() => {
    const handleUpdateCalendarView = (e: any) => {
      if (e.detail) {
        setCalendarView({ year: e.detail.year, month: e.detail.month });
      }
    };
    const handleToggleFullscreen = () => setIsFullscreen(prev => !prev);

    window.addEventListener('updateCalendarView', handleUpdateCalendarView);
    window.addEventListener('toggleFullscreen', handleToggleFullscreen);

    return () => {
      window.removeEventListener('updateCalendarView', handleUpdateCalendarView);
      window.removeEventListener('toggleFullscreen', handleToggleFullscreen);
    };
  }, []);

  // Login & Profile Modal Handlers
  useEffect(() => {
    const handleOpenUserProfile = () => {
      window.dispatchEvent(new CustomEvent('openDrawer'));
    };



    const handleProtectedAction = (e: any) => {
      const { message } = e.detail || {};
      openLoginOrKioskGuide(message);
    };

    // Standardized Login Modal Event
    const handleOpenLoginModal = (e: any) => {
      const { message } = e.detail || {};
      openLoginOrKioskGuide(message);
    };

    window.addEventListener('openUserProfile', handleOpenUserProfile);
    window.addEventListener('requestProtectedAction', handleProtectedAction);
    window.addEventListener('openLoginModal', handleOpenLoginModal);

    return () => {
      window.removeEventListener('openUserProfile', handleOpenUserProfile);
      window.removeEventListener('requestProtectedAction', handleProtectedAction);
      window.removeEventListener('openLoginModal', handleOpenLoginModal);
    };
  }, [user, userRegistrationModal, openLoginOrKioskGuide]);

  const clearTranslationErrorTimer = useCallback(() => {
    if (translationErrorTimerRef.current !== null) {
      window.clearTimeout(translationErrorTimerRef.current);
      translationErrorTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    isTranslationPendingRef.current = false;
    clearTranslationErrorTimer();
  }, [clearTranslationErrorTimer]);

  useEffect(() => {
    const syncBrowserTranslationState = () => {
      setHasBrowserTranslation(
        document.body.classList.contains('translated-ltr') ||
        document.body.classList.contains('translated-rtl') ||
        document.documentElement.classList.contains('translated-ltr') ||
        document.documentElement.classList.contains('translated-rtl')
      );
    };

    syncBrowserTranslationState();

    const observer = new MutationObserver(syncBrowserTranslationState);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'lang'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('languageChanged', syncBrowserTranslationState);

    const timer = window.setInterval(syncBrowserTranslationState, 1500);

    return () => {
      observer.disconnect();
      window.removeEventListener('languageChanged', syncBrowserTranslationState);
      window.clearInterval(timer);
    };
  }, []);

  const finishTranslationFeedback = useCallback(() => {
    isTranslationPendingRef.current = false;
    setIsTranslationPending(false);
  }, []);

  const showTranslationError = useCallback((message: string) => {
    clearTranslationErrorTimer();
    setTranslationErrorMessage(message);
    translationErrorTimerRef.current = window.setTimeout(() => {
      setTranslationErrorMessage('');
      translationErrorTimerRef.current = null;
    }, 4500);
  }, [clearTranslationErrorTimer]);

  const changeLanguage = useCallback(async (lng: string) => {
    setTranslationErrorMessage('');
    const previousLanguage = i18n.language || document.documentElement.lang || 'ko';

    const restorePreviousLanguage = async () => {
      if (previousLanguage === lng) return;
      try {
        await i18n.changeLanguage(previousLanguage);
        document.documentElement.lang = previousLanguage;
      } catch {
        // Keep the original failure message visible if rollback itself fails.
      }
    };

    try {
      await i18n.changeLanguage(lng);
      document.documentElement.lang = lng;
      logUserInteraction('Language', 'Change', lng);

      const googleTranslateChangeLanguage = typeof window !== 'undefined'
        ? ((window as any).googleTranslateChangeLanguage || (window as any).changeLanguage)
        : null;

      if (typeof googleTranslateChangeLanguage === 'function') {
        const result = await Promise.resolve(googleTranslateChangeLanguage(lng));

        if (result && typeof result === 'object') {
          const { ok, lang: appliedLanguage } = result as { ok?: boolean; lang?: string };
          if (ok === false || (appliedLanguage && appliedLanguage !== lng)) {
            await restorePreviousLanguage();
            showTranslationError('본문 번역 적용이 지연됩니다. 다시 눌러 주세요.');
            logUserInteraction('Language', 'ChangeFailed', lng);
            return false;
          }
        }
      } else if (lng !== 'ko') {
        await restorePreviousLanguage();
        showTranslationError('본문 번역 서버가 아직 준비되지 않았습니다.');
        logUserInteraction('Language', 'ChangeFailed', lng);
        return false;
      }

      return true;
    } catch (error) {
      const retryAfterMillis = typeof error === 'object' && error !== null && 'retryAfterMillis' in error
        ? Number((error as { retryAfterMillis?: unknown }).retryAfterMillis)
        : 0;
      const retrySeconds = Number.isFinite(retryAfterMillis) && retryAfterMillis > 0
        ? Math.max(1, Math.ceil(retryAfterMillis / 1000))
        : 0;
      const reason = typeof error === 'object' && error !== null && 'reason' in error
        ? String((error as { reason?: unknown }).reason)
        : '';
      const message = retrySeconds > 0
        ? `${retrySeconds}초 후 다시 시도해 주세요.`
        : reason === 'translate-timeout'
          ? '번역 적용이 지연됩니다. 다시 눌러 주세요.'
          : '번역 서버가 잠시 응답하지 않습니다.';

      await restorePreviousLanguage();
      showTranslationError(message);
      logUserInteraction('Language', 'ChangeFailed', lng);
      return false;
    }
  }, [i18n, showTranslationError]);

  const handleTranslateToggle = useCallback(() => {
    if (isTranslationPendingRef.current) return;

    const nextLang = i18n.language?.startsWith('ko') ? 'en' : 'ko';
    isTranslationPendingRef.current = true;
    setIsTranslationPending(true);
    void changeLanguage(nextLang).finally(() => {
      finishTranslationFeedback();
    });
  }, [changeLanguage, finishTranslationFeedback, i18n.language]);

  useEffect(() => {
    if (didAutoApplyInitialTranslationRef.current) return;
    if (!i18n.language?.startsWith('en')) return;
    if (hasBrowserTranslation || isTranslationPendingRef.current) return;

    didAutoApplyInitialTranslationRef.current = true;
    isTranslationPendingRef.current = true;
    setIsTranslationPending(true);
    void changeLanguage('en').finally(() => {
      finishTranslationFeedback();
    });
  }, [changeLanguage, finishTranslationFeedback, hasBrowserTranslation, i18n.language]);

  // Layout Mode: Determine if we need wide layout (for full-screen features like Swinpedia)
  const isWideLayout = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const category = searchParams.get('category');
    return currentPath.startsWith('/learning') || 
           currentPath.startsWith('/history') || 
           (currentPath === '/board' && category === 'history') ||
           isPlacesPage ||
           isAdminV2Ingestor;
  }, [currentPath, location.search, isAdminV2Ingestor, isPlacesPage]);

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

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (isEventsPage) {
      root.classList.add('v2-home-mode');
      body.classList.add('v2-home-mode');
    } else {
      root.classList.remove('v2-home-mode');
      body.classList.remove('v2-home-mode');
    }

    return () => {
      root.classList.remove('v2-home-mode');
      body.classList.remove('v2-home-mode');
    };
  }, [isEventsPage]);

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

  const isEnglishTranslationActive = i18n.language?.startsWith('en') || hasBrowserTranslation;
  const translateButtonClassName = [
    'header-translate-btn',
    isEnglishTranslationActive ? 'is-english' : 'is-korean',
    isTranslationPending ? 'is-translating' : '',
    translationErrorMessage ? 'has-translation-error' : ''
  ].filter(Boolean).join(' ');
  const translateButtonIdleLabel = isEnglishTranslationActive
    ? '현재 영어 번역 상태 · 한국어로 전환'
    : '현재 한국어 상태 · 영어로 전환';
  const translateButtonLabel = translationErrorMessage || (isTranslationPending ? '번역 적용 중...' : translateButtonIdleLabel);

  useEffect(() => {
    const button = translateButtonRef.current;
    if (!button) return;

    const syncButtonLabel = () => {
      button.setAttribute('title', translateButtonLabel);
      button.setAttribute('aria-label', translateButtonLabel);
    };

    syncButtonLabel();
    const syncTimers = [
      window.setTimeout(syncButtonLabel, 120),
      window.setTimeout(syncButtonLabel, 600),
      window.setTimeout(syncButtonLabel, 1500),
    ];

    return () => {
      syncTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [translateButtonLabel]);

  return (
    <div className={`shell-container ${isAdminV2Ingestor ? 'layout-full' : isWideLayout ? 'layout-wide' : 'layout-compact'} ${isFullscreen ? 'fullscreen-mode' : ''} ${isMetronomePage ? 'metronome-shell' : ''} ${isCalendarPage ? 'calendar-shell-page' : ''} ${isEventsPage ? 'v2-home-shell' : ''} ${isSwingFloorCouncilPage ? 'swing-floor-council-shell' : ''} ${isHomeMenuHubTestPage ? 'home-menu-hub-test-shell' : ''}`}>
      {/* Global Fixed Header */}
      {!isFullscreen && !isAdminWebzinePage && !isAdminV2Ingestor && !isSwingFloorCouncilPage && (
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
                        window.dispatchEvent(new CustomEvent('openDrawer'));
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
                      <img src="/logo.png" alt="Dance Billboard Logo" className="header-logo" referrerPolicy="no-referrer" />
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
                    <div
                      onClick={() => navigate('/')}
                      className="header-logo-container header-logo-container--compact"
                      data-analytics-id="logo_home"
                      data-analytics-type="nav_item"
                      data-analytics-title="댄스빌보드 로고"
                      data-analytics-section="header"
                    >
                      <img src="/logo.png" alt="Dance Billboard Logo" className="header-logo" referrerPolicy="no-referrer" />
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
                            <span key={`page-char-${i}-${char}`}>{char}</span>
                          ))}
                        </span>
                      </div>
                      {currentPath === '/metronome' && (
                        <button
                          className="header-metronome-info-btn-inline"
                          onClick={() => window.dispatchEvent(new CustomEvent('openMetronomeInfo'))}
                          title="메트로놈 활용 가이드"
                          data-analytics-id="metronome_guide"
                          data-analytics-type="action"
                          data-analytics-title="메트로놈 가이드"
                          data-analytics-section="header"
                        >
                          <i className="ri-question-line"></i>
                        </button>
                      )}
                    </div>
                  )}

                </div>
              )}
              {/* 2. Calendar Page (Full Screen) */}
              {isCalendarPage && (
                <div className="calendar-header-sample">
                  <div className="calendar-header-main-cluster">
                    <button
                      className="header-hamburger-btn calendar-header-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent('openDrawer'));
                      }}
                      data-analytics-id="header_hamburger"
                      data-analytics-type="action"
                      data-analytics-title="사이드 메뉴"
                      data-analytics-section="header"
                      aria-label="사이드 메뉴"
                    >
                      <i className="ri-menu-line"></i>
                    </button>

                    <div className="calendar-header-title-control">
                      <button
                        type="button"
                        className="calendar-header-month-step"
                        onClick={() => window.dispatchEvent(new CustomEvent('prevMonth'))}
                        data-analytics-id="cal_prev_month_title"
                        data-analytics-type="action"
                        data-analytics-title="이전 달 이동(캘린더 헤더)"
                        data-analytics-section="header_calendar"
                        aria-label="이전 달"
                      >
                        <i className="ri-arrow-left-s-line"></i>
                      </button>

                      <button
                        type="button"
                        className="calendar-header-title-lockup"
                        onClick={() => window.dispatchEvent(new CustomEvent('openCalendarNavigator'))}
                        data-analytics-id="cal_open_month_navigator_title"
                        data-analytics-type="action"
                        data-analytics-title="월 선택 열기(캘린더 헤더)"
                        data-analytics-section="header_calendar"
                        aria-label={`${calendarView.year}년 ${calendarView.month + 1}월 선택`}
                      >
                        <strong>
                          <span>{calendarView.year}년</span>
                          <em>{calendarView.month + 1}월</em>
                        </strong>
                      </button>

                      <button
                        type="button"
                        className="calendar-header-month-step"
                        onClick={() => window.dispatchEvent(new CustomEvent('nextMonth'))}
                        data-analytics-id="cal_next_month_title"
                        data-analytics-type="action"
                        data-analytics-title="다음 달 이동(캘린더 헤더)"
                        data-analytics-section="header_calendar"
                        aria-label="다음 달"
                      >
                        <i className="ri-arrow-right-s-line"></i>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="calendar-header-today-compact"
                    onClick={() => window.dispatchEvent(new CustomEvent('goToToday'))}
                    data-analytics-id="cal_goto_today_compact"
                    data-analytics-type="action"
                    data-analytics-title="오늘로 이동"
                    data-analytics-section="header_calendar"
                  >
                    오늘
                  </button>

                  <div className="calendar-header-menu-cluster">
                    <div className="calendar-header-view-switch" aria-label="캘린더 보기 방식">
                      {([
                        ['calendar', '캘린더'],
                        ['list', '리스트'],
                        ['map', '지도'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={calendarHeaderDisplayMode === mode ? 'active' : ''}
                          onClick={() => handleCalendarHeaderDisplayMode(mode)}
                          aria-pressed={calendarHeaderDisplayMode === mode}
                          title={`${label} 보기`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="calendar-month-nav calendar-month-nav--sample">
                      <button
                        type="button"
                        className="calendar-today-header-btn"
                        onClick={() => {
                          console.log('[MobileShell] Today button clicked, dispatching goToToday');
                          window.dispatchEvent(new CustomEvent('goToToday'));
                        }}
                        data-analytics-id="cal_goto_today_btn"
                        data-analytics-type="action"
                        data-analytics-title="오늘로 이동"
                        data-analytics-section="header_calendar"
                      >
                        오늘
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isEventsPage && (
              <div
                id="home-neb-header-scope-target"
                className="home-neb-header-scope-target"
              />
            )}

            <div className="header-right-buttons">
              <button
                ref={translateButtonRef}
                type="button"
                onClick={handleTranslateToggle}
                className={translateButtonClassName}
                title={translateButtonLabel}
                aria-label={translateButtonLabel}
                aria-busy={isTranslationPending}
                aria-pressed={isEnglishTranslationActive}
                disabled={isTranslationPending}
                translate="no"
                data-current-language={isEnglishTranslationActive ? 'en' : 'ko'}
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

              <button
                className="header-search-btn"
                onClick={() => {
                  if (isCalendarPage) {
                    window.dispatchEvent(new CustomEvent('openCalendarSearch'));
                  } else {
                    globalSearchModal.open();
                  }
                }}
                title="검색"
                data-analytics-id="header_search"
                data-analytics-type="action"
                data-analytics-title="검색"
                data-analytics-section="header"
              >
                <i className="ri-search-line"></i>
              </button>

              {/* User/Login button */}
              {user || userProfile ? (
                <button
                  className="header-user-btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('openDrawer'))}
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
              ) : null}
            </div>
          </div>
        </header >
      )}

      {isTranslationPending && (
        <div
          className="translation-blocker"
          role="status"
          aria-live="polite"
          aria-label="번역 적용 중"
          translate="no"
        >
          <div className="translation-blocker__panel">
            <span className="translation-blocker__spinner" aria-hidden="true" />
            <span>번역 적용 중...</span>
          </div>
        </div>
      )}

      <div className={`shell-main-content ${isAdminV2Ingestor ? 'layout-full' : ''}`}>
        <Outlet context={{ category, isFullscreen }} />
      </div>

      {!isFullscreen && !isAdminV2Ingestor && !isSwingFloorCouncilPage && !isHomeMenuHubTestPage && <HomeV2MenuPanel />}

      {!isAdminV2Ingestor && !isSwingFloorCouncilPage && (
        <SideDrawer
          pageAction={pageAction}
          onPageActionClick={handlePageAction}
          onLoginClick={() => {
            window.dispatchEvent(new CustomEvent('closeDrawer'));
            loginModal.open({
              message: '댄스빌보드 로그인'
            });
          }}
        />
      )}

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
