import { useState, useEffect, useMemo, useRef, useCallback, type RefObject } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import { createResizedImages } from "../../../utils/imageResize";
import { parseVideoUrl } from "../../../utils/videoEmbed";
import {
  getVideoThumbnailOptions,
  downloadThumbnailAsBlob,
  type VideoThumbnailOption,
} from "../../../utils/videoThumbnail";
import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";
import {
  parseMultipleContacts,
  copyToClipboard,
} from "../../../utils/contactLink";
import { QRCodeSVG } from "qrcode.react";
import ImageCropModal from "../../../components/ImageCropModal";
import { EventCard } from "./EventCard";
import EventPasswordModal from "./EventPasswordModal";

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface EventListProps {
  selectedDate: Date | null;
  selectedCategory: string;
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
  sortBy?: "random" | "time" | "title" | "newest";
  setSortBy?: (sort: "random" | "time" | "title" | "newest") => void;
  highlightEvent?: { id: number; nonce: number } | null;
  onHighlightComplete?: () => void;
  dragOffset?: number;
  isAnimating?: boolean;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
  onMonthChange?: (date: Date) => void;
}

export default function EventList({
  selectedDate,
  selectedCategory,
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
  dragOffset: externalDragOffset = 0,
  isAnimating: externalIsAnimating = false,
  slideContainerRef,
  onMonthChange,
}: EventListProps) {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const setSearchTerm = externalSetSearchTerm ?? setInternalSearchTerm;

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventPassword, setEventPassword] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [internalShowSearchModal, setInternalShowSearchModal] = useState(false);
  const [showDatePickerModal, setShowDatePickerModal] = useState<
    "start" | "end" | null
  >(null);
  const [datePickerMonth, setDatePickerMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [internalSortBy, setInternalSortBy] = useState<
    "random" | "time" | "title" | "newest"
  >("random");
  const [internalShowSortModal, setInternalShowSortModal] = useState(false);

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
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [editVideoPreview, setEditVideoPreview] = useState<{
    provider: string | null;
    embedUrl: string | null;
  }>({ provider: null, embedUrl: null });
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [thumbnailOptions, setThumbnailOptions] = useState<
    VideoThumbnailOption[]
  >([]);
  const [tempDateInput, setTempDateInput] = useState<string>("");
  
  const [showEditCropModal, setShowEditCropModal] = useState(false);
  const [editCropImageUrl, setEditCropImageUrl] = useState<string>("");
  const [editOriginalImageFile, setEditOriginalImageFile] = useState<File | null>(null);
  const [editOriginalImagePreview, setEditOriginalImagePreview] = useState<string>(""); // 편집 모달에서 특정 날짜 추가용

  const { defaultThumbnailClass, defaultThumbnailEvent } =
    useDefaultThumbnail();

  // 현재 날짜 추적 (자정 지날 때 캐시 무효화를 위해)
  const [currentDay, setCurrentDay] = useState(() => new Date().toDateString());

  // 슬라이드 높이 동적 조정을 위한 상태 및 ref
  // const [slideContainerHeight, setSlideContainerHeight] = useState<number | null>(null);
  const prevMonthRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const nextMonthRef = useRef<HTMLDivElement>(null);

  // 월별 정렬된 이벤트 캐시 (슬라이드 시 재로드 방지 및 랜덤 순서 유지)
  const sortedEventsCache = useRef<{
    [key: string]: Event[]; // key: "YYYY-MM-category-sortBy"
  }>({});

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
  }, []);

  // 카테고리, 정렬 기준, 이벤트 배열, 날짜 변경 시 캐시 초기화
  useEffect(() => {
    sortedEventsCache.current = {};
  }, [selectedCategory, sortBy, events, currentDay]);

  // 모달이 열릴 때 배경 스크롤 막기
  useEffect(() => {
    if (selectedEvent || showFullscreenImage) {
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalTop = document.body.style.top;
      const originalWidth = document.body.style.width;
      const scrollY = window.scrollY;
      
      // 모바일 포함 모든 브라우저에서 스크롤 완전 차단
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;
        window.scrollTo(0, scrollY);
      };
    }
  }, [selectedEvent, showFullscreenImage]);

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
  const getLocalDateString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Seeded Random 함수
  const seededRandom = (seed: number) => {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  };

  // 이벤트 정렬 함수 (targetMonth를 명시적으로 받음)
  const sortEvents = (eventsToSort: Event[], sortType: string, targetMonth?: Date) => {
    const eventsCopy = [...eventsToSort];
    const today = getLocalDateString();

    // 진행 중/종료 이벤트 분류 (종료일 기준)
    const ongoingEvents: Event[] = [];
    const endedEvents: Event[] = [];

    eventsCopy.forEach((event) => {
      const endDate = event.end_date || event.date;
      if (endDate && endDate < today) {
        endedEvents.push(event);
      } else {
        ongoingEvents.push(event);
      }
    });

    // 각 그룹 내에서 정렬 적용
    const sortGroup = (group: Event[]) => {
      switch (sortType) {
        case "random":
          // 랜덤 정렬 - targetMonth 기반 고정 seed 사용
          const monthToUse = targetMonth || currentMonth || new Date();
          const seed = monthToUse.getFullYear() * 12 + monthToUse.getMonth();
          const random = seededRandom(seed);
          
          const shuffled = [...group];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          return shuffled;
        case "time":
          // 시간순 정렬 (날짜 + 시간)
          return group.sort((a, b) => {
            const dateStrA = a.start_date || a.date;
            const dateStrB = b.start_date || b.date;
            if (!dateStrA && !dateStrB) return 0;
            if (!dateStrA) return 1;
            if (!dateStrB) return -1;
            const dateA = new Date(`${dateStrA} ${a.time}`);
            const dateB = new Date(`${dateStrB} ${b.time}`);
            return dateA.getTime() - dateB.getTime();
          });
        case "title":
          // 제목순 정렬 (가나다순)
          return group.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        case "newest":
          // 최신순 정렬 (created_at 기준)
          return group.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });
        default:
          return group;
      }
    };

    // 진행 중 이벤트를 위로, 종료된 이벤트를 아래로
    return [...sortGroup(ongoingEvents), ...sortGroup(endedEvents)];
  };

  // 검색 자동완성을 위한 이벤트 데이터에서 키워드 추출
  const generateSearchSuggestions = (query: string) => {
    if (!query.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // 3년치 데이터만 사용 (전년, 올해, 후년)
    const currentYear = new Date().getFullYear();
    const threeYearEvents = events.filter((event) => {
      const eventDate = event.start_date || event.date;
      if (!eventDate) return false;

      const eventYear = new Date(eventDate).getFullYear();
      return eventYear >= currentYear - 1 && eventYear <= currentYear + 1;
    });

    threeYearEvents.forEach((event) => {
      // 제목 전체가 검색어를 포함하는 경우
      if (event.title.toLowerCase().includes(queryLower)) {
        suggestions.add(event.title);
      }

      // 장소 전체가 검색어를 포함하는 경우
      if (event.location.toLowerCase().includes(queryLower)) {
        suggestions.add(event.location);
      }

      // 주최자 전체가 검색어를 포함하는 경우
      if (event.organizer.toLowerCase().includes(queryLower)) {
        suggestions.add(event.organizer);
      }

      // 설명에서 의미있는 단어 추출 (3글자 이상)
      const descWords = event.description.split(/\s+/);
      descWords.forEach((word) => {
        const cleanWord = word.replace(/[^\w가-힣]/g, ""); // 특수문자 제거
        if (
          cleanWord.length >= 3 &&
          cleanWord.toLowerCase().includes(queryLower)
        ) {
          // 해당 단어로 실제 검색 결과가 있는지 확인 (3년치 데이터 내에서)
          const hasResults = threeYearEvents.some(
            (e) =>
              e.title.toLowerCase().includes(cleanWord.toLowerCase()) ||
              e.location.toLowerCase().includes(cleanWord.toLowerCase()) ||
              e.organizer.toLowerCase().includes(cleanWord.toLowerCase()) ||
              e.description.toLowerCase().includes(cleanWord.toLowerCase()),
          );
          if (hasResults) {
            suggestions.add(cleanWord);
          }
        }
      });
    });

    // 검색 결과가 실제로 있는 제안만 필터링 (3년치 데이터 내에서)
    const validSuggestions = Array.from(suggestions).filter((suggestion) => {
      const suggestionLower = suggestion.toLowerCase();
      return threeYearEvents.some(
        (event) =>
          event.title.toLowerCase().includes(suggestionLower) ||
          event.location.toLowerCase().includes(suggestionLower) ||
          event.organizer.toLowerCase().includes(suggestionLower) ||
          event.description.toLowerCase().includes(suggestionLower),
      );
    });

    setSearchSuggestions(validSuggestions.slice(0, 8));
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    generateSearchSuggestions(query);
  };

  const handleSearchSubmit = () => {
    if (onSearchStart) {
      onSearchStart();
    }
    setSearchTerm(searchQuery);
    setShowSearchModal(false);
    setSearchQuery("");
    setSearchSuggestions([]);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    if (onSearchStart) {
      onSearchStart();
    }
    setSearchTerm(suggestion);
    setShowSearchModal(false);
    setSearchSuggestions([]);
  };

  const handleSortChange = (
    newSortBy: "random" | "time" | "title" | "newest",
  ) => {
    setSortBy(newSortBy);
    setShowSortModal(false);
  };

  const sortOptions = [
    { id: "random", name: "랜덤", icon: "ri-shuffle-line" },
    { id: "time", name: "시간순", icon: "ri-time-line" },
    { id: "title", name: "제목순", icon: "ri-sort-alphabet-asc" },
    { id: "newest", name: "최신순", icon: "ri-calendar-line" },
  ];

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
      let error: any = null;

      const fetchPromise = (async () => {
        if (isAdminMode) {
          const result = await supabase
            .from("events")
            .select("*")
            .order("start_date", { ascending: true, nullsFirst: false })
            .order("date", { ascending: true, nullsFirst: false });
          data = result.data;
          error = result.error;
        } else {
          const result = await supabase
            .from("events")
            .select(
              "id,title,date,start_date,end_date,event_dates,time,location,location_link,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,contact,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,password,created_at,updated_at",
            )
            .order("start_date", { ascending: true, nullsFirst: false })
            .order("date", { ascending: true, nullsFirst: false });
          data = result.data;
          error = result.error;
        }
      })();

      await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error("[EventList] Supabase 에러:", error);
        setLoadError(`DB 에러: ${error.message || "알 수 없는 오류"}`);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
    } catch (error: any) {
      console.error("[EventList] 데이터 로딩 실패:", error.message);
      setLoadError(`로딩 실패: ${error.message || "알 수 없는 오류"}`);
      // 타임아웃이나 에러 발생 시 빈 배열로 설정 (무한 로딩 방지)
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [isAdminMode]);

  // 이벤트 데이터 로드
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 이벤트 업데이트/삭제 감지 (refreshTrigger 대체)
  useEffect(() => {
    const handleEventUpdate = () => {
      fetchEvents();
    };

    window.addEventListener("eventDeleted", handleEventUpdate);
    window.addEventListener("eventUpdated", handleEventUpdate);

    return () => {
      window.removeEventListener("eventDeleted", handleEventUpdate);
      window.removeEventListener("eventUpdated", handleEventUpdate);
    };
  }, [fetchEvents]);

  // 달 변경 및 카테고리 변경 시 스크롤 위치 리셋
  // 슬라이드 또는 강습/행사 버튼 클릭 시 스크롤을 맨 위로 올림
  useEffect(() => {
    // 이벤트 리스트 컨테이너 스크롤 (이제 body가 아니라 컨테이너만 스크롤)
    const scrollContainer = document.querySelector(".overflow-y-auto");
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }, [currentMonth, selectedCategory]);

  // 광고판에서 이벤트 선택 이벤트 리스너
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleEventSelected = (e: CustomEvent) => {
      if (e.detail) {
        setSelectedEvent(e.detail);
      }
    };

    window.addEventListener(
      "eventSelected",
      handleEventSelected as EventListener,
    );

    return () => {
      window.removeEventListener(
        "eventSelected",
        handleEventSelected as EventListener,
      );
    };
  }, []);

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
        window.removeEventListener(event, () => {});
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

      // 검색어 필터
      const matchesSearch =
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase());

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

        return matchesCategory && matchesSearch && matchesYearRange;
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
          return matchesCategory && matchesSelectedDate;
        }

        // 연속 기간으로 정의된 이벤트
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;

        if (!startDate || !endDate) {
          return false;
        }

        const matchesSelectedDate =
          selectedDateString >= startDate && selectedDateString <= endDate;

        return matchesCategory && matchesSelectedDate;
      }

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

      return matchesCategory && matchesDate;
    });
  }, [
    events,
    selectedDate,
    selectedCategory,
    searchTerm,
    currentMonth,
    viewMode,
  ]);

  // 3개월치 이벤트 데이터 계산 (이전/현재/다음 달)
  const {
    prevMonthEvents,
    currentMonthEvents,
    nextMonthEvents,
    prevMonthKey,
    currentMonthKey,
    nextMonthKey,
  } = useMemo(() => {
    if (!currentMonth) {
      return {
        prevMonthEvents: [],
        currentMonthEvents: filteredEvents,
        nextMonthEvents: [],
        prevMonthKey: "",
        currentMonthKey: "",
        nextMonthKey: "",
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
    const prevKey = `${prevMonth.getFullYear()}-${prevMonth.getMonth() + 1}-${selectedCategory}`;
    const currKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth() + 1}-${selectedCategory}`;
    const nextKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth() + 1}-${selectedCategory}`;

    // 각 달의 이벤트 필터링 함수
    const filterByMonth = (targetMonth: Date) => {
      return events.filter((event) => {
        const matchesCategory =
          selectedCategory === "none"
            ? false
            : selectedCategory === "all" || event.category === selectedCategory;

        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;

        if (!startDate || !endDate) return false;

        const targetYear = targetMonth.getFullYear();
        const targetMonthNum = targetMonth.getMonth() + 1;
        const monthStartStr = `${targetYear}-${String(targetMonthNum).padStart(2, "0")}-01`;
        const monthEndStr = `${targetYear}-${String(targetMonthNum).padStart(2, "0")}-${new Date(targetYear, targetMonthNum, 0).getDate()}`;

        const matchesDate =
          startDate <= monthEndStr && endDate >= monthStartStr;
        return matchesCategory && matchesDate;
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
    searchTerm,
    selectedDate,
    filteredEvents,
  ]);

  // 필터링된 이벤트를 정렬 (캐싱으로 슬라이드 시 재정렬 방지 및 랜덤 순서 유지)
  const sortedPrevEvents = useMemo(() => {
    if (!prevMonthKey || !currentMonth) return [];
    const cacheKey = `${prevMonthKey}-${sortBy}`;
    if (sortedEventsCache.current[cacheKey]) {
      return sortedEventsCache.current[cacheKey];
    }
    // 이전 달의 Date 객체 생성
    const prevMonth = new Date(currentMonth.getTime());
    prevMonth.setMonth(currentMonth.getMonth() - 1);
    const sorted = sortEvents(prevMonthEvents, sortBy, prevMonth);
    sortedEventsCache.current[cacheKey] = sorted;
    return sorted;
  }, [prevMonthEvents, sortBy, prevMonthKey, currentMonth]);

  const sortedCurrentEvents = useMemo(() => {
    if (!currentMonthKey) {
      // 검색/날짜 선택 시: 정렬하되 캐시하지 않음 (검색 결과는 매번 다를 수 있음)
      return sortEvents(currentMonthEvents, sortBy, currentMonth);
    }
    const cacheKey = `${currentMonthKey}-${sortBy}`;
    if (sortedEventsCache.current[cacheKey]) {
      return sortedEventsCache.current[cacheKey];
    }
    const sorted = sortEvents(currentMonthEvents, sortBy, currentMonth);
    sortedEventsCache.current[cacheKey] = sorted;
    return sorted;
  }, [currentMonthEvents, sortBy, currentMonthKey, currentMonth]);

  const sortedNextEvents = useMemo(() => {
    if (!nextMonthKey || !currentMonth) return [];
    const cacheKey = `${nextMonthKey}-${sortBy}`;
    if (sortedEventsCache.current[cacheKey]) {
      return sortedEventsCache.current[cacheKey];
    }
    // 다음 달의 Date 객체 생성
    const nextMonth = new Date(currentMonth.getTime());
    nextMonth.setMonth(currentMonth.getMonth() + 1);
    const sorted = sortEvents(nextMonthEvents, sortBy, nextMonth);
    sortedEventsCache.current[cacheKey] = sorted;
    return sorted;
  }, [nextMonthEvents, sortBy, nextMonthKey, currentMonth]);

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
    setSelectedEvent(event);
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = (event: Event, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    if (isAdminMode) {
      // 개발자 모드(관리자 모드)에서는 비밀번호 없이 바로 수정 모달 열기
      setEventToEdit(event);
      // event_dates가 있으면 특정 날짜 모드, 없으면 연속 기간 모드
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
        videoUrl: event?.video_url || "",
      });

      // 영상 URL과 이미지를 모두 로드 (추출 썸네일 지원)
      setEditImagePreview(event?.image || "");
      setEditImageFile(null);

      if (event?.video_url) {
        const videoInfo = parseVideoUrl(event.video_url);
        setEditVideoPreview({
          provider: videoInfo.provider,
          embedUrl: videoInfo.embedUrl,
        });
      } else {
        setEditVideoPreview({ provider: null, embedUrl: null });
      }
      setShowEditModal(true);
      setSelectedEvent(null); // 상세 모달 닫기
    } else {
      // 일반 모드에서는 비밀번호 확인
      setEventToEdit(event);
      setShowPasswordModal(true);
      setSelectedEvent(null); // 상세 모달 닫기
    }
  };

  const handleDeleteClick = (event: Event, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (adminType === "super") {
      // 슈퍼 관리자는 비밀번호 없이 바로 삭제
      if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
        deleteEvent(event.id);
        setSelectedEvent(null); // 상세 모달 닫기
        setShowEditModal(false); // 수정 모달 닫기
        setShowPasswordModal(false); // 비밀번호 모달 닫기
        setEventToEdit(null); // 수정 이벤트 초기화
        setEditVideoPreview({ provider: null, embedUrl: null }); // YouTube iframe 메모리 해제
      }
    } else {
      // 일반 모드에서는 비밀번호 확인 후 삭제
      const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
      if (password && password === event.password) {
        if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
          deleteEvent(event.id);
          setSelectedEvent(null); // 상세 모달 닫기
          setShowEditModal(false); // 수정 모달 닫기
          setShowPasswordModal(false); // 비밀번호 모달 닫기
          setEventToEdit(null); // 수정 이벤트 초기화
          setEditVideoPreview({ provider: null, embedUrl: null }); // YouTube iframe 메모리 해제
        }
      } else if (password) {
        alert("비밀번호가 올바르지 않습니다.");
      }
    }
  };

  const deleteEvent = async (eventId: number) => {
    try {
      // 1. 이벤트 정보를 조회하여 이미지 URL 가져오기 (원본 image 포함)
      const { data: event, error: fetchError } = await supabase
        .from("events")
        .select("image, image_thumbnail, image_medium, image_full")
        .eq("id", eventId)
        .single();

      if (fetchError) {
        console.error("Error fetching event:", fetchError);
        alert("이벤트 정보를 불러오는 중 오류가 발생했습니다.");
        return;
      }

      // 2. Storage에서 이미지 파일 삭제
      if (event) {
        const imagesToDelete: string[] = [];

        // URL에서 Storage 경로 추출 및 디코딩 함수
        const extractStoragePath = (url: string | null | undefined): string | null => {
          if (!url) return null;
          try {
            // Supabase Storage URL 형식: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
            const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/);
            if (!match) return null;
            
            // URL 디코딩 (events%2Fthumb.jpg → events/thumb.jpg)
            const encodedPath = match[1];
            return decodeURIComponent(encodedPath);
          } catch (error) {
            console.error("경로 추출 실패:", url, error);
            return null;
          }
        };

        // 각 이미지 URL에서 경로 추출 (원본 포함 4개)
        const imagePath = extractStoragePath(event.image);
        const thumbnailPath = extractStoragePath(event.image_thumbnail);
        const mediumPath = extractStoragePath(event.image_medium);
        const fullPath = extractStoragePath(event.image_full);

        // 중복 제거하여 배열에 추가
        const paths = [imagePath, thumbnailPath, mediumPath, fullPath].filter(
          (path): path is string => !!path
        );
        imagesToDelete.push(...new Set(paths));

        // Storage에서 이미지 삭제
        if (imagesToDelete.length > 0) {
          console.log("삭제할 이미지 경로:", imagesToDelete);
          
          const { error: storageError } = await supabase.storage
            .from("event-images")
            .remove(imagesToDelete);

          if (storageError) {
            console.error("Storage 이미지 삭제 실패:", storageError);
            alert(
              `이미지 파일 삭제 중 오류가 발생했습니다.\n계속 진행하시겠습니까?\n\n오류: ${storageError.message}`
            );
            const proceed = confirm("DB에서 이벤트를 삭제하시겠습니까?");
            if (!proceed) {
              return;
            }
          }
        }
      }

      // 3. DB에서 이벤트 삭제
      const { error: deleteError } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (deleteError) {
        console.error("Error deleting event:", deleteError);
        alert("이벤트 삭제 중 오류가 발생했습니다.");
      } else {
        alert("이벤트가 삭제되었습니다.");
        window.location.reload();
      }
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 삭제 중 오류가 발생했습니다.");
    }
  };

  const handlePasswordSubmit = async () => {
    if (eventToEdit && eventPassword === eventToEdit.password) {
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
        
        const blobUrl = URL.createObjectURL(blob);
        setEditCropImageUrl(blobUrl);
        setShowEditCropModal(true);
      } catch (error) {
        console.error('이미지 로드 실패:', error);
        alert('이미지를 불러오는 중 오류가 발생했습니다.');
      }
    } else {
      // data URL인 경우 바로 사용
      setEditCropImageUrl(editImagePreview);
      setShowEditCropModal(true);
    }
  };
  
  const handleEditOpenCropForThumbnail = async (thumbnailUrl: string) => {
    try {
      const blob = await downloadThumbnailAsBlob(thumbnailUrl);
      if (!blob) {
        alert('썸네일 다운로드에 실패했습니다.');
        return;
      }
      
      if (!editOriginalImageFile) {
        const file = new File([blob], 'youtube-thumbnail.jpg', { type: 'image/jpeg' });
        setEditOriginalImageFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setEditOriginalImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
      
      const blobUrl = URL.createObjectURL(blob);
      setEditCropImageUrl(blobUrl);
      setShowEditCropModal(true);
      setShowThumbnailSelector(false);
    } catch (error) {
      console.error('썸네일 다운로드 실패:', error);
      alert('썸네일 다운로드 중 오류가 발생했습니다.');
    }
  };
  
  const handleEditCropComplete = (croppedFile: File, croppedPreviewUrl: string) => {
    setEditImageFile(croppedFile);
    setEditImagePreview(croppedPreviewUrl);
    
    if (editCropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(editCropImageUrl);
    }
    setEditCropImageUrl('');
  };
  
  const handleEditCropDiscard = () => {
    if (editCropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(editCropImageUrl);
    }
    setEditCropImageUrl('');
  };
  
  const handleEditRestoreOriginal = () => {
    if (editOriginalImagePreview) {
      if (editCropImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(editCropImageUrl);
      }
      setEditCropImageUrl(editOriginalImagePreview);
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
      alert("링크1 주소를 입력했다면 링크 제목  � 입력해주세요.");
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
        updated_at: new Date().toISOString(), // 캐시 무효화를 위해 항상 갱신
      };

      // 이미지가 삭제되었으면 (editImagePreview가 비어있고 editImageFile도 없음)
      if (!editImagePreview && !editImageFile) {
        updateData.image = "";
        updateData.image_thumbnail = null;
        updateData.image_medium = null;
        updateData.image_full = null;
      }
      // 주의: 영상 URL이 있어도 추출 썸네일은 유지됨 (image 필드 사용)

      // 새 이미지가 업로드되었으면 Supabase Storage에 3가지 크기로 업로드
      if (editImageFile) {
        const resizedImages = await createResizedImages(editImageFile);
        const timestamp = Date.now();

        // 파일명 정규화 (전각 문자 및 특수문자 제거)
        const sanitizeFileName = (fileName: string): string => {
          const nameWithoutExt = fileName.split(".")[0];

          // 전각 문자를 반각으로 변환
          let normalized = nameWithoutExt.replace(/[\uFF01-\uFF5E]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
          );

          // 영문, 숫자, 하이픈, 언더스코어만 남기고 나머지는 제거
          normalized = normalized.replace(/[^a-zA-Z0-9\-_]/g, "");

          // 연속된 특수문자 제거
          normalized = normalized.replace(/[\-_]+/g, "_");

          // 앞뒤 특수문자 제거
          normalized = normalized.replace(/^[\-_]+|[\-_]+$/g, "");

          return normalized || "image";
        };

        const baseFileName = sanitizeFileName(editImageFile.name);
        
        // 리사이즈된 이미지의 실제 확장자 추출 (WebP 또는 JPEG)
        const getExtension = (fileName: string) => {
          const ext = fileName.split('.').pop()?.toLowerCase();
          return ext || 'jpg';
        };

        const uploadPromises = [
          {
            file: resizedImages.thumbnail,
            path: `event-posters/thumbnail/${baseFileName}_${timestamp}_thumb.${getExtension(resizedImages.thumbnail.name)}`,
            key: "thumbnail" as const,
          },
          {
            file: resizedImages.medium,
            path: `event-posters/medium/${baseFileName}_${timestamp}_medium.${getExtension(resizedImages.medium.name)}`,
            key: "medium" as const,
          },
          {
            file: resizedImages.full,
            path: `event-posters/full/${baseFileName}_${timestamp}_full.${getExtension(resizedImages.full.name)}`,
            key: "full" as const,
          },
        ];

        const results = await Promise.all(
          uploadPromises.map(async ({ file, path, key }) => {
            const { error } = await supabase.storage
              .from("images")
              .upload(path, file, {
                cacheControl: "31536000",
              });

            if (error) {
              console.error(`${key} upload error:`, error);
              return { key, url: "" };
            }

            const { data } = supabase.storage.from("images").getPublicUrl(path);

            return { key, url: data.publicUrl };
          }),
        );

        const thumbnailUrl =
          results.find((r) => r.key === "thumbnail")?.url || "";
        const mediumUrl = results.find((r) => r.key === "medium")?.url || "";
        const fullUrl = results.find((r) => r.key === "full")?.url || "";

        updateData.image = fullUrl || editFormData.image;
        updateData.image_thumbnail = thumbnailUrl || null;
        updateData.image_medium = mediumUrl || null;
        updateData.image_full = fullUrl || null;
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
      <div className="bg-[#1f1f1f] rounded-none p-4">
        <div className="text-center py-8">
          <i className="ri-loader-4-line text-4xl text-gray-500 mb-4 animate-spin"></i>
          <p className="text-gray-400">이벤트를 불러오는 중...</p>
          {loadError && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-lg">
              <p className="text-red-300 text-sm">{loadError}</p>
              <button
                onClick={() => {
                  setLoadError(null);
                  fetchEvents();
                }}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
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
      <div className="bg-[#1f1f1f] rounded-none p-4">
        <div className="text-center py-8">
          <i className="ri-error-warning-line text-4xl text-red-500 mb-4"></i>
          <p className="text-gray-400 mb-2">데이터를 불러올 수 없습니다</p>
          <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-lg">
            <p className="text-red-300 text-sm">{loadError}</p>
            <button
              onClick={() => {
                setLoadError(null);
                fetchEvents();
              }}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="no-select pb-24">
      {/* 검색 키워드 배너 (Compact Style) */}
      {searchTerm && (
        <div
          className="p-[0.4rem]"
          style={{
            margin: "2px 0",
            borderRadius: "11px",
            backgroundColor: "var(--event-list-outer-bg-color)",
          }}
        >
          <div className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/40 px-2.5 py-0.5 rounded-full text-xs font-medium">
            <button
              onClick={() => {
                const currentTerm = searchTerm;
                setSearchTerm("");
                setTimeout(() => setSearchTerm(currentTerm), 0);
              }}
              className="flex items-center gap-1 cursor-pointer hover:text-blue-300 transition-colors"
              aria-label="검색 재실행"
            >
              <i className="ri-search-line text-[11px]"></i>
              <span>"{searchTerm}"</span>
            </button>
            <button
              onClick={() => setSearchTerm("")}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-600/20 transition-colors cursor-pointer"
              aria-label="검색 취소"
            >
              <i className="ri-close-line text-[10px]"></i>
            </button>
          </div>
        </div>
      )}

      {/* Events List - 3-month sliding layout */}
      {searchTerm.trim() || selectedDate ? (
        // 검색 또는 날짜 선택 시: 단일 뷰
        <div
          className="p-[0.4rem]"
          style={{
            margin: "2px 0",
            borderRadius: "11px",
            backgroundColor: "var(--event-list-outer-bg-color)",
          }}
        >
          {/* Grid layout with 3 columns - poster ratio */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
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
                viewMode={viewMode}
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
              className="cursor-pointer"
            >
              <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="ri-add-line text-6xl text-gray-600"></i>
                </div>
              </div>
            </div>
          </div>

          {/* 이벤트 없음 메시지 */}
          {sortedEvents.length === 0 && (
            <div className="text-center py-4 mt-2">
              <p className="text-gray-500 text-sm">
                {selectedDate && selectedCategory === "class"
                  ? "강습이 없습니다"
                  : selectedDate && selectedCategory === "event"
                    ? "행사가 없습니다"
                    : "해당 조건에 맞는 이벤트가 없습니다"}
              </p>
            </div>
          )}
        </div>
      ) : (
        // 일반 월간 뷰: 3개월 슬라이드 (독립 컨테이너)
        <div
          className="overflow-hidden"
          style={
            {
              // height: slideContainerHeight ? `${slideContainerHeight}px` : 'auto',
              // transition: 'height 0.3s ease-out'
            }
          }
        >
          <div
            ref={slideContainerRef}
            className="flex items-start"
            style={{
              transform: `translateX(calc(-100% + ${externalDragOffset}px))`,
              transition: externalIsAnimating
                ? "transform 0.25s cubic-bezier(0.4, 0.0, 0.2, 1)"
                : "none",
              willChange: "transform",
            }}
          >
            {/* 이전 달 - 독립 컨테이너 */}
            <div ref={prevMonthRef} className="flex-shrink-0 w-full self-start">
              <div
                className="p-[0.4rem]"
                style={{
                  margin: "2px 0",
                  borderRadius: "11px",
                  backgroundColor: "var(--event-list-outer-bg-color)",
                }}
              >
                {sortedPrevEvents.length > 0 || externalIsAnimating ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {sortedPrevEvents.map((event) => (
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
                        viewMode={viewMode}
                        variant="sliding"
                      />
                    ))}

                    {/* 등록 버튼 배너 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const prevMonth = new Date(monthDate);
                        prevMonth.setMonth(prevMonth.getMonth() - 1);
                        const firstDayOfMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {/* 등록 버튼 배너만 표시 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const prevMonth = new Date(monthDate);
                        prevMonth.setMonth(prevMonth.getMonth() - 1);
                        const firstDayOfMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 현재 달 - 독립 컨테이너 */}
            <div
              ref={currentMonthRef}
              className="flex-shrink-0 w-full self-start"
            >
              <div
                className="p-[0.4rem]"
                style={{
                  margin: "2px 0",
                  borderRadius: "11px",
                  backgroundColor: "var(--event-list-outer-bg-color)",
                }}
              >
                {sortedCurrentEvents.length > 0 || externalIsAnimating ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {sortedCurrentEvents.map((event) => (
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
                        viewMode={viewMode}
                        variant="sliding"
                      />
                    ))}

                    {/* 등록 버튼 배너 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {/* 등록 버튼 배너만 표시 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 다음 달 - 독립 컨테이너 */}
            <div ref={nextMonthRef} className="flex-shrink-0 w-full self-start">
              <div
                className="p-[0.4rem]"
                style={{
                  margin: "2px 0",
                  borderRadius: "11px",
                  backgroundColor: "var(--event-list-outer-bg-color)",
                }}
              >
                {sortedNextEvents.length > 0 || externalIsAnimating ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {sortedNextEvents.map((event) => (
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
                        viewMode={viewMode}
                        variant="sliding"
                      />
                    ))}

                    {/* 등록 버튼 배너 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const nextMonth = new Date(monthDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        const firstDayOfMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[0.4rem]">
                    {/* 등록 버튼 배너만 표시 */}
                    <div
                      onClick={() => {
                        const monthDate = currentMonth || new Date();
                        const nextMonth = new Date(monthDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        const firstDayOfMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
                        window.dispatchEvent(new CustomEvent('createEventForDate', {
                          detail: { source: 'banner', monthIso: firstDayOfMonth.toISOString() }
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <div className="relative aspect-[3/4] border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-500/5 transition-all overflow-hidden" style={{ borderRadius: "0.3rem" }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="ri-add-line text-6xl text-gray-600"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 정렬 모달 */}
      {showSortModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">정렬 방식</h3>
                <button
                  onClick={() => setShowSortModal(false)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      handleSortChange(
                        option.id as "random" | "time" | "title" | "newest",
                      )
                    }
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                      sortBy === option.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    <i className={`${option.icon} text-lg`}></i>
                    <span className="font-medium">{option.name}</span>
                    {sortBy === option.id && (
                      <i className="ri-check-line text-lg ml-auto"></i>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 검색 모달 */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">이벤트 검색</h3>
                <button
                  onClick={() => {
                    setShowSearchModal(false);
                    setSearchQuery("");
                    setSearchSuggestions([]);
                    setSearchTerm("");
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* 검색 입력창 */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSearchSubmit();
                      }
                    }}
                    className="w-full bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이벤트 제목, 장소, 주최자로 검색..."
                    autoFocus
                  />
                  <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                </div>

                {/* 자동완성 제안 */}
                {searchSuggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 mb-2">추천 검색어</p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {searchSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full text-left bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-2 rounded-lg transition-colors cursor-pointer text-sm"
                        >
                          <i className="ri-search-line text-xs mr-2 text-gray-400"></i>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 검색 버튼 */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowSearchModal(false);
                      setSearchQuery("");
                      setSearchSuggestions([]);
                      setSearchTerm("");
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSearchSubmit}
                    className="flex-1 bg-blue-600 hover-bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    검색
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && eventToEdit && (
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
      )}

      {/* Edit Modal */}
      {showEditModal && eventToEdit && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto"
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
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] flex flex-col">
            {/* 헤더 */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">이벤트 수정</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEventToEdit(null);
                    setEditVideoPreview({ provider: null, embedUrl: null });
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            {/* 스크롤 가능한 폼 영역 */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <form id="edit-event-form" onSubmit={handleEditSubmit} className="space-y-3">
                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
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
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
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
                    className="w-full bg-[#242424] text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 text-sm"
                  >
                    <option value="class">강습</option>
                    <option value="event">행사</option>
                  </select>
                </div>

                {/* 장소 이름 & 주소 링크 (한 줄) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
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
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="예: 홍대 연습실"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
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
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="지도 링크"
                    />
                  </div>
                </div>

                {/* 날짜 선택 섹션 (통합 박스) */}
                <div className="bg-gray-700/50 rounded-lg p-3 space-y-3">
                  <label className="block text-gray-300 text-xs font-medium">
                    날짜 선택 방식
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
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
                        className="mr-2"
                      />
                      <span className="text-gray-300 text-sm">연속 기간</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
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
                        className="mr-2"
                      />
                      <span className="text-gray-300 text-sm">
                        특정 날짜 선택
                      </span>
                    </label>
                  </div>

                  {editFormData.dateMode === "range" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-300 text-xs font-medium mb-1">
                          시작일
                        </label>
                        <div
                          onClick={() => {
                            setDatePickerMonth(
                              editFormData.start_date
                                ? new Date(editFormData.start_date)
                                : new Date(),
                            );
                            setShowDatePickerModal("start");
                          }}
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer hover:bg-gray-600 transition-colors flex items-center justify-between"
                        >
                          <span>
                            {editFormData.start_date
                              ? new Date(
                                  editFormData.start_date,
                                ).toLocaleDateString("ko-KR", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              : "날짜 선택"}
                          </span>
                          <i className="ri-calendar-line"></i>
                        </div>
                      </div>
                      <div>
                        <label className="block text-gray-300 text-xs font-medium mb-1">
                          종료일
                        </label>
                        <div
                          onClick={() => {
                            setDatePickerMonth(
                              editFormData.end_date
                                ? new Date(editFormData.end_date)
                                : editFormData.start_date
                                  ? new Date(editFormData.start_date)
                                  : new Date(),
                            );
                            setShowDatePickerModal("end");
                          }}
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer hover:bg-gray-600 transition-colors flex items-center justify-between"
                        >
                          <span>
                            {editFormData.end_date
                              ? new Date(
                                  editFormData.end_date,
                                ).toLocaleDateString("ko-KR", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              : "날짜 선택"}
                          </span>
                          <i className="ri-calendar-line"></i>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        선택된 날짜 ({editFormData.event_dates.length}개)
                      </label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {editFormData.event_dates
                          .sort((a, b) => a.localeCompare(b))
                          .map((dateStr, index) => {
                            const date = new Date(dateStr);
                            return (
                              <div
                                key={index}
                                className="inline-flex items-center bg-blue-600 text-white px-3 py-1 rounded-full text-sm"
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
                                  className="ml-2 hover:text-red-300"
                                >
                                  <i className="ri-close-line"></i>
                                </button>
                              </div>
                            );
                          })}
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="date"
                          value={tempDateInput}
                          className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                        >
                          추가
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        예: 11일, 25일, 31일처럼 특정 날짜들만 선택할 수
                        있습니다
                      </p>
                    </div>
                  )}
                </div>

                {/* 문의 정보 (공개) */}
                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
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
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="카카오톡ID, 전화번호, SNS 등 (예: 카카오톡09502958)"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    <i className="ri-information-line mr-1"></i>
                    참가자가 문의할 수 있는 연락처를 입력해주세요 (선택사항)
                  </p>
                </div>

                {/* 내용 */}
                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
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
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
                    placeholder="이벤트에 대한 자세한 설명을 입력해주세요"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    바로가기 링크
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="url"
                      value={editFormData.link1}
                      onChange={(e) =>
                        setEditFormData((prev) => ({
                          ...prev,
                          link1: e.target.value,
                        }))
                      }
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="링크 이름"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    이벤트 이미지 (선택사항)
                  </label>
                  <div className="space-y-2">
                    {editImagePreview && (
                      <div className="relative">
                        <img
                          src={editImagePreview}
                          alt="이벤트 이미지"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            type="button"
                            onClick={handleEditOpenCropForFile}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                          >
                            <i className="ri-crop-line mr-1"></i>
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
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                            >
                              <i className="ri-download-line mr-1"></i>
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
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
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
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />

                    {/* 썸네일 추출 버튼 (영상 URL이 있을 때만) */}
                    {editFormData.videoUrl && editVideoPreview.provider && (
                      <>
                        {editVideoPreview.provider === "youtube" ||
                        editVideoPreview.provider === "vimeo" ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const options = await getVideoThumbnailOptions(
                                  editFormData.videoUrl,
                                );
                                if (options.length > 0) {
                                  setThumbnailOptions(options);
                                  setShowThumbnailSelector(true);
                                } else {
                                  alert(
                                    "이 영상에서 썸네일을 추출할 수 없습니다.",
                                  );
                                }
                              } catch (error) {
                                console.error("썸네일 추출 오류:", error);
                                alert("썸네일 추출 중 오류가 발생했습니다.");
                              }
                            }}
                            className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                          >
                            <i className="ri-image-add-line mr-1"></i>
                            썸네일 추출하기{" "}
                            {editVideoPreview.provider === "youtube" &&
                              "(여러 장면 선택 가능)"}
                          </button>
                        ) : (
                          <div className="mt-2">
                            <button
                              type="button"
                              disabled
                              className="w-full bg-gray-600 text-gray-400 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed opacity-60"
                            >
                              <i className="ri-image-add-line mr-1"></i>
                              썸네일 추출 불가능
                            </button>
                            <p className="text-xs text-orange-400 mt-2">
                              <i className="ri-alert-line mr-1"></i>
                              Instagram/Facebook은 썸네일 자동 추출이 지원되지
                              않습니다. 위 이미지로 썸네일을 직접 등록해주세요.
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    <p className="text-xs text-gray-400">
                      <i className="ri-information-line mr-1"></i>
                      포스터 이미지는 이벤트 배너와 상세보기에 표시됩니다.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    영상 URL (선택사항)
                  </label>
                  <div className="space-y-2">
                    {/* 영상 프리뷰 */}
                    {editVideoPreview.provider && editVideoPreview.embedUrl && (
                      <div className="relative">
                        <div className="flex items-center gap-2 text-sm text-green-400 mb-2">
                          <i className="ri-check-line"></i>
                          <span>영상 인식됨 - 빌보드에서 재생됩니다</span>
                        </div>
                        <div
                          className="relative w-full"
                          style={{ paddingTop: "56.25%" }}
                        >
                          <iframe
                            src={editVideoPreview.embedUrl}
                            className="absolute top-0 left-0 w-full h-full rounded-lg"
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
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                        >
                          영상 삭제
                        </button>
                      </div>
                    )}
                    
                    {/* 영상 URL 입력창 - 항상 표시 */}
                    <div>
                      <label className="block text-gray-300 text-xs mb-1">
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
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="YouTube 링크만 가능"
                      />
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-400">
                        <i className="ri-information-line mr-1"></i>
                        영상은 전면 빌보드에서 자동재생됩니다.
                      </p>
                      <p className="text-xs text-green-400">
                        <i className="ri-check-line mr-1"></i>
                        <strong>YouTube만 지원:</strong> 썸네일 자동 추출 + 영상
                        재생 가능
                      </p>
                      <p className="text-xs text-red-400">
                        <i className="ri-close-line mr-1"></i>
                        <strong>Instagram, Vimeo는 지원하지 않습니다</strong>
                      </p>
                    </div>
                    {editFormData.videoUrl && !editVideoPreview.provider && (
                      <p className="text-xs text-red-400 mt-1">
                        <i className="ri-alert-line mr-1"></i>
                        YouTube URL만 지원합니다. 인스타그램, 비메오는 사용할 수
                        없습니다.
                      </p>
                    )}
                  </div>
                </div>

                {/* 등록자 정보 (관리자 전용, 비공개) - 최하단 */}
                <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-lock-line text-orange-400 text-sm"></i>
                    <h3 className="text-orange-400 text-xs font-bold">
                      등록자 정보 (비공개 - 관리자만 확인 가능)
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-orange-300 text-xs font-medium mb-1">
                        등록자 이름 <span className="text-red-400">*필수</span>
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
                        className="w-full bg-gray-800 border border-orange-700/30 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                        placeholder="등록자 이름"
                      />
                    </div>
                    <div>
                      <label className="block text-orange-300 text-xs font-medium mb-1">
                        등록자 전화번호{" "}
                        <span className="text-red-400">*필수</span>
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
                        className="w-full bg-gray-800 border border-orange-700/30 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                        placeholder="010-0000-0000"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-orange-300/80 mt-2">
                    <i className="ri-information-line mr-1"></i>
                    수정 등 문제가 있을 경우 연락받으실 번호입니다
                  </p>
                </div>

              </form>
            </div>

            {/* 하단 고정 버튼 */}
            <div className="sticky bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (eventToEdit) {
                      handleDeleteClick(eventToEdit);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                >
                  삭제
                </button>
                <div className="flex-1 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEventToEdit(null);
                      setEditVideoPreview({ provider: null, embedUrl: null });
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    form="edit-event-form"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap text-sm"
                  >
                    수정 완료
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePickerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">
                  {showDatePickerModal === "start"
                    ? "시작일 선택"
                    : "종료일 선택"}
                </h3>
                <button
                  onClick={() => setShowDatePickerModal(null)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    const newMonth = new Date(datePickerMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setDatePickerMonth(newMonth);
                  }}
                  className="text-gray-300 hover:text-white transition-colors cursor-pointer p-2"
                >
                  <i className="ri-arrow-left-s-line text-xl"></i>
                </button>
                <span className="text-white font-semibold">
                  {datePickerMonth.getFullYear()}년{" "}
                  {datePickerMonth.getMonth() + 1}월
                </span>
                <button
                  onClick={() => {
                    const newMonth = new Date(datePickerMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setDatePickerMonth(newMonth);
                  }}
                  className="text-gray-300 hover:text-white transition-colors cursor-pointer p-2"
                >
                  <i className="ri-arrow-right-s-line text-xl"></i>
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Weekday Headers */}
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                  <div
                    key={day}
                    className="text-center text-gray-400 text-sm py-2"
                  >
                    {day}
                  </div>
                ))}

                {/* Calendar Days */}
                {(() => {
                  const year = datePickerMonth.getFullYear();
                  const month = datePickerMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const days = [];

                  // Empty cells before first day
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className="p-2"></div>);
                  }

                  // Actual days
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    const dateStr = formatDateForInput(date);
                    const isSelected =
                      showDatePickerModal === "start"
                        ? editFormData.start_date === dateStr
                        : editFormData.end_date === dateStr;
                    const isDisabled =
                      showDatePickerModal === "end" &&
                      !!editFormData.start_date &&
                      dateStr < editFormData.start_date;

                    days.push(
                      <button
                        key={day}
                        onClick={() => {
                          if (!isDisabled) {
                            if (showDatePickerModal === "start") {
                              setEditFormData((prev) => ({
                                ...prev,
                                start_date: dateStr,
                                end_date:
                                  !prev.end_date || prev.end_date < dateStr
                                    ? dateStr
                                    : prev.end_date,
                              }));
                            } else {
                              setEditFormData((prev) => ({
                                ...prev,
                                end_date: dateStr,
                              }));
                            }
                            // 달력 이동
                            if (onMonthChange) {
                              onMonthChange(date);
                            }
                            setShowDatePickerModal(null);
                          }
                        }}
                        disabled={isDisabled}
                        className={`p-2 rounded-lg text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : isDisabled
                              ? "text-gray-600 cursor-not-allowed"
                              : "text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {day}
                      </button>,
                    );
                  }

                  return days;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal - Sticky Header */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
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
          <div
            className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] overflow-hidden border-2 relative flex flex-col"
            style={{ borderColor: "rgb(255 191 19)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 스크롤 가능한 전체 영역 */}
            <div 
              className="overflow-y-auto flex-1"
              style={{ 
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* 이미지 영역 (스크롤과 함께 사라짐) */}
              <div
                className={`relative w-full ${selectedEvent.image_medium || selectedEvent.image || getEventThumbnail(selectedEvent, defaultThumbnailClass, defaultThumbnailEvent) ? "bg-black" : "bg-cover bg-center"}`}
                style={{
                  height: "256px",
                  ...(!(
                    selectedEvent.image_medium ||
                    selectedEvent.image ||
                    getEventThumbnail(
                      selectedEvent,
                      defaultThumbnailClass,
                      defaultThumbnailEvent,
                    )
                  )
                    ? { backgroundImage: "url(/grunge.png)" }
                    : {}),
                }}
              >
                {(() => {
                  const detailImageUrl =
                    selectedEvent.image_medium ||
                    selectedEvent.image ||
                    getEventThumbnail(
                      selectedEvent,
                      defaultThumbnailClass,
                      defaultThumbnailEvent,
                    );
                  const isDefaultThumbnail =
                    !selectedEvent.image_medium &&
                    !selectedEvent.image &&
                    detailImageUrl;

                  if (detailImageUrl) {
                    return (
                      <>
                        <img
                          src={detailImageUrl}
                          alt={selectedEvent.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        {isDefaultThumbnail && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-white/50 text-6xl font-bold">
                              {selectedEvent.category === "class"
                                ? "강습"
                                : "행사"}
                            </span>
                          </div>
                        )}
                        {/* 크게보기 버튼 */}
                        <button
                          onClick={() => setShowFullscreenImage(true)}
                          className="absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white px-3 py-2 rounded-lg text-xs backdrop-blur-sm transition-colors cursor-pointer"
                        >
                          <i className="ri-zoom-in-line mr-1"></i>
                          크게 보기
                        </button>
                      </>
                    );
                  }

                  return (
                    <>
                      <div
                        className={`absolute inset-0 ${selectedEvent.category === "class" ? "bg-purple-500/30" : "bg-blue-500/30"}`}
                      ></div>
                      <span className="absolute inset-0 flex items-center justify-center text-white/10 text-6xl font-bold">
                        {selectedEvent.category === "class" ? "강습" : "행사"}
                      </span>
                    </>
                  );
                })()}

                {/* 카테고리 배지 - 좌측 하단 */}
                <div
                  className={`absolute bottom-4 left-4 px-3 py-1 text-white text-sm font-bold rounded-lg ${selectedEvent.category === "class" ? "bg-purple-600" : "bg-[#242424]"}`}
                >
                  {selectedEvent.category === "class" ? "강습" : "행사"}
                </div>
              </div>

              {/* 제목 - Sticky Header */}
              <div
                className="sticky top-0 z-40 bg-gray-800 border-b border-gray-700"
                style={{
                  padding: "16px",
                }}
              >
                <h2 className="text-xl font-bold text-white leading-tight break-words">
                  {selectedEvent.title}
                </h2>
              </div>

              {/* 세부 정보 */}
              <div className="p-4 space-y-3 bg-gray-800 overflow-x-hidden">
                <div className="flex items-center space-x-3 text-gray-300">
                  <i className="ri-calendar-line text-blue-400 text-xl"></i>
                  <span>
                    {(() => {
                      // 특정 날짜 모드: event_dates 배열이 있으면 개별 날짜 표시
                      if (
                        selectedEvent.event_dates &&
                        selectedEvent.event_dates.length > 0
                      ) {
                        const dates = selectedEvent.event_dates.map(
                          (dateStr) => new Date(dateStr),
                        );
                        const firstDate = dates[0];
                        const year = firstDate.getFullYear();
                        const month = firstDate.toLocaleDateString("ko-KR", {
                          month: "long",
                        });

                        // 같은 년월인지 확인
                        const sameYearMonth = dates.every(
                          (d) =>
                            d.getFullYear() === year &&
                            d.toLocaleDateString("ko-KR", { month: "long" }) ===
                              month,
                        );

                        if (sameYearMonth) {
                          // 같은 년월: "2025년 10월 11일, 25일, 31일"
                          const days = dates
                            .map((d) => d.getDate())
                            .join("일, ");
                          return `${year}년 ${month} ${days}일`;
                        } else {
                          // 다른 년월: "10/11, 11/25, 12/31"
                          return dates
                            .map((d) => `${d.getMonth() + 1}/${d.getDate()}`)
                            .join(", ");
                        }
                      }

                      // 연속 기간 모드
                      const startDate =
                        selectedEvent.start_date || selectedEvent.date;
                      const endDate = selectedEvent.end_date;

                      if (!startDate) return "날짜 미정";

                      const start = new Date(startDate);
                      const startYear = start.getFullYear();
                      const startMonth = start.toLocaleDateString("ko-KR", {
                        month: "long",
                      });
                      const startDay = start.getDate();

                      if (endDate && endDate !== startDate) {
                        const end = new Date(endDate);
                        const endYear = end.getFullYear();
                        const endMonth = end.toLocaleDateString("ko-KR", {
                          month: "long",
                        });
                        const endDay = end.getDate();

                        if (startYear === endYear && startMonth === endMonth) {
                          return `${startYear}년 ${startMonth} ${startDay}~${endDay}일`;
                        } else if (startYear === endYear) {
                          return `${startYear}년 ${startMonth} ${startDay}일~${endMonth} ${endDay}일`;
                        } else {
                          return `${startYear}년 ${startMonth} ${startDay}일~${endYear}년 ${endMonth} ${endDay}일`;
                        }
                      }

                      return `${startYear}년 ${startMonth} ${startDay}일`;
                    })()}
                  </span>
                </div>

                {selectedEvent.organizer && (
                  <div className="flex items-center space-x-3 text-gray-300">
                    <i className="ri-user-line text-blue-400 text-xl"></i>
                    <span>{selectedEvent.organizer}</span>
                  </div>
                )}

                {selectedEvent.location && (
                  <div className="flex items-center space-x-3 text-gray-300">
                    <i className="ri-map-pin-line text-blue-400 text-xl"></i>
                    <div className="flex items-center gap-1">
                      <span>{selectedEvent.location}</span>
                      {selectedEvent.location_link && (
                        <a
                          href={selectedEvent.location_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-blue-600/20 rounded transition-colors"
                          title="지도 보기"
                        >
                          <i className="ri-external-link-line text-blue-400 text-lg"></i>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="flex items-start space-x-3 text-gray-300">
                      <i className="ri-file-text-line text-blue-400 text-xl flex-shrink-0 mt-0.5"></i>
                      <div className="flex-1 min-w-0">
                        {/* <p className="text-sm text-gray-400 mb-1 font-medium">내용</p> */}
                        <p className="whitespace-pre-wrap leading-relaxed break-words overflow-wrap-anywhere">
                          {selectedEvent.description
                            .split(/(\bhttps?:\/\/[^\s]+)/g)
                            .map((part, idx) => {
                              if (part.match(/^https?:\/\//)) {
                                return (
                                  <a
                                    key={idx}
                                    href={part}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer break-all"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {part}
                                  </a>
                                );
                              }
                              return <span key={idx}>{part}</span>;
                            })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedEvent.contact &&
                  (() => {
                    const contactInfos = parseMultipleContacts(
                      selectedEvent.contact,
                    );

                    return (
                      <div className="space-y-2">
                        <span className="text-sm text-gray-400 block">
                          문의
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {contactInfos.map((contactInfo, index) => {
                            const handleContactClick = async () => {
                              if (contactInfo.link) {
                                window.open(contactInfo.link, "_blank");
                              } else {
                                try {
                                  await copyToClipboard(contactInfo.value);
                                  alert(`복사되었습니다: ${contactInfo.value}`);
                                } catch (err) {
                                  console.error("복사 실패:", err);
                                  alert("복사에 실패했습니다.");
                                }
                              }
                            };

                            return (
                              <button
                                key={index}
                                onClick={handleContactClick}
                                className="flex items-center gap-2 bg-green-600/20 hover:bg-green-600/40 border border-green-600/50 text-gray-200 px-3 py-2 rounded-lg transition-colors group"
                              >
                                <i
                                  className={`${contactInfo.icon} text-green-400 text-lg`}
                                ></i>
                                <div className="text-left">
                                  <div className="text-sm font-medium">
                                    {contactInfo.displayText}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {contactInfo.link
                                      ? "탭하여 열기"
                                      : "탭하여 복사"}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                {/* 관리자 전용: 등록자 정보 */}
                {isAdminMode &&
                  (selectedEvent.organizer_name ||
                    selectedEvent.organizer_phone) && (
                    <div className="pt-3 border-t border-gray-700 space-y-2">
                      <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                        <i className="ri-admin-line"></i>
                        <span>등록자 정보 (관리자 전용)</span>
                      </div>
                      {selectedEvent.organizer_name && (
                        <div className="flex items-center space-x-3 text-gray-300">
                          <i className="ri-user-star-line text-red-400 text-xl"></i>
                          <span>{selectedEvent.organizer_name}</span>
                        </div>
                      )}
                      {selectedEvent.organizer_phone && (
                        <div className="flex items-center space-x-3 text-gray-300">
                          <i className="ri-phone-line text-red-400 text-xl"></i>
                          <span>{selectedEvent.organizer_phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                {/* 추가 링크 */}
                {selectedEvent.link1 && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="flex items-center gap-3">
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors cursor-pointer"
                      >
                        <i className="ri-external-link-line text-lg"></i>
                        <span className="font-medium">
                          {selectedEvent.link_name1 || "바로가기"}
                        </span>
                      </a>
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 bg-white p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                        title="QR 코드로 바로가기"
                      >
                        <QRCodeSVG
                          value={selectedEvent.link1}
                          size={64}
                          level="M"
                          includeMargin={false}
                        />
                      </a>
                    </div>
                  </div>
                )}

                {/* 등록 날짜 (관리자만) */}
                {isAdminMode && selectedEvent.created_at && (
                  <div className="pt-3 border-t border-gray-700">
                    <span className="text-xs text-gray-500">
                      등록:{" "}
                      {new Date(selectedEvent.created_at).toLocaleDateString(
                        "ko-KR",
                        {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* 하단 고정 버튼 영역 */}
            <div className="border-t border-gray-700 bg-gray-800 p-4 flex gap-3 justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(selectedEvent, e);
                }}
                className="bg-black/30 hover:bg-black/50 text-yellow-400 hover:text-yellow-300 w-12 h-12 rounded-lg transition-all cursor-pointer backdrop-blur-sm flex items-center justify-center"
                title="이벤트 수정"
              >
                <i className="ri-edit-line text-2xl"></i>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeModal();
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white w-12 h-12 rounded-lg transition-all cursor-pointer shadow-lg flex items-center justify-center"
                title="닫기"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 풀스크린 이미지 모달 */}
      {showFullscreenImage &&
        selectedEvent &&
        (selectedEvent.image_full ||
          selectedEvent.image ||
          getEventThumbnail(
            selectedEvent,
            defaultThumbnailClass,
            defaultThumbnailEvent,
          )) && (
          <div
            className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[60] p-4"
            onClick={() => setShowFullscreenImage(false)}
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
            <button
              onClick={() => setShowFullscreenImage(false)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors cursor-pointer backdrop-blur-sm"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
            <img
              src={
                selectedEvent.image_full ||
                selectedEvent.image ||
                getEventThumbnail(
                  selectedEvent,
                  defaultThumbnailClass,
                  defaultThumbnailEvent,
                )
              }
              alt={selectedEvent.title}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

      {/* 이미지 크롭 모달 */}
      <ImageCropModal
        isOpen={showEditCropModal}
        imageUrl={editCropImageUrl}
        onClose={() => setShowEditCropModal(false)}
        onCropComplete={handleEditCropComplete}
        onDiscard={handleEditCropDiscard}
        onRestoreOriginal={handleEditRestoreOriginal}
        hasOriginal={!!editOriginalImageFile}
        fileName="cropped-edit-image.jpg"
      />

      {/* 썸네일 선택 모달 */}
      {showThumbnailSelector && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}
        >
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90svh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-white">썸네일 선택</h2>
              <button
                onClick={() => {
                  setShowThumbnailSelector(false);
                  setThumbnailOptions([]);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6">
              <p className="text-gray-400 text-sm mb-4">
                원하는 썸네일을 선택하세요. YouTube 쇼츠도 지원됩니다.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {thumbnailOptions.map((option, index) => (
                  <div
                    key={index}
                    onClick={() => handleEditOpenCropForThumbnail(option.url)}
                    className="cursor-pointer group"
                  >
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 border-2 border-gray-700 group-hover:border-blue-500 transition-colors">
                      <img
                        src={option.url}
                        alt={option.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                        <i className="ri-checkbox-circle-fill text-4xl text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                      </div>
                    </div>
                    <p className="text-center text-sm text-gray-300 mt-2">
                      {option.label}
                    </p>
                    {option.quality === "high" && (
                      <span className="block text-center text-xs text-green-400 mt-1">
                        고화질
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
