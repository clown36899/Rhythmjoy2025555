import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import EventRegistrationModal from "../../components/EventRegistrationModal";
import { supabase } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";
import { useAuth } from "../../contexts/AuthContext";
import { useUnifiedGestureController } from "../../hooks/useUnifiedGestureController";

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedCategory = searchParams.get("category") || "all";
  const { isAdmin } = useAuth();

  // 카테고리 변경 헬퍼 함수
  const navigateWithCategory = useCallback(
    (cat?: string) => {
      if (!cat || cat === "all") {
        navigate("/");
      } else {
        navigate(`/?category=${cat}`);
      }
    },
    [navigate],
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [qrLoading, setQrLoading] = useState(false);
  const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [fromBanner, setFromBanner] = useState(false);
  const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // isAdmin 상태에 따라 adminType 자동 동기화
  useEffect(() => {
    if (isAdmin) {
      setAdminType("super");
      console.log("[HomePage] 슈퍼 관리자 모드 활성화");
    } else if (!billboardUserId) {
      // 빌보드 사용자도 아니고 슈퍼 관리자도 아니면 null
      setAdminType(null);
      console.log("[HomePage] 관리자 모드 비활성화");
    }
  }, [isAdmin, billboardUserId]);

  // MobileShell에 현재 월 정보 전달
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("monthChanged", {
        detail: { month: currentMonth.toISOString() },
      }),
    );
  }, [currentMonth]);

  // MobileShell에 viewMode 정보 전달
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("viewModeChanged", {
        detail: { viewMode },
      }),
    );
  }, [viewMode]);
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
  const [calendarMode, setCalendarMode] = useState<
    "collapsed" | "expanded" | "fullscreen"
  >("collapsed");
  // calendarMode -> 달력 3단계 상태: collapsed (접힘) / expanded (펼쳐짐) / fullscreen (전체화면)
  const [searchTerm, setSearchTerm] = useState("");
  const [isRandomBlinking, setIsRandomBlinking] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(60); // 헤더 높이 (기본 60px)
  const headerRef = useRef<HTMLDivElement>(null);

  // 달력 끌어내림 제스처 상태
  const [isDraggingCalendar, setIsDraggingCalendar] = useState(false);
  const [liveCalendarHeight, setLiveCalendarHeight] = useState(0); // 🎯 실시간 달력 높이
  const calendarContentRef = useRef<HTMLDivElement>(null);

  // 스크롤 기반 달력 확장용 상태
  const isScrollExpandingRef = useRef<boolean>(false);

  // 공통 스와이프 상태 (달력과 이벤트 리스트 동기화)
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  // const [swipeDirection, setSwipeDirection] = useState<
  //   "horizontal" | "vertical" | null
  // >(null);

  // 스와이프 최적화용 ref
  const swipeAnimationRef = useRef<number | null>(null);
  const calendarElementRef = useRef<HTMLDivElement | null>(null);
  const eventListElementRef = useRef<HTMLDivElement | null>(null);
  const eventListSlideContainerRef = useRef<HTMLDivElement | null>(null); // 이벤트 리스트 슬라이드 컨테이너 (3개월 애니메이션용)
  const swipeOffsetRef = useRef<number>(0); // 실제 드래그 offset (리렌더링 없음)
  const gestureDirectionRef = useRef<"horizontal" | "vertical" | null>(null); // 🎯 제스처 방향 공유
  const containerRef = useRef<HTMLDivElement>(null); // 통합 제스처 컨트롤러용 컨테이너

  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // cleanup: 컴포넌트 언마운트 시 애니메이션 프레임 취소
  useEffect(() => {
    return () => {
      if (swipeAnimationRef.current) {
        cancelAnimationFrame(swipeAnimationRef.current);
      }
    };
  }, []);

  // 헤더 높이 측정
  useEffect(() => {
    if (headerRef.current) {
      const height = headerRef.current.offsetHeight;
      setHeaderHeight(height);
    }
  }, []);

  // 🎯 통합 Pointer Events 컨트롤러
  useUnifiedGestureController({
    containerRef,
    eventListRef: eventListElementRef,
    calendarContentRef,
    headerHeight,
    calendarMode,
    setCalendarMode,
    isScrollExpandingRef,
    gestureDirectionRef, // 🎯 제스처 방향 공유
    onHeightChange: setLiveCalendarHeight, // 실시간 높이 업데이트
    onDraggingChange: setIsDraggingCalendar, // 드래그 상태 업데이트
  });

  // 🎯 수평 스와이프 핸들러 (native event listener로 passive: false 설정)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let localTouchStart: { x: number; y: number } | null = null;
    let localSwipeDirection: "horizontal" | "vertical" | null = null;
    let localIsDragging = false;

    const handleTouchStart = (e: TouchEvent) => {
      // 🎯 ref 사용하여 최신 상태 체크
      if (isAnimating) return;
      const touch = e.touches[0];
      localTouchStart = { x: touch.clientX, y: touch.clientY };
      localIsDragging = true;
      localSwipeDirection = null;
      gestureDirectionRef.current = null; // 🎯 방향 초기화
      setDragOffset(0);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!localIsDragging || !localTouchStart) return;

      const touch = e.touches[0];
      const diffX = touch.clientX - localTouchStart.x;
      const diffY = touch.clientY - localTouchStart.y;

      // 방향 결정
      if (localSwipeDirection === null) {
        // 🎯 이미 다른 핸들러가 방향을 정했는지 확인
        if (gestureDirectionRef.current === "vertical") {
          // 수직 드래그가 이미 시작됨 → 수평 스와이프 차단
          localIsDragging = false;
          return;
        }

        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        if (absX > 3 || absY > 3) {
          if (absY > absX * 1.5) {
            localSwipeDirection = "vertical";
            gestureDirectionRef.current = "vertical"; // 🎯 방향 공유
          } else if (absX > absY * 1.5) {
            localSwipeDirection = "horizontal";
            gestureDirectionRef.current = "horizontal"; // 🎯 방향 공유
          }
        }
      }

      // 수평 슬라이드 처리
      if (localSwipeDirection === "horizontal") {
        e.preventDefault(); // passive: false이므로 가능

        if (swipeAnimationRef.current) {
          cancelAnimationFrame(swipeAnimationRef.current);
        }

        swipeAnimationRef.current = requestAnimationFrame(() => {
          swipeOffsetRef.current = diffX;

          // dragOffset state 업데이트 (EventCalendar와 EventList가 내부적으로 처리)
          setDragOffset(diffX);
        });
      }
    };

    const handleTouchEnd = () => {
      if (!localIsDragging || !localTouchStart) return;

      if (swipeAnimationRef.current) {
        cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = null;
      }

      localIsDragging = false;

      if (localSwipeDirection === "horizontal") {
        const distance = swipeOffsetRef.current;
        const threshold = minSwipeDistance;

        if (Math.abs(distance) > threshold) {
          setIsAnimating(true);

          const screenWidth = window.innerWidth;
          const direction = distance < 0 ? "next" : "prev";
          const targetOffset = distance < 0 ? -screenWidth : screenWidth;

          setDragOffset(targetOffset);

          // 🎯 월 변경 로직을 setTimeout 내부로 이동하여 최신 currentMonth 사용
          setTimeout(() => {
            setCurrentMonth((prevMonth) => {
              const newMonth = new Date(prevMonth);
              newMonth.setDate(1);
              if (direction === "prev") {
                newMonth.setMonth(prevMonth.getMonth() - 1);
              } else {
                newMonth.setMonth(prevMonth.getMonth() + 1);
              }
              return newMonth;
            });
            setSelectedDate(null);

            swipeOffsetRef.current = 0;
            setDragOffset(0);
            setIsAnimating(false);
          }, 300);
        } else {
          setIsAnimating(true);

          swipeOffsetRef.current = 0;
          setDragOffset(0);

          setTimeout(() => {
            setIsAnimating(false);
          }, 300);
        }
      } else {
        swipeOffsetRef.current = 0;
        setDragOffset(0);
      }

      localTouchStart = null;
      localSwipeDirection = null;
    };

    // passive: false로 등록하여 preventDefault 가능하게
    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);

      if (swipeAnimationRef.current) {
        cancelAnimationFrame(swipeAnimationRef.current);
      }
    };

    // 🎯 dependencies에서 currentMonth 제거 - 함수형 업데이트로 최신 값 사용
  }, [containerRef, isAnimating]);

  // QR 스캔 또는 이벤트 수정으로 접속했는지 동기적으로 확인 (초기 렌더링 시점에 결정)
  const [fromQR] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("from");
    return source === "qr" || source === "edit";
  });

  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  // URL 파라미터 처리 (QR 코드 스캔 또는 이벤트 수정 후 하이라이트)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    const source = params.get("from");

    if ((source === "qr" || source === "edit") && eventId) {
      const id = parseInt(eventId);
      setQrLoading(true);

      // 이벤트 정보 조회 후 달력 이동
      const loadEventAndNavigate = async () => {
        try {
          const { data: event } = await supabase
            .from("events")
            .select("start_date, date")
            .eq("id", id)
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
          console.error("Error loading event for navigation:", error);
          setQrLoading(false);
        }
      };

      loadEventAndNavigate();

      // URL에서 파라미터 제거 (깔끔하게)
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // 검색 취소 시 전체 모드로 리셋
  useEffect(() => {
    if (!searchTerm) {
      // 검색 취소: 전체 모드로 리셋
      navigateWithCategory("all");
    }
  }, [searchTerm, navigateWithCategory]);

  // 날짜 선택 시 이벤트 리스트 스크롤 최상단으로 이동
  useEffect(() => {
    if (selectedDate && !qrLoading) {
      const scrollContainer = document.querySelector(".overflow-y-auto");
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
  }, [selectedDate]);

  // 이벤트 삭제/수정 감지는 EventList 컴포넌트에서 직접 처리

  // 전체 버튼 클릭 시 날짜 선택 해제
  useEffect(() => {
    const handleClearDate = () => {
      setSelectedDate(null);
    };

    window.addEventListener("clearSelectedDate", handleClearDate);

    return () => {
      window.removeEventListener("clearSelectedDate", handleClearDate);
    };
  }, []);

  // 검색 시작 시 호출되는 콜백
  const handleSearchStart = () => {
    // 전체 모드로 전환
    navigateWithCategory("all");
  };

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

    // Throttle: 200ms마다 최대 1회만 실행 (성능 최적화)
    let lastCallTime = 0;
    const throttleDelay = 200;

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastCallTime >= throttleDelay) {
        lastCallTime = now;
        resetInactivityTimer();
      }
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

        // DB 레벨에서 필터링 (성능 최적화)
        let query = supabase
          .from("events")
          .select(
            "id,title,date,start_date,end_date,time,location,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at",
          );

        // 이미지 또는 영상이 있는 것만 조회
        query = query.or("image_full.not.is.null,image.not.is.null,video_url.not.is.null");

        // 날짜 범위 필터
        if (settings.dateRangeStart) {
          query = query.gte("start_date", settings.dateRangeStart);
        }
        if (settings.dateRangeEnd) {
          query = query.lte("start_date", settings.dateRangeEnd);
        }

        query = query.order("date", { ascending: true });

        const { data: events } = await query;

        if (events && events.length > 0) {
          // JavaScript에서 요일/ID 제외만 처리
          const filteredEvents = events.filter((event) => {
            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) {
              return false;
            }

            // 특정 이벤트 제외
            if (
              settings.excludedEventIds &&
              settings.excludedEventIds.includes(event.id)
            ) {
              return false;
            }

            // 요일 제외
            if (
              settings.excludedWeekdays &&
              settings.excludedWeekdays.length > 0
            ) {
              const eventDate = new Date(event.start_date || event.date);
              const dayOfWeek = eventDate.getDay();
              if (settings.excludedWeekdays.includes(dayOfWeek)) {
                return false;
              }
            }

            return true;
          });

          // 이미지 또는 영상 URL 추출 (인덱스 일치 보장)
          const imagesOrVideos = filteredEvents.map(
            (event) => event?.video_url || event?.image_full || event?.image,
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
  }, [
    settings.enabled,
    settings.autoOpenOnLoad,
    settings.dateRangeStart,
    settings.dateRangeEnd,
    settings.excludedWeekdays,
    settings.excludedEventIds,
    fromQR,
  ]);

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

  const handleDateSelect = (date: Date | null, hasEvents?: boolean) => {
    setSelectedDate(date);

    // 이벤트가 있는 날짜만 전체 리스트로 변경 (해당 날짜 이벤트는 상단에 정렬됨)
    if (date && hasEvents) {
      navigateWithCategory("all");
    }
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);

    // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
    setSelectedDate(null);

    // 년 모드가 아닐 때만 카테고리 변경 (년 모드에서는 뷰 유지)
    if (viewMode === "month") {
      navigateWithCategory("all");
    }
  };

  // 수평 스와이프 임계값
  const minSwipeDistance = 30;

  const handleEventsUpdate = async (createdDate?: Date) => {
    // 이벤트 등록 후 날짜가 전달되었을 때, 그 날짜를 선택 (handleDateSelect가 자동으로 카테고리 감지)
    if (createdDate) {
      await handleDateSelect(createdDate);
    }
  };

  const handleAdminModeToggle = (
    _adminMode: boolean,
    type: "super" | "sub" | null = null,
    userId: string | null = null,
    userName: string = "",
  ) => {
    // AuthContext에서 관리하므로 isAdminMode state는 제거
    // 빌보드 사용자 정보만 저장
    setAdminType(type);
    setBillboardUserId(userId);
    setBillboardUserName(userName);
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

  const handleViewModeChange = (mode: "month" | "year") => {
    if (mode === "year") {
      setSavedMonth(new Date(currentMonth));
    } else if (mode === "month" && savedMonth) {
      setCurrentMonth(new Date(savedMonth));
    }

    setViewMode(mode);

    // 뷰 모드 변경 시 이벤트 리스트 표시
    navigateWithCategory("all");
  };
  // 1. 달력 접기/펴기 버튼의 배경색/텍스트를 조건부로 설정하는 상수
  const buttonBgClass =
    calendarMode === "collapsed"
      ? "bg-blue-600 hover:bg-blue-700 text-white" // 달력 접힘 상태일 때 (이벤트 등록 버튼) -> 파란색 배경
      : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"; // 달력 펼침/전체화면 상태일 때 (달력 접기 버튼) -> 어두운 배경

  // 2. 화살표 아이콘 및 색상 설정
  const arrowIconContent =
    calendarMode === "collapsed" ? (
      // 달력 접힘 (true): 펼치라는 의미의 '위쪽' 화살표 + 파란색 배경 대비를 위한 흰색 텍스트
      <i className="ri-arrow-up-s-line text-sm leading-none align-middle text-white font-bold"></i>
    ) : (
      // 달력 펼침 (false): 접으라는 의미의 '아래쪽' 화살표 + 어두운 배경 대비를 위한 파란색 텍스트
      <i className="ri-arrow-down-s-line text-sm leading-none align-middle text-blue-400 font-bold"></i>
    );

  // 🎯 효과적인 달력 높이 계산 헬퍼
  const getEffectiveCalendarHeight = () => {
    const fullscreenHeight =
      typeof window !== "undefined" ? window.innerHeight - 150 : 700;

    if (isDraggingCalendar && liveCalendarHeight > 0) {
      // 드래그 중이면 훅에서 전달받은 실시간 높이
      return liveCalendarHeight;
    }

    // 드래그 중이 아니면 모드 기반 고정 높이
    if (calendarMode === "collapsed") return 0;
    if (calendarMode === "fullscreen") return fullscreenHeight;
    return 250; // expanded
  };

  // 실시간 달력 높이 계산 (숫자) - EventCalendar prop용
  const getCalendarHeightPx = () => {
    return getEffectiveCalendarHeight();
  };

  // 실시간 달력 높이 계산 (문자열)
  const getCalendarDragHeight = () => {
    return `${getCalendarHeightPx()}px`;
  };

  // 등록 버튼 클릭 이벤트 리스너
  useEffect(() => {
    const handleCreateEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      
      // 등록 배너에서 온 경우: detail에 달 정보가 있음
      if (customEvent.detail?.source === 'banner' && customEvent.detail?.monthIso) {
        const firstDayOfMonth = new Date(customEvent.detail.monthIso);
        setSelectedDate(firstDayOfMonth);
        setFromBanner(true);
        
        // 해당 달의 첫날과 마지막날 계산
        const year = firstDayOfMonth.getFullYear();
        const month = firstDayOfMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const formatDate = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };
        
        setBannerMonthBounds({
          min: formatDate(firstDay),
          max: formatDate(lastDay)
        });
      } else {
        // 하단 메뉴 버튼에서 온 경우: selectedDate가 없으면 오늘 날짜로 등록
        if (!selectedDate) {
          setSelectedDate(new Date());
        }
        setFromBanner(false);
        setBannerMonthBounds(null);
      }
      
      setShowRegistrationModal(true);
    };

    window.addEventListener(
      "createEventForDate",
      handleCreateEvent as EventListener,
    );

    return () => {
      window.removeEventListener(
        "createEventForDate",
        handleCreateEvent as EventListener,
      );
    };
  }, [selectedDate]);

  // selectedDate 변경 시 CustomEvent로 알림 (MobileShell에서 사용)
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("selectedDateChanged", {
        detail: selectedDate,
      }),
    );
  }, [selectedDate]);

  // 네이티브 DOM 이벤트 리스너 등록 (passive: false 필수)

  return (
    <div
      ref={containerRef}
      className="h-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--page-bg-color)",
        touchAction: "none", // PointerCancel 방지 - 모든 제스처를 JS로 제어
      }}
    >
      {/* Fixed Header for all screens */}
      <div
        ref={headerRef}
        className="flex-shrink-0 w-full z-30 border-b border-[#22262a]"
        style={{ 
          backgroundColor: "var(--header-bg-color)",
          touchAction: "auto",
          pointerEvents: "auto"
        }}
      >
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(direction) => {
            if (isAnimating) return;

            setIsAnimating(true);

            const screenWidth = window.innerWidth;
            const targetOffset =
              direction === "prev" ? screenWidth : -screenWidth;
            setDragOffset(targetOffset);

            // 날짜 오버플로뚰 방지 (10월 31일 → 11월 문제 해결)
            const newMonth = new Date(currentMonth);
            newMonth.setDate(1); // 먼저 1일로 설정하여 오버플로우 방지
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
              navigateWithCategory("all");
            }, 300);
          }}
          onDateChange={(newMonth) => {
            setCurrentMonth(newMonth);
            // 날짜 변경 시 날짜 리셋하고 이벤트 리스트 표시
            setSelectedDate(null);
            navigateWithCategory("all");
          }}
          onResetToToday={() => {
            // 이번달로 이동
            const today = new Date();
            setCurrentMonth(today);
            // 날짜 선택 해제
            setSelectedDate(null);
            // 전체 모드로 전환
            navigateWithCategory("all");
            // 랜덤 버튼 깜빡임 (랜덤 정렬일 때만)
            if (sortBy === "random") {
              setIsRandomBlinking(true);
              setTimeout(() => setIsRandomBlinking(false), 500);
            }
          }}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
          onBillboardSettingsOpen={handleBillboardSettingsOpen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          billboardEnabled={settings.enabled}
        />
      </div>

      {/* Mobile Layout - Sticky Calendar, Scrollable Events */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 서브 관리자도 일반 사용자처럼 달력/이벤트 표시 */}
        {/* Calendar Section - Fixed (헤더 아래 고정) */}
        <div
          ref={calendarRef}
          className="w-full"
          style={{
            backgroundColor: "var(--calendar-bg-color)",
            touchAction: "none",
            // 🎯 드래그 중 실시간 position 적용
            position: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? "fixed"
                : "relative";
            })(),
            // top은 헤더 높이만큼!
            top: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? `${headerHeight}px`
                : undefined;
            })(),
            left: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? "0"
                : undefined;
            })(),
            right: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? "0"
                : undefined;
            })(),
            // bottom은 설정 안 함! (달력이 자연스럽게 높이만큼만 차지)
            zIndex: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? 50
                : 15;
            })(),
            flexShrink: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? undefined
                : 0;
            })(),
          }}
        >
          {/* Calendar - Collapsible */}
          <div
            ref={(el) => {
              calendarContentRef.current = el;
              calendarElementRef.current = el;
            }}
            className="overflow-hidden"
            style={{
              height:
                isDraggingCalendar ||
                calendarMode === "collapsed" ||
                calendarMode === "fullscreen"
                  ? getCalendarDragHeight()
                  : "auto",
              maxHeight:
                calendarMode === "expanded" && !isDraggingCalendar
                  ? "500px"
                  : undefined,
              contain: "layout style paint",
              transform: "translateZ(0)",
              willChange: isDraggingCalendar ? "height" : undefined, // GPU 가속
            }}
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              isAdminMode={isAdmin}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              hoveredEventId={hoveredEventId}
              dragOffset={dragOffset}
              isAnimating={isAnimating}
              calendarHeightPx={getCalendarHeightPx()}
            />
          </div>

          {/* Tools Panel - 달력 바로 아래 (같은 sticky 컨테이너 내) */}
          <div
            className="w-full border-b border-[#22262a]"
            style={{
              backgroundColor: "var(--calendar-bg-color)",
              touchAction: "none",
            }}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              {/* 달력 접기/펴기 토글 버튼 */}
              <button
                onClick={() => {
                  // 3단계 순환: collapsed → expanded → collapsed
                  setCalendarMode((prev) => {
                    const nextMode =
                      prev === "collapsed"
                        ? "expanded"
                        : prev === "fullscreen"
                          ? "expanded"
                          : "collapsed";

                    return nextMode;
                  });
                }}
                // 중복된 배경색 클래스를 제거하고 buttonBgClass만 적용하여
                // '이벤트 등록' 상태(달력 접힘)일 때 파란색 배경이 적용되도록 합니다.
                className={`flex items-center justify-center gap-1 h-6 px-2
                         ${buttonBgClass}
                         rounded-lg transition-colors cursor-pointer flex-shrink-0`}
                aria-label={
                  calendarMode === "collapsed" ? "달력 펴기" : "달력 접기:"
                }
              >
                <i
                  className={`${calendarMode === "collapsed" ? "ri-calendar-line" : "ri-calendar-close-line"} text-sm leading-none align-middle`}
                ></i>

                <span className="text-xs leading-none align-middle whitespace-nowrap">
                  {calendarMode === "collapsed"
                    ? "이벤트 등록달력"
                    : calendarMode === "fullscreen"
                      ? "달력 접기"
                      : "달력 접기"}
                </span>

                {/* 화살표 아이콘 (상단에 정의된 arrowIconContent 사용) */}
                {arrowIconContent}
              </button>

              <div className="flex-1"></div>

              {/* 정렬 버튼 */}
              <button
                onClick={() => setShowSortModal(true)}
                className={`flex items-center justify-center h-6 gap-1 px-2
                         rounded-lg transition-colors cursor-pointer flex-shrink-0 ${
                           sortBy === "random" && isRandomBlinking
                             ? "bg-blue-500 text-white animate-pulse"
                             : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"
                         }`}
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
        </div>

        {/* Scrollable Content Area - Events and Footer (독립 스크롤) */}
        <div
          ref={eventListElementRef}
          className="flex-1 w-full bg-[#1f1f1f] overflow-y-auto pb-20"
          style={{
            // 달력이 fixed일 때 이벤트 리스트 위치 유지
            // 중요: 250px로 완전 고정! (fullscreen이든 뭐든 250px 유지)
            marginTop: (() => {
              const threshold = Math.min(
                250,
                (typeof window !== "undefined"
                  ? window.innerHeight - 150
                  : 700) / 2,
              );
              return calendarMode === "fullscreen" ||
                (isDraggingCalendar && getEffectiveCalendarHeight() > threshold)
                ? "250px" // 무조건 250px 고정!
                : undefined;
            })(),
            // 실제 모바일: pull-to-refresh 차단
            overscrollBehavior: "none",
          }}
        >
          {/* 이벤트 등록 안내 */}
          <div className="p-0 bg-[#222] rounded-none no-select">
            <p className="text-gray-300 text-[13px] text-center no-select">
              <i className="ri-information-line mr-1"></i>
              날짜를 클릭하면 이벤트를 등록할 수 있습니다
            </p>
          </div>

          {qrLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">이벤트 로딩 중...</div>
            </div>
          ) : (
            <EventList
              selectedDate={selectedDate}
              selectedCategory={selectedCategory}
              currentMonth={currentMonth}
              isAdminMode={isAdmin}
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
              slideContainerRef={eventListSlideContainerRef}
              onMonthChange={(date) => setCurrentMonth(date)}
            />
          )}

          {/* Footer - 고정 */}
          <Footer />
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
              window.dispatchEvent(new CustomEvent("reopenAdminSettings"));
            }, 100);
          }
        }}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        adminType={billboardUserId ? "sub" : isAdmin ? "super" : null}
        billboardUserId={billboardUserId}
        billboardUserName={billboardUserName}
      />

      {/* Event Registration Modal */}
      {showRegistrationModal && selectedDate && (
        <EventRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => {
            setShowRegistrationModal(false);
            // 배너에서 열었던 경우 selectedDate도 리셋
            if (fromBanner) {
              setSelectedDate(null);
            }
            setFromBanner(false);
            setBannerMonthBounds(null);
          }}
          selectedDate={selectedDate}
          onMonthChange={(date) => {
            setCurrentMonth(date);
          }}
          onEventCreated={(createdDate, eventId) => {
            setShowRegistrationModal(false);
            setFromBanner(false);
            setBannerMonthBounds(null);
            
            // 등록된 달로 이동
            setCurrentMonth(createdDate);
            
            // 등록된 이벤트 하이라이트
            if (eventId) {
              setTimeout(() => {
                setHighlightEvent({
                  id: eventId,
                  nonce: Date.now(),
                });
              }, 300);
            }
          }}
          fromBanner={fromBanner}
          bannerMonthBounds={bannerMonthBounds ?? undefined}
        />
      )}
    </div>
  );
}
