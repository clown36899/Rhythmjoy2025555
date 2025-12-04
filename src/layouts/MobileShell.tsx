import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import '../styles/components/MobileShell.css';
import { BottomNavigation } from "./BottomNavigation";

export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [eventCounts, setEventCounts] = useState({ class: 0, event: 0 });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarView, setCalendarView] = useState<{ year: number; month: number; viewMode: 'month' | 'year' }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    viewMode: 'month'
  });

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

  // selectedDate 변경 감지
  useEffect(() => {
    const handleSelectedDateChanged = (e: CustomEvent) => {
      setSelectedDate(e.detail);
    };

    window.addEventListener('selectedDateChanged', handleSelectedDateChanged as EventListener);

    return () => {
      window.removeEventListener('selectedDateChanged', handleSelectedDateChanged as EventListener);
    };
  }, []);

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
  const isEventsPage = location.pathname === '/';
  const isSocialPage = location.pathname.startsWith('/social');
  const isPracticePage = location.pathname === '/practice';
  const isBoardPage = location.pathname === '/board';
  const isShoppingPage = location.pathname.startsWith('/shopping');
  const isGuidePage = location.pathname === '/guide';
  const category = searchParams.get('category') || 'all';



  return (
    <div className="shell-container">
      {/* Main Content */}
      <Outlet context={{ category, eventCounts }} />

      {/* Bottom Navigation - 모든 페이지 공통 */}
      <div data-id="bottom-nav" className="shell-bottom-nav">
        {/* Category Filter Badges - 홈 페이지에서만 표시 */}
        {isEventsPage && (
          <div
            className="shell-top-bar"
            style={{
              backgroundColor: "var(--header-bg-color)",
              minHeight: '32px'
            }}
          >
            <div className="shell-top-bar-content">
              {/* 행사 버튼 (앞으로 이동) */}
              <div className="shell-text-hint">
                날짜를 클릭하여 일정을 추가하세요
              </div>
              <div id="mobile-shell-action-portal"></div>

              {/* 등록 버튼 - 날짜 선택 시에만 표시 */}
              {selectedDate && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('createEventForDate'));
                  }}
                  className="shell-btn-register"
                >
                  <i className="ri-add-line shell-icon-sm"></i>
                  <span>등록</span>
                </button>
              )}
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="shell-btn-admin"
              >
                <i className={`${showAdminPanel ? 'ri-close-line' : 'ri-admin-line'} shell-icon-sm`}></i>
              </button>
            )}
          </div>
        )}

        {/* 관리자 상태 표시 - 모든 페이지 공통 */}
        {!isEventsPage && (
          <div
            className="shell-top-bar"
            style={{
              backgroundColor: "var(--header-bg-color)",
              minHeight: '32px'
            }}
          >
            <span className="shell-text-label no-select">
              {isSocialPage && '소셜 장소'}
              {isPracticePage && '연습실'}
              {isBoardPage && '자유게시판'}
              {isShoppingPage && '쇼핑'}
              {isGuidePage && '안내'}
            </span>
            <div className="shell-flex-center shell-gap-2">
              {isPracticePage && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('practiceRoomRegister'));
                  }}
                  className="shell-btn-practice-register"
                >
                  <i className="ri-add-line shell-icon-sm shell-mr-0-5"></i>
                  <span>등록</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="shell-btn-admin"
                >
                  <i className={`${showAdminPanel ? 'ri-close-line' : 'ri-admin-line'} shell-icon-sm`}></i>
                </button>
              )}
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
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openBillboardSettings'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-image-2-line"></i>
              광고판 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openBillboardUserManagement'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-user-settings-line"></i>
              빌보드 사용자 관리
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openDefaultThumbnailSettings'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-image-line"></i>
              기본 썸네일 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openColorSettings'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-palette-line"></i>
              색상 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
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
                setShowAdminPanel(false);
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
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/board');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openRegistrationFormPreview'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-file-edit-line"></i>
              회원가입 폼 미리보기
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openSettings'));
                }, 100);
              }}
              className="shell-admin-panel-btn"
            >
              <i className="ri-settings-3-line"></i>
              전체 설정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
