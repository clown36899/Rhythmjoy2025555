import { useState, useEffect, useRef, useCallback } from "react";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import PracticeRoomList from "./components/PracticeRoomList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import { supabase } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  const calendarRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [savedMonth, setSavedMonth] = useState<Date | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">(
    "random",
  );
  const [highlightEvent, setHighlightEvent] = useState<{
    id: number;
    nonce: number;
  } | null>(null);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // 공통 스와이프 상태 (달력과 이벤트 리스트 동기화)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'horizontal' | 'vertical' | null>(null);

  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // QR 스캔 또는 이벤트 수정으로 접속했는지 동기적으로 확인 (초기 렌더링 시점에 결정)
  const [fromQR] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('from');
    return source === 'qr' || source === 'edit';
  });

  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  // URL 파라미터 처리 (QR 코드 스캔 또는 이벤트 수정 후 하이라이트)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    const source = params.get('from');

    if ((source === 'qr' || source === 'edit') && eventId) {
      const id = parseInt(eventId);
      setQrLoading(true);
      
      // 이벤트 정보 조회 후 달력 이동
      const loadEventAndNavigate = async () => {
        try {
          const { data: event } = await supabase
            .from('events')
            .select('start_date, date')
            .eq('id', id)
            .single();
          
          if (event) {
            // 이벤트 날짜로 달력 이동
            const eventDate = event.start_date || event.date;
            if (eventDate) {
              const date = new Date(eventDate);
              setCurrentMonth(date);
            }
            
            // 로딩 해제 후 하이라이트
            setTimeout(() => {
              setQrLoading(false);
              setTimeout(() => {
                setHighlightEvent({ id, nonce: Date.now() });
              }, 500);
            }, 100);
          } else {
            setQrLoading(false);
          }
        } catch (error) {
          console.error('Error loading event for navigation:', error);
          setQrLoading(false);
        }
      };
      
      loadEventAndNavigate();
      
      // URL에서 파라미터 제거 (깔끔하게)
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);


  // 검색 취소 시 전체 모드로 리셋
  useEffect(() => {
    if (!searchTerm) {
      // 검색 취소: 전체 모드로 리셋
      setSelectedCategory("all");
    }
  }, [searchTerm]);

  // 날짜 선택 시 스크롤 최상단으로 이동
  useEffect(() => {
    if (selectedDate && !qrLoading) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedDate]);

  // 이벤트 삭제/수정 시 빌보드 재로딩
  useEffect(() => {
    const handleEventUpdate = () => {
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('eventDeleted', handleEventUpdate);
    
    return () => {
      window.removeEventListener('eventDeleted', handleEventUpdate);
    };
  }, []);

  // 검색 시작 시 호출되는 콜백
  const handleSearchStart = () => {
    // 전체 모드로 전환
    setSelectedCategory("all");
  };

  // 안내창 열릴 때 스크롤 완전히 막기
  useEffect(() => {
    if (isGuideOpen) {
      // 현재 스크롤 위치 저장
      const scrollY = window.scrollY;
      
      // body를 고정하고 스크롤 위치 유지
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // 원래 상태로 복원
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        
        // 스크롤 위치 복원
        window.scrollTo(0, scrollY);
      };
    }
  }, [isGuideOpen]);

  // 비활동 타이머 초기화 함수
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // 광고판이 비활성화되어 있거나, 열려있거나, 타이머가 0이면 설정 안 함
    // QR 스캔으로 접속한 경우에도 타이머 설정 안 함
    if (
      !settings.enabled ||
      isBillboardOpen ||
      settings.inactivityTimeout === 0 ||
      fromQR
    )
      return;

    // 설정된 시간 후 광고판 자동 열기
    inactivityTimerRef.current = setTimeout(() => {
      if (billboardImages.length > 0) {
        setIsBillboardOpen(true);
      }
    }, settings.inactivityTimeout);
  }, [
    settings.enabled,
    settings.inactivityTimeout,
    isBillboardOpen,
    billboardImages.length,
    fromQR,
  ]);

  // 사용자 활동 감지 및 비활동 타이머
  useEffect(() => {
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    // 초기 타이머 시작
    resetInactivityTimer();

    // 이벤트 리스너 등록
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      // cleanup
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [resetInactivityTimer]);

  // 광고판 이미지 로드 및 자동 표시
  useEffect(() => {
    const loadBillboardImages = async () => {
      // 광고판이 비활성화되어 있으면 로드하지 않음
      if (!settings.enabled) {
        setBillboardImages([]);
        setBillboardEvents([]);
        return;
      }

      try {
        const today = new Date();

        const { data: events } = await supabase
          .from("events")
          .select("id,title,date,start_date,end_date,time,location,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at")
          .order("date", { ascending: true });

        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            // 이미지 또는 영상이 있는지 확인
            if (!event.image_full && !event.image && !event.video_url) {
              return false;
            }

            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) {
              return false;
            }

            // 특정 이벤트 제외
            if (settings.excludedEventIds && settings.excludedEventIds.includes(event.id)) {
              return false;
            }

            // 요일 제외
            if (settings.excludedWeekdays && settings.excludedWeekdays.length > 0) {
              const eventDate = new Date(event.start_date || event.date);
              const dayOfWeek = eventDate.getDay();
              if (settings.excludedWeekdays.includes(dayOfWeek)) {
                return false;
              }
            }

            // 날짜 범위 필터 적용 (시작 날짜만 체크)
            if (settings.dateRangeStart || settings.dateRangeEnd) {
              const eventStartDate = event.start_date || event.date;
              
              if (settings.dateRangeStart && eventStartDate < settings.dateRangeStart) {
                return false;
              }
              
              if (settings.dateRangeEnd && eventStartDate > settings.dateRangeEnd) {
                return false;
              }
            }

            return true;
          });

          // 이미지 또는 영상 URL 추출 (인덱스 일치 보장)
          const imagesOrVideos = filteredEvents.map((event) => 
            event.video_url || event.image_full || event.image
          );
          
          setBillboardImages(imagesOrVideos);
          setBillboardEvents(filteredEvents);

          // 자동 열기 설정이 켜져있을 때만 자동으로 표시 (QR 스캔으로 접속한 경우 제외)
          if (settings.autoOpenOnLoad && !fromQR) {
            const todayStr = today.toDateString();
            const dismissedDate = localStorage.getItem(
              "billboardDismissedDate",
            );

            if (dismissedDate !== todayStr && imagesOrVideos.length > 0) {
              setIsBillboardOpen(true);
            }
          }
        }
      } catch (error) {
        console.error("Error loading billboard images:", error);
      }
    };

    loadBillboardImages();
  }, [settings.enabled, settings.autoOpenOnLoad, settings.dateRangeStart, settings.dateRangeEnd, settings.excludedWeekdays, settings.excludedEventIds, fromQR, refreshTrigger]);

  const handleBillboardClose = () => {
    setIsBillboardOpen(false);
    const today = new Date().toDateString();
    localStorage.setItem("billboardDismissedDate", today);
  };

  const handleBillboardOpen = () => {
    setIsBillboardOpen(true);
  };

  const handleBillboardSettingsOpen = () => {
    setIsBillboardSettingsOpen(true);
  };

  const handleBillboardSettingsClose = () => {
    setIsBillboardSettingsOpen(false);
  };

  const handleBillboardEventClick = (event: any) => {
    setIsBillboardOpen(false);

    if (event && event.id) {
      // 이벤트 날짜로 달력 이동
      const eventDate = event.start_date || event.date;
      if (eventDate) {
        const date = new Date(eventDate);
        setCurrentMonth(date);
      }

      // 약간의 딜레이 후 하이라이트 (달력이 먼저 렌더링되도록)
      setTimeout(() => {
        setHighlightEvent({ id: event.id, nonce: Date.now() });
      }, 100);
    }
  };

  const handleHighlightComplete = () => {
    setHighlightEvent(null);
  };

  const handleDateSelect = async (date: Date | null) => {
    setSelectedDate(date);

    // 날짜가 선택되었을 때 해당 날짜의 모든 이벤트 카테고리를 감지
    if (date) {
      try {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        // 모든 이벤트를 가져와서 클라이언트에서 날짜 범위 필터링
        const { data: allEvents } = await supabase
          .from("events")
          .select("category, start_date, end_date, date")
          .order("created_at", { ascending: true });

        // 날짜 범위를 고려한 필터링
        const events =
          allEvents?.filter((event: any) => {
            const startDate = event.start_date || event.date;
            const endDate = event.end_date || event.date;
            return (
              selectedDateString >= startDate && selectedDateString <= endDate
            );
          }) || [];

        if (events && events.length > 0) {
          // 해당 날짜의 모든 고l�� 카테고리 추출
          const uniqueCategories = [
            ...new Set(events.map((event) => event.category)),
          ];

          // 카테고리가 1개만 있으면 그 카테고리 선택
          if (uniqueCategories.length === 1) {
            setSelectedCategory(uniqueCategories[0]);
          } else {
            // 2개 이상 있으면 "all"로 설정 (모든 카테고리 표시)
            setSelectedCategory("all");
          }
        } else {
          // 이벤트가 없으면 "all" 카테고리로 설정
          setSelectedCategory("all");
        }
      } catch (error) {
        console.error("Error fetching events for date:", error);
        setSelectedCategory("all");
      }
    }
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
    setSelectedDate(null);
    setSelectedCategory("all");
  };

  // 공통 스와이프/드래그 핸들러 (달력과 이벤트 리스트가 함께 사용)
  const minSwipeDistance = 30;

  // 터치 핸들러 - 좌우 슬라이드와 상하 스크롤 명확히 구분
  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const touch = e.targetTouches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(true);
    setDragOffset(0);
    setSwipeDirection(null);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || touchStart === null) return;

    const touch = e.targetTouches[0];
    const diffX = touch.clientX - touchStart.x;
    const diffY = touch.clientY - touchStart.y;

    // 방향이 아직 결정되지 않았으면 결정
    if (swipeDirection === null) {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      
      // 임계값: 최소 3px 이동 후 방향 결정 (즉각 반응)
      if (absX > 3 || absY > 3) {
        // Y축 이동이 X축보다 1.5배 이상 크면 수직 스크롤
        if (absY > absX * 1.5) {
          setSwipeDirection('vertical');
        } 
        // X축 이동이 Y축보다 1.5배 이상 크면 수평 슬라이드
        else if (absX > absY * 1.5) {
          setSwipeDirection('horizontal');
        }
      }
    }

    // 수평 슬라이드로 결정되었을 때만 dragOffset 업데이트
    if (swipeDirection === 'horizontal') {
      setDragOffset(diffX);
      e.preventDefault(); // 스크롤 방지
    } else if (swipeDirection === 'vertical') {
      // 수직 스크롤은 기본 동작 허용 (dragOffset 업데이트 안 함)
      return;
    }
  };

  const onTouchEnd = () => {
    if (!isDragging || touchStart === null) return;

    setIsDragging(false);

    // 수평 슬라이드로 인식된 경우만 월 변경
    if (swipeDirection === 'horizontal') {
      const distance = dragOffset;
      const threshold = minSwipeDistance;

      if (Math.abs(distance) > threshold) {
        setIsAnimating(true);

        const screenWidth = window.innerWidth;
        const direction = distance < 0 ? "next" : "prev";
        const targetOffset = distance < 0 ? -screenWidth : screenWidth;

        setDragOffset(targetOffset);

        // 월 변경 계산
        const newMonth = new Date(currentMonth);
        if (direction === "prev") {
          newMonth.setMonth(currentMonth.getMonth() - 1);
        } else {
          newMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // 애니메이션 종료 후 월 변경 및 상태 리셋
        setTimeout(() => {
          setCurrentMonth(newMonth);
          setDragOffset(0);
          setIsAnimating(false);
          setTouchStart(null);
          setSwipeDirection(null);
        }, 300);
      } else {
        setDragOffset(0);
        setTouchStart(null);
        setSwipeDirection(null);
      }
    } else {
      // 수직 스크롤이거나 방향 미결정인 경우 상태만 리셋
      setDragOffset(0);
      setTouchStart(null);
      setSwipeDirection(null);
    }
  };


  const handleEventsUpdate = async (createdDate?: Date) => {
    setRefreshTrigger((prev) => prev + 1);

    // 이벤트 등록 후 날짜가 전달되었을 때, 그 날짜를 선택 (handleDateSelect가 자동으로 카테고리 감지)
    if (createdDate) {
      await handleDateSelect(createdDate);
    }
  };

  const handleAdminModeToggle = (
    adminMode: boolean, 
    type: "super" | "sub" | null = null,
    userId: string | null = null,
    userName: string = ""
  ) => {
    setIsAdminMode(adminMode);
    setAdminType(type);
    setBillboardUserId(userId);
    setBillboardUserName(userName);
  };

  const handleCategoryChange = (category: string) => {
    // "전체" 버튼만 검색 취소, 강습/행사는 검색 결과 내 필터링
    if (category === "all" && searchTerm) {
      setSearchTerm("");
    }
    setSelectedCategory(category);
    // "모든 이벤트"를 클릭했을 때 선택된 날짜 초기화
    if (category === "all") {
      setSelectedDate(null);
    }
  };

  const getSortIcon = () => {
    switch (sortBy) {
      case "random":
        return "ri-shuffle-line";
      case "time":
        return "ri-time-line";
      case "title":
        return "ri-sort-alphabet-asc";
      case "newest":
        return "ri-calendar-line";
      default:
        return "ri-shuffle-line";
    }
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case "random":
        return "랜덤";
      case "time":
        return "시간";
      case "title":
        return "제목";
      case "newest":
        return "최신";
      default:
        return "랜덤";
    }
  };

  // 카테고리 버튼이 활성화되어야 하는지 확인하는 함수
  const isCategoryActive = (categoryId: string) => {
    // 날짜가 선택되었고 selectedCategory가 "all"일 때
    if (selectedDate && selectedCategory === "all") {
      // "모든 이벤트" 버튼은 비활성화
      if (categoryId === "all") {
        return false;
      }
      // 강습/행사 버튼은 활성화 (날짜에 이벤트가 있으면 클릭 가능하도록)
      if (categoryId === "class" || categoryId === "event") {
        return true;
      }
    }

    // 그 외의 경우는 현재 선택된 카테고리인지 확인
    return selectedCategory === categoryId;
  };

  const handleViewModeChange = (mode: "month" | "year") => {
    if (mode === "year") {
      // 년 보기로 전환: 현재 월 저장
      setSavedMonth(new Date(currentMonth));
    } else if (mode === "month" && savedMonth) {
      // 월 보기로 복귀: 저장된 월 복원
      setCurrentMonth(new Date(savedMonth));
    }
    setViewMode(mode);
    // 뷰 모드 변경 시 이벤트 리스트 표시
    setSelectedCategory("all");
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--page-bg-color)" }}
    >
      {/* Fixed Header for all screens */}
      <div
        className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(direction) => {
            if (isAnimating) return;
            
            setIsAnimating(true);
            
            const screenWidth = window.innerWidth;
            const targetOffset = direction === "prev" ? screenWidth : -screenWidth;
            setDragOffset(targetOffset);

            const newMonth = new Date(currentMonth);
            if (viewMode === "year") {
              // 연간 보기: 년 단위로 이동
              if (direction === "prev") {
                newMonth.setFullYear(currentMonth.getFullYear() - 1);
              } else {
                newMonth.setFullYear(currentMonth.getFullYear() + 1);
              }
            } else {
              // 월간 보기: 월 단위로 이동
              if (direction === "prev") {
                newMonth.setMonth(currentMonth.getMonth() - 1);
              } else {
                newMonth.setMonth(currentMonth.getMonth() + 1);
              }
            }

            setTimeout(() => {
              setCurrentMonth(newMonth);
              setDragOffset(0);
              setIsAnimating(false);
              // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
              setSelectedDate(null);
              setSelectedCategory("all");
            }, 300);
          }}
          onDateChange={(newMonth) => {
            setCurrentMonth(newMonth);
            // 날짜 변경 시 날짜 리셋하고 이벤트 리스트 표시
            setSelectedDate(null);
            setSelectedCategory("all");
          }}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
          onBillboardSettingsOpen={handleBillboardSettingsOpen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          billboardEnabled={settings.enabled}
        />
      </div>

      {/* Mobile Layout - Scrollable Calendar & Content */}
      <div className="pt-16">
        {/* Calendar Section - 일반 스크롤 (sticky 아님) */}
        <div
          ref={calendarRef}
          className="w-full"
          style={{ backgroundColor: "var(--calendar-bg-color)" }}
        >
          {/* Calendar - Collapsible */}
          <div
            className="transition-all duration-300 ease-in-out overflow-hidden border-b border-[#22262a]"
            style={{
              maxHeight: isCalendarCollapsed ? '0px' : '2000px',
            }}
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
              hoveredEventId={hoveredEventId}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              dragOffset={dragOffset}
              isAnimating={isAnimating}
            />
          </div>
        </div>

        {/* Tools Panel - 달력 아래에서 따라 올라가다가 헤더에 STICKY */}
        <div 
          className="sticky top-16 w-full z-[15] border-b border-[#22262a]"
          style={{ 
            backgroundColor: "var(--calendar-bg-color)"
          }}
        >
          <div className="flex items-center gap-2 px-2 py-1">
            {/* 달력 접기/펴기 토글 버튼 */}
            <button
              onClick={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
              className="flex items-center justify-center h-6 w-8
                         bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white
                         rounded-lg transition-colors cursor-pointer flex-shrink-0"
              aria-label={isCalendarCollapsed ? "달력 펴기" : "달력 접기"}
            >
              <i className={`${isCalendarCollapsed ? 'ri-calendar-line' : 'ri-calendar-close-line'} text-sm leading-none align-middle`}></i>
            </button>
            
            <div className="flex-1"></div>

            {/* 정렬 버튼 */}
            <button
              onClick={() => setShowSortModal(true)}
              className="flex items-center justify-center h-6 gap-1 px-2
                         bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white
                         rounded-lg transition-colors cursor-pointer flex-shrink-0"
            >
              <i
                className={`${getSortIcon()} text-sm leading-none align-middle`}
              ></i>
              <span className="text-xs leading-none align-middle">
                {getSortLabel()}
              </span>
            </button>

            {/* 검색 버튼 */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="flex items-center justify-center h-6 w-8
                         bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white
                         rounded-lg transition-colors cursor-pointer flex-shrink-0"
              aria-label="검색"
            >
              <i className="ri-search-line text-sm leading-none align-middle"></i>
            </button>
          </div>
        </div>

          {/* Scrollable Content Area - Events/Practice Rooms and Footer */}
          <div className="w-full bg-[#1f1f1f] pb-16">
            {selectedCategory === "practice" ? (
                <PracticeRoomList 
                  adminType={adminType}
                  showSearchModal={showSearchModal}
                  setShowSearchModal={setShowSearchModal}
                  showSortModal={showSortModal}
                  setShowSortModal={setShowSortModal}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                />
              ) : qrLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-400">이벤트 로딩 중...</div>
                </div>
              ) : (
                <EventList
                  selectedDate={selectedDate}
                  selectedCategory={selectedCategory}
                  currentMonth={currentMonth}
                  refreshTrigger={refreshTrigger}
                  isAdminMode={isAdminMode}
                  adminType={adminType}
                  viewMode={viewMode}
                  onEventHover={setHoveredEventId}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  onSearchStart={handleSearchStart}
                  showSearchModal={showSearchModal}
                  setShowSearchModal={setShowSearchModal}
                  showSortModal={showSortModal}
                  setShowSortModal={setShowSortModal}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  highlightEvent={highlightEvent}
                  onHighlightComplete={handleHighlightComplete}
                  dragOffset={dragOffset}
                  isAnimating={isAnimating}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                />
              )}

            {/* Footer - 고정 (위치는 고정이지만 터치 슬라이드 인식) */}
            <div
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <Footer />
            </div>
          </div>
      </div>

      {/* Fullscreen Billboard */}
      {settings.enabled && (
        <FullscreenBillboard
          images={billboardImages}
          events={billboardEvents}
          isOpen={isBillboardOpen}
          onClose={handleBillboardClose}
          onEventClick={handleBillboardEventClick}
          autoSlideInterval={settings.autoSlideInterval}
          transitionDuration={settings.transitionDuration}
          dateRangeStart={settings.dateRangeStart}
          dateRangeEnd={settings.dateRangeEnd}
          showDateRange={settings.showDateRange}
          playOrder={settings.playOrder}
        />
      )}

      {/* Admin Billboard Settings Modal */}
      <AdminBillboardModal
        isOpen={isBillboardSettingsOpen}
        onClose={() => {
          handleBillboardSettingsClose();
          // 서브 관리자는 설정 창 닫아도 설정 모달 다시 열기
          if (adminType === "sub") {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('reopenAdminSettings'));
            }, 100);
          }
        }}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        adminType={adminType}
        billboardUserId={billboardUserId}
        billboardUserName={billboardUserName}
      />

      {/* Guide Panel Backdrop - 터치 이벤트 차단 */}
      {isGuideOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-24"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.preventDefault();
          }}
        />
      )}

      {/* Guide Panel - 사이트 안내 */}
      <div 
        className={`fixed left-0 right-0 bg-[#1f1f1f] transition-all duration-300 ease-out overflow-y-auto ${
          isGuideOpen ? 'bottom-16 top-16' : 'bottom-16 top-full'
        }`}
        style={{ 
          maxWidth: '650px', 
          margin: '0 auto',
          zIndex: 25,
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="p-6 text-white">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-4 text-blue-400">광고판 사용 안내</h2>
            
            {/* 주 문구 */}
            <div className="mb-6">
              <p className="text-yellow-400 mb-4 text-base font-bold animate-pulse">
                누구나 일정 무료 등록가능 (로그인 x),
              </p>

              <p className="text-gray-400 text-sm mb-1">
                사용방법 <br />
                달력을 두번 클릭하면 일정등록폼이 나옵니다.<br />
                자율등록하시고 비번설정으로 수정가능
                <br />공공의 이익에 해가되면 삭제수정될수있습니다.
              </p>

              <p className="text-orange-400 text-base font-semibold mt-4">
                연습실 등록은 별도문의(사용불가능한 연습실은 등록불가)
              </p>
            </div>

            {/* QR 공유 안내 */}
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-2">
                친구에게 공유하려면 우측 상단 메뉴에서<br />
                <span className="text-blue-400 font-semibold">QR 코드 공유</span>를 클릭하세요
              </p>
            </div>

            {/* 연락처 */}
            <div className="mt-8 pt-6 border-t border-gray-700">
              <p className="text-gray-400 text-sm mb-2">
                이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.
              </p>
              <p className="text-gray-400 text-sm">© since 2025. 제작-joy.</p>
              <p className="text-gray-500 text-xs mt-2">
                Contact:{" "}
                <a
                  href="tel:010-4801-7180"
                  onClick={(e) => {
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (!isMobile) {
                      e.preventDefault();
                      navigator.clipboard.writeText("010-4801-7180").then(() => {
                        alert("전화번호가 복사되었습니다!");
                      }).catch(() => {
                        alert("복사에 실패했습니다. 번호: 010-4801-7180");
                      });
                    }
                  }}
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  010-4801-7180
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation - 분류 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#22262a]" style={{ maxWidth: '650px', margin: '0 auto', backgroundColor: "var(--header-bg-color)" }}>
        <div className="flex items-center justify-around px-2 py-2">
          {/* 전체 버튼 */}
          <button
            onClick={() => {
              handleCategoryChange("all");
              setIsGuideOpen(false);
            }}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              searchTerm
                ? "text-gray-400"
                : isCategoryActive("all")
                  ? "text-blue-500"
                  : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-file-list-3-line text-xl mb-0.5"></i>
            <span className="text-xs">
              {currentMonth
                ? viewMode === "year"
                  ? `${currentMonth.getFullYear()}년`
                  : `${currentMonth.getMonth() + 1}월`
                : "전체"}
            </span>
          </button>

          {/* 강습 버튼 */}
          <button
            onClick={() => {
              handleCategoryChange("class");
              setIsGuideOpen(false);
            }}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              searchTerm
                ? isCategoryActive("class")
                  ? "text-purple-400"
                  : "text-gray-400"
                : isCategoryActive("class")
                  ? "text-purple-500"
                  : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-book-open-line text-xl mb-0.5"></i>
            <span className="text-xs">강습</span>
          </button>

          {/* 행사 버튼 */}
          <button
            onClick={() => {
              handleCategoryChange("event");
              setIsGuideOpen(false);
            }}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              searchTerm
                ? isCategoryActive("event")
                  ? "text-blue-400"
                  : "text-gray-400"
                : isCategoryActive("event")
                  ? "text-blue-500"
                  : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-calendar-event-line text-xl mb-0.5"></i>
            <span className="text-xs">행사</span>
          </button>

          {/* 연습실 버튼 */}
          <button
            onClick={() => {
              setSelectedCategory("practice");
              setIsGuideOpen(false);
            }}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isCategoryActive("practice")
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-music-2-line text-xl mb-0.5"></i>
            <span className="text-xs">연습실</span>
          </button>

          {/* 안내 버튼 */}
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isGuideOpen
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className={`${isGuideOpen ? 'ri-close-line' : 'ri-information-line'} text-xl mb-0.5`}></i>
            <span className="text-xs">안내</span>
          </button>
        </div>
      </div>
    </div>
  );
}
