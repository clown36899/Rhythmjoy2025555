import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, lazy, Suspense, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import type { Event as BaseEvent } from "../../../lib/supabase";
import { createResizedImages } from "../../../utils/imageResize";
import { getLocalDateString, sortEvents, isEventMatchingFilter } from "../utils/eventListUtils";
interface Event extends BaseEvent {
  storage_path?: string | null;
  genre?: string | null;
}
import { parseVideoUrl, isValidVideoUrl } from "../../../utils/videoEmbed";
import {
  getVideoThumbnail,
  downloadThumbnailAsBlob,
} from "../../../utils/videoThumbnail";
import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail";
import ImageCropModal from "../../../components/ImageCropModal";
import CustomDatePickerHeader from "../../../components/CustomDatePickerHeader";
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import { EventCard } from "./EventCard";
// Modals Lazy Loading
const EventPasswordModal = lazy(() => import("./EventPasswordModal"));
const EventDetailModal = lazy(() => import("./EventDetailModal"));
const EventSearchModal = lazy(() => import("./EventSearchModal"));
const EventSortModal = lazy(() => import("./EventSortModal"));
import Footer from "./Footer";
import EditableEventDetail, { type EditableEventDetailRef } from "../../../components/EditableEventDetail";
import ShoppingBanner from "./ShoppingBanner";
import "../../../styles/components/EventList.css";
import "../../../components/EventRegistrationModal.css";
import "../styles/EventListSections.css";
// Lazy loading으로 성능 최적화
const SocialCalendar = lazy(() => import("../../social/components/SocialCalendar"));
import { useSocialSchedules } from "../../social/hooks/useSocialSchedules";
import { useAuth } from "../../../contexts/AuthContext";
import PracticeRoomBanner from "./PracticeRoomBanner";

registerLocale("ko", ko);

// ForwardRef 커스텀 입력 컴포넌트
interface CustomInputProps {
  value?: string;
  onClick?: () => void;
}

const CustomDateInput = forwardRef<HTMLButtonElement, CustomInputProps>(
  ({ value, onClick }, ref) => (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className="evt-date-input-btn"
    >
      {value || "날짜 선택"}
    </button>
  )
);

CustomDateInput.displayName = "CustomDateInput";

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};




interface EventListProps {
  selectedDate: Date | null;
  currentMonth?: Date;
  isAdminMode?: boolean;
  adminType?: "super" | "sub" | null;
  viewMode?: "month" | "year";
  onEventHover?: (eventId: number | null) => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  onSearchStart?: () => void;
  showSearchModal?: boolean;
  setShowSearchModal?: (show: boolean) => void;
  showSortModal?: boolean;
  setShowSortModal?: (show: boolean) => void;
  sortBy?: "random" | "time" | "title";
  setSortBy?: (sort: "random" | "time" | "title") => void;
  highlightEvent?: { id: number; nonce: number } | null;
  onHighlightComplete?: () => void;
  sharedEventId?: number | null;
  onSharedEventOpened?: () => void;
  dragOffset?: number;
  isAnimating?: boolean;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
  onMonthChange?: (date: Date) => void;
  calendarMode?: "collapsed" | "expanded" | "fullscreen";
  onEventClickInFullscreen?: (event: Event) => void;
  onModalStateChange: (isModalOpen: boolean) => void;
  selectedWeekday?: number | null;
  onFilterDataUpdate?: (data: { categoryCounts: { all: number; event: number; class: number }; genres: string[] }) => void;
  sectionViewMode?: 'preview' | 'viewAll-events' | 'viewAll-classes';
  onSectionViewModeChange?: (mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => void;
}

export default function EventList({
  selectedDate,
  currentMonth,
  isAdminMode = false,
  adminType = null,
  viewMode = "month",
  onEventHover,
  searchTerm: externalSearchTerm,
  setSearchTerm: externalSetSearchTerm,
  onSearchStart,
  showSearchModal: externalShowSearchModal,
  setShowSearchModal: externalSetShowSearchModal,
  showSortModal: externalShowSortModal,
  setShowSortModal: externalSetShowSortModal,
  sortBy: externalSortBy,
  setSortBy: externalSetSortBy,
  highlightEvent,
  onHighlightComplete,
  sharedEventId,
  onSharedEventOpened,

  onMonthChange,
  calendarMode,
  onEventClickInFullscreen,
  onModalStateChange,
  selectedWeekday,
  onFilterDataUpdate,
  sectionViewMode = 'preview',
  onSectionViewModeChange,
}: EventListProps) {
  const { user, signInWithKakao } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category') ?? 'all';
  const selectedGenre = searchParams.get('genre');



  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const setSearchTerm = externalSetSearchTerm ?? setInternalSearchTerm;



  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventPassword, setEventPassword] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);

  // Local state for expanded view filtering
  const [viewCategory, setViewCategory] = useState<'all' | 'event' | 'class'>('all');

  const [internalShowSearchModal, setInternalShowSearchModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // 삭제 로딩 상태
  const [internalSortBy, setInternalSortBy] = useState<
    "random" | "time" | "title"
  >("random");
  const [internalShowSortModal, setInternalShowSortModal] = useState(false);
  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
  const [isGenreInputFocused, setIsGenreInputFocused] = useState(false);
  const [randomizedGenres, setRandomizedGenres] = useState<string[]>([]);
  // sectionViewMode는 이제 props로 받음
  const showSearchModal = externalShowSearchModal ?? internalShowSearchModal;
  const setShowSearchModal =
    externalSetShowSearchModal ?? setInternalShowSearchModal;
  const showSortModal = externalShowSortModal ?? internalShowSortModal;
  const setShowSortModal = externalSetShowSortModal ?? setInternalShowSortModal;
  const sortBy = externalSortBy ?? internalSortBy;
  const setSortBy = externalSetSortBy ?? setInternalSortBy;
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    genre: "",
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
  const [editVideoPreview, setEditVideoPreview] = useState<{
    provider: string | null;
    embedUrl: string | null;
  }>({ provider: null, embedUrl: null });
  const [tempDateInput, setTempDateInput] = useState<string>("");

  const [editOriginalImageFile, setEditOriginalImageFile] = useState<File | null>(null);
  const [editOriginalImagePreview, setEditOriginalImagePreview] = useState<string>(""); // 편집 모달에서 특정 날짜 추가용

  // EditableEventDetail state
  const [isEditingWithDetail, setIsEditingWithDetail] = useState(false);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editEndDate, setEditEndDate] = useState<Date | null>(null);
  const [editEventDates, setEditEventDates] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editLinkName, setEditLinkName] = useState("");
  const [editImagePosition, setEditImagePosition] = useState({ x: 0, y: 0 });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const editDetailRef = useRef<EditableEventDetailRef>(null);
  const [editCropModalOpen, setEditCropModalOpen] = useState(false);
  const [editTempImageSrc, setEditTempImageSrc] = useState<string | null>(null);
  const [editOriginalImageForCrop, setEditOriginalImageForCrop] = useState<File | null>(null);
  const [editOriginalImageUrl, setEditOriginalImageUrl] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editPreviewMode, setEditPreviewMode] = useState<'detail' | 'card' | 'billboard'>('detail');

  const { defaultThumbnailClass, defaultThumbnailEvent } =
    useDefaultThumbnail();


  // 현재 날짜 추적 (자정 지날 때 캐시 무효화를 위해)
  const [currentDay, setCurrentDay] = useState(() => new Date().toDateString());



  // 월별 정렬된 이벤트 캐시 (슬라이드 시 재로드 방지 및 랜덤 순서 유지)
  const sortedEventsCache = useRef<{
    [key: string]: Event[]; // key: "YYYY-MM-category-sortBy"
  }>({});
  // 내부 모달 상태가 변경될 때마다 부모 컴포넌트(HomePage)에 알림
  useEffect(() => {
    const isAnyModalOpen = !!(selectedEvent || showEditModal || showPasswordModal);

    onModalStateChange(isAnyModalOpen);
  }, [selectedEvent, showEditModal, showPasswordModal, onModalStateChange]);
  // 날짜 변경 감지 (자정에만 실행)
  useEffect(() => {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0); // 다음 자정
      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      return setTimeout(() => {
        setCurrentDay(new Date().toDateString());
        // 자정 이후 다음 자정을 위해 재귀적으로 스케줄링
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    const timer = scheduleNextMidnight();
    return () => clearTimeout(timer);
  }, [currentDay]);

  // Listen for edit event from Page.tsx (fullscreen calendar detail modal)
  useEffect(() => {
    const handleEditFromDetail = (e: CustomEvent) => {
      console.log('[EventList] editEventFromDetail event received:', e.detail);
      const event = e.detail;
      if (event) {
        handleEditClick(event);
      }
    };

    window.addEventListener('editEventFromDetail', handleEditFromDetail as EventListener);
    return () => window.removeEventListener('editEventFromDetail', handleEditFromDetail as EventListener);
  }, []);


  // 카테고리, 정렬 기준, 이벤트 배열, 날짜 변경 시 캐시 초기화
  useEffect(() => {
    sortedEventsCache.current = {};
  }, [selectedCategory, sortBy, events, currentDay]);


  // 슬라이드 높이 측정 및 업데이트 (애니메이션과 동시에)
  // ⚠️ 높이 자동 조정 기능 비활성화 - 푸터가 올라오는 문제 해결
  // useEffect(() => {
  //   // 검색/날짜 선택 모드에서는 슬라이드가 아니므로 높이 조정 불필요
  //   if (searchTerm.trim() || selectedDate) {
  //     setSlideContainerHeight(null);
  //     return;
  //   }

  //   // currentMonth가 변경되면 즉시 새 높이 측정 시작 (애니메이션 전에)
  //   if (currentMonthRef.current) {
  //     const measureHeight = () => {
  //       requestAnimationFrame(() => {
  //         if (currentMonthRef.current) {
  //           const height = currentMonthRef.current.offsetHeight;
  //           setSlideContainerHeight(height);
  //         }
  //       });
  //     };

  //     // 애니메이션과 동시에 높이 조정
  //     measureHeight();
  //   }
  // }, [currentMonth, searchTerm, selectedDate]);

  // 로컬 날짜를 YYYY-MM-DD 형식으로 반환하는 헬퍼 함수
  // Moved to utils/eventListUtils.ts
  // const getLocalDateString = ... 

  // Seeded Random 함수
  // Moved to utils/eventListUtils.ts
  // const seededRandom = ...

  // 이벤트 정렬 함수 (targetMonth를 명시적으로 받음)
  // Moved to utils/eventListUtils.ts
  // const sortEvents = ...

  // 검색 관련 핸들러들 제거됨 (EventSearchModal로 이동)


  const handleGenreSuggestionClick = (genre: string) => {
    setEditFormData(prev => ({ ...prev, genre }));
    setGenreSuggestions([]);
  };

  const handleGenreFocus = () => {
    setIsGenreInputFocused(true);
    setGenreSuggestions(allGenres); // 포커스 시 전체 장르 목록 보여주기
  };



  const handleSortChange = (
    newSortBy: "random" | "time" | "title",
  ) => {
    setSortBy(newSortBy);
    setShowSortModal(false);
  };



  const sortedAllGenres = useMemo(() => {
    const genres = new Set<string>();
    events.forEach(event => {
      if (event.genre) {
        genres.add(event.genre);
      }
    });
    return Array.from(genres).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [events]);


  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // 10초 timeout 설정
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("데이터 로딩 시간 초과 (10초)")),
          10000,
        ),
      );

      let data: Event[] | null = null;
      let error: unknown = undefined; // Use unknown instead of any

      const fetchPromise = (async () => {
        // 필요한 컬럼만 선택 (성능 최적화)
        const columns = "id,title,date,start_date,end_date,event_dates,time,location,location_link,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,organizer_name,organizer_phone,contact,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,password,created_at,updated_at,show_title_on_billboard,genre,storage_path,user_id";

        if (isAdminMode) {
          // 관리자 모드: 모든 이벤트 조회 (종료된 이벤트 포함)
          const result = await supabase
            .from("events")
            .select(columns)
            .order("start_date", { ascending: true, nullsFirst: false })
            .order("date", { ascending: true, nullsFirst: false });
          data = result.data;
          error = result.error;
        } else {
          // 일반 사용자: 3개월 전부터 미래 이벤트만 조회 (성능 최적화)
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const cutoffDate = threeMonthsAgo.toISOString().split('T')[0];

          const result = await supabase
            .from("events")
            .select(columns)
            .or(`end_date.gte.${cutoffDate},date.gte.${cutoffDate}`)
            .order("start_date", { ascending: true, nullsFirst: false })
            .order("date", { ascending: true, nullsFirst: false });
          data = result.data;
          error = result.error;
        }
      })();

      await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error("[📋 이벤트 목록] ❌ Supabase 에러:", error);
        setLoadError(`DB 에러: ${(error as any).message || "알 수 없는 오류"}`);
        setEvents([]);
      } else {
        const eventList: Event[] = data || [];

        // Analyze image usage
        setEvents(eventList);
      }
    } catch (error: unknown) {
      console.error("이벤트 상세 로딩 실패:", (error as Error).message);
      setLoadError((error as Error).message || "알 수 없는 오류");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [isAdminMode]);

  // Silent refresh for background updates (no loading spinner)
  const fetchEventsSilently = useCallback(async () => {
    try {
      console.log('[📋 이벤트 목록] 백그라운드 새로고침...');
      // Don't set loading state - update silently

      const columns = "id,title,date,start_date,end_date,event_dates,time,location,location_link,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,organizer_name,organizer_phone,contact,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,password,created_at,updated_at,show_title_on_billboard,genre,storage_path,user_id";

      let data: Event[] | null = null;

      if (isAdminMode) {
        const result = await supabase
          .from("events")
          .select(columns)
          .order("start_date", { ascending: true, nullsFirst: false })
          .order("date", { ascending: true, nullsFirst: false });
        data = result.data;
      } else {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const cutoffDate = threeMonthsAgo.toISOString().split('T')[0];

        const result = await supabase
          .from("events")
          .select(columns)
          .or(`end_date.gte.${cutoffDate},date.gte.${cutoffDate}`)
          .order("start_date", { ascending: true, nullsFirst: false })
          .order("date", { ascending: true, nullsFirst: false });
        data = result.data;
      }

      if (data) {
        setEvents(data);
        console.log('[📋 이벤트 목록] ✅ 백그라운드 새로고침 완료');
      }
    } catch (error: unknown) {
      console.error("백그라운드 새로고침 실패:", (error as Error).message);
      // Don't show error to user for silent updates
    }
  }, [isAdminMode]);

  // Social Schedules Data
  const { events: socialEvents, loading: socialLoading } = useSocialSchedules();

  // 이벤트 데이터 로드
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 이벤트 업데이트/삭제 감지
  useEffect(() => {
    const handleEventUpdate = () => {
      console.log('[📋 이벤트 목록] 이벤트 변경 감지 - 데이터 새로고침');
      fetchEventsSilently(); // Silent refresh - no loading spinner
    };

    window.addEventListener("eventDeleted", handleEventUpdate);
    window.addEventListener("eventUpdated", handleEventUpdate);
    window.addEventListener("eventCreated", handleEventUpdate);

    return () => {
      window.removeEventListener("eventDeleted", handleEventUpdate);
      window.removeEventListener("eventUpdated", handleEventUpdate);
      window.removeEventListener("eventCreated", handleEventUpdate);
    };
  }, [fetchEventsSilently]);

  // 달 변경 및 카테고리 변경 시 스크롤 위치 리셋
  useEffect(() => {
    // 슬라이드 아이템들의 스크롤을 초기화
    const slideItems = document.querySelectorAll(".evt-slide-item");
    slideItems.forEach(item => {
      item.scrollTop = 0;
    });

    // 단일 뷰 스크롤 초기화
    const singleView = document.querySelector(".evt-single-view-scroll");
    if (singleView) {
      singleView.scrollTop = 0;
    }
  }, [currentMonth, selectedCategory]);

  // 댄스빌보드에서 이벤트 선택 이벤트 리스너
  // REMOVED: This was causing duplicate modals to open because Page.tsx also listens to eventSelected
  // The Page.tsx listener handles fullscreen calendar event clicks
  // useEffect(() => {
  //   if (typeof window === "undefined") return;
  //
  //   const handleEventSelected = (e: CustomEvent) => {
  //     if (e.detail) {
  //       setSelectedEvent(e.detail);
  //     }
  //   };
  //
  //   window.addEventListener(
  //     "eventSelected",
  //     handleEventSelected as EventListener,
  //   );
  //
  //   return () => {
  //     window.removeEventListener(
  //       "eventSelected",
  //       handleEventSelected as EventListener,
  //     );
  //   };
  // }, []);


  // props로 전달받은 공유 이벤트 ID로 상세 모달 자동 열기
  useEffect(() => {
    if (sharedEventId && events.length > 0) {
      console.log('[공유 링크] 이벤트 ID:', sharedEventId);
      console.log('[공유 링크] 로드된 이벤트 수:', events.length);

      const event = events.find(e => e.id === sharedEventId);

      console.log('[공유 링크] 찾은 이벤트:', event ? event.title : '없음');

      if (event) {
        // 상세 모달 자동 열기
        console.log('[공유 링크] 상세 모달 열기 시도');
        setTimeout(() => {
          setSelectedEvent(event);
          if (onSharedEventOpened) {
            onSharedEventOpened();
          }
          console.log('[공유 링크] 모달 열림 완료');
        }, 500);
      } else {
        console.log('[공유 링크] 이벤트를 찾지 못함. ID:', sharedEventId);
      }
    }
  }, [sharedEventId, events, onSharedEventOpened]);

  // 빌보드에서 특정 이벤트 하이라이트
  useEffect(() => {
    if (!highlightEvent?.id) return;

    // DOM에 이벤트 카드가 나타날 때까지 기다리는 함수
    const waitForElement = (selector: string): Promise<HTMLElement> => {
      return new Promise((resolve) => {
        // 이미 존재하는지 확인
        const existing = document.querySelector(selector) as HTMLElement;
        if (existing) {
          resolve(existing);
          return;
        }

        // MutationObserver로 DOM 변화 감지
        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector) as HTMLElement;
          if (element) {
            observer.disconnect();
            resolve(element);
          }
        });

        // body 전체를 관찰
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // 최대 5초 타임아웃
        setTimeout(() => {
          observer.disconnect();
        }, 5000);
      });
    };

    let listenerTimer: NodeJS.Timeout;
    let autoTimer: NodeJS.Timeout;

    // 비동기로 이벤트 카드가 나타날 때까지 기다림
    waitForElement(`[data-event-id="${highlightEvent.id}"]`).then(
      (eventElement) => {
        // 스크롤 컨테이너 찾기
        let container: HTMLElement = eventElement.parentElement as HTMLElement;
        while (container && container !== document.body) {
          const style = window.getComputedStyle(container);
          if (
            /(auto|scroll)/.test(style.overflowY) &&
            container.scrollHeight > container.clientHeight
          ) {
            break;
          }
          container = container.parentElement as HTMLElement;
        }

        if (!container || container === document.body) {
          container =
            (document.scrollingElement as HTMLElement) ||
            document.documentElement;
        }

        // 카테고리 패널 찾기
        const categoryPanel = document.querySelector(
          "[data-category-panel]",
        ) as HTMLElement;

        if (!categoryPanel) return;

        // 스크롤 실행
        const containerRect = container.getBoundingClientRect();
        const panelRect = categoryPanel.getBoundingClientRect();
        const elementRect = eventElement.getBoundingClientRect();

        const panelBottomInContainer = panelRect.bottom - containerRect.top;
        const elementTopInContainer = elementRect.top - containerRect.top;

        const targetTop = panelBottomInContainer + 5;
        const scrollDelta = elementTopInContainer - targetTop;

        container.scrollTo({
          top: container.scrollTop + scrollDelta,
          behavior: "smooth",
        });

        // 하이라이트 해제 리스너
        const handleUserInput = () => {
          if (onHighlightComplete) {
            onHighlightComplete();
          }
        };

        const eventTypes = [
          "click",
          "wheel",
          "keydown",
          "touchstart",
          "touchmove",
        ];

        // 600ms 후 리스너 등록
        listenerTimer = setTimeout(() => {
          eventTypes.forEach((event) => {
            window.addEventListener(event, handleUserInput);
          });
        }, 600);

        // 3초 후 자동 해제
        autoTimer = setTimeout(() => {
          if (onHighlightComplete) {
            onHighlightComplete();
          }
        }, 3000);
      },
    );

    return () => {
      clearTimeout(listenerTimer);
      clearTimeout(autoTimer);
      const eventTypes = [
        "click",
        "wheel",
        "keydown",
        "touchstart",
        "touchmove",
      ];
      eventTypes.forEach((event) => {
        window.removeEventListener(event, () => { });
      });
    };
  }, [highlightEvent?.id, highlightEvent?.nonce]);

  // 필터링된 이벤트 (useMemo로 캐싱하여 불필요한 재필터링 방지)
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // 카테고리 필터 (none이면 모두 필터링하여 빈 리스트)
      const matchesCategory =
        selectedCategory === "none"
          ? false
          : selectedCategory === "all" || event.category === selectedCategory;

      // 장르 필터
      const matchesGenre =
        (() => {
          if (!selectedGenre) {
            return true; // 선택된 장르가 없으면 항상 통과 (필터 리셋)
          }
          if (!event.genre) {
            return false; // 이벤트에 장르가 없으면 매칭 실패
          }
          return event.genre.trim().toLowerCase() === selectedGenre.trim().toLowerCase();
        })();

      // 검색어 필터
      const matchesSearch =
        (event.title && event.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.location && event.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.organizer && event.organizer.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.genre && event.genre.toLowerCase().includes(searchTerm.toLowerCase()));

      // 검색어가 있을 때는 3년치 데이터만 필터링 (월 필터 무시)
      if (searchTerm.trim()) {
        const currentYear = new Date().getFullYear();
        const eventDate = event.start_date || event.date;

        if (!eventDate) {
          return false; // 날짜 없는 이벤트 제외
        }

        const eventYear = new Date(eventDate).getFullYear();
        const matchesYearRange =
          eventYear >= currentYear - 1 && eventYear <= currentYear + 1;

        return matchesCategory && matchesGenre && matchesSearch && matchesYearRange;
      }

      // 특정 날짜가 선택된 경우: 해당 날짜 이벤트만 필터링
      if (selectedDate) {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        // event_dates 배열이 있으면 그 중에서 찾기
        if (event.event_dates && event.event_dates.length > 0) {
          const matchesSelectedDate = event.event_dates.includes(selectedDateString);
          return matchesCategory && matchesGenre && matchesSelectedDate;
        }

        // 연속 기간으로 정의된 이벤트
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;

        if (!startDate || !endDate) {
          return false;
        }

        const matchesSelectedDate =
          selectedDateString >= startDate && selectedDateString <= endDate;

        return matchesCategory && matchesGenre && matchesSelectedDate;
      }

      // 요일 필터 (selectedWeekday가 있을 때만 적용)
      const matchesWeekday = (() => {
        if (selectedWeekday === undefined || selectedWeekday === null) return true;
        // console.log(`[Filter] Checking event: ${event.title}, dates: ${event.date || event.start_date}`);

        const startDateStr = event.start_date || event.date;
        const endDateStr = event.end_date || event.date;

        if (!startDateStr) return false;

        // 날짜 파싱 헬퍼 (YYYY-MM-DD 형식일 때만 T12:00:00 추가)
        const parseDateSafe = (dateStr: string) => {
          if (dateStr.length === 10) {
            return new Date(`${dateStr}T12:00:00`);
          }
          return new Date(dateStr);
        };

        // 특정 날짜 배열이 있는 경우
        if (event.event_dates && event.event_dates.length > 0) {
          return event.event_dates.some(d => parseDateSafe(d).getDay() === selectedWeekday);
        }

        // 기간인 경우
        const start = parseDateSafe(startDateStr);
        const end = parseDateSafe(endDateStr || startDateStr);

        // 7일 이상이면 무조건 해당 요일 포함
        const oneDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.round(Math.abs((end.getTime() - start.getTime()) / oneDay));
        if (diffDays >= 6) return true;

        // 기간 순회하며 요일 확인
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === selectedWeekday) {
            console.log(`[Filter] Match found for ${event.title} on ${d.toDateString()}`);
            return true;
          }
        }

        console.log(`[Filter] No match for ${event.title}`);
        return false;
      })();

      // 날짜가 선택되지 않은 경우: 현재 달력 월 기준으로 필터링
      let matchesDate = true;
      const filterMonth = currentMonth;
      if (filterMonth) {
        // 특정 날짜 모드: event_dates 배열이 있으면 우선 사용
        if (event.event_dates && event.event_dates.length > 0) {
          const currentYear = filterMonth.getFullYear();
          const currentMonthNum = filterMonth.getMonth() + 1; // 1~12

          if (viewMode === "year") {
            // 연간 보기: event_dates 중 하나라도 해당 년도에 속하면 표시
            matchesDate = event.event_dates.some((dateStr) => {
              const year = parseInt(dateStr.split("-")[0]);
              return year === currentYear;
            });
          } else {
            // 월간 보기: event_dates 중 하나라도 현재 월에 속하면 표시
            const monthPrefix = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;
            matchesDate = event.event_dates.some((dateStr) =>
              dateStr.startsWith(monthPrefix),
            );
          }
        } else {
          // 연속 기간 모드: 기존 로직
          const startDate = event.start_date || event.date;
          const endDate = event.end_date || event.date;

          // 날짜 정보가 없는 이벤트는 필터링에서 제외
          if (!startDate || !endDate) {
            matchesDate = false;
          } else {
            const eventStartDate = new Date(startDate);
            const eventEndDate = new Date(endDate);

            if (viewMode === "year") {
              // 연간 보기: 해당 년도의 모든 이벤트
              const yearStart = new Date(filterMonth.getFullYear(), 0, 1);
              const yearEnd = new Date(filterMonth.getFullYear(), 11, 31);
              matchesDate =
                eventStartDate <= yearEnd && eventEndDate >= yearStart;
            } else {
              // 월간 보기: 시간대 문제 해결을 위해 날짜 문자열로 비교
              const currentYear = filterMonth.getFullYear();
              const currentMonthNum = filterMonth.getMonth() + 1; // 1~12

              // 월의 첫날과 마지막 날을 문자열로 생성
              const monthStartStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}-01`;
              const monthEndStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}-${new Date(currentYear, currentMonthNum, 0).getDate()}`;

              // 이벤트가 현재 월과 겹치는지 확인 (문자열 비교)
              // 이벤트 시작일 <= 월 마지막 날 AND 이벤트 종료일 >= 월 첫 날
              matchesDate =
                startDate <= monthEndStr && endDate >= monthStartStr;
            }
          }
        }
      }

      return matchesCategory && matchesGenre && matchesSearch && matchesDate && matchesWeekday;
    });
  }, [
    events,
    selectedDate,
    selectedCategory,
    selectedGenre,
    searchTerm,
    currentMonth,
    viewMode,
    selectedWeekday,
  ]);

  // 진행중인 행사 (Future Events - Grid)
  // Category: 'event'
  // Date: From today to future (no limit)
  const futureEvents = useMemo(() => {
    // Use local date string instead of UTC to fix "passed one day" logic
    // const today = new Date().toISOString().split('T')[0]; // UTC (WRONG for local filtering)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    const result = events.filter(event => {
      if (event.category !== 'event') return false;

      const startDate = event.start_date || event.date;
      const endDate = event.end_date || event.date;

      if (!startDate) return false;

      // Event must not have ended yet
      if (endDate && endDate < today) return false;

      return true;
    });

    // 3. Shuffle (Randomize fairness) for Events
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    // 4. 방금 등록된 이벤트(highlightEvent)가 있으면 맨 앞으로 정렬
    if (highlightEvent?.id) {
      result.sort((a, b) => {
        if (a.id === highlightEvent.id) return -1;
        if (b.id === highlightEvent.id) return 1;
        return 0;
      });
    }

    return result;
  }, [events, highlightEvent]);

  // 진행중인 강습 (Future Classes - Horizontal Scroll)
  // Category: 'class'
  // Date: From today to future (no limit)
  // Genre Filter Applied
  const futureClasses = useMemo(() => {
    // const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    const result = events.filter(event => {
      if (event.category !== 'class') return false;

      const startDate = event.start_date || event.date;
      const endDate = event.end_date || event.date;

      if (!startDate) return false;

      // Class must not have ended yet
      if (endDate && endDate < today) return false;

      // Genre Filter
      if (selectedGenre && event.genre !== selectedGenre) return false;

      return true;
    });

    // 3. Shuffle (Randomize fairness) for Classes
    // "처음 새로고침했을때 랜덤으로 배치"
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    // 4. 방금 등록된 이벤트(highlightEvent)가 있으면 맨 앞으로 정렬 (Override random)
    if (highlightEvent?.id) {
      result.sort((a, b) => {
        if (a.id === highlightEvent.id) return -1;
        if (b.id === highlightEvent.id) return 1;
        return 0;
      });
    }

    return result;
  }, [events, selectedGenre, highlightEvent]);

  // 장르 목록 추출 (진행중인 강습만)
  const allGenres = useMemo(() => {
    // const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    const genres = new Set<string>();

    events.forEach(event => {
      // 1. 강습 카테고리여야 함
      // 2. 장르가 있어야 함
      if (event.category === 'class' && event.genre) {
        // 3. 종료되지 않은 강습이어야 함
        const endDate = event.end_date || event.date;
        if (!endDate || endDate >= today) {
          genres.add(event.genre);
        }
      }
    });
    return Array.from(genres).sort();
  }, [events]);

  // 장르 순서를 랜덤화 (새로고침 시에만)
  useEffect(() => {
    if (allGenres.length > 0 && randomizedGenres.length === 0) {
      const shuffled = [...allGenres].sort(() => Math.random() - 0.5);
      setRandomizedGenres(shuffled);
    }
  }, [allGenres, randomizedGenres.length]);


  // 3개월치 이벤트 데이터 계산 (이전/현재/다음 달)
  const {
    currentMonthEvents,
    currentMonthKey,
  } = useMemo(() => {
    if (!currentMonth) {
      return {
        currentMonthEvents: filteredEvents,
        currentMonthKey: "",
      };
    }

    // 검색어가 있거나 날짜가 선택된 경우 또는 년 모드인 경우 현재 필터링된 전체 표시
    if (searchTerm.trim() || selectedDate || viewMode === "year") {
      return {
        prevMonthEvents: [],
        currentMonthEvents: filteredEvents,
        nextMonthEvents: [],
        prevMonthKey: "",
        currentMonthKey: "",
        nextMonthKey: "",
      };
    }

    // 이전 달
    const prevMonth = new Date(currentMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);

    // 다음 달
    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // 캐시 키 생성
    const prevKey = `${prevMonth.getFullYear()}-${prevMonth.getMonth() + 1}-${selectedCategory}-${selectedGenre || 'all'}-${selectedWeekday ?? 'all'}`;
    const currKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth() + 1}-${selectedCategory}-${selectedGenre || 'all'}-${selectedWeekday ?? 'all'}`;
    const nextKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth() + 1}-${selectedCategory}-${selectedGenre || 'all'}-${selectedWeekday ?? 'all'}`;

    // 각 달의 이벤트 필터링 함수
    const filterByMonth = (targetMonth: Date) => {
      return events.filter((event) => {
        return isEventMatchingFilter(event, {
          selectedCategory,
          selectedGenre,
          searchTerm,
          selectedDate,
          targetMonth,
          viewMode,
          selectedWeekday
        });
      });
    };

    return {
      prevMonthEvents: filterByMonth(prevMonth),
      currentMonthEvents: filterByMonth(currentMonth),
      nextMonthEvents: filterByMonth(nextMonth),
      prevMonthKey: prevKey,
      currentMonthKey: currKey,
      nextMonthKey: nextKey,
    };
  }, [
    events,
    currentMonth,
    selectedCategory,
    selectedGenre,
    searchTerm,
    selectedDate,
    filteredEvents,
    viewMode,
    selectedWeekday,
  ]);

  // 카테고리별 이벤트 개수 계산 (현재 필터 조건 기준, 카테고리만 제외)
  const categoryCounts = useMemo(() => {
    // 기본 필터링 로직 (카테고리 제외하고 카운트용)
    const baseFilter = (event: Event) => {
      // 카테고리 필터는 'all'로 설정하여 무시 (모든 카테고리 대상으로 필터링 후 개수 셈)
      return isEventMatchingFilter(event, {
        selectedCategory: 'all',
        selectedGenre,
        searchTerm,
        selectedDate,
        targetMonth: currentMonth || undefined, // baseFilter defaults to currentMonth if present
        viewMode,
        selectedWeekday
      });
    };

    const baseEvents = events.filter(baseFilter);

    return {
      all: baseEvents.length,
      event: baseEvents.filter(e => e.category === 'event').length,
      class: baseEvents.filter(e => e.category === 'class').length
    };
  }, [events, selectedGenre, searchTerm, selectedDate, currentMonth, viewMode, selectedWeekday]);

  // Send filter data to parent
  useEffect(() => {
    if (onFilterDataUpdate) {
      onFilterDataUpdate({
        categoryCounts,
        genres: sortedAllGenres
      });
    }
  }, [categoryCounts, sortedAllGenres, onFilterDataUpdate]);


  // 필터링된 이벤트를 정렬 (캐싱으로 슬라이드 시 재정렬 방지 및 랜덤 순서 유지)


  const sortedCurrentEvents = useMemo(() => {
    if (!currentMonthKey) {
      // 검색/날짜 선택/년 모드 시: 정렬하되 캐시하지 않음
      // 년 모드일 때는 년도 전체 기준으로 정렬 (예: 2025-01-01)
      const targetMonth = viewMode === "year" && currentMonth
        ? new Date(currentMonth.getFullYear(), 0, 1)
        : currentMonth;
      const isYearView = viewMode === "year";
      return sortEvents(currentMonthEvents, sortBy, targetMonth, isYearView);
    }
    const cacheKey = `${currentMonthKey}-${sortBy}`;
    if (sortedEventsCache.current[cacheKey]) {
      return sortedEventsCache.current[cacheKey];
    }
    const sorted = sortEvents(currentMonthEvents, sortBy, currentMonth, false);
    sortedEventsCache.current[cacheKey] = sorted;
    return sorted;
  }, [currentMonthEvents, sortBy, currentMonthKey, currentMonth, viewMode]);



  // 레거시 호환을 위해 sortedEvents는 현재 달 이벤트를 가리킴
  // 날짜 선택 시 해당 날짜 이벤트를 상단에 배치
  const sortedEvents = useMemo(() => {
    // selectedDate가 없으면 기본 정렬 그대로 반환
    if (!selectedDate) {
      return sortedCurrentEvents;
    }

    // selectedDate를 YYYY-MM-DD 형식으로 변환
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const selectedDateString = `${year}-${month}-${day}`;

    // 캐시된 배열을 복사하여 새 배열 생성 (useMemo 재실행 보장)
    const eventsCopy = [...sortedCurrentEvents];

    // 선택된 날짜에 해당하는 이벤트와 아닌 이벤트로 분리
    const eventsOnSelectedDate: Event[] = [];
    const eventsNotOnSelectedDate: Event[] = [];

    eventsCopy.forEach((event) => {
      let isOnSelectedDate = false;

      // 1. event_dates 배열로 정의된 이벤트 체크 (특정 날짜 모드)
      if (event.event_dates && event.event_dates.length > 0) {
        isOnSelectedDate = event.event_dates.includes(selectedDateString);
      }
      // 2. start_date/end_date 범위로 정의된 이벤트 체크 (연속 기간 모드)
      else {
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;
        isOnSelectedDate = !!(
          startDate &&
          endDate &&
          selectedDateString >= startDate &&
          selectedDateString <= endDate
        );
      }

      if (isOnSelectedDate) {
        eventsOnSelectedDate.push(event);
      } else {
        eventsNotOnSelectedDate.push(event);
      }
    });

    // 선택된 날짜 이벤트를 상단에, 나머지를 하단에 배치
    return [...eventsOnSelectedDate, ...eventsNotOnSelectedDate];
  }, [sortedCurrentEvents, selectedDate]);

  const handleEventClick = (event: Event) => {
    console.log(`[EventList] handleEventClick triggered for event ID: ${event.id}`);
    if (calendarMode === 'fullscreen' && onEventClickInFullscreen) {
      console.log('[EventList] Fullscreen mode detected, calling onEventClickInFullscreen.');
      onEventClickInFullscreen(event);
    } else {
      console.log('[EventList] Default mode, calling setSelectedEvent to open detail modal.');
      setSelectedEvent(event);
    }
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = (event: Event, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // 1. 로그인 체크
    if (!user) {
      if (confirm("이벤트를 수정하려면 로그인이 필요합니다.\n로그인 하시겠습니까?")) {
        signInWithKakao();
      }
      return;
    }

    // 2. 권한 체크
    const isOwner = user.id === event.user_id;
    // isAdminMode prop is passed to EventList, assume it's reliable.
    // Also check generic admin rights via user metadata just in case.
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const isSuperAdmin = user.app_metadata?.is_admin === true || (!!adminEmail && user.email === adminEmail);

    if (!isOwner && !isAdminMode && !isSuperAdmin && !adminType) {
      alert("본인이 작성한 이벤트만 수정할 수 있습니다.");
      return;
    }

    // 비밀번호 확인 로직 제거, 바로 수정 모달 열기 (RLS가 저장 시 권한 체크)
    setEventToEdit(event);

    // Convert event dates to Date objects
    const hasEventDates = event.event_dates && event.event_dates.length > 0;

    if (hasEventDates) {
      // Individual dates mode
      setEditEventDates(event.event_dates || []);
      setEditEventDates(event.event_dates || []);
      setEditDate(null);
      setEditEndDate(null);
    } else {
      // Range or single date mode
      const startDate = event.start_date || event.date;
      const endDate = event.end_date || event.date;

      setEditDate(startDate ? new Date(startDate) : null);
      setEditEndDate(endDate ? new Date(endDate) : null);
      setEditEventDates([]);
    }

    // Set other edit states
    setEditPassword(event.password || "");
    setEditLink(event.link1 || "");
    setEditLinkName(event.link_name1 || "");
    setEditImagePosition({
      x: (event as any).image_position_x || 0,
      y: (event as any).image_position_y || 0
    });
    setEditOriginalImageUrl(event.image || null);
    setEditOriginalImageForCrop(null);

    // Populate editFormData for the event object
    setEditFormData({
      title: event.title,
      description: event.description || "",
      time: event.time,
      location: event.location,
      locationLink: event.location_link || "",
      category: event.category,
      genre: event.genre || "",
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

    setIsEditingWithDetail(true);
    setSelectedEvent(null); // 상세 모달 닫기
  };

  // EditableEventDetail handlers
  const handleEditDetailUpdate = (field: string, value: string | number | boolean | null) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  // Helper to convert File to Data URL (Base64) to prevent ERR_UPLOAD_FILE_CHANGED
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  };

  const handleEditImageUpload = () => {
    if (editImageFile) {
      fileToDataURL(editImageFile).then(url => {
        setEditTempImageSrc(url);
        setEditCropModalOpen(true);
      }).catch(console.error);
    } else if (editImagePreview) {
      setEditTempImageSrc(editImagePreview);
      setEditCropModalOpen(true);
    } else {
      setEditTempImageSrc(null);
      setEditCropModalOpen(true);
    }
  };

  const handleEditImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditOriginalImageForCrop(file);
      setEditImageFile(file);
      setEditImagePosition({ x: 0, y: 0 });

      fileToDataURL(file).then(setEditTempImageSrc).catch(console.error);
      // Modal is already open
    }
    e.target.value = '';
  };

  const handleEditImageUpdate = (file: File) => {
    setEditOriginalImageForCrop(file);
    setEditImageFile(file);
    setEditImagePosition({ x: 0, y: 0 });
    fileToDataURL(file).then(setEditTempImageSrc).catch(console.error);
  };

  const handleEditCropComplete = async (croppedBlob: Blob, _previewUrl: string, _isModified: boolean) => {
    // Save the cropped/current result regardless of modification flag relative to current view.
    // This prevents re-edited images from reverting to the ancient original just because they weren't further modified.

    // Create a new File from the blob
    const croppedFile = new File([croppedBlob], editOriginalImageForCrop?.name || "cropped.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    setEditImageFile(croppedFile);
    fileToDataURL(croppedFile).then(setEditImagePreview).catch(console.error);
    setEditTempImageSrc(null);
    setEditCropModalOpen(false);
  };

  const handleEditRestoreCropOriginal = () => {
    if (editOriginalImageForCrop) {
      setEditImageFile(editOriginalImageForCrop);
      fileToDataURL(editOriginalImageForCrop).then(setEditTempImageSrc).catch(console.error);
    } else if (editOriginalImageUrl) {
      // URL로 복원하는 경우, 이미지는 그대로 두고 미리보기만 변경
      setEditImageFile(null); // 편집된 파일 제거
      setEditImagePreview(editOriginalImageUrl);
      setEditTempImageSrc(editOriginalImageUrl);
    }
  };

  const handleEditReEditImage = () => {
    if (editImageFile) {
      fileToDataURL(editImageFile).then(url => {
        setEditTempImageSrc(url);
        setEditCropModalOpen(true);
      }).catch(console.error);
    } else if (editImagePreview) {
      setEditTempImageSrc(editImagePreview);
      setEditCropModalOpen(true);
    } else if (editOriginalImageUrl) {
      setEditTempImageSrc(editOriginalImageUrl);
      setEditCropModalOpen(true);
    }
  };

  const handleEditExtractThumbnail = async () => {
    if (!editFormData.videoUrl || !isValidVideoUrl(editFormData.videoUrl)) {
      alert("유효한 유튜브 동영상 주소가 필요합니다.");
      return;
    }

    try {
      const thumbnailUrl = await getVideoThumbnail(editFormData.videoUrl);
      if (!thumbnailUrl) {
        alert("썸네일을 가져올 수 없습니다.");
        return;
      }

      const blob = await downloadThumbnailAsBlob(thumbnailUrl);
      if (!blob) {
        alert("썸네일 이미지를 다운로드할 수 없습니다.");
        return;
      }

      const file = new File([blob], "video-thumbnail.jpg", { type: "image/jpeg" });
      setEditOriginalImageForCrop(file);
      setEditImageFile(file);
      setEditImagePosition({ x: 0, y: 0 });

      try {
        const dataUrl = await fileToDataURL(file);
        setEditTempImageSrc(dataUrl);
        setEditCropModalOpen(true);
      } catch (err) {
        console.error("Thumbnail preview failed", err);
      }
    } catch (e) {
      console.error("Failed to extract thumbnail", e);
      alert("썸네일 추출 중 오류가 발생했습니다.");
    }
  };

  const handleEditSave = async () => {
    if (!eventToEdit) return;

    if (!editFormData.title.trim()) {
      alert("제목을 입력해주세요.");
      editDetailRef.current?.openModal('title');
      return;
    }

    if (!editFormData.genre) {
      alert("장르를 선택해주세요.");
      editDetailRef.current?.openModal('genre');
      return;
    }

    if (!editDate && (!editEventDates || editEventDates.length === 0)) {
      alert("날짜를 선택해주세요.");
      editDetailRef.current?.openModal('date');
      return;
    }

    // New Validation: Image OR Video is required
    // (Existing image OR New Upload OR Video URL)
    const hasImage = !!editImageFile || !!eventToEdit.image;
    const hasVideo = !!editFormData.videoUrl;

    if (!hasImage && !hasVideo) {
      alert("이미지 또는 동영상 중 하나는 필수입니다!\n둘 중 하나라도 입력해주세요.");
      return;
    }

    setIsEditSubmitting(true);

    try {
      let imageUrl = eventToEdit.image;
      let imageMicroUrl = eventToEdit.image_micro;
      let imageThumbnailUrl = eventToEdit.image_thumbnail;
      let imageMediumUrl = eventToEdit.image_medium;
      let imageFullUrl = eventToEdit.image_full;

      // Upload new image if changed
      if (editImageFile) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const basePath = `event-posters`;

        // 먼저 모든 이미지 리사이즈 (WebP 변환 포함)
        try {
          const resizedImages = await createResizedImages(editImageFile);

          // 파일명은 WebP 확장자 사용
          const fileName = `${timestamp}_${randomString}.webp`;

          // Upload micro (micro 폴더) - 달력용
          const microPath = `${basePath}/micro/${fileName}`;
          await supabase.storage.from("images").upload(microPath, resizedImages.micro);
          imageMicroUrl = supabase.storage.from("images").getPublicUrl(microPath).data.publicUrl;

          // Upload thumbnail (thumbnail 폴더)
          const thumbPath = `${basePath}/thumbnail/${fileName}`;
          await supabase.storage.from("images").upload(thumbPath, resizedImages.thumbnail);
          imageThumbnailUrl = supabase.storage.from("images").getPublicUrl(thumbPath).data.publicUrl;

          // Upload medium (medium 폴더)
          const mediumPath = `${basePath}/medium/${fileName}`;
          await supabase.storage.from("images").upload(mediumPath, resizedImages.medium);
          imageMediumUrl = supabase.storage.from("images").getPublicUrl(mediumPath).data.publicUrl;

          // Upload full (full 폴더) - 원본 대신 사용
          const fullPath = `${basePath}/full/${fileName}`;
          await supabase.storage.from("images").upload(fullPath, resizedImages.full);
          imageFullUrl = supabase.storage.from("images").getPublicUrl(fullPath).data.publicUrl;

          // 원본도 full과 동일하게 설정
          imageUrl = imageFullUrl;

        } catch (resizeError) {
          console.error("Image resize failed:", resizeError);
          alert("이미지 처리 중 오류가 발생했습니다.");
          throw resizeError;
        }
      }

      // Determine effective start and end dates
      const sortedDates = editEventDates.length > 0 ? [...editEventDates].sort() : [];
      const effectiveStartDate = editDate ? formatDateForInput(editDate) : (sortedDates.length > 0 ? sortedDates[0] : null);
      const effectiveEndDate = editEndDate ? formatDateForInput(editEndDate) : (sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null);

      const updateData = {
        title: editFormData.title,
        date: effectiveStartDate,
        start_date: effectiveStartDate,
        end_date: effectiveEndDate,
        event_dates: editEventDates.length > 0 ? editEventDates : null,
        location: editFormData.location,
        location_link: editFormData.locationLink,
        description: editFormData.description,
        category: editFormData.category,
        genre: editFormData.genre || undefined,
        password: editPassword,
        link1: editLink,
        link_name1: editLinkName,
        image: imageUrl,
        image_micro: imageMicroUrl,
        image_thumbnail: imageThumbnailUrl,
        image_medium: imageMediumUrl,
        image_full: imageFullUrl,
        image_position_x: editImagePosition.x,
        image_position_y: editImagePosition.y,
        video_url: editFormData.videoUrl,
      };

      let query = supabase
        .from("events")
        .update(updateData)
        .eq("id", eventToEdit.id);

      // Security: If not admin, restrict update to own events
      if (!isAdminMode) {
        query = query.eq('user_id', user?.id);
      }

      const { error } = await query;

      if (error) throw error;

      alert("이벤트가 수정되었습니다.");
      setIsEditingWithDetail(false);
      setEventToEdit(null);
      fetchEventsSilently(); // Silent refresh - no loading spinner
      window.dispatchEvent(new Event("eventUpdated"));
    } catch (error) {
      console.error("Error updating event:", error);
      alert("이벤트 수정 중 오류가 발생했습니다.");
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleEditCancel = () => {
    setIsEditingWithDetail(false);
    setEventToEdit(null);
  };


  const handleDeleteClick = (event: Event, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // 확인 메시지만 표시 (비밀번호 프롬프트 제거, RLS가 권한 체크)
    if (confirm('정말로 이 이벤트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      deleteEvent(event.id);
    }
  };

  const deleteEvent = async (eventId: number) => {
    setIsDeleting(true);
    try {
      console.log(`[삭제 시작] Event ID: ${eventId}`);

      // 직접 Supabase 쿼리 (RLS가 권한 체크)
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('삭제 실패:', error);

        // RLS 권한 에러 처리
        if (error.code === 'PGRST301' || error.message?.includes('policy')) {
          alert('권한이 없습니다.\n본인이 작성한 글이거나 관리자만 삭제할 수 있습니다.');
        } else {
          alert('삭제 중 오류가 발생했습니다.');
        }
        setIsDeleting(false);
        return;
      }

      console.log(`[삭제 성공] Event ID: ${eventId}`);
      setIsEditingWithDetail(false); // Close edit modal immediately
      setEventToEdit(null);
      closeModal(); // Close detail modal if open
      fetchEventsSilently(); // Silent refresh - no loading spinner
      window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } })); // Notify other components
      alert("이벤트가 삭제되었습니다.");
    } catch (error: any) {
      console.error("Edge Function 호출 또는 이벤트 삭제 중 오류 발생:", error);
      alert(`이벤트 삭제 중 오류가 발생했습니다: ${error.context?.error_description || error.message || '알 수 없는 오류'}`);
    } finally {
      setIsDeleting(false);
    }
  };


  const handlePasswordSubmit = async () => {
    // 개발 모드에서는 비밀번호 체크 건너뛰기
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (eventToEdit && (isDev || eventPassword === eventToEdit.password)) {
      // 비밀번호 확인 후 등록자 정보를 포함한 전체 데이터 다시 가져오기
      try {
        const { data: fullEvent, error } = await supabase
          .from("events")
          .select("*")
          .eq("id", eventToEdit.id)
          .single();

        if (error) {
          console.error("Error fetching full event data:", error);
          alert("이벤트 정보를 불러오는 중 오류가 발생했습니다.");
          return;
        }

        if (fullEvent) {
          // event_dates가 있으면 특정 날짜 모드, 없으면 연속 기간 모드
          const hasEventDates =
            fullEvent.event_dates && fullEvent.event_dates.length > 0;

          setEditFormData({
            title: fullEvent.title,
            genre: fullEvent.genre || "",

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
            setEditVideoPreview({
              provider: videoInfo.provider,
              embedUrl: videoInfo.embedUrl,
            });
          } else {
            setEditVideoPreview({ provider: null, embedUrl: null });
          }
          // 전체 이벤트 데이터로 업데이트
          setEventToEdit(fullEvent);

          // Convert dates for EditableEventDetail
          if (hasEventDates) {
            setEditEventDates(fullEvent.event_dates || []);
            setEditDate(null);
            setEditEndDate(null);
          } else {
            const startDate = fullEvent.start_date || fullEvent.date;
            const endDate = fullEvent.end_date || fullEvent.date;
            setEditDate(startDate ? new Date(startDate) : null);
            setEditEndDate(endDate ? new Date(endDate) : null);
            setEditEventDates([]);
          }

          setEditPassword(fullEvent.password || "");
          setEditLink(fullEvent.link1 || "");
          setEditLinkName(fullEvent.link_name1 || "");
          setEditImagePosition({
            x: (fullEvent as any).image_position_x || 0,
            y: (fullEvent as any).image_position_y || 0
          });
          setEditOriginalImageUrl(fullEvent.image || null);
          setEditOriginalImageForCrop(null);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("이벤트 정보를 불러오는 중 오류가 발생했습니다.");
        return;
      }

      setShowPasswordModal(false);
      setIsEditingWithDetail(true);
      setEventPassword("");
    } else {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditImageFile(file);
      if (!editOriginalImageFile) {
        setEditOriginalImageFile(file);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        setEditImagePreview(preview);
        if (!editOriginalImagePreview) {
          setEditOriginalImagePreview(preview);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditOpenCropForFile = async () => {
    if (!editImagePreview) return;

    // Supabase URL인 경우 blob으로 변환 (CORS 문제 해결)
    if (editImagePreview.startsWith('http')) {
      try {
        const blob = await downloadThumbnailAsBlob(editImagePreview);
        if (!blob) {
          alert('이미지 로드에 실패했습니다.');
          return;
        }

        // 원본 보관 (최초 편집 시만)
        if (!editOriginalImageFile) {
          const file = new File([blob], 'existing-image.jpg', { type: 'image/jpeg' });
          setEditOriginalImageFile(file);
          const reader = new FileReader();
          reader.onload = (e) => {
            setEditOriginalImagePreview(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }

        const reader2 = new FileReader();
        reader2.onload = (e) => {
          setEditTempImageSrc(e.target?.result as string);
          setEditCropModalOpen(true);
        };
        reader2.readAsDataURL(blob);
      } catch (error) {
        console.error('이미지 로드 실패:', error);
        alert('이미지를 불러오는 중 오류가 발생했습니다.');
      }
    } else {
      // data URL인 경우 바로 사용
      setEditTempImageSrc(editImagePreview);
      setEditCropModalOpen(true);
    }
  };





  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToEdit) return;

    // 종료일이 시작일보다 빠르면 안됨
    if (
      editFormData.start_date &&
      editFormData.end_date &&
      editFormData.end_date < editFormData.start_date
    ) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    // 영상 URL 유효성 검증
    if (editFormData.videoUrl) {
      const videoInfo = parseVideoUrl(editFormData.videoUrl);

      // 유튜브만 허용
      if (!videoInfo.provider || videoInfo.provider !== "youtube") {
        alert(
          "YouTube URL만 지원합니다. 인스타그램, 비메오는 사용할 수 없습니다.",
        );
        return;
      }

      // YouTube URL이 있고 썸네일이 없으면 추출 필수
      if (!editImageFile && !editImagePreview) {
        alert(
          "YouTube 영상은 썸네일 이미지가 필요합니다. 이미지를 업로드하거나 썸네일 추출 기능을 사용해주세요.",
        );
        return;
      }
    }

    // 링크 유효성 검증: 제목과 주소가 짝을 이루어야 함
    if (editFormData.linkName1 && !editFormData.link1) {
      alert("링크1 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (editFormData.link1 && !editFormData.linkName1) {
      alert("링크1 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }
    if (editFormData.linkName2 && !editFormData.link2) {
      alert("링크2 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (editFormData.link2 && !editFormData.linkName2) {
      alert("링크2 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }
    if (editFormData.linkName3 && !editFormData.link3) {
      alert("링크3 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (editFormData.link3 && !editFormData.linkName3) {
      alert("링크3 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }

    try {
      // 날짜 데이터 준비
      let eventDatesArray: string[] | null = null;
      let startDate = editFormData.start_date || null;
      let endDate = editFormData.end_date || null;

      if (
        editFormData.dateMode === "specific" &&
        editFormData.event_dates.length > 0
      ) {
        // 특정 날짜 모드: event_dates 배열 사용
        eventDatesArray = [...editFormData.event_dates].sort();
        startDate = eventDatesArray[0];
        endDate = eventDatesArray[eventDatesArray.length - 1];
      }

      const updateData: Partial<Event> = {
        title: editFormData.title,
        genre: editFormData.genre || null,

        time: editFormData.time,
        location: editFormData.location,
        location_link: editFormData.locationLink || undefined,
        category: editFormData.category,
        description: editFormData.description || "",
        organizer: editFormData.organizer,
        organizer_name: editFormData.organizerName || undefined,
        organizer_phone: editFormData.organizerPhone || undefined,
        contact: editFormData.contact || undefined,
        link1: editFormData.link1 || undefined,
        link2: editFormData.link2 || undefined,
        link3: editFormData.link3 || undefined,
        link_name1: editFormData.linkName1 || undefined,
        link_name2: editFormData.linkName2 || undefined,
        link_name3: editFormData.linkName3 || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        event_dates: eventDatesArray || undefined,
        video_url: editFormData.videoUrl || undefined,
        show_title_on_billboard: editFormData.showTitleOnBillboard,
        updated_at: new Date().toISOString(), // 캐시 무효화를 위해 항상 갱신
      };

      // --- 이미지 처리 로직 ---
      const deleteOldImages = async () => {
        if (!eventToEdit) return;
        // [신규 방식] storage_path가 있으면 폴더 내용 삭제
        if (eventToEdit.storage_path) {
          console.log(`[수정] 기존 폴더 삭제: ${eventToEdit.storage_path}`);
          const { data: files } = await supabase.storage.from("images").list(eventToEdit.storage_path);
          if (files && files.length > 0) {
            const paths = files.map(f => `${eventToEdit.storage_path}/${f.name}`);
            await supabase.storage.from("images").remove(paths);
          }
        }
        // [레거시 방식] 기존 이미지가 URL 방식이면 개별 파일 삭제
        else if (eventToEdit.image || eventToEdit.image_full) {
          console.log("[수정] 기존 개별 파일 삭제");
          const extractStoragePath = (url: string | null | undefined): string | null => {
            if (!url) return null;
            try {
              const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/);
              return match ? decodeURIComponent(match[1]) : null;
            } catch (e) { return null; }
          };
          const paths = [...new Set([eventToEdit.image, eventToEdit.image_thumbnail, eventToEdit.image_medium, eventToEdit.image_full].map(extractStoragePath).filter((p): p is string => !!p))];
          if (paths.length > 0) {
            await supabase.storage.from("images").remove(paths);
          }
        }
      };

      // Case 1: 새 이미지가 업로드된 경우 (교체)
      if (editImageFile) {
        console.log("[수정] 새 이미지 감지. 기존 파일 정리 및 새 파일 업로드.");
        await deleteOldImages();

        // 새 이미지 업로드 (폴더 생성)
        const resizedImages = await createResizedImages(editImageFile);
        const timestamp = Date.now();

        const sanitizeFileName = (fileName: string): string => {
          const nameWithoutExt = fileName.split(".")[0];
          let normalized = nameWithoutExt.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
          normalized = normalized.replace(/[^a-zA-Z0-9\-_]/g, "");
          normalized = normalized.replace(/[\-_]+/g, "_");
          normalized = normalized.replace(/^[\-_]+|[\-_]+$/g, "");
          return normalized || "image";
        };
        const baseFileName = sanitizeFileName(editImageFile.name);
        const newFolderPath = `event-posters/${timestamp}_${baseFileName}`;
        const getExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || 'jpg';

        const uploadPromises = ["thumbnail", "medium", "full"].map(async (key) => {
          const file = resizedImages[key as keyof typeof resizedImages];
          const path = `${newFolderPath}/${key}.${getExtension(file.name)}`;
          const { error } = await supabase.storage.from("images").upload(path, file, { cacheControl: "31536000" });
          if (error) throw new Error(`${key} upload failed: ${error.message}`);
          return { key, url: supabase.storage.from("images").getPublicUrl(path).data.publicUrl };
        });

        const results = await Promise.all(uploadPromises);
        const urls = Object.fromEntries(results.map(r => [r.key, r.url]));

        updateData.image = urls.full;
        updateData.image_thumbnail = urls.thumbnail;
        updateData.image_medium = urls.medium;
        updateData.image_full = urls.full;
        updateData.storage_path = newFolderPath;
      }
      // Case 2: 기존 이미지가 삭제된 경우 (새 이미지 없음)
      else if (!editImagePreview && (eventToEdit.image || eventToEdit.image_full)) {
        console.log("[수정] 이미지 삭제 감지. 기존 파일 정리.");
        await deleteOldImages();

        // DB 필드 초기화
        updateData.image = "";
        updateData.image_thumbnail = null as any;
        updateData.image_medium = null as any;
        updateData.image_full = null as any;
        updateData.storage_path = null;
      }

      const { error } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", eventToEdit.id);

      if (error) {
        console.error("Error updating event:", error);
        alert("이벤트 수정 중 오류가 발생했습니다.");
      } else {
        alert("이벤트가 수정되었습니다.");

        // 이미지/영상 캐시 문제 해결을 위해 페이지 새로고침 + 수정한 이벤트로 스크롤
        const eventId = eventToEdit.id;
        window.location.href = `${window.location.pathname}?from=edit&event=${eventId}`;
      }
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 수정 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="event-list-loading-container">
        <div className="event-list-loading-content">
          <i className="ri-loader-4-line event-list-loading-icon"></i>
          <p className="event-list-loading-text">이벤트를 불러오는 중...</p>
          {loadError && (
            <div className="evt-alert-error">
              <p className="event-list-error-text">{loadError}</p>
              <button
                onClick={() => {
                  setLoadError(null);
                  fetchEvents();
                }}
                className="evt-alert-btn"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 로딩 완료 후 에러가 있으면 표시
  if (loadError && events.length === 0) {
    return (
      <div className="event-list-loading-container">
        <div className="event-list-loading-content">
          <i className="ri-error-warning-line event-list-error-icon"></i>
          <p className="event-list-error-message">데이터를 불러올 수 없습니다</p>
          <div className="evt-alert-error">
            <p className="event-list-error-text">{loadError}</p>
            <button
              onClick={() => {
                setLoadError(null);
                fetchEvents();
              }}
              className="evt-alert-btn"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="no-select evt-flex-col-full">
      {/* 삭제 로딩 오버레이 */}
      {isDeleting && createPortal(
        <div
          className="evt-delete-overlay"
          // 이벤트 전파를 막아 하단 컨텐츠 클릭 방지
          onClick={(e) => e.stopPropagation()}
        >
          <div className="evt-loading-spinner-outer">
            <div className="evt-loading-spinner-base evt-loading-spinner-gray"></div>
            <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
          </div>
          <p className="event-list-deleting-text">삭제 중...</p>
        </div>, document.body
      )}
      {/* 검색 키워드 배너 (Compact Style) */}
      {searchTerm && (
        <div
          className="event-list-search-container evt-list-bg-container"
        >
          <div className="evt-search-result-badge">
            <button
              onClick={() => {
                const currentTerm = searchTerm;
                setSearchTerm("");
                setTimeout(() => setSearchTerm(currentTerm), 0);
              }}
              className="evt-search-close-btn"
              aria-label="검색 재실행"
            >
              <i className="ri-search-line evt-icon-xs"></i>
              <span>"{searchTerm}"</span>
            </button>
            <button
              onClick={() => setSearchTerm("")}
              className="evt-date-remove-btn"
              aria-label="검색 취소"
            >
              <i className="ri-close-line evt-icon-xxs"></i>
            </button>
          </div>
        </div>
      )}

      {/* 
        VIEW 1: 달력이 접혀있을 때 (collapsed) 
        => '진행중인 행사/강습' 섹션 표시
      */}
      {calendarMode === 'collapsed' && !searchTerm.trim() && !selectedDate && (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'none') ? (
        sectionViewMode === 'preview' ? (
          // 프리뷰 모드
          <div className="evt-ongoing-section evt-preview-section">
            {/* Shopping Mall Banner */}
            <ShoppingBanner />

            {/* BillboardSection 제거 - 사용하지 않음 (display: none) */}


            {/* Section 1: 진행중인 행사 (Horizontal Scroll) */}
            <div className="evt-v2-section evt-v2-section-events">
              <div className="evt-v2-section-title">

                <span>진행중인 행사</span>
                <span className="evt-v2-count">{futureEvents.length}</span>
                {futureEvents.length > 0 && (
                  <button
                    onClick={() => onSectionViewModeChange?.('viewAll-events')}
                    className="evt-view-all-btn"
                  >
                    전체보기 ❯
                  </button>
                )}
              </div>

              {futureEvents.length > 0 ? (
                <div className="evt-v2-horizontal-scroll">
                  <div className="evt-spacer-5"></div>
                  {futureEvents.map(event => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onClick={() => handleEventClick(event)}
                      onMouseEnter={onEventHover}
                      onMouseLeave={() => onEventHover?.(null)}
                      isHighlighted={highlightEvent?.id === event.id}
                      selectedDate={selectedDate}
                      defaultThumbnailClass={defaultThumbnailClass}
                      defaultThumbnailEvent={defaultThumbnailEvent}
                      variant="sliding"
                      hideGenre={true}
                    />
                  ))}
                  <div className="evt-spacer-11"></div>
                </div>
              ) : (
                <div className="evt-v2-empty">진행중인 행사가 없습니다</div>
              )}
            </div>



            {/* Section 2: 진행중인 강습 (Horizontal Scroll) */}
            <div className="evt-v2-section evt-v2-section-classes">
              <div className="evt-v2-section-title">
                <span>강습</span>
                <span className="evt-v2-count">{futureClasses.length}</span>

                {allGenres.length > 0 && (
                  <select
                    value={selectedGenre || ''}
                    onChange={(e) => {
                      const params = new URLSearchParams(searchParams);
                      if (e.target.value) {
                        params.set('genre', e.target.value);
                      } else {
                        params.delete('genre');
                      }
                      setSearchParams(params);
                    }}
                    className="evt-genre-select evt-ml-2"
                  >
                    <option value="">장르 선택</option>
                    {allGenres.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                )}

                {futureClasses.length > 0 && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('setFullscreenMode'))}
                    className="evt-view-all-btn"

                  >
                    전체 달력 ❯
                  </button>
                )}
              </div>


              {futureClasses.length > 0 ? (
                <div className="evt-v2-horizontal-scroll">
                  <div className="evt-spacer-5"></div>
                  {futureClasses.map(event => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onClick={() => handleEventClick(event)}
                      onMouseEnter={onEventHover}
                      onMouseLeave={() => onEventHover?.(null)}
                      isHighlighted={highlightEvent?.id === event.id}
                      selectedDate={selectedDate}
                      defaultThumbnailClass={defaultThumbnailClass}
                      defaultThumbnailEvent={defaultThumbnailEvent}
                      variant="sliding"
                      hideGenre={true}
                    />
                  ))}
                  <div className="evt-spacer-11"></div>
                </div>
              ) : (
                <div className="evt-v2-empty">진행중인 강습이 없습니다</div>
              )}

            </div>

            {/* Social Schedule Section (Readonly) */}
            <div className="evt-v2-section social-section-schedule-preview evt-mb-4">
              <div className="evt-v2-section-title">
                <span>정기 소셜 일정</span>
              </div>
              <Suspense fallback={<div className="evt-loading-fallback">로딩 중...</div>}>
                <SocialCalendar
                  showModal={false}
                  setShowModal={() => { }}
                  events={socialEvents}
                  loading={socialLoading}
                  onEventCreated={() => { }}
                  onEventUpdated={() => { }}
                  onEventDeleted={() => { }}
                  readonly={true}
                />
              </Suspense>
            </div>

            {/* Practice Room Banner Section */}
            <PracticeRoomBanner />

            {/* Section 3+: 장르별 이벤트 (랜덤 순서, 진행중인 강습 필터와 독립) - 무조건 표시 */}
            {(randomizedGenres.length > 0 ? randomizedGenres : allGenres).map((genre) => {
              // 전체 이벤트에서 해당 장르만 필터링
              const genreEvents = events.filter(e => {
                // 강습만 표시
                if (e.category !== 'class') return false;

                if (!e.genre || e.genre !== genre) return false;

                // 날짜 필터 적용: 진행중이거나 예정된 강습만 표시
                const today = getLocalDateString();
                const endDate = e.end_date || e.date;

                // 종료일이 있고 오늘보다 이전이면 숨김 (=이미 끝난 강습)
                if (endDate && endDate < today) return false;

                return true;
              });

              if (genreEvents.length === 0) return null;

              return (
                <div key={genre} className="evt-v2-section">
                  <div className="evt-v2-section-title">

                    <span>{genre}</span>
                    <span className="evt-v2-count">{genreEvents.length}</span>
                  </div>

                  <div className="evt-v2-horizontal-scroll">
                    <div className="evt-spacer-5"></div>
                    {genreEvents.map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => handleEventClick(event)}
                        onMouseEnter={onEventHover}
                        onMouseLeave={() => onEventHover?.(null)}
                        isHighlighted={highlightEvent?.id === event.id}
                        selectedDate={selectedDate}
                        defaultThumbnailClass={defaultThumbnailClass}
                        defaultThumbnailEvent={defaultThumbnailEvent}
                        variant="sliding"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="evt-spacer-16"></div>
          </div>
        ) : (
          // 전체보기 모드
          <div
            className="event-list-search-container evt-single-view-scroll evt-list-bg-container evt-single-view-container"
          >
            {/* 제목 */}
            <div className="evt-v2-section-title" >
              <i className={sectionViewMode === 'viewAll-events' ? 'ri-flag-line' : 'ri-graduation-cap-line'}></i>
              <span>{sectionViewMode === 'viewAll-events' ? '진행중인 행사' : '진행중인 강습'}</span>
              <span className="evt-v2-count">
                {sectionViewMode === 'viewAll-events' ? futureEvents.length : futureClasses.length}
              </span>
            </div>

            {/* 그리드 레이아웃 */}
            <div className="evt-grid-3-4-10">
              {(sectionViewMode === 'viewAll-events' ? futureEvents : futureClasses).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                  onMouseEnter={onEventHover}
                  onMouseLeave={() => onEventHover?.(null)}
                  isHighlighted={highlightEvent?.id === event.id}
                  selectedDate={selectedDate}
                  defaultThumbnailClass={defaultThumbnailClass}
                  defaultThumbnailEvent={defaultThumbnailEvent}
                />
              ))}
            </div>
          </div>
        )
      ) : null}

      {/* Events List - 3-month sliding layout */}
      {searchTerm.trim() || selectedDate || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'none') ? (
        // 검색 또는 날짜 선택 시: 단일 뷰
        <div
          className="event-list-search-container evt-single-view-scroll evt-list-bg-container evt-single-view-container"
        >
          {/* Grid layout with 3 columns - poster ratio */}
          <div className="evt-grid-3-4-10">
            {/* 필터 활성화 시 '전체 보기' 카드 표시 */}
            {(selectedDate || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'none')) && (
              <div
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('clearAllFilters'));
                }}
                className="evt-cursor-pointer"
                title="전체 일정 보기"
              >
                <div className="evt-add-banner-legacy evt-radius-sm">
                  <div className="evt-icon-absolute-center">
                    <i className="ri-arrow-go-back-line event-list-view-all-icon"></i>
                    <span className="event-list-view-all-text">전체 일정 보기</span>
                  </div>
                </div>
              </div>
            )}

            {sortedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => handleEventClick(event)}
                onMouseEnter={onEventHover}
                onMouseLeave={() => onEventHover?.(null)}
                isHighlighted={highlightEvent?.id === event.id}
                selectedDate={selectedDate}
                defaultThumbnailClass={defaultThumbnailClass}
                defaultThumbnailEvent={defaultThumbnailEvent}
              />
            ))}

            {/* 등록 버튼 배너 - 항상 표시 */}
            <div
              onClick={() => {
                const monthDate = currentMonth || new Date();
                const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                window.dispatchEvent(new CustomEvent('createEventForDate', {
                  detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                }));
              }}
              className="evt-cursor-pointer"
            >
              <div className="evt-add-banner-card">
                <div className="evt-add-banner-icon">
                  <i className="ri-add-line event-list-add-icon"></i>
                </div>
              </div>
            </div>
          </div>

          {/* 이벤트 없음 메시지 */}
          {sortedEvents.length === 0 && (
            <div className="event-list-empty-container">
              <p className="event-list-empty-text">
                {selectedDate && selectedCategory === "class"
                  ? "강습이 없습니다"
                  : selectedDate && selectedCategory === "event"
                    ? "행사가 없습니다"
                    : "해당 조건에 맞는 이벤트가 없습니다"}
              </p>
            </div>
          )}
          <Footer />
        </div>
      ) : (
        // VIEW 2: 달력이 펼쳐졌을 때 (expanded/fullscreen)
        // => '월간 전체 이벤트' 리스트 표시 (또는 검색 중일 때도 이쪽)
        (calendarMode !== 'collapsed' && !searchTerm.trim() && !selectedDate && (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'none')) ? (
          (() => {
            // 1. First filter by Genre
            const genreFilteredEvents = selectedGenre
              ? sortedCurrentEvents.filter(e => e.genre === selectedGenre)
              : sortedCurrentEvents;

            // Calculate counts for tabs
            const totalCount = genreFilteredEvents.length;
            const eventCount = genreFilteredEvents.filter(e => e.category === 'event').length;
            const classCount = genreFilteredEvents.filter(e => e.category === 'class').length;

            // 2. Then filter by Category (Local State)
            const finalFilteredEvents = viewCategory === 'all'
              ? genreFilteredEvents
              : genreFilteredEvents.filter(e => e.category === viewCategory);

            return (
              <div
                className="evt-single-view-container"
              >
                {/* Unified Filter Bar (Sticky) */}
                <div className="evt-sticky-header evt-sticky-header-container">
                  <div className="evt-sticky-header-inner">
                    {/* Category Tabs */}
                    <div className="evt-flex-1-gap-8">
                      <button
                        onClick={() => setViewCategory('all')}
                        className={`evt-filter-chip ${viewCategory === 'all' ? 'active' : ''}`}
                      >
                        전체 {totalCount}
                      </button>
                      <button
                        onClick={() => setViewCategory('event')}
                        className={`evt-filter-chip ${viewCategory === 'event' ? 'active' : ''}`}
                      >
                        행사 {eventCount}
                      </button>
                      <button
                        onClick={() => setViewCategory('class')}
                        className={`evt-filter-chip ${viewCategory === 'class' ? 'active' : ''}`}
                      >
                        강습 {classCount}
                      </button>
                    </div>

                    {/* Genre Dropdown (If genres exist) */}
                    {allGenres.length > 0 && (
                      <select
                        value={selectedGenre || ''}
                        onChange={(e) => {
                          const params = new URLSearchParams(searchParams);
                          if (e.target.value) {
                            params.set('genre', e.target.value);
                          } else {
                            params.delete('genre');
                          }
                          setSearchParams(params);
                        }}
                        className="evt-genre-select evt-width-auto-min-100"
                      >
                        <option value="">모든 장르</option>
                        {allGenres.map(genre => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Single Filtered Grid */}
                {finalFilteredEvents.length > 0 ? (
                  <div className="evt-grid-3-4-10 evt-px-4">
                    {finalFilteredEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => handleEventClick(event)}
                        onMouseEnter={onEventHover}
                        onMouseLeave={() => onEventHover?.(null)}
                        isHighlighted={highlightEvent?.id === event.id}
                        selectedDate={null}
                        defaultThumbnailClass={defaultThumbnailClass}
                        defaultThumbnailEvent={defaultThumbnailEvent}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="evt-v2-empty evt-mt-8">
                    조건에 맞는 일정이 없습니다
                  </div>
                )}


                {/* 등록 버튼 배너 (항상 마지막에 표시) */}
                <div className="evt-grid-3-4-10 evt-mt-4 evt-px-4">
                  <div
                    onClick={() => {
                      const monthDate = currentMonth || new Date();
                      const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                      window.dispatchEvent(new CustomEvent('createEventForDate', {
                        detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                      }));
                    }}
                    className="evt-cursor-pointer"
                  >
                    <div className="evt-add-banner-card">
                      <div className="evt-add-banner-icon">
                        <i className="ri-add-line event-list-add-icon"></i>
                      </div>
                    </div>
                  </div>
                </div>

                <Footer />
              </div>
            );
          })()
        ) : null
      )}

      {/* 정렬 모달 */}
      {/* 정렬 모달 */}
      <Suspense fallback={null}>
        <EventSortModal
          isOpen={showSortModal}
          onClose={() => setShowSortModal(false)}
          sortBy={sortBy}
          onSortChange={handleSortChange}
        />

        {/* 검색 모달 */}
        {/* 검색 모달 */}
        <EventSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSearch={(term) => {
            if (onSearchStart) onSearchStart();
            setSearchTerm(term);
            setShowSearchModal(false);
          }}
          events={events}
        />

        <EventDetailModal
          isOpen={!!selectedEvent}
          event={selectedEvent}
          onClose={closeModal}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
          isAdminMode={isAdminMode}
          currentUserId={user?.id}
        />
      </Suspense>

      {/* EditableEventDetail for editing */}
      {isEditingWithDetail && eventToEdit && createPortal(
        <div className={`reg-modal-overlay ${editPreviewMode === 'billboard' ? 'billboard-mode' : ''}`}>
          {/* Ceiling Switcher */}
          <div className="ceiling-switcher-container">
            <div className="ceiling-switcher-wrapper">
              <button
                onClick={() => setEditPreviewMode('detail')}
                className={`switcher-btn ${editPreviewMode === 'detail' ? 'active' : 'inactive'}`}
              >
                <i className="ri-file-list-line"></i>
                <span className="switcher-label">상세</span>
              </button>

              <button
                onClick={() => setEditPreviewMode('billboard')}
                className={`switcher-btn ${editPreviewMode === 'billboard' ? 'active' : 'inactive'}`}
              >
                <i className="ri-billboard-line"></i>
                <span className="switcher-label">전광판</span>
              </button>
            </div>
          </div>

          {editPreviewMode === 'detail' ? (
            <EditableEventDetail
              event={{
                ...eventToEdit,
                ...editFormData,
                id: eventToEdit.id,
                created_at: eventToEdit.created_at,
                title: editFormData.title,
                date: editDate ? formatDateForInput(editDate) : undefined,
                start_date: editDate ? formatDateForInput(editDate) : undefined,
                end_date: editEndDate ? formatDateForInput(editEndDate) : undefined,
                event_dates: editEventDates.length > 0 ? editEventDates : undefined,
                location: editFormData.location || "",
                location_link: editFormData.locationLink || undefined,
                description: editFormData.description || "",
                category: editFormData.category as "class" | "event",
                genre: editFormData.genre || undefined,
                image: editImagePreview || editFormData.image || "",
                link1: editLink || undefined,
                link_name1: editLinkName || undefined,
                organizer: editFormData.organizer || "",
                organizer_name: editFormData.organizerName || undefined,
                time: editFormData.time || "",
                price: eventToEdit.price,
                capacity: eventToEdit.capacity,
                registered: eventToEdit.registered,
              }}
              onUpdate={handleEditDetailUpdate}
              onImageUpload={handleEditImageUpload}
              imagePosition={editImagePosition}
              onImagePositionChange={setEditImagePosition}
              genreSuggestions={allGenres}
              ref={editDetailRef}
              date={editDate}
              setDate={setEditDate}
              endDate={editEndDate}
              setEndDate={setEditEndDate}
              eventDates={editEventDates}
              setEventDates={setEditEventDates}
              link={editLink}
              setLink={setEditLink}
              linkName={editLinkName}
              setLinkName={setEditLinkName}
              onRegister={handleEditSave}
              onClose={handleEditCancel}
              isSubmitting={isEditSubmitting}
              onDelete={() => {
                if (eventToEdit) {
                  handleDeleteClick(eventToEdit);
                }
              }}
              videoUrl={editFormData.videoUrl}
              onVideoChange={(url) => setEditFormData(prev => ({ ...prev, videoUrl: url }))}
              onExtractThumbnail={handleEditExtractThumbnail}
            />
          ) : editPreviewMode === 'billboard' ? (
            /* Billboard Mode: Directly Render Card */
            <div className="billboard-content-card">
              {/* Video/Image Area */}
              <div className="billboard-media-area">
                {editFormData.videoUrl && isValidVideoUrl(editFormData.videoUrl) ? (
                  <div className="billboard-media-video-wrapper w-full h-full">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${parseVideoUrl(editFormData.videoUrl).videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${parseVideoUrl(editFormData.videoUrl).videoId}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full object-cover"
                    ></iframe>
                  </div>
                ) : editImagePreview || editFormData.image ? (
                  <img
                    src={editImagePreview || editFormData.image}
                    alt="preview"
                    className="billboard-media-image cursor-pointer"
                    onClick={handleEditReEditImage}
                  />
                ) : (
                  <div className="billboard-media-placeholder">
                    <i className="ri-image-line billboard-empty-icon"></i>
                  </div>
                )}

                {/* QR Code Placeholder */}
                <div className="billboard-qr-placeholder">
                  <i className="ri-qr-code-line billboard-qr-icon"></i>
                </div>
              </div>

              {/* Bottom Info */}
              <div className="billboard-info-overlay">
                <h3 className="billboard-info-title">{editFormData.title || "제목"}</h3>
                <p className="billboard-info-date">
                  {editDate ? formatDateForInput(editDate) : "날짜"}
                </p>
              </div>
            </div>
          ) : null}

        </div>,
        document.body
      )
      }

      {/* Hidden File Input for Edit Mode */}
      <input
        type="file"
        ref={editFileInputRef}
        onChange={handleEditImageSelect}
        accept="image/*"
        className="hidden evt-hidden"
      />

      {/* Image Crop Modal for Edit Mode */}
      <ImageCropModal
        isOpen={editCropModalOpen}
        onClose={() => setEditCropModalOpen(false)}
        imageUrl={editTempImageSrc || ''}
        onCropComplete={handleEditCropComplete}
        onRestoreOriginal={handleEditRestoreCropOriginal}
        onChangeImage={() => editFileInputRef.current?.click()}
        hasOriginal={
          (!!editOriginalImageForCrop && editImageFile !== editOriginalImageForCrop) ||
          (!!editOriginalImageUrl && editImagePreview !== editOriginalImageUrl)
        }
      />

      {/* Password Modal */}
      <Suspense fallback={null}>
        {
          showPasswordModal && eventToEdit && (
            <EventPasswordModal
              event={eventToEdit}
              password={eventPassword}
              onPasswordChange={setEventPassword}
              onSubmit={handlePasswordSubmit}
              onClose={() => {
                setShowPasswordModal(false);
                setEventPassword("");
                setEventToEdit(null);
              }}
            />
          )
        }
      </Suspense>

      {/* Edit Modal */}
      {
        showEditModal && eventToEdit && createPortal(
          <div
            className={`evt-fixed-inset-edit-modal ${editPreviewMode === 'billboard' ? 'billboard-mode' : ''}`}
            onTouchStartCapture={(e) => {
              e.stopPropagation();
            }}
            onTouchMoveCapture={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onTouchEndCapture={(e) => {
              e.stopPropagation();
            }}
          >
            {editPreviewMode === 'billboard' ? (
              <div className="billboard-content-card">
                {/* Video/Image Area */}
                <div className="billboard-media-area">
                  {editFormData.videoUrl && isValidVideoUrl(editFormData.videoUrl) ? (
                    <div className="billboard-media-video-wrapper w-full h-full">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${parseVideoUrl(editFormData.videoUrl).videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${parseVideoUrl(editFormData.videoUrl).videoId}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full object-cover"
                      ></iframe>
                    </div>
                  ) : editImagePreview || editFormData.image ? (
                    <img
                      src={editImagePreview || editFormData.image}
                      alt="preview"
                      className="billboard-media-image cursor-pointer"
                      onClick={handleEditReEditImage}
                    />
                  ) : (
                    <div className="billboard-media-placeholder">
                      <i className="ri-image-line billboard-empty-icon"></i>
                    </div>
                  )}

                  {/* QR Code Placeholder */}
                  <div className="billboard-qr-placeholder">
                    <i className="ri-qr-code-line billboard-qr-icon"></i>
                  </div>
                </div>

                {/* Bottom Info */}
                <div className="billboard-info-overlay">
                  <h3 className="billboard-info-title">{editFormData.title || "제목"}</h3>
                  <p className="billboard-info-date">
                    {editDate ? formatDateForInput(editDate) : "날짜"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="evt-modal-container-lg">
                {/* 헤더 */}
                <div className="evt-modal-header">
                  <div className="evt-modal-header-content">
                    <h2 className="evt-modal-title">
                      이벤트 수정
                    </h2>
                    <button
                      onClick={() => {
                        setShowEditModal(false);
                        setEventToEdit(null);
                        setEditVideoPreview({ provider: null, embedUrl: null });
                      }}
                      className="evt-modal-close-btn"
                    >
                      <i className="ri-close-line evt-icon-xl"></i>
                    </button>
                  </div>
                </div>

                {/* 스크롤 가능한 폼 영역 */}
                <div className="evt-modal-body-scroll">
                  <form id="edit-event-form" onSubmit={handleEditSubmit} className="evt-space-y-3">
                    <div>
                      <label className="evt-form-label">
                        이벤트 제목
                      </label>
                      <input
                        type="text"
                        value={editFormData.title}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        className="evt-form-input"
                      />
                    </div>


                    <div className="evt-relative">

                      <label className="evt-form-label">
                        장르 (7자 이내, 선택사항)
                      </label>
                      <input
                        type="text"
                        value={editFormData.genre}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditFormData((prev) => ({ ...prev, genre: value }));
                          const suggestions = value
                            ? allGenres.filter(
                              (genre) =>
                                genre.toLowerCase().includes(value.toLowerCase()) &&
                                genre.toLowerCase() !== value.toLowerCase(),
                            )
                            : allGenres; // 입력값이 없으면 전체 목록 보여주기
                          setGenreSuggestions(suggestions);
                        }}
                        onFocus={handleGenreFocus}
                        onBlur={() => setTimeout(() => setIsGenreInputFocused(false), 150)}
                        maxLength={7}
                        className="evt-form-input"
                        placeholder="예: 린디합, 발보아"
                        autoComplete="off"

                      />
                      {isGenreInputFocused && genreSuggestions.length > 0 && (
                        <div className="evt-autocomplete-dropdown">
                          {genreSuggestions.map((genre) => (
                            <div key={genre} onMouseDown={() => handleGenreSuggestionClick(genre)} className="evt-autocomplete-genre-item">
                              {genre}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="evt-form-label">
                        카테고리
                      </label>
                      <select
                        value={editFormData.category}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        className="evt-form-select"
                      >
                        <option value="class">강습</option>
                        <option value="event">행사</option>
                      </select>
                    </div>

                    {/* 빌보드 표시 옵션 */}
                    <div className="evt-billboard-option-box evt-space-y-2">
                      <label className="event-list-form-label">
                        빌보드 표시 옵션
                      </label>
                      <div className="event-list-form-flex">
                        <input
                          type="checkbox"
                          id="editShowTitleOnBillboard"
                          name="showTitleOnBillboard"
                          checked={editFormData.showTitleOnBillboard}
                          onChange={(e) => {
                            const { checked } = e.target;
                            setEditFormData(prev => ({ ...prev, showTitleOnBillboard: checked }));
                          }}
                          className="evt-form-checkbox"
                        />
                        <label htmlFor="editShowTitleOnBillboard" className="event-list-form-label-ml">
                          빌보드에 제목, 날짜, 장소 정보 표시
                        </label>
                      </div>
                    </div>

                    {/* 장소 이름 & 주소 링크 (한 줄) */}
                    <div className="evt-grid-cols-2 evt-gap-3">
                      <div>
                        <label className="evt-form-label">
                          장소 이름
                        </label>
                        <input
                          type="text"
                          value={editFormData.location}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              location: e.target.value,
                            }))
                          }
                          className="evt-form-input"
                          placeholder="예: 홍대 연습실"
                        />
                      </div>
                      <div>
                        <label className="evt-form-label">
                          주소 링크 (선택)
                        </label>
                        <input
                          type="text"
                          value={editFormData.locationLink}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              locationLink: e.target.value,
                            }))
                          }
                          className="evt-form-input"
                          placeholder="지도 링크"
                        />
                      </div>
                    </div>

                    {/* 날짜 선택 섹션 (통합 박스) */}
                    <div className="evt-billboard-option-box evt-space-y-3">
                      <label className="event-list-form-label">
                        날짜 선택 방식
                      </label>
                      <div className="event-list-form-flex-gap">
                        <label className="evt-flex evt-items-center evt-cursor-pointer">
                          <input
                            type="radio"
                            name="edit-dateMode"
                            value="range"
                            checked={editFormData.dateMode === "range"}
                            onChange={() => {
                              setEditFormData((prev) => ({
                                ...prev,
                                dateMode: "range",
                                event_dates: [],
                              }));
                            }}
                            className="evt-mr-2"
                          />
                          <span className="event-list-form-text-small">연속 기간</span>
                        </label>
                        <label className="evt-flex evt-items-center evt-cursor-pointer">
                          <input
                            type="radio"
                            name="edit-dateMode"
                            value="specific"
                            checked={editFormData.dateMode === "specific"}
                            onChange={() => {
                              setEditFormData((prev) => ({
                                ...prev,
                                dateMode: "specific",
                              }));
                            }}
                            className="evt-mr-2"
                          />
                          <span className="event-list-form-text-small">
                            특정 날짜 선택
                          </span>
                        </label>
                      </div>

                      {editFormData.dateMode === "range" ? (
                        <div className="evt-grid-cols-2 evt-gap-3">
                          <div>
                            <label className="evt-form-label">
                              시작일
                            </label>
                            <DatePicker
                              selected={editFormData.start_date ? new Date(editFormData.start_date + "T00:00:00") : null}
                              onChange={(date) => {
                                if (date) {
                                  const dateStr = formatDateForInput(date);
                                  setEditFormData((prev) => ({
                                    ...prev,
                                    start_date: dateStr,
                                    end_date: !prev.end_date || prev.end_date < dateStr ? dateStr : prev.end_date,
                                  }));
                                  if (onMonthChange) {
                                    onMonthChange(date);
                                  }
                                }
                              }}
                              locale="ko"
                              shouldCloseOnSelect={false}
                              customInput={
                                <CustomDateInput
                                  value={
                                    editFormData.start_date
                                      ? `${new Date(editFormData.start_date + "T00:00:00").getMonth() + 1}.${new Date(editFormData.start_date + "T00:00:00").getDate()}`
                                      : undefined
                                  }
                                />
                              }
                              calendarClassName="evt-calendar-bg"
                              withPortal
                              portalId="root-portal"
                              renderCustomHeader={(props) => (
                                <CustomDatePickerHeader
                                  {...props}
                                  selectedDate={editFormData.start_date ? new Date(editFormData.start_date + "T00:00:00") : null}
                                  onTodayClick={() => {
                                    const today = new Date();
                                    props.changeMonth(today.getMonth());
                                    props.changeYear(today.getFullYear());
                                    const todayStr = formatDateForInput(today);
                                    setEditFormData((prev) => ({
                                      ...prev,
                                      start_date: todayStr,
                                      end_date: !prev.end_date || prev.end_date < todayStr ? todayStr : prev.end_date,
                                    }));
                                    if (onMonthChange) {
                                      onMonthChange(today);
                                    }
                                  }}
                                />
                              )}
                            />
                          </div>
                          <div>
                            <label className="evt-form-label">
                              종료일
                            </label>
                            <DatePicker
                              selected={editFormData.end_date ? new Date(editFormData.end_date + "T00:00:00") : null}
                              onChange={(date) => {
                                if (date) {
                                  const dateStr = formatDateForInput(date);
                                  setEditFormData((prev) => ({
                                    ...prev,
                                    end_date: dateStr,
                                  }));
                                  if (onMonthChange) {
                                    onMonthChange(date);
                                  }
                                }
                              }}
                              startDate={editFormData.start_date ? new Date(editFormData.start_date + "T00:00:00") : null}
                              endDate={editFormData.end_date ? new Date(editFormData.end_date + "T00:00:00") : null}
                              minDate={editFormData.start_date ? new Date(editFormData.start_date + "T00:00:00") : undefined}
                              locale="ko"
                              shouldCloseOnSelect={false}
                              customInput={
                                <CustomDateInput
                                  value={
                                    editFormData.end_date
                                      ? `${new Date(editFormData.end_date + "T00:00:00").getMonth() + 1}.${new Date(editFormData.end_date + "T00:00:00").getDate()}`
                                      : undefined
                                  }
                                />
                              }
                              calendarClassName="evt-calendar-bg"
                              withPortal
                              portalId="root-portal"
                              renderCustomHeader={(props) => <CustomDatePickerHeader {...props} />}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="event-list-form-label-small">
                            선택된 날짜 ({editFormData.event_dates.length}개)
                          </label>
                          <div className="event-list-form-flex-wrap">
                            {editFormData.event_dates
                              .sort((a, b) => a.localeCompare(b))
                              .map((dateStr, index) => {
                                const date = new Date(dateStr);
                                return (
                                  <div
                                    key={index}
                                    className="evt-date-badge"
                                  >
                                    <span>
                                      {date.getMonth() + 1}/{date.getDate()}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (editFormData.event_dates.length > 1) {
                                          setEditFormData((prev) => ({
                                            ...prev,
                                            event_dates: prev.event_dates.filter(
                                              (_, i) => i !== index,
                                            ),
                                          }));
                                        }
                                      }}
                                      className="event-list-icon-hover"
                                    >
                                      <i className="ri-close-line"></i>
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="event-list-form-flex-wrap">
                            <input
                              type="date"
                              value={tempDateInput}
                              className="event-list-form-input-flex evt-form-input"
                              onKeyDown={(e) => {
                                if (
                                  e.key !== "Tab" &&
                                  e.key !== "ArrowLeft" &&
                                  e.key !== "ArrowRight"
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              onChange={(e) => {
                                setTempDateInput(e.target.value);
                                // 달력 이동
                                if (e.target.value && onMonthChange) {
                                  const newDate = new Date(e.target.value + "T00:00:00");
                                  onMonthChange(newDate);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (tempDateInput) {
                                  const newDate = tempDateInput;
                                  const isDuplicate =
                                    editFormData.event_dates.includes(newDate);
                                  if (!isDuplicate) {
                                    setEditFormData((prev) => ({
                                      ...prev,
                                      event_dates: [...prev.event_dates, newDate],
                                    }));
                                  }
                                  setTempDateInput("");
                                }
                              }}
                              className="evt-video-btn"
                            >
                              추가
                            </button>
                          </div>
                          <p className="event-list-form-hint">
                            예: 11일, 25일, 31일처럼 특정 날짜들만 선택할 수
                            있습니다
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 문의 정보 (공개) */}
                    <div>
                      <label className="evt-form-label">
                        문의
                      </label>
                      <input
                        type="text"
                        value={editFormData.contact}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            contact: e.target.value,
                          }))
                        }
                        className="evt-form-input"
                        placeholder="카카오톡ID, 전화번호, SNS 등 (예: 카카오톡09502958)"
                      />
                      <p className="event-list-form-hint-mt">
                        <i className="ri-information-line evt-mr-1"></i>
                        참가자가 문의할 수 있는 연락처를 입력해주세요 (선택사항)
                      </p>
                    </div>

                    {/* 내용 */}
                    <div>
                      <label className="evt-form-label">
                        내용 (선택사항)
                      </label>
                      <textarea
                        value={editFormData.description}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        rows={4}
                        className="evt-form-input"
                        placeholder="이벤트에 대한 자세한 설명을 입력해주세요"
                      />
                    </div>

                    <div>
                      <label className="evt-form-label">
                        바로가기 링크
                      </label>
                      <div className="evt-grid-cols-2 evt-gap-2">
                        <input
                          type="url"
                          value={editFormData.link1}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              link1: e.target.value,
                            }))
                          }
                          className="evt-form-input"
                          placeholder="링크 URL"
                        />
                        <input
                          type="text"
                          value={editFormData.linkName1}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              linkName1: e.target.value,
                            }))
                          }
                          className="evt-form-input"
                          placeholder="링크 이름"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="evt-form-label">
                        이벤트 이미지 (선택사항)
                      </label>
                      <div className="evt-space-y-2">
                        {editImagePreview && (
                          <div className="evt-relative">
                            <img
                              src={editImagePreview}
                              alt="이벤트 이미지"
                              className="evt-img-full-h48"
                            />
                            <div className="event-list-image-controls">
                              <button
                                type="button"
                                onClick={handleEditOpenCropForFile}
                                className="evt-btn-purple"
                              >
                                <i className="ri-crop-line evt-mr-1"></i>
                                편집
                              </button>
                              {isAdminMode && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = editImagePreview;
                                    link.download = `thumbnail-${Date.now()}.jpg`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="evt-thumbnail-btn"
                                >
                                  <i className="ri-download-line evt-mr-1"></i>
                                  다운로드
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditImagePreview("");
                                  setEditImageFile(null);
                                  setEditFormData((prev) => ({
                                    ...prev,
                                    image: "",
                                  }));
                                }}
                                className="evt-thumbnail-remove-btn"
                              >
                                이미지 삭제
                              </button>
                            </div>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleEditImageChange}
                          className="evt-file-input"
                        />



                        <p className="event-list-form-hint">
                          <i className="ri-information-line evt-mr-1"></i>
                          포스터 이미지는 이벤트 배너와 상세보기에 표시됩니다.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="evt-form-label">
                        영상 URL (선택사항)
                      </label>
                      <div className="evt-space-y-2">
                        {/* 영상 프리뷰 */}
                        {editVideoPreview.provider && editVideoPreview.embedUrl && (
                          <div className="evt-relative">
                            <div className="event-list-video-success">
                              <i className="ri-check-line"></i>
                              <span>영상 인식됨 - 빌보드에서 재생됩니다</span>
                            </div>
                            <div className="evt-video-preview-wrapper">
                              <iframe
                                src={editVideoPreview.embedUrl}
                                className="evt-video-preview-iframe"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              ></iframe>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditVideoPreview({
                                  provider: null,
                                  embedUrl: null,
                                });
                                setEditFormData((prev) => ({
                                  ...prev,
                                  videoUrl: "",
                                }));
                                setEditImageFile(null);
                                setEditImagePreview("");
                              }}
                              className="evt-btn-red-abs"
                            >
                              영상 삭제
                            </button>
                          </div>
                        )}

                        {/* 영상 URL 입력창 - 항상 표시 */}
                        <div>
                          <label className="event-list-form-label-small">
                            {editVideoPreview.provider ? '영상 주소 (복사/수정 가능)' : '영상 주소 입력'}
                          </label>
                          <input
                            type="url"
                            value={editFormData.videoUrl}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEditFormData((prev) => ({
                                ...prev,
                                videoUrl: value,
                              }));

                              if (value.trim() === "") {
                                setEditVideoPreview({
                                  provider: null,
                                  embedUrl: null,
                                });
                              } else {
                                const videoInfo = parseVideoUrl(value);

                                // 유튜브만 허용
                                if (
                                  videoInfo.provider &&
                                  videoInfo.provider !== "youtube"
                                ) {
                                  setEditVideoPreview({
                                    provider: null,
                                    embedUrl: null,
                                  });
                                } else {
                                  setEditVideoPreview({
                                    provider: videoInfo.provider,
                                    embedUrl: videoInfo.embedUrl,
                                  });
                                }
                              }
                            }}
                            className="evt-form-input"
                            placeholder="YouTube 링크만 가능"
                          />
                        </div>
                        <div className="evt-mt-2 evt-space-y-1">
                          <p className="event-list-form-hint">
                            <i className="ri-information-line evt-mr-1"></i>
                            영상은 전면 빌보드에서 자동재생됩니다.
                          </p>
                          <p className="event-list-form-success">
                            <i className="ri-check-line evt-mr-1"></i>
                            <strong>YouTube만 지원:</strong> 썸네일 자동 추출 + 영상
                            재생 가능
                          </p>
                          <p className="event-list-form-error">
                            <i className="ri-close-line evt-mr-1"></i>
                            <strong>Instagram, Vimeo는 지원하지 않습니다</strong>
                          </p>
                        </div>
                        {editFormData.videoUrl && !editVideoPreview.provider && (
                          <p className="event-list-form-error-mt">
                            <i className="ri-alert-line evt-mr-1"></i>
                            YouTube URL만 지원합니다. 인스타그램, 비메오는 사용할 수
                            없습니다.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 등록자 정보 (관리자 전용, 비공개) - 최하단 */}
                    <div className="evt-registrant-box">
                      <div className="evt-registrant-header">
                        <i className="ri-lock-line event-list-form-icon-warning"></i>
                        <h3 className="evt-registrant-title">
                          등록자 정보 (비공개 - 관리자만 확인 가능)
                        </h3>
                      </div>
                      <div className="evt-grid-cols-2 evt-gap-3">
                        <div>
                          <label className="evt-registrant-label">
                            등록자 이름 <span className="event-list-form-required">*필수</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.organizerName}
                            onChange={(e) =>
                              setEditFormData((prev) => ({
                                ...prev,
                                organizerName: e.target.value,
                              }))
                            }
                            required
                            className="evt-form-input-orange"
                            placeholder="등록자 이름"
                          />
                        </div>
                        <div>
                          <label className="evt-registrant-label">
                            등록자 전화번호{" "}
                            <span className="event-list-form-required">*필수</span>
                          </label>
                          <input
                            type="tel"
                            value={editFormData.organizerPhone}
                            onChange={(e) =>
                              setEditFormData((prev) => ({
                                ...prev,
                                organizerPhone: e.target.value,
                              }))
                            }
                            required
                            className="evt-form-input-orange"
                            placeholder="010-0000-0000"
                          />
                        </div>
                      </div>
                      <p className="evt-registrant-info">
                        <i className="ri-information-line evt-mr-1"></i>
                        수정 등 문제가 있을 경우 연락받으실 번호입니다
                      </p>
                    </div>

                  </form>
                </div>

                {/* 하단 고정 버튼 */}
                <div className="evt-footer-sticky">
                  <div className="event-list-button-group">
                    {/* Only show delete button if admin or owner */}
                    {(isAdminMode || (user && eventToEdit && user.id === eventToEdit.user_id)) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          if (eventToEdit) {
                            handleDeleteClick(eventToEdit);
                          }
                        }}
                        className="evt-btn-red-footer"
                      >
                        삭제
                      </button>
                    )}
                    <div className="event-list-button-group-flex">
                      <button
                        type="button"
                        onClick={() => {
                          setShowEditModal(false);
                          setEventToEdit(null);
                          setEditVideoPreview({ provider: null, embedUrl: null });
                        }}
                        className="evt-btn-gray-footer"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        form="edit-event-form"
                        className="evt-btn-blue-footer"
                      >
                        수정 완료
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )
      }



      {/* Image Crop Modal for Edit Mode */}
      <ImageCropModal
        key={editTempImageSrc || 'modal'}
        isOpen={editCropModalOpen}
        onClose={() => setEditCropModalOpen(false)}
        imageUrl={editTempImageSrc || ''}
        videoUrl={editFormData.videoUrl}
        onCropComplete={handleEditCropComplete}
        onRestoreOriginal={handleEditRestoreCropOriginal}
        onImageUpdate={handleEditImageUpdate}
        onChangeImage={() => editFileInputRef.current?.click()}
        hasOriginal={
          (!!editOriginalImageForCrop && editImageFile !== editOriginalImageForCrop) ||
          (!!editOriginalImageUrl && editImagePreview !== editOriginalImageUrl)
        }
      />
    </div >
  );
}
