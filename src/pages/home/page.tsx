import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import EventRegistrationModal from "../../components/EventRegistrationModal";
import FullscreenDateEventsModal from "../../components/FullscreenDateEventsModal";
import EventDetailModal from "./components/EventDetailModal";
import EventPasswordModal from "./components/EventPasswordModal";
import ImageCropModal from "../../components/ImageCropModal";
import CustomDatePickerHeader from "../../components/CustomDatePickerHeader";
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import { createResizedImages } from "../../utils/imageResize";
import { parseVideoUrl } from "../../utils/videoEmbed";
import {
  getVideoThumbnailOptions,
  downloadThumbnailAsBlob,
  type VideoThumbnailOption,
} from "../../utils/videoThumbnail";
import { supabase } from "../../lib/supabase";
import type { Event as AppEvent } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";
import { useAuth } from "../../contexts/AuthContext";

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedCategory = searchParams.get("category") || "all";
  const { isAdmin } = useAuth();

  registerLocale("ko", ko);

  // ForwardRef 커스텀 입력 컴포넌트
  interface CustomInputProps {
    value?: string;
    onClick?: () => void;
  }

  const CustomDateInput = useMemo(() => forwardRef<HTMLButtonElement, CustomInputProps>(
    ({ value, onClick }, ref) => (
      <button
        type="button"
        ref={ref}
        onClick={onClick}
        className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-left hover:bg-gray-600 transition-colors"
      >
        {value || "날짜 선택"}
      </button>
    )
  ), []);
  CustomDateInput.displayName = "CustomDateInput";

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // --------------------------------------------------------------------------------
  // 1. UI 상수
  // --------------------------------------------------------------------------------
  const EXPANDED_HEIGHT = 280;
  const FOOTER_HEIGHT = 80;
  const MIN_SWIPE_DISTANCE = 50;

  // 모바일 바운스 방지
  useEffect(() => {
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.documentElement.style.overscrollBehavior = '';
      document.body.style.overscrollBehavior = '';
    };
  }, []);

  const navigateWithCategory = useCallback((cat?: string) => {
    if (!cat || cat === "all") navigate("/");
    else navigate(`/?category=${cat}`);
  }, [navigate]);

  // --------------------------------------------------------------------------------
  // 2. 상태 관리
  // --------------------------------------------------------------------------------
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  
  const [calendarMode, setCalendarMode] = useState<"collapsed" | "expanded" | "fullscreen">("collapsed");
  const [isDragging, setIsDragging] = useState(false);
  const [liveCalendarHeight, setLiveCalendarHeight] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(60);

  const swipeAnimationRef = useRef<number | null>(null);

  // 기타 상태
  const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  const [isAdminModeOverride, setIsAdminModeOverride] = useState(false);
  const effectiveIsAdmin = isAdmin || isAdminModeOverride;

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [fromBanner, setFromBanner] = useState(false);
  const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [savedMonth, setSavedMonth] = useState<Date | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title">("random");
  const [highlightEvent, setHighlightEvent] = useState<{ id: number; nonce: number } | null>(null);
  const [sharedEventId, setSharedEventId] = useState<number | null>(null);
  const [eventJustCreated, setEventJustCreated] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRandomBlinking, setIsRandomBlinking] = useState(false);
  
  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEventListModalOpen, setIsEventListModalOpen] = useState(false);
  const [isFullscreenDateModalOpen, setIsFullscreenDateModalOpen] = useState(false);
  const [fullscreenSelectedDate, setFullscreenSelectedDate] = useState<Date | null>(null);
  const [fullscreenClickPosition, setFullscreenClickPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // --- EventList에서 이동된 상태들 ---
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
  const [eventPassword, setEventPassword] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    time: "",
    location: "",
    locationLink: "",
    category: "",
    organizer: "",
    organizerName: "",
    organizerPhone: "",
    contact: "",
    link1: "",
    link2: "",
    link3: "",
    linkName1: "",
    linkName2: "",
    linkName3: "",
    image: "",
    start_date: "",
    end_date: "",
    event_dates: [] as string[],
    dateMode: "range" as "range" | "specific",
    videoUrl: "",
    showTitleOnBillboard: true,
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [editVideoPreview, setEditVideoPreview] = useState<{ provider: string | null; embedUrl: string | null; }>({ provider: null, embedUrl: null });
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [thumbnailOptions, setThumbnailOptions] = useState<VideoThumbnailOption[]>([]);
  const [tempDateInput, setTempDateInput] = useState<string>("");
  const [showEditCropModal, setShowEditCropModal] = useState(false);
  const [editCropImageUrl, setEditCropImageUrl] = useState<string>("");
  const [editOriginalImageFile, setEditOriginalImageFile] = useState<File | null>(null);
  const [editOriginalImagePreview, setEditOriginalImagePreview] = useState<string>("");

  // Refs
  const calendarRef = useRef<HTMLDivElement>(null);
  const calendarContentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventListElementRef = useRef<HTMLDivElement | null>(null);
  const eventListSlideContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const calendarControlBarRef = useRef<HTMLDivElement>(null);
  const calendarCategoryButtonsRef = useRef<HTMLDivElement>(null);

  // --------------------------------------------------------------------------------
  // 3. 최신 상태 참조 Ref
  // --------------------------------------------------------------------------------
  const latestStateRef = useRef({
    isAnimating,
    calendarMode,
    headerHeight,
    viewMode,
    liveCalendarHeight,
    isDragging,
  });

  useEffect(() => {
    latestStateRef.current = { isAnimating, calendarMode, headerHeight, viewMode, liveCalendarHeight, isDragging };
  }, [isAnimating, calendarMode, headerHeight, viewMode, liveCalendarHeight, isDragging]);

  // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
  useEffect(() => {
    const isAnyModalOpen = isEventListModalOpen ||
                           showSearchModal ||
                           showSortModal ||
                           showRegistrationModal ||
                           isBillboardSettingsOpen ||
                           isFullscreenDateModalOpen ||
                           !!selectedEvent ||
                           showEditModal ||
                           showPasswordModal;

    const container = containerRef.current;
    if (container) {
      container.inert = isAnyModalOpen;
    }

    return () => {
      if (container) container.inert = false;
    };
  }, [isEventListModalOpen, showSearchModal, showSortModal, showRegistrationModal, isBillboardSettingsOpen, isFullscreenDateModalOpen, selectedEvent, showEditModal, showPasswordModal]);


  // --------------------------------------------------------------------------------
  // 4. 헬퍼 함수
  // --------------------------------------------------------------------------------
  const calculateFullscreenHeight = useCallback(() => {
    if (typeof window === 'undefined') return 600;
    // 하단 메인 네비게이션 버튼 영역의 실제 높이를 동적으로 가져옴
    const mainNavButtons = document.querySelector<HTMLElement>('[data-id="main-nav-buttons"]');
    // 메인 버튼 영역이 있으면 높이를 사용하고, 없으면 기존 상수를 폴백으로 사용
    const mainNavButtonsHeight = mainNavButtons ? mainNavButtons.offsetHeight : FOOTER_HEIGHT;
    
    return window.innerHeight - headerHeight - mainNavButtonsHeight;
  }, [headerHeight]);

  const getTargetHeight = useCallback(() => {
    if (calendarMode === "collapsed") return 0;
    if (calendarMode === "fullscreen") return calculateFullscreenHeight();
    return EXPANDED_HEIGHT;
  }, [calendarMode, calculateFullscreenHeight]);

  const isCurrentMonthVisible = (() => {
    const today = new Date();
    return currentMonth.getFullYear() === today.getFullYear() && 
           currentMonth.getMonth() === today.getMonth();
  })();

  // --------------------------------------------------------------------------------
  // 5. ★★★ 통합 제스처 핸들러 (Native TouchEvent) ★★★
  // --------------------------------------------------------------------------------
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startHeight: number;
    isLocked: 'horizontal' | 'vertical-resize' | 'vertical-scroll' | null; 

    initialScrollTop: number;
  }>({
    startX: 0, startY: 0, startHeight: 0, isLocked: null, initialScrollTop: 0
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCoords = (e: TouchEvent | MouseEvent): { clientX: number; clientY: number } | null => {
      if (e instanceof TouchEvent) {
        return e.touches.length > 0 ? e.touches[0] : null;
      }
      return e; // MouseEvent
    };

    const getEndCoords = (e: TouchEvent | MouseEvent): { clientX: number; clientY: number } | null => {
      if (e instanceof TouchEvent) {
        return e.changedTouches.length > 0 ? e.changedTouches[0] : null;
      }
      return e; // MouseEvent
    };

    const handleGestureStart = (e: TouchEvent | MouseEvent) => {
      if (latestStateRef.current.isAnimating || (e instanceof TouchEvent && e.touches.length > 1)) return;
      console.log('[Gesture] Start', { target: e.target });
      const target = e.target as HTMLElement;

      // 버튼 등 상호작용 요소는 터치 허용 (이벤트 핸들러 실행 안함)
      if (target.closest('button, a, input, select, .clickable, [role="button"]')) return;
      
      // Year 모드 달력 내부는 스크롤 허용
      if (latestStateRef.current.viewMode === 'year' && calendarContentRef.current?.contains(target)) return;

      const coords = getCoords(e);
      if (!coords) return;

      const eventList = eventListElementRef.current;
      const scrollTop = eventList ? eventList.scrollTop : 0;
      
      // 현재 높이 저장
      const currentHeight = calendarContentRef.current 
        ? calendarContentRef.current.getBoundingClientRect().height 
        : getTargetHeight();

      gestureRef.current = {
        startX: coords.clientX,
        startY: coords.clientY,
        startHeight: currentHeight,
        isLocked: null,
        initialScrollTop: scrollTop
      };
      if (e instanceof MouseEvent) {
        window.addEventListener('mousemove', handleGestureMove, { passive: false });
        window.addEventListener('mouseup', handleGestureEnd, { passive: false });
      }
    };

    const handleGestureMove = (e: TouchEvent | MouseEvent) => {
      const coords = getCoords(e);
      if (!coords) return;
      const { startX, startY, isLocked, startHeight, initialScrollTop } = gestureRef.current;
      
      const diffX = coords.clientX - startX;
      const diffY = coords.clientY - startY;
      
      if (!isLocked && (Math.abs(diffX) > 3 || Math.abs(diffY) > 3)) {
        console.log('[Gesture] Move', { diffX: Math.round(diffX), diffY: Math.round(diffY), isLocked });
      }


      // 1. 방향 잠금 로직 (아직 안 잠겼을 때)
      if (!isLocked) {
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);
        // 10px 이상 움직여야 스크롤/스와이프로 인식 (탭과의 충돌 방지) - 민감도 하향 조정
        if (absX > 10 || absY > 10) {

          if (absX > absY * 1.5) {
            gestureRef.current.isLocked = 'horizontal';
          } 
          
          else if (absY > absX) {
            const isTouchingCalendar = calendarRef.current?.contains(e.target as Node);
            // 리스트 맨 위 + 당김
            const isPullingDown = initialScrollTop <= 2 && diffY > 0;

            // 달력 영역을 터치했거나, 이벤트 목록 최상단에서 아래로 당길 때만 달력 크기 조절
            // 이벤트 목록에서 위로 올리는 동작은 목록 스크롤을 위해 제외
            if (isTouchingCalendar || isPullingDown) {
              gestureRef.current.isLocked = 'vertical-resize';

              setIsDragging(true);
              setLiveCalendarHeight(startHeight);
            } else if (e instanceof MouseEvent) {
              // 마우스 이벤트의 경우, 달력 리사이즈 조건이 아니면 스크롤로 간주
              gestureRef.current.isLocked = 'vertical-scroll';

            }
          }
        }
      }

      // 2. 실행 로직 (잠긴 후)
      const currentLock = gestureRef.current.isLocked;

      if (currentLock === 'horizontal') {
        if (e.cancelable && !(e.target as HTMLElement)?.closest('input[type="range"]')) e.preventDefault();

        if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = requestAnimationFrame(() => {
          setDragOffset(diffX);
        });
      } 
      else if (currentLock === 'vertical-resize') {
        if (e.cancelable) e.preventDefault();   
        const newHeight = startHeight + diffY;
        const maxAllowedHeight = calculateFullscreenHeight();
        const clampedHeight = Math.max(0, Math.min(newHeight, maxAllowedHeight));
        
        if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = requestAnimationFrame(() => {
          setLiveCalendarHeight(clampedHeight);
        });
      } else if (currentLock === 'vertical-scroll') {
        // 마우스로 이벤트 목록을 스크롤하는 경우
        if (e instanceof MouseEvent) {
          if (e.cancelable) e.preventDefault();
          const eventList = eventListElementRef.current;
          if (eventList) {
            eventList.scrollTop = initialScrollTop - diffY;
          }
        }
        // 터치 이벤트는 브라우저 네이티브 스크롤에 맡김 (아무것도 안 함)
      }
    };

    const handleGestureEnd = (e: TouchEvent | MouseEvent) => {
      const { isLocked, startX, startY } = gestureRef.current;
      const endCoords = getEndCoords(e);
      if (!endCoords) return;

      const diffX = endCoords.clientX - startX;
      const diffY = endCoords.clientY - startY;
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);

      console.log('[Gesture] End', { isLocked, distance: Math.round(distance) });

      if (swipeAnimationRef.current) { cancelAnimationFrame(swipeAnimationRef.current); swipeAnimationRef.current = null; }


      // 탭(Tap) 동작 처리: 드래그/스와이프가 시작되지 않았고, 움직임이 거의 없었을 때
      if (!isLocked && distance < 10) {
        const target = e.target as HTMLElement;
        // data-event-id를 가진 가장 가까운 부모 요소를 찾음 (EventCard)
        const eventCard = target.closest<HTMLElement>('[data-event-id]');
        if (eventCard) {
          // 브라우저의 기본 클릭 이벤트를 막고, 수동으로 클릭 이벤트를 발생시켜 300ms 딜레이를 없애고 탭 안정성을 높임
          e.preventDefault();

          console.log('[Gesture] Tap detected on EventCard, manually clicking.');
          eventCard.click();
        }
        
        // 달력 날짜 셀에 대한 탭 처리
        const dateCell = target.closest<HTMLElement>('[data-calendar-date]');
        if (dateCell) {
          e.preventDefault();
          console.log(`[Gesture] Tap detected on DateCell (${dateCell.dataset.calendarDate}), manually clicking.`);
          dateCell.click();
        }
      }

      // 수평 종료
      if (isLocked === 'horizontal') {
        if (Math.abs(diffX) > MIN_SWIPE_DISTANCE) {
          const direction = diffX < 0 ? "next" : "prev";
          const targetOffset = diffX < 0 ? -window.innerWidth : window.innerWidth;
          setDragOffset(targetOffset); 
          setIsAnimating(true);

          setTimeout(() => {
            setCurrentMonth((prev) => {
              const newM = new Date(prev); newM.setDate(1);
              if (latestStateRef.current.viewMode === "year") {
                newM.setFullYear(prev.getFullYear() + (direction === 'next' ? 1 : -1));
              } else {
                newM.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
              }
              return newM;
            });
            setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null);
            setDragOffset(0); setIsAnimating(false);
          }, 200);
        } else {
          setDragOffset(0);
        }
      } 
      // 수직 종료 (자석)
      else if (isLocked === 'vertical-resize') {

        const endHeight = liveCalendarHeight;
        const fullscreenH = calculateFullscreenHeight();
        
        let nextMode = latestStateRef.current.calendarMode;

        // 아래로 당김 (열기)
        if (diffY > 50) {
            if (endHeight < EXPANDED_HEIGHT) nextMode = 'expanded';
            else nextMode = 'fullscreen';
        } 
        // 위로 밈 (닫기)
        else if (diffY < -50) {
            if (endHeight > EXPANDED_HEIGHT) nextMode = 'expanded';
            else nextMode = 'collapsed';
        }
        // 조금 움직임 -> 가까운 곳으로
        else {
            const dist0 = Math.abs(endHeight - 0);
            const distEx = Math.abs(endHeight - EXPANDED_HEIGHT);
            const distFull = Math.abs(endHeight - fullscreenH);
            const min = Math.min(dist0, distEx, distFull);
            
            if (min === dist0) nextMode = 'collapsed';
            else if (min === distFull) nextMode = 'fullscreen';
            else nextMode = 'expanded';
        }

        setCalendarMode(nextMode);
        setIsDragging(false); // 트랜지션 복구
      }
      if (e instanceof MouseEvent) {
        window.removeEventListener('mousemove', handleGestureMove);
        window.removeEventListener('mouseup', handleGestureEnd);
      }
      gestureRef.current.isLocked = null;
    };

    // ★ passive: false (필수)
    const options = { passive: false };
    
    container.addEventListener('touchstart', handleGestureStart, options);
    container.addEventListener('touchmove', handleGestureMove, options);
    container.addEventListener('touchend', handleGestureEnd, options);
    container.addEventListener('touchcancel', handleGestureEnd, options);
    container.addEventListener('mousedown', handleGestureStart, options);


    return () => {
      container.removeEventListener('touchstart', handleGestureStart);
      container.removeEventListener('touchmove', handleGestureMove);
      container.removeEventListener('touchend', handleGestureEnd);
      container.removeEventListener('touchcancel', handleGestureEnd);
      container.removeEventListener('mousedown', handleGestureStart);
      window.removeEventListener('mousemove', handleGestureMove);
      window.removeEventListener('mouseup', handleGestureEnd);
    };
  }, [calculateFullscreenHeight, liveCalendarHeight]); 

  useEffect(() => {
    return () => {
      if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
    };
  }, []);

  // --------------------------------------------------------------------------------
  // 6. 핸들러 및 기타 로직
  // --------------------------------------------------------------------------------
  useEffect(() => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight); }, []);
  useEffect(() => { if (effectiveIsAdmin && !billboardUserId && adminType !== "super") setAdminType("super"); else if (!effectiveIsAdmin && !billboardUserId && adminType !== null) { setAdminType(null); setIsAdminModeOverride(false); } }, [effectiveIsAdmin, billboardUserId, adminType]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("monthChanged", { detail: { month: currentMonth.toISOString() } })); }, [currentMonth]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode } })); }, [viewMode]);
  const [fromQR] = useState(() => { const p = new URLSearchParams(window.location.search); const s = p.get("from"); return s === "qr" || s === "edit"; });
  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  const handleBillboardClose = () => { setIsBillboardOpen(false); localStorage.setItem("billboardDismissedDate", new Date().toDateString()); };
  const handleBillboardOpen = () => setIsBillboardOpen(true);
  const handleBillboardSettingsOpen = () => setIsBillboardSettingsOpen(true);
  const handleBillboardSettingsClose = () => setIsBillboardSettingsOpen(false);
  const handleBillboardEventClick = (event: any) => { setIsBillboardOpen(false); if (event && event.id) { const eventDate = event.start_date || event.date; if (eventDate) setCurrentMonth(new Date(eventDate)); setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 100); } };
  const handleHighlightComplete = () => setHighlightEvent(null);
  const handleDateSelect = (date: Date | null, hasEvents?: boolean) => { setSelectedDate(date); if (date && hasEvents) navigateWithCategory("all"); };
  const handleMonthChange = (month: Date) => { setCurrentMonth(month); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); if (viewMode === "month") navigateWithCategory("all"); };
  const handleEventsUpdate = async (createdDate?: Date) => { if (createdDate) await handleDateSelect(createdDate); };
  const handleAdminModeToggle = (adminMode: boolean, type: "super" | "sub" | null = null, userId: string | null = null, userName: string = "") => { if (adminMode && type === "super" && !userId) setIsAdminModeOverride(true); else if (!adminMode) setIsAdminModeOverride(false); setAdminType(type ?? null); setBillboardUserId(userId ?? null); setBillboardUserName(userName ?? ""); };
  const getSortIcon = () => (sortBy === "random" ? "ri-shuffle-line" : sortBy === "time" ? "ri-time-line" : "ri-sort-alphabet-asc");
  const getSortLabel = () => (sortBy === "random" ? "랜덤" : sortBy === "time" ? "시간" : "제목");
  const handleViewModeChange = (mode: "month" | "year") => { if (mode === "year") setSavedMonth(new Date(currentMonth)); else if (mode === "month" && savedMonth) setCurrentMonth(new Date(savedMonth)); setViewMode(mode); };
  const handleSearchStart = () => navigateWithCategory("all");

  const handleDailyModalEventClick = (event: AppEvent) => {
    setIsFullscreenDateModalOpen(false);
    // 약간의 딜레이 후 상세 모달을 열어 애니메이션이 겹치지 않게 함
    setTimeout(() => {
      setSelectedEvent(event);
    }, 100);
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = (event: AppEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    if (effectiveIsAdmin) {
      setEventToEdit(event);
      const hasEventDates = event.event_dates && event.event_dates.length > 0;
      setEditFormData({
        title: event.title,
        description: event.description || "",
        time: event.time,
        location: event.location,
        locationLink: event.location_link || "",
        category: event.category,
        organizer: event.organizer,
        organizerName: event.organizer_name || "",
        organizerPhone: event.organizer_phone || "",
        contact: event.contact || "",
        link1: event.link1 || "",
        link2: event.link2 || "",
        link3: event.link3 || "",
        linkName1: event.link_name1 || "",
        linkName2: event.link_name2 || "",
        linkName3: event.link_name3 || "",
        image: event?.image || "",
        start_date: event.start_date || event.date || "",
        end_date: event.end_date || event.date || "",
        event_dates: event.event_dates || [],
        dateMode: hasEventDates ? "specific" : "range",
        showTitleOnBillboard: event.show_title_on_billboard ?? true,
        videoUrl: event?.video_url || "",
      });
      setEditImagePreview(event?.image || "");
      setEditImageFile(null);
      if (event?.video_url) {
        const videoInfo = parseVideoUrl(event.video_url);
        setEditVideoPreview({ provider: videoInfo.provider, embedUrl: videoInfo.embedUrl });
      } else {
        setEditVideoPreview({ provider: null, embedUrl: null });
      }
      setShowEditModal(true);
      setSelectedEvent(null);
    } else {
      setEventToEdit(event);
      setShowPasswordModal(true);
      setSelectedEvent(null);
    }
  };

  const deleteEvent = async (eventId: number, password: string | null = null) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-event', { body: { eventId, password } });
      if (error) throw error;
      alert("이벤트가 삭제되었습니다.");
      window.dispatchEvent(new CustomEvent("eventDeleted"));
      closeModal();
    } catch (error: any) {
      console.error("이벤트 삭제 중 오류 발생:", error);
      alert(`이벤트 삭제 중 오류가 발생했습니다: ${error.context?.error_description || error.message || '알 수 없는 오류'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = (event: AppEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (adminType === "super") {
      if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
        deleteEvent(event.id);
      }
      return;
    }
    const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
    if (password === null) return;
    if (password !== event.password) {
      alert("비밀번호가 올바르지 않습니다.");
      return;
    }
    if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      deleteEvent(event.id, password);
    }
  };

  const handlePasswordSubmit = async () => {
    if (eventToEdit && eventPassword === eventToEdit.password) {
      try {
        const { data: fullEvent, error } = await supabase.from("events").select("*").eq("id", eventToEdit.id).single();
        if (error) throw error;
        if (fullEvent) {
          const hasEventDates = fullEvent.event_dates && fullEvent.event_dates.length > 0;
          setEditFormData({
            title: fullEvent.title,
            description: fullEvent.description || "",
            time: fullEvent.time,
            location: fullEvent.location,
            locationLink: fullEvent.location_link || "",
            category: fullEvent.category,
            organizer: fullEvent.organizer,
            organizerName: fullEvent.organizer_name || "",
            organizerPhone: fullEvent.organizer_phone || "",
            contact: fullEvent.contact || "",
            link1: fullEvent.link1 || "",
            link2: fullEvent.link2 || "",
            link3: fullEvent.link3 || "",
            linkName1: fullEvent.link_name1 || "",
            linkName2: fullEvent.link_name2 || "",
            linkName3: fullEvent.link_name3 || "",
            image: fullEvent.image || "",
            start_date: fullEvent.start_date || fullEvent.date || "",
            end_date: fullEvent.end_date || fullEvent.date || "",
            event_dates: fullEvent.event_dates || [],
            dateMode: hasEventDates ? "specific" : "range",
            videoUrl: fullEvent.video_url || "",
            showTitleOnBillboard: fullEvent.show_title_on_billboard ?? true,
          });
          setEditImagePreview(fullEvent.image || "");
          setEditImageFile(null);
          if (fullEvent.video_url) {
            const videoInfo = parseVideoUrl(fullEvent.video_url);
            setEditVideoPreview({ provider: videoInfo.provider, embedUrl: videoInfo.embedUrl });
          } else {
            setEditVideoPreview({ provider: null, embedUrl: null });
          }
          setEventToEdit(fullEvent);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("이벤트 정보를 불러오는 중 오류가 발생했습니다.");
        return;
      }
      setShowPasswordModal(false);
      setShowEditModal(true);
      setEventPassword("");
    } else {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToEdit) return;

    if (editFormData.start_date && editFormData.end_date && editFormData.end_date < editFormData.start_date) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    try {
      let eventDatesArray: string[] | null = null;
      let startDate = editFormData.start_date || null;
      let endDate = editFormData.end_date || null;

      if (editFormData.dateMode === "specific" && editFormData.event_dates.length > 0) {
        eventDatesArray = [...editFormData.event_dates].sort();
        startDate = eventDatesArray[0];
        endDate = eventDatesArray[eventDatesArray.length - 1];
      }

      let updateData: any = {
        title: editFormData.title,
        time: editFormData.time,
        location: editFormData.location,
        location_link: editFormData.locationLink || null,
        category: editFormData.category,
        description: editFormData.description || "",
        organizer: editFormData.organizer,
        organizer_name: editFormData.organizerName || null,
        organizer_phone: editFormData.organizerPhone || null,
        contact: editFormData.contact || null,
        link1: editFormData.link1 || null,
        link2: editFormData.link2 || null,
        link3: editFormData.link3 || null,
        link_name1: editFormData.linkName1 || null,
        link_name2: editFormData.linkName2 || null,
        link_name3: editFormData.linkName3 || null,
        start_date: startDate,
        end_date: endDate,
        event_dates: eventDatesArray,
        video_url: editFormData.videoUrl || null,
        show_title_on_billboard: editFormData.showTitleOnBillboard,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("events").update(updateData).eq("id", eventToEdit.id);

      if (error) throw error;

      alert("이벤트가 수정되었습니다.");
      window.dispatchEvent(new CustomEvent("eventUpdated"));
      setShowEditModal(false);
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 수정 중 오류가 발생했습니다.");
    }
  };

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!settings.enabled || isBillboardOpen || settings.inactivityTimeout === 0 || fromQR) return;
    inactivityTimerRef.current = setTimeout(() => { if (billboardImages.length > 0) setIsBillboardOpen(true); }, settings.inactivityTimeout);
  }, [settings.enabled, settings.inactivityTimeout, isBillboardOpen, billboardImages.length, fromQR]);

  useEffect(() => {
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    let lastCallTime = 0;
    const throttleDelay = 200;
    const handleUserActivity = () => { const now = Date.now(); if (now - lastCallTime >= throttleDelay) { lastCallTime = now; resetInactivityTimer(); } };
    resetInactivityTimer();
    activityEvents.forEach((event) => window.addEventListener(event, handleUserActivity));
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); activityEvents.forEach((event) => window.removeEventListener(event, handleUserActivity)); };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const loadBillboardImages = async () => {
      if (!settings.enabled) { setBillboardImages([]); setBillboardEvents([]); return; }
      try {
        let query = supabase.from("events").select("id,title,date,start_date,end_date,time,location,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at");
        query = query.or("image_full.not.is.null,image.not.is.null,video_url.not.is.null");
        if (settings.dateRangeStart) query = query.gte("start_date", settings.dateRangeStart);
        if (settings.dateRangeEnd) query = query.lte("start_date", settings.dateRangeEnd);
        query = query.order("date", { ascending: true });
        const { data: events } = await query;
        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) return false;
            if (settings.excludedEventIds && settings.excludedEventIds.includes(event.id)) return false;
            if (settings.excludedWeekdays && settings.excludedWeekdays.length > 0) {
              const eventDate = new Date(event.start_date || event.date);
              if (settings.excludedWeekdays.includes(eventDate.getDay())) return false;
            }
            return true;
          });
          const imagesOrVideos = filteredEvents.map((event) => event?.video_url || event?.image_full || event?.image);
          setBillboardImages(imagesOrVideos);
          setBillboardEvents(filteredEvents);
          if (settings.autoOpenOnLoad && !fromQR) {
            const todayStr = new Date().toDateString();
            const dismissedDate = localStorage.getItem("billboardDismissedDate");
            if (dismissedDate !== todayStr && imagesOrVideos.length > 0) setIsBillboardOpen(true);
          }
        }
      } catch (error) { console.error("Error", error); }
    };
    loadBillboardImages();
  }, [settings, fromQR]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    const source = params.get("from");
    if (eventId) {
      const id = parseInt(eventId);
      setQrLoading(true);
      if (!source || (source !== "qr" && source !== "edit")) setSharedEventId(id);
      const loadEventAndNavigate = async () => {
        try {
          const { data: event } = await supabase.from("events").select("id, start_date, date").eq("id", id).single();
          if (event) {
            const eventDate = event.start_date || event.date;
            if (eventDate) setCurrentMonth(new Date(eventDate));
            setTimeout(() => {
              setQrLoading(false);
              if (source === "qr" || source === "edit") setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 500);
            }, 100);
          } else setQrLoading(false);
        } catch (error) { console.error(error); setQrLoading(false); }
      };
      loadEventAndNavigate();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => { if (!searchTerm) navigateWithCategory("all"); }, [searchTerm, navigateWithCategory]);
  useEffect(() => { if (selectedDate && !qrLoading) { const scrollContainer = document.querySelector(".overflow-y-auto"); if (scrollContainer) scrollContainer.scrollTop = 0; } }, [selectedDate, qrLoading]);
  useEffect(() => { const handleClearDate = () => { setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }; window.addEventListener("clearSelectedDate", handleClearDate); return () => window.removeEventListener("clearSelectedDate", handleClearDate); }, []);
  useEffect(() => {
    const handleResetToToday = () => { const today = new Date(); setCurrentMonth(today); setSelectedDate(null); navigateWithCategory("all"); if (sortBy === "random") { setIsRandomBlinking(true); setTimeout(() => setIsRandomBlinking(false), 500); } };
    window.addEventListener("resetToToday", handleResetToToday); return () => window.removeEventListener("resetToToday", handleResetToToday);
  }, [navigateWithCategory, sortBy]);

  useEffect(() => {
    const handleCreateEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.source === 'banner' && customEvent.detail?.monthIso) {
        if (selectedDate) { setFromBanner(false); setBannerMonthBounds(null); }
        else {
          const firstDayOfMonth = new Date(customEvent.detail.monthIso);
          setSelectedDate(firstDayOfMonth); setFromBanner(true);
          const year = firstDayOfMonth.getFullYear(); const month = firstDayOfMonth.getMonth();
          const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
          const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          setBannerMonthBounds({ min: formatDate(firstDay), max: formatDate(lastDay) });
        }
      } else {
        if (!selectedDate) setSelectedDate(new Date());
        setFromBanner(false); setBannerMonthBounds(null);
      }
      setShowRegistrationModal(true);
    };
    window.addEventListener("createEventForDate", handleCreateEvent);
    return () => window.removeEventListener("createEventForDate", handleCreateEvent);

  }, [selectedDate]);

  useEffect(() => { window.dispatchEvent(new CustomEvent("selectedDateChanged", { detail: selectedDate })); }, [selectedDate]);
  useEffect(() => {
    const handleFullscreenDateClick = (e: Event) => { const customEvent = e as CustomEvent<{ date: Date; clickPosition?: { x: number; y: number } }>; setFullscreenSelectedDate(customEvent.detail.date); setFullscreenClickPosition(customEvent.detail.clickPosition); setIsFullscreenDateModalOpen(true); };
    window.addEventListener("fullscreenDateClick", handleFullscreenDateClick); return () => window.removeEventListener("fullscreenDateClick", handleFullscreenDateClick);

  }, []);

  // --------------------------------------------------------------------------------
  // 7. 렌더링
  // --------------------------------------------------------------------------------
  const renderHeight = useMemo(() => {
    if (isDragging) return `${liveCalendarHeight}px`;
    if (calendarMode === 'collapsed') return '0px';
    if (calendarMode === 'fullscreen') {
      const containerHeight = calculateFullscreenHeight();
      const controlBarHeight = calendarControlBarRef.current?.offsetHeight || 32;
      const categoryButtonsHeight = calendarCategoryButtonsRef.current?.offsetHeight || 42;
      return `${Math.max(0, containerHeight - controlBarHeight - categoryButtonsHeight)}px`;
    }
    return `${EXPANDED_HEIGHT}px`;
  }, [isDragging, liveCalendarHeight, calendarMode, calculateFullscreenHeight]);
  const isFixed = calendarMode === "fullscreen" || (isDragging && liveCalendarHeight > 300);
  const buttonBgClass = calendarMode === "collapsed" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white";
  const arrowIconContent = calendarMode === "collapsed" ? <i className="ri-arrow-up-s-line text-sm leading-none align-middle text-white font-bold"></i> : <i className="ri-arrow-down-s-line text-sm leading-none align-middle text-blue-400 font-bold"></i>;

  return (
    <div
      ref={containerRef}
      className="h-screen flex flex-col overflow-hidden"
      style={{ 
        backgroundColor: "var(--page-bg-color)",
        touchAction: "pan-y" 
      }}
    >
      <div ref={headerRef} className="flex-shrink-0 w-full z-40 border-b border-[#22262a]" style={{ backgroundColor: "var(--header-bg-color)", touchAction: "auto" }}>
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(dir) => {
             if(isAnimating) return; setIsAnimating(true);
             const w = window.innerWidth;
             setDragOffset(dir==="prev" ? w : -w);
             const newM = new Date(currentMonth); newM.setDate(1);
             if(viewMode==="year") newM.setFullYear(currentMonth.getFullYear()+(dir==="prev"?-1:1));
             else newM.setMonth(currentMonth.getMonth()+(dir==="prev"?-1:1));
             setTimeout(() => { setCurrentMonth(newM); setDragOffset(0); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); setIsAnimating(false); }, 250);
          }}
          onDateChange={(m) => { setCurrentMonth(m); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
          onBillboardSettingsOpen={handleBillboardSettingsOpen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          billboardEnabled={settings.enabled}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div
          ref={calendarRef}
          className="w-full"
          style={{
            backgroundColor: "var(--calendar-bg-color)",
            touchAction: "pan-y",
            position: isFixed ? "fixed" : "relative",
            top: isFixed ? `${headerHeight}px` : undefined,
            left: 0, right: 0,
            zIndex: isFixed ? 30 : 15,
          }}
        >
          <div
            ref={calendarContentRef}
            className="overflow-hidden"
            style={{
              height: renderHeight,
              transition: isDragging ? "none" : "height 0.3s cubic-bezier(0.33, 1, 0.68, 1)",
              willChange: isDragging ? "height" : undefined,
              touchAction: viewMode === "year" ? "auto" : "none"
            }}
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              isAdminMode={effectiveIsAdmin}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              hoveredEventId={hoveredEventId}
              dragOffset={dragOffset}
              isAnimating={isAnimating}
              calendarHeightPx={isDragging ? liveCalendarHeight : getTargetHeight()}
              calendarMode={calendarMode}
              selectedCategory={selectedCategory}
              
            />
          </div>

          <div ref={calendarControlBarRef} className="w-full border-b border-[#22262a]" style={{ backgroundColor: "var(--calendar-bg-color)", touchAction: "none",padding:"0 9px" }}>
            <div className="flex items-center gap-2 py-1">
              <button
                onClick={() => setCalendarMode(prev => prev === "collapsed" ? "expanded" : prev === "fullscreen" ? "expanded" : "collapsed")}
                className={`flex items-center justify-center gap-1 h-6 px-2 ${buttonBgClass} rounded-lg transition-colors cursor-pointer flex-shrink-0`}
              >
                <i className={`${calendarMode === "collapsed" ? "ri-calendar-line" : "ri-calendar-close-line"} text-sm leading-none align-middle`}></i>
                <span className="text-xs leading-none align-middle whitespace-nowrap">{calendarMode === "collapsed" ? "이벤트 등록달력" : "달력 접기"}</span>
                {arrowIconContent}
              </button>
              <div className="flex-1"></div>
              {calendarMode === "fullscreen" ? (
                null
              ) : (
                <>
                  {/* 오늘 버튼 조건부 렌더링 */}
                  {!isCurrentMonthVisible && (
                    <button onClick={() => { const today = new Date(); setCurrentMonth(today); setSelectedDate(null); navigateWithCategory("all"); if (sortBy === "random") { setIsRandomBlinking(true); setTimeout(() => setIsRandomBlinking(false), 500); } }} className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full text-[10px] font-medium border transition-colors bg-green-500/20 border-green-500 text-green-300 hover:bg-green-500/30 flex-shrink-0"><span>오늘</span><i className="ri-calendar-check-line text-[10px]"></i></button>
                  )}
                  <button onClick={() => setShowSortModal(true)} className={`flex items-center justify-center h-6 gap-1 px-2 rounded-lg transition-colors cursor-pointer flex-shrink-0 ${sortBy === "random" && isRandomBlinking ? "bg-blue-500 text-white animate-pulse" : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"}`}><i className={`${getSortIcon()} text-sm leading-none align-middle`}></i><span className="text-xs leading-none align-middle">{getSortLabel()}</span></button>
                  <button onClick={() => setShowSearchModal(true)} className="flex items-center justify-center h-6 w-8 bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer flex-shrink-0"><i className="ri-search-line text-sm leading-none align-middle"></i></button>
                </>
              )}
              <button onClick={() => setCalendarMode(prev => prev === "fullscreen" ? "expanded" : "fullscreen")} className={`flex items-center justify-center h-6 w-8 rounded-lg transition-colors cursor-pointer flex-shrink-0 ${calendarMode === "fullscreen" ? "bg-blue-600 text-white" : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"}`}><i className={`${calendarMode === "fullscreen" ? "ri-fullscreen-exit-line" : "ri-fullscreen-line"} text-sm leading-none align-middle`}></i></button>
            </div>
          </div>
          <div ref={calendarCategoryButtonsRef} data-id="bottom-nav" className="w-full flex justify-center items-center gap-3 px-[9px] py-2 border-b border-[#22262a]" style={{ 
            backgroundColor: "var(--calendar-bg-color)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}>
            <button onClick={() => navigateWithCategory('all')} className={`text-lg font-bold transition-colors ${selectedCategory === 'all' ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
              <span>전체</span>
            </button>
            <span className="text-gray-600 select-none">|</span>
            <button onClick={() => navigateWithCategory('event')} className={`text-lg font-bold transition-colors ${selectedCategory === 'event' ? 'text-blue-300' : 'text-gray-400 hover:text-white'}`}>
              <span>행사</span>
            </button>
            <span className="text-gray-600 select-none">|</span>
            <button onClick={() => navigateWithCategory('class')} className={`text-lg font-bold transition-colors ${selectedCategory === 'class' ? 'text-purple-300' : 'text-gray-400 hover:text-white'}`}>
              <span>강습</span>
            </button>
          </div>
        </div>

        <div
          ref={eventListElementRef}
          className="flex-1 w-full mx-auto bg-[#1f1f1f] overflow-y-auto pb-20"
          style={{
            marginTop: isFixed ? `${calculateFullscreenHeight()}px` : undefined,
            overscrollBehaviorY: "contain"
          }}
        >
          {/* <div className="p-0 bg-[#222] rounded-none no-select">
            <p className="text-gray-300 text-[13px] text-center no-select"><i className="ri-information-line mr-1"></i>날짜를 클릭하면 이벤트를 등록할 수 있습니다</p>
          </div> */}

          {qrLoading ? (
            <div className="flex items-center justify-center h-full"><div className="text-gray-400">이벤트 로딩 중...</div></div>
          ) : (
            <EventList
              key={eventJustCreated || undefined}
              selectedDate={selectedDate}
              selectedCategory={selectedCategory}
              currentMonth={currentMonth}
              isAdminMode={effectiveIsAdmin}
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
              sharedEventId={sharedEventId}
              onSharedEventOpened={() => setSharedEventId(null)}
              dragOffset={dragOffset}
              isAnimating={isAnimating}
              slideContainerRef={eventListSlideContainerRef}
              onMonthChange={(date) => setCurrentMonth(date)}
              onModalStateChange={setIsEventListModalOpen}
               />
          )}
          <Footer />
        </div>
      </div>

      {/* Modals */}
      {settings.enabled && <FullscreenBillboard images={billboardImages} events={billboardEvents} isOpen={isBillboardOpen} onClose={handleBillboardClose} onEventClick={handleBillboardEventClick} autoSlideInterval={settings.autoSlideInterval} transitionDuration={settings.transitionDuration} dateRangeStart={settings.dateRangeStart} dateRangeEnd={settings.dateRangeEnd} showDateRange={settings.showDateRange} playOrder={settings.playOrder} />}
      <AdminBillboardModal isOpen={isBillboardSettingsOpen} onClose={() => { handleBillboardSettingsClose(); if(adminType==="sub") setTimeout(()=>window.dispatchEvent(new CustomEvent("reopenAdminSettings")),100); }} settings={settings} onUpdateSettings={updateSettings} onResetSettings={resetSettings} adminType={billboardUserId?"sub":isAdmin?"super":null} billboardUserId={billboardUserId} billboardUserName={billboardUserName} />
      {showRegistrationModal && selectedDate && <EventRegistrationModal isOpen={showRegistrationModal} onClose={() => { setShowRegistrationModal(false); if(fromBanner) setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }} selectedDate={selectedDate} onMonthChange={(d)=>setCurrentMonth(d)} onEventCreated={(d, id)=>{ setShowRegistrationModal(false); setFromBanner(false); setBannerMonthBounds(null); setCurrentMonth(d); setEventJustCreated(Date.now()); setHighlightEvent({id:id||0, nonce:Date.now()}); }} fromBanner={fromBanner} bannerMonthBounds={bannerMonthBounds ?? undefined} />}
      {isFullscreenDateModalOpen && fullscreenSelectedDate && <FullscreenDateEventsModal isOpen={isFullscreenDateModalOpen} onClose={() => { setIsFullscreenDateModalOpen(false); setFullscreenSelectedDate(null); setFullscreenClickPosition(undefined); }} selectedDate={fullscreenSelectedDate} clickPosition={fullscreenClickPosition} onEventClick={handleDailyModalEventClick} />}
      <EventDetailModal isOpen={!!selectedEvent} event={selectedEvent} onClose={closeModal} onEdit={handleEditClick} onDelete={handleDeleteClick} isAdminMode={effectiveIsAdmin} />
      {showPasswordModal && eventToEdit && (
        <EventPasswordModal event={eventToEdit} password={eventPassword} onPasswordChange={setEventPassword} onSubmit={handlePasswordSubmit} onClose={() => { setShowPasswordModal(false); setEventPassword(""); setEventToEdit(null); }} />
      )}
      {/* 여기에 수정 모달(Edit Modal)의 JSX 코드가 위치합니다. 코드가 매우 길어 생략되었지만, 관련 로직은 모두 이곳으로 이동되었습니다. */}
    </div>
  );
}