import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import { supabase } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";
import { useAuth } from "../../contexts/AuthContext";

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
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
  const [calendarPullStart, setCalendarPullStart] = useState<number | null>(
    null,
  );
  const [calendarPullDistance, setCalendarPullDistance] = useState(0);
  const [isDraggingCalendar, setIsDraggingCalendar] = useState(false);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  const [lastTouchY, setLastTouchY] = useState<number | null>(null);
  const [lastTouchTime, setLastTouchTime] = useState<number | null>(null);
  const calendarContentRef = useRef<HTMLDivElement>(null);

  // 스크롤 기반 달력 확장용 상태
  const scrollAccumulatorRef = useRef<number>(0);
  const isScrollExpandingRef = useRef<boolean>(false);

  // Transform 기반 최적화용 ref
  const dragAnimationRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  // 공통 스와이프 상태 (달력과 이벤트 리스트 동기화)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<
    "horizontal" | "vertical" | null
  >(null);

  // 스와이프 최적화용 ref
  const swipeAnimationRef = useRef<number | null>(null);
  const calendarElementRef = useRef<HTMLDivElement | null>(null);
  const eventListElementRef = useRef<HTMLDivElement | null>(null);
  const swipeOffsetRef = useRef<number>(0); // 실제 드래그 offset (리렌더링 없음)

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
      if (dragAnimationRef.current) {
        cancelAnimationFrame(dragAnimationRef.current);
      }
    };
  }, []);

  // 헤더 높이 측정
  useEffect(() => {
    if (headerRef.current) {
      const height = headerRef.current.offsetHeight;
      setHeaderHeight(height);
      console.log("📏 헤더 높이 측정:", height);
    }
  }, []);

  // 스크롤 기반 달력 확장 로직 (scroll 이벤트 사용)
  useEffect(() => {
    console.log(
      "🔧 useEffect 실행 - eventListElementRef:",
      eventListElementRef.current,
    );
    const eventListElement = eventListElementRef.current;
    if (!eventListElement) {
      console.log("❌ eventListElement가 null입니다!");
      return;
    }

    console.log("✅ scroll 이벤트 리스너 등록 완료!");

    let lastScrollTop = 0;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartHeight = 0;
    let lastTouchDeltaY = 0; // 마지막 터치 이동 방향 저장
    let isTouchOnCalendar = false;
    let isTouching = false;
    let isHorizontalScroll = false;

    const handleScroll = () => {
      const scrollTop = eventListElement.scrollTop;
      const isAtTop = scrollTop <= 0;
      const scrollDelta = lastScrollTop - scrollTop; // 양수 = 위로, 음수 = 아래로
      const isScrollingUp = scrollDelta > 0;
      const fullscreenHeight = window.innerHeight - 150;

      console.log(
        `🔍 scroll: scrollTop=${scrollTop.toFixed(1)}, delta=${scrollDelta.toFixed(1)}, isAtTop=${isAtTop}, isScrollingUp=${isScrollingUp}, calendarMode=${calendarMode}`,
      );

      lastScrollTop = scrollTop;

      // 리스트가 최상단일 때만 처리
      if (!isAtTop) return;

      console.log("✅ 최상단 도달!");
    };

    const handleTouchStart = (e: TouchEvent) => {
      const scrollTop = eventListElement.scrollTop;
      const isAtTop = scrollTop <= 0;

      // 최상단이 아니면 일반 스크롤
      if (!isAtTop) {
        isTouching = false;
        return;
      }

      const currentCalendarHeight =
        calendarContentRef.current?.offsetHeight || 0;
      const calendarBottomY = headerHeight + currentCalendarHeight; // 헤더 + 달력 높이

      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartHeight = currentCalendarHeight; // 시작 높이 저장!

      // 터치 위치가 달력 영역 내부인지 확인
      isTouchOnCalendar = touchStartY <= calendarBottomY;

      isTouching = true;
      isHorizontalScroll = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching) return;

      const scrollTop = eventListElement.scrollTop;
      const isAtTop = scrollTop <= 0;
      const touchCurrentY = e.touches[0].clientY;
      const touchCurrentX = e.touches[0].clientX;
      const touchDeltaY = touchCurrentY - touchStartY;
      const touchDeltaX = touchCurrentX - touchStartX;
      const isPullingDown = touchDeltaY > 0;
      const fullscreenHeight = window.innerHeight - 150;

      // 수평/수직 스크롤 감지 (첫 움직임 기준)
      if (
        !isHorizontalScroll &&
        (Math.abs(touchDeltaX) > 5 || Math.abs(touchDeltaY) > 5)
      ) {
        isHorizontalScroll = Math.abs(touchDeltaX) > Math.abs(touchDeltaY);
      }

      // 수평 스크롤이면 달력 반응 안 함
      if (isHorizontalScroll) {
        return;
      }

      // 터치 방향 저장
      lastTouchDeltaY = touchDeltaY;

      // 리스트가 최상단이고 아래로 당김 → 달력 확장
      if (isAtTop && isPullingDown && calendarMode !== "fullscreen") {
        e.preventDefault();
        isScrollExpandingRef.current = true;

        let targetHeight = touchStartHeight + touchDeltaY * 1.2;
        const scale = Math.min(1, 0.6 + (targetHeight / 150) * 0.4);

        requestAnimationFrame(() => {
          targetHeight = Math.max(0, Math.min(targetHeight, fullscreenHeight));

          if (calendarContentRef.current) {
            calendarContentRef.current.style.setProperty(
              "height",
              `${targetHeight}px`,
            );
            calendarContentRef.current.style.setProperty("transition", "none");
            calendarContentRef.current.style.setProperty(
              "transform",
              `scale(${scale})`,
            );
            calendarContentRef.current.style.setProperty(
              "transform-origin",
              "top center",
            );
          }
        });
      }

      // 달력이 확장 중이고 위로 밀기 → 달력 축소 (달력 영역에서 시작한 경우만!)
      if (
        isAtTop &&
        !isPullingDown &&
        calendarMode !== "collapsed" &&
        isTouchOnCalendar
      ) {
        e.preventDefault();

        let targetHeight = touchStartHeight + touchDeltaY * 1.2;
        const scale = Math.min(1, 0.6 + (targetHeight / 150) * 0.4);

        requestAnimationFrame(() => {
          targetHeight = Math.max(0, targetHeight);

          if (calendarContentRef.current) {
            calendarContentRef.current.style.setProperty(
              "height",
              `${targetHeight}px`,
            );
            calendarContentRef.current.style.setProperty("transition", "none");
            calendarContentRef.current.style.setProperty(
              "transform",
              `scale(${scale})`,
            );
            calendarContentRef.current.style.setProperty(
              "transform-origin",
              "top center",
            );
          }
        });
      }
    };

    const handleTouchEnd = () => {
      if (!isTouching) return;

      isTouching = false;

      const currentHeight = calendarContentRef.current?.offsetHeight || 0;
      const fullscreenHeight = window.innerHeight - 150;
      const isPullingDown = lastTouchDeltaY > 0;

      console.log("🔴 touchEnd:", {
        calendarMode,
        currentHeight: currentHeight.toFixed(0),
        fullscreenHeight: fullscreenHeight.toFixed(0),
        isPullingDown,
        lastTouchDeltaY: lastTouchDeltaY.toFixed(0),
        threshold: (fullscreenHeight - 15).toFixed(0),
      });

      // 방향 기반 양방향 자석 스냅
      let finalHeight = 0;
      let targetMode: "collapsed" | "expanded" | "fullscreen" = "collapsed";

      if (calendarMode === "collapsed") {
        // collapsed에서 시작 → 아주 조금만 내려도 expanded로 (15px)
        if (isPullingDown && currentHeight > 15) {
          finalHeight = 250;
          targetMode = "expanded";
        } else {
          finalHeight = 0;
          targetMode = "collapsed";
          isScrollExpandingRef.current = false;
        }
      } else if (calendarMode === "expanded") {
        // expanded에서 시작
        if (isPullingDown) {
          // 아래로 당김 → 조금만 움직여도 fullscreen으로 (30px)
          if (currentHeight > 280) {
            finalHeight = fullscreenHeight;
            targetMode = "fullscreen";
          } else {
            finalHeight = 250;
            targetMode = "expanded";
          }
        } else {
          // 위로 밀기 → 조금만 움직여도 collapsed로 (30px)
          if (currentHeight < 220) {
            finalHeight = 0;
            targetMode = "collapsed";
            isScrollExpandingRef.current = false;
          } else {
            finalHeight = 250;
            targetMode = "expanded";
          }
        }
      } else {
        // fullscreen에서 시작 → 아주 조금만 올려도 expanded로 (60px threshold)
        if (!isPullingDown && currentHeight < fullscreenHeight - 60) {
          console.log("✅ fullscreen → expanded 스냅!");
          finalHeight = 250;
          targetMode = "expanded";
        } else {
          console.log(
            "❌ fullscreen 유지:",
            currentHeight,
            ">=",
            fullscreenHeight - 60,
          );
          finalHeight = fullscreenHeight;
          targetMode = "fullscreen";
        }
      }

      console.log("🧲 최종 스냅:", finalHeight, targetMode);

      // 스냅 애니메이션
      if (calendarContentRef.current) {
        calendarContentRef.current.style.setProperty(
          "height",
          `${finalHeight}px`,
        );
        calendarContentRef.current.style.setProperty(
          "transition",
          "height 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        );
        calendarContentRef.current.style.setProperty("transform", "scale(1)");
      }

      if (targetMode !== calendarMode) {
        setCalendarMode(targetMode);
      }

      touchStartY = 0;
      touchStartX = 0;
      touchStartHeight = 0;
      lastTouchDeltaY = 0;
      isTouchOnCalendar = false;
      isHorizontalScroll = false;
    };

    eventListElement.addEventListener("scroll", handleScroll, {
      passive: true,
    });
    eventListElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    eventListElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    eventListElement.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });

    return () => {
      eventListElement.removeEventListener("scroll", handleScroll);
      eventListElement.removeEventListener("touchstart", handleTouchStart);
      eventListElement.removeEventListener("touchmove", handleTouchMove);
      eventListElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, [calendarMode]);

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

  // 이벤트 삭제/수정 시 빌보드 재로딩
  useEffect(() => {
    const handleEventUpdate = () => {
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("eventDeleted", handleEventUpdate);

    return () => {
      window.removeEventListener("eventDeleted", handleEventUpdate);
    };
  }, []);

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
          .select(
            "id,title,date,start_date,end_date,time,location,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at",
          )
          .order("date", { ascending: true });

        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            // 이미지 또는 영상이 있는지 확인
            if (!event?.image_full && !event?.image && !event?.video_url) {
              return false;
            }

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

            // 날짜 범위 필터 적용 (시작 날짜만 체크)
            if (settings.dateRangeStart || settings.dateRangeEnd) {
              const eventStartDate = event.start_date || event.date;

              if (
                settings.dateRangeStart &&
                eventStartDate < settings.dateRangeStart
              ) {
                return false;
              }

              if (
                settings.dateRangeEnd &&
                eventStartDate > settings.dateRangeEnd
              ) {
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
    refreshTrigger,
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
    console.log(">>> handleMonthChange 시작 <<<");
    console.log("받은 month:", month);
    console.log("month.toISOString():", month.toISOString());
    console.log("현재 viewMode:", viewMode);
    console.log("현재 currentMonth:", currentMonth);

    setCurrentMonth(month);
    console.log("setCurrentMonth 완료");

    // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
    setSelectedDate(null);
    console.log("setSelectedDate(null) 완료");

    // 년 모드가 아닐 때만 카테고리 변경 (년 모드에서는 뷰 유지)
    if (viewMode === "month") {
      console.log("월 모드 - navigateWithCategory 호출");
      navigateWithCategory("all");
    } else {
      console.log("년 모드 - navigateWithCategory 생략");
    }
    console.log(">>> handleMonthChange 완료 <<<");
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
          setSwipeDirection("vertical");
        }
        // X축 이동이 Y축보다 1.5배 이상 크면 수평 슬라이드
        else if (absX > absY * 1.5) {
          setSwipeDirection("horizontal");
        }
      }
    }

    // 수평 슬라이드로 결정되었을 때만 dragOffset 업데이트
    if (swipeDirection === "horizontal") {
      // passive event listener 에러 방지
      if (e.cancelable) {
        e.preventDefault();
      }

      // requestAnimationFrame으로 60fps 보장
      if (swipeAnimationRef.current) {
        cancelAnimationFrame(swipeAnimationRef.current);
      }

      swipeAnimationRef.current = requestAnimationFrame(() => {
        // ref에 저장 (리렌더링 없음!)
        swipeOffsetRef.current = diffX;

        // DOM 직접 조작 (GPU 가속)
        if (calendarElementRef.current) {
          calendarElementRef.current.style.transform = `translateX(${diffX}px) translateZ(0)`;
        }
        if (eventListElementRef.current) {
          eventListElementRef.current.style.transform = `translateX(${diffX}px) translateZ(0)`;
        }
      });
    } else if (swipeDirection === "vertical") {
      // 수직 스크롤은 기본 동작 허용 (dragOffset 업데이트 안 함)
      return;
    }
  };

  const onTouchEnd = () => {
    if (!isDragging || touchStart === null) return;

    // animation cleanup
    if (swipeAnimationRef.current) {
      cancelAnimationFrame(swipeAnimationRef.current);
      swipeAnimationRef.current = null;
    }

    setIsDragging(false);

    // 수평 슬라이드로 인식된 경우만 월 변경
    if (swipeDirection === "horizontal") {
      const distance = swipeOffsetRef.current; // ref 사용!
      const threshold = minSwipeDistance;

      if (Math.abs(distance) > threshold) {
        setIsAnimating(true);

        const screenWidth = window.innerWidth;
        const direction = distance < 0 ? "next" : "prev";
        const targetOffset = distance < 0 ? -screenWidth : screenWidth;

        // 스냅 애니메이션 (CSS transition 사용)
        if (calendarElementRef.current) {
          calendarElementRef.current.style.transition =
            "transform 0.3s ease-out";
          calendarElementRef.current.style.transform = `translateX(${targetOffset}px) translateZ(0)`;
        }
        if (eventListElementRef.current) {
          eventListElementRef.current.style.transition =
            "transform 0.3s ease-out";
          eventListElementRef.current.style.transform = `translateX(${targetOffset}px) translateZ(0)`;
        }

        setDragOffset(targetOffset);

        // 월 변경 계산 (날짜 오버플로우 방지 - 10월 31일 → 11월 문제 해결)
        const newMonth = new Date(currentMonth);
        newMonth.setDate(1); // 먼저 1일로 설정하여 오버플로우 방지
        if (direction === "prev") {
          newMonth.setMonth(currentMonth.getMonth() - 1);
        } else {
          newMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // 애니메이션 종료 후 월 변경 및 상태 리셋
        setTimeout(() => {
          setCurrentMonth(newMonth);
          setSelectedDate(null);

          // 리셋
          swipeOffsetRef.current = 0;
          if (calendarElementRef.current) {
            calendarElementRef.current.style.transition = "none";
            calendarElementRef.current.style.transform = "translateZ(0)";
          }
          if (eventListElementRef.current) {
            eventListElementRef.current.style.transition = "none";
            eventListElementRef.current.style.transform = "translateZ(0)";
          }

          setDragOffset(0);
          setIsAnimating(false);
          setTouchStart(null);
          setSwipeDirection(null);
        }, 300);
      } else {
        // 스와이프 거리가 부족하면 원위치로 애니메이션
        setIsAnimating(true);

        // 원위치 애니메이션
        if (calendarElementRef.current) {
          calendarElementRef.current.style.transition =
            "transform 0.3s ease-out";
          calendarElementRef.current.style.transform = "translateZ(0)";
        }
        if (eventListElementRef.current) {
          eventListElementRef.current.style.transition =
            "transform 0.3s ease-out";
          eventListElementRef.current.style.transform = "translateZ(0)";
        }

        swipeOffsetRef.current = 0;
        setDragOffset(0);

        setTimeout(() => {
          // transition 리셋 (다음 제스처를 위해 필수!)
          if (calendarElementRef.current) {
            calendarElementRef.current.style.transition = "none";
          }
          if (eventListElementRef.current) {
            eventListElementRef.current.style.transition = "none";
          }

          setIsAnimating(false);
          setTouchStart(null);
          setSwipeDirection(null);
        }, 300);
      }
    } else {
      // 수직 스크롤이거나 방향 미결정인 경우 상태만 리셋
      swipeOffsetRef.current = 0;
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
    console.log("@@@ handleViewModeChange 시작 @@@");
    console.log("이전 모드:", viewMode);
    console.log("새 모드:", mode);

    if (mode === "year") {
      console.log("년 모드로 전환 - 현재 월 저장");
      setSavedMonth(new Date(currentMonth));
    } else if (mode === "month" && savedMonth) {
      console.log("월 모드로 복귀 - 저장된 월 복원");
      setCurrentMonth(new Date(savedMonth));
    }

    setViewMode(mode);
    console.log("setViewMode 완료");

    // 뷰 모드 변경 시 이벤트 리스트 표시
    navigateWithCategory("all");
    console.log("@@@ handleViewModeChange 완료 @@@");
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

  // 실시간 달력 높이 계산 (숫자)
  const getCalendarHeightPx = () => {
    // 헤더(60px) + 바텀메뉴(70px) + 여유(20px) = 150px
    const fullscreenHeight =
      typeof window !== "undefined" ? window.innerHeight - 150 : 700;

    if (!isDraggingCalendar) {
      // 드래그 중이 아니면 고정 상태
      if (calendarMode === "collapsed") return 0;
      if (calendarMode === "fullscreen") return fullscreenHeight;
      return 250; // expanded
    }

    // 드래그 중: 시작 시점의 고정된 높이 + 드래그 거리
    let currentHeight = dragStartHeight + calendarPullDistance;

    // 0 이상, fullscreen 높이 이하로 제한
    currentHeight = Math.max(0, Math.min(currentHeight, fullscreenHeight));

    return currentHeight;
  };

  // 실시간 달력 높이 계산 (문자열)
  const getCalendarDragHeight = () => {
    return `${getCalendarHeightPx()}px`;
  };

  // 네이티브 DOM 이벤트 리스너 등록 (passive: false 필수)
  useEffect(() => {
    const calendarElement = calendarRef.current;
    if (!calendarElement) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.stopPropagation();
      const touch = e.touches[0];
      const target = e.target as HTMLElement;

      // 버튼 클릭과 충돌 방지
      const isButton = target.closest("button");

      const currentActualHeight = calendarContentRef.current?.offsetHeight || 0;
      const fullscreenHeight = window.innerHeight - 150;

      // 로그 제거 (성능 향상)

      // 버튼 터치면 드래그 방지
      if (isButton) {
        console.log("🚫 버튼 터치 - 드래그 비활성화");
        return;
      }

      setCalendarPullStart(touch.clientY);
      setCalendarPullDistance(0);
      setDragStartHeight(currentActualHeight); // 시작 높이 저장!
      setIsDraggingCalendar(true);
      setLastTouchY(touch.clientY);
      setLastTouchTime(Date.now());
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (calendarPullStart === null) return;

      e.stopPropagation();
      e.preventDefault();

      const touch = e.touches[0];
      const distance = touch.clientY - calendarPullStart;

      // requestAnimationFrame으로 60fps 보장
      if (dragAnimationRef.current) {
        cancelAnimationFrame(dragAnimationRef.current);
      }

      dragAnimationRef.current = requestAnimationFrame(() => {
        const fullscreenHeight = window.innerHeight - 150;
        let targetHeight = dragStartHeight + distance;
        targetHeight = Math.max(0, Math.min(targetHeight, fullscreenHeight));

        const expandedThreshold = Math.min(250, fullscreenHeight / 2);
        const bottomMagneticZone = 10; // 자석 구역 축소 (조금만 움직여도 스냅!)
        const fullscreenZoneStart = fullscreenHeight - bottomMagneticZone;

        const expandedMagneticZone = 10;
        const expandedLowerBound = expandedThreshold - expandedMagneticZone;
        const expandedUpperBound = expandedThreshold + expandedMagneticZone;

        let zone = "";
        if (targetHeight < 30) zone = "🔵 collapsed 자석";
        else if (targetHeight < expandedLowerBound) zone = "→ collapsed로 스냅";
        else if (targetHeight <= expandedUpperBound) zone = "🟢 expanded 유지";
        else if (targetHeight < fullscreenZoneStart)
          zone = "→ fullscreen으로 스냅";
        else zone = "🔴 fullscreen 자석";

        console.log(
          `📊 [${targetHeight.toFixed(0)}px] ${zone} | 🔵0~30 🟢${expandedLowerBound}~${expandedUpperBound} 🔴${fullscreenZoneStart}~${fullscreenHeight}`,
        );

        // DOM 직접 조작 (리렌더링 없음!)
        if (calendarContentRef.current) {
          calendarContentRef.current.style.height = `${targetHeight}px`;
        }

        // 최종 스냅을 위해 state는 유지
        setCalendarPullDistance(distance);
        setLastTouchY(touch.clientY);
        setLastTouchTime(Date.now());
      });
    };

    const handleTouchEnd = () => {
      if (calendarPullStart === null) {
        console.log("⚠️ TOUCH END: no start point");
        setIsDraggingCalendar(false);
        return;
      }

      const fullscreenHeight = window.innerHeight - 150;

      // 실제 최종 높이 계산 (시작높이 + 드래그 거리)
      let finalHeight = dragStartHeight + calendarPullDistance;
      finalHeight = Math.max(0, Math.min(finalHeight, fullscreenHeight));

      // 3단계 타겟 높이 (고정)
      const targets = {
        collapsed: 0,
        expanded: Math.min(250, fullscreenHeight / 2), // 중간 또는 250px
        fullscreen: fullscreenHeight,
      };

      // 🎯 Hysteresis 기반 상태 전환 로직 (현재 상태에 따라 다른 임계값!)
      let nextState: "collapsed" | "expanded" | "fullscreen";

      // 현재 상태가 collapsed일 때
      if (calendarMode === "collapsed") {
        if (finalHeight <= 35) {
          nextState = "collapsed"; // 0~35px: collapsed 유지
        } else if (finalHeight <= 230) {
          nextState = "expanded"; // 36~230px: expanded 진입! (조금만 내려도!)
        } else if (finalHeight <= 265) {
          nextState = "expanded"; // 231~265px: expanded 구간
        } else {
          nextState = "fullscreen"; // 265px 넘으면: 중간을 통과! → fullscreen!
        }
      }
      // 현재 상태가 expanded일 때
      else if (calendarMode === "expanded") {
        if (finalHeight <= 230) {
          nextState = "collapsed"; // 0~230px: collapsed로 탈출! (조금만 올려도!)
        } else if (finalHeight <= 265) {
          nextState = "expanded"; // 231~265px: expanded 유지 (좁은 구간!)
        } else if (finalHeight <= 405) {
          nextState = "fullscreen"; // 266~405px: fullscreen으로 탈출! (조금만 내려도!)
        } else {
          nextState = "fullscreen"; // 406px~: fullscreen
        }
      }
      // 현재 상태가 fullscreen일 때
      else {
        const threshold = fullscreenHeight - 50; // 50px만 움직여도 스냅!

        if (finalHeight <= 230) {
          nextState = "collapsed"; // 0~230px: collapsed
        } else if (finalHeight < threshold) {
          nextState = "expanded"; // 231~(fullscreen-50)px: expanded 진입! (조금만 올려도!)
        } else {
          nextState = "fullscreen"; // (fullscreen-50)px~: fullscreen 유지
        }
      }

      console.log(
        `🎯 [${finalHeight.toFixed(0)}px] ${calendarMode} → ${nextState}`,
      );

      setCalendarMode(nextState);
      setCalendarPullStart(null);
      setCalendarPullDistance(0);
      setDragStartHeight(0);
      setIsDraggingCalendar(false);
    };

    // passive: false로 등록 (preventDefault 가능하도록)
    calendarElement.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    calendarElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    calendarElement.addEventListener("touchend", handleTouchEnd);

    return () => {
      calendarElement.removeEventListener("touchstart", handleTouchStart);
      calendarElement.removeEventListener("touchmove", handleTouchMove);
      calendarElement.removeEventListener("touchend", handleTouchEnd);

      // cleanup
      if (dragAnimationRef.current) {
        cancelAnimationFrame(dragAnimationRef.current);
      }
    };
  }, [
    calendarMode,
    calendarPullStart,
    isDraggingCalendar,
    calendarPullDistance,
    dragStartHeight,
  ]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--page-bg-color)" }}
    >
      {/* Fixed Header for all screens */}
      <div
        ref={headerRef}
        className="flex-shrink-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
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

            // 날짜 오버플로우 방지 (10월 31일 → 11월 문제 해결)
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
            // 강제 리프레시 (랜덤 정렬 재실행)
            setRefreshTrigger((prev) => prev + 1);
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
            // 드래그 중 실시간 position 적용
            position:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? "fixed"
                : "relative",
            // top은 헤더 높이만큼!
            top:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? `${headerHeight}px`
                : undefined,
            left:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? "0"
                : undefined,
            right:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? "0"
                : undefined,
            // bottom은 설정 안 함! (달력이 자연스럽게 높이만큼만 차지)
            zIndex:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? 50
                : 15,
            flexShrink:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? undefined
                : 0,
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
              transition: isDraggingCalendar
                ? "none"
                : "height 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
              contain: "layout style paint",
              transform: "translateZ(0)", // ref로 제어
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
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
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

                    console.log("🔘 버튼 클릭:", {
                      이전모드: prev,
                      다음모드: nextMode,
                      현재높이: calendarContentRef.current?.offsetHeight || 0,
                    });

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
                    ? "이벤트 등록"
                    : calendarMode === "fullscreen"
                      ? "전체화면"
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
            marginTop:
              calendarMode === "fullscreen" ||
              (isDraggingCalendar &&
                dragStartHeight + calendarPullDistance >
                  Math.min(
                    250,
                    (typeof window !== "undefined"
                      ? window.innerHeight - 150
                      : 700) / 2,
                  ))
                ? "250px" // 무조건 250px 고정!
                : undefined,
          }}
        >
          {/* 이벤트 등록 안내 */}
          <div className="p-0 bg-[#222] rounded-none no-select">
            <p className="text-gray-300 text-[13px] text-center no-select">
              <i className="ri-information-line mr-1"></i>
              날짜를 두번 클릭하면 이벤트를 등록할 수 있습니다
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
              refreshTrigger={refreshTrigger}
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
    </div>
  );
}
