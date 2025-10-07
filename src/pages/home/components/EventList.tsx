import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import PracticeRoomModal from "../../../components/PracticeRoomModal";
import { getEventColor } from "../../../utils/eventColors";

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface EventListProps {
  selectedDate: Date | null;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  currentMonth?: Date;
  refreshTrigger?: number;
  isAdminMode?: boolean;
  viewMode?: "month" | "year";
  onEventHover?: (eventId: number | null) => void;
  showSearchModal?: boolean;
  setShowSearchModal?: (show: boolean) => void;
  showSortModal?: boolean;
  setShowSortModal?: (show: boolean) => void;
  sortBy?: "random" | "time" | "title" | "newest";
  setSortBy?: (sort: "random" | "time" | "title" | "newest") => void;
  showPracticeRoomModal?: boolean;
  setShowPracticeRoomModal?: (show: boolean) => void;
  highlightEventId?: number | null;
  onHighlightComplete?: () => void;
}

export default function EventList({
  selectedDate,
  selectedCategory,
  onCategoryChange,
  currentMonth,
  refreshTrigger,
  isAdminMode = false,
  viewMode = "month",
  onEventHover,
  showSearchModal: externalShowSearchModal,
  setShowSearchModal: externalSetShowSearchModal,
  showSortModal: externalShowSortModal,
  setShowSortModal: externalSetShowSortModal,
  sortBy: externalSortBy,
  setSortBy: externalSetSortBy,
  showPracticeRoomModal: externalShowPracticeRoomModal,
  setShowPracticeRoomModal: externalSetShowPracticeRoomModal,
  highlightEventId,
  onHighlightComplete,
}: EventListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
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

  const [internalShowPracticeRoomModal, setInternalShowPracticeRoomModal] = useState(false);

  const showSearchModal = externalShowSearchModal ?? internalShowSearchModal;
  const setShowSearchModal =
    externalSetShowSearchModal ?? setInternalShowSearchModal;
  const showSortModal = externalShowSortModal ?? internalShowSortModal;
  const setShowSortModal = externalSetShowSortModal ?? setInternalShowSortModal;
  const sortBy = externalSortBy ?? internalSortBy;
  const setSortBy = externalSetSortBy ?? setInternalSortBy;
  const showPracticeRoomModal = externalShowPracticeRoomModal ?? internalShowPracticeRoomModal;
  const setShowPracticeRoomModal = externalSetShowPracticeRoomModal ?? setInternalShowPracticeRoomModal;
  const [editFormData, setEditFormData] = useState({
    title: "",
    time: "",
    location: "",
    category: "",
    organizer: "",
    link1: "",
    link2: "",
    link3: "",
    linkName1: "",
    linkName2: "",
    linkName3: "",
    image: "",
    start_date: "",
    end_date: "",
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>("");

  // 이벤트 정렬 함수
  const sortEvents = (eventsToSort: Event[], sortType: string) => {
    const eventsCopy = [...eventsToSort];

    switch (sortType) {
      case "random":
        // 랜덤 정렬 - Fisher-Yates 알고리즘 사용
        for (let i = eventsCopy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [eventsCopy[i], eventsCopy[j]] = [eventsCopy[j], eventsCopy[i]];
        }
        return eventsCopy;
      case "time":
        // 시간순 정렬 (날짜 + 시간)
        return eventsCopy.sort((a, b) => {
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
        return eventsCopy.sort((a, b) => a.title.localeCompare(b.title, "ko"));
      case "newest":
        // 최신순 정렬 (created_at 기준)
        return eventsCopy.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
      default:
        return eventsCopy;
    }
  };

  // 검색 자동완성을 위한 이벤트 데이터에서 키워드 추출
  const generateSearchSuggestions = (query: string) => {
    if (!query.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    events.forEach((event) => {
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
          // 해당 단어로 실제 검색 결과가 있는지 확인
          const hasResults = events.some(
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

    // 검색 결과가 실제로 있는 제안만 필터링
    const validSuggestions = Array.from(suggestions).filter((suggestion) => {
      const suggestionLower = suggestion.toLowerCase();
      return events.some(
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
    setSearchTerm(searchQuery);
    setShowSearchModal(false);
    setSearchQuery("");
    setSearchSuggestions([]);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setSearchTerm(suggestion);
    setShowSearchModal(false);
    setSearchSuggestions([]);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setSearchQuery("");
    setSearchSuggestions([]);
  };

  const handleSortChange = (
    newSortBy: "random" | "time" | "title" | "newest",
  ) => {
    setSortBy(newSortBy);
    setShowSortModal(false);
  };

  const getSortIcon = () => {
    return "ri-sort-desc";
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case "random":
        return "랜덤";
      case "time":
        return "시간순";
      case "title":
        return "제목순";
      default:
        return "정렬";
    }
  };

  const categories = [
    {
      id: "all",
      name: currentMonth
        ? viewMode === "year"
          ? `${currentMonth.getFullYear()} 전체`
          : `${currentMonth.getMonth() + 1}월 전체`
        : "모든 이벤트",
      icon: "ri-calendar-line",
    },
    { id: "class", name: "강습", icon: "ri-book-line" },
    { id: "event", name: "행사", icon: "ri-calendar-event-line" },
    { id: "practice", name: "연습실", icon: "ri-home-4-line" },
  ];

  const sortOptions = [
    { id: "random", name: "랜덤", icon: "ri-shuffle-line" },
    { id: "time", name: "시간순", icon: "ri-time-line" },
    { id: "title", name: "제목순", icon: "ri-sort-alphabet-asc" },
    { id: "newest", name: "최신순", icon: "ri-calendar-line" },
  ];

  // 이벤트 데이터 로드
  useEffect(() => {
    fetchEvents();
  }, [currentMonth, refreshTrigger]);

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
    if (!highlightEventId) {
      console.log("하이라이트 없음");
      return;
    }

    console.log("하이라이트 ID:", highlightEventId);
    let hasScrolled = false;

    // 이벤트 카드 찾기
    const eventElement = document.querySelector(
      `[data-event-id="${highlightEventId}"]`,
    ) as HTMLElement;
    
    console.log("찾은 요소:", eventElement);
    
    if (eventElement) {
      // 스크롤 - 배너 최상단-2px가 분류 컨테이너 바로 아래에 붙도록
      const scrollToElement = () => {
        if (hasScrolled) return;
        hasScrolled = true;

        // 스크롤 컨테이너 찾기 (overflow-y-auto를 가진 부모)
        const scrollContainer = document.querySelector(".overflow-y-auto");
        
        if (!scrollContainer) {
          console.log("스크롤 컨테이너를 찾을 수 없습니다");
          return;
        }

        console.log("스크롤 컨테이너:", scrollContainer);

        // 분류 컨테이너(카테고리 패널)의 하단 위치 계산
        const header = document.querySelector("header");
        const calendar = document.querySelector("[data-calendar]");
        
        let fixedAreaHeight = 0;
        if (header) fixedAreaHeight += header.offsetHeight;
        if (calendar) fixedAreaHeight += calendar.offsetHeight;
        fixedAreaHeight += 95; // 카테고리 패널 높이

        console.log("고정 영역 높이:", fixedAreaHeight);

        // 요소의 컨테이너 내 상대 위치 계산
        const containerTop = scrollContainer.getBoundingClientRect().top;
        const elementTop = eventElement.getBoundingClientRect().top;
        const relativePosition = elementTop - containerTop;

        // 현재 스크롤 위치에서 목표 위치 계산
        const targetScroll = scrollContainer.scrollTop + relativePosition - 10; // 10px 위쪽 여유

        console.log("스크롤 위치:", targetScroll);

        scrollContainer.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      };

      // 자동 스크롤 1회 실행
      scrollToElement();

      // 모든 사용자 입력 감지하여 하이라이트 해제
      const handleUserInput = () => {
        if (onHighlightComplete) {
          onHighlightComplete();
        }
      };

      // 여러 이벤트 리스너 등록 (클릭, 스크롤, 휠, 키보드, 터치)
      const events = ["click", "wheel", "keydown", "touchstart", "touchmove"];
      
      // 스크롤 후 약간 딜레이를 두고 리스너 등록 (자동 스크롤과 겹치지 않도록)
      const listenerTimer = setTimeout(() => {
        events.forEach((event) => {
          window.addEventListener(event, handleUserInput);
        });
      }, 100);

      // 3초 후 하이라이트 자동 해제
      const autoTimer = setTimeout(() => {
        if (onHighlightComplete) {
          onHighlightComplete();
        }
      }, 3000);

      return () => {
        clearTimeout(listenerTimer);
        clearTimeout(autoTimer);
        events.forEach((event) => {
          window.removeEventListener(event, handleUserInput);
        });
      };
    }
  }, [highlightEventId, onHighlightComplete]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        setEvents(data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 필터링된 이벤트 (useMemo로 캐싱하여 불필요한 재필터링 방지)
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // 날짜가 선택된 경우
      if (selectedDate) {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        const startDate = event.start_date || event.date || "";
        const endDate = event.end_date || event.date || "";
        const matchesDate =
          startDate &&
          endDate &&
          selectedDateString >= startDate &&
          selectedDateString <= endDate;

        // 날짜가 선택되었을 때도 사용자가 카테고리를 선택하면 필터 적용
        const matchesCategory =
          selectedCategory === "all" || event.category === selectedCategory;

        const matchesSearch =
          event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.location.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesDate && matchesCategory && matchesSearch;
      }

      // 날짜가 선택되지 않은 경우 기존 로직 사용
      const matchesCategory =
        selectedCategory === "all" || event.category === selectedCategory;
      const matchesSearch =
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesDate = true;
      if (currentMonth) {
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
            const yearStart = new Date(currentMonth.getFullYear(), 0, 1);
            const yearEnd = new Date(currentMonth.getFullYear(), 11, 31);
            matchesDate =
              eventStartDate <= yearEnd && eventEndDate >= yearStart;
          } else {
            // 월간 보기: 현재 월의 첫날과 마지막 날
            const monthStart = new Date(
              currentMonth.getFullYear(),
              currentMonth.getMonth(),
              1,
            );
            const monthEnd = new Date(
              currentMonth.getFullYear(),
              currentMonth.getMonth() + 1,
              0,
            );

            // 이벤트가 현재 월과 겹치는지 확인
            // 이벤트 시작일 <= 월 마지막 날 AND 이벤트 종료일 >= 월 첫 날
            matchesDate =
              eventStartDate <= monthEnd && eventEndDate >= monthStart;
          }
        }
      }

      return matchesCategory && matchesSearch && matchesDate;
    });
  }, [
    events,
    selectedDate,
    selectedCategory,
    searchTerm,
    currentMonth,
    viewMode,
  ]);

  // 필터링된 이벤트를 정렬 (useMemo로 캐싱하여 불필요한 재정렬 방지)
  const sortedEvents = useMemo(() => {
    return sortEvents(filteredEvents, sortBy);
  }, [filteredEvents, sortBy]);

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = (event: Event, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isAdminMode) {
      // 관리자 모드에서는 바로 수정 모달 열기
      setEventToEdit(event);
      setEditFormData({
        title: event.title,
        time: event.time,
        location: event.location,
        category: event.category,
        organizer: event.organizer,
        link1: event.link1 || "",
        link2: event.link2 || "",
        link3: event.link3 || "",
        linkName1: event.link_name1 || "",
        linkName2: event.link_name2 || "",
        linkName3: event.link_name3 || "",
        image: event.image || "",
        start_date: event.start_date || event.date || "",
        end_date: event.end_date || event.date || "",
      });
      setEditImagePreview(event.image || "");
      setEditImageFile(null);
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
    if (isAdminMode) {
      // 관리자 모드에서는 바로 삭제
      if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
        deleteEvent(event.id);
        setSelectedEvent(null); // 상세 모달 닫기
        setShowEditModal(false); // 수정 모달 닫기
        setShowPasswordModal(false); // 비밀번호 모달 닫기
        setEventToEdit(null); // 수정 이벤트 초기화
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
        }
      } else if (password) {
        alert("비밀번호가 올바르지 않습니다.");
      }
    }
  };

  const deleteEvent = async (eventId: number) => {
    try {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) {
        console.error("Error deleting event:", error);
        alert("이벤트 삭제 중 오류가 발생했습니다.");
      } else {
        alert("이벤트가 삭제되었습니다.");
        fetchEvents();
        // 달력 업데이트를 위해 상위 컴포넌트에 알림
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eventDeleted"));
        }
      }
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 삭제 중 오류가 발생했습니다.");
    }
  };

  const deleteAllEvents = async () => {
    if (
      !confirm(
        "정말로 모든 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      )
    ) {
      return;
    }

    if (!confirm("한 번 더 확인합니다. 정말 모든 이벤트를 삭제하시겠습니까?")) {
      return;
    }

    try {
      const { error } = await supabase.from("events").delete().gte("id", 0);

      if (error) {
        console.error("Error deleting all events:", error);
        alert("모든 이벤트 삭제 중 오류가 발생했습니다.");
      } else {
        alert("모든 이벤트가 삭제되었습니다.");
        fetchEvents();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eventDeleted"));
        }
      }
    } catch (error) {
      console.error("Error:", error);
      alert("모든 이벤트 삭제 중 오류가 발생했습니다.");
    }
  };

  const handlePasswordSubmit = () => {
    if (eventToEdit && eventPassword === eventToEdit.password) {
      setEditFormData({
        title: eventToEdit.title,
        time: eventToEdit.time,
        location: eventToEdit.location,
        category: eventToEdit.category,
        organizer: eventToEdit.organizer,
        link1: eventToEdit.link1 || "",
        link2: eventToEdit.link2 || "",
        link3: eventToEdit.link3 || "",
        linkName1: eventToEdit.link_name1 || "",
        linkName2: eventToEdit.link_name2 || "",
        linkName3: eventToEdit.link_name3 || "",
        image: eventToEdit.image || "",
        start_date: eventToEdit.start_date || eventToEdit.date || "",
        end_date: eventToEdit.end_date || eventToEdit.date || "",
      });
      setEditImagePreview(eventToEdit.image || "");
      setEditImageFile(null);
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
      const previewUrl = URL.createObjectURL(file);
      setEditImagePreview(previewUrl);
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
      let imageUrl = editFormData.image;

      // 새 이미지가 업로드되었으면 Supabase Storage에 업로드 시도
      if (editImageFile) {
        const fileExt = editImageFile.name.split(".").pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `event-posters/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("images")
          .upload(filePath, editImageFile);

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          alert("이미지 업로드 중 오류가 발생했습니다.");
          return;
        }

        const { data } = supabase.storage.from("images").getPublicUrl(filePath);

        imageUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from("events")
        .update({
          title: editFormData.title,
          time: editFormData.time,
          location: editFormData.location,
          category: editFormData.category,
          description: '',
          organizer: editFormData.organizer,
          link1: editFormData.link1 || null,
          link2: editFormData.link2 || null,
          link3: editFormData.link3 || null,
          link_name1: editFormData.linkName1 || null,
          link_name2: editFormData.linkName2 || null,
          link_name3: editFormData.linkName3 || null,
          image: imageUrl,
          start_date: editFormData.start_date || null,
          end_date: editFormData.end_date || null,
        })
        .eq("id", eventToEdit.id);

      if (error) {
        console.error("Error updating event:", error);
        alert("이벤트 수정 중 오류가 발생했습니다.");
      } else {
        alert("이벤트가 수정되었습니다.");
        setShowEditModal(false);
        setEventToEdit(null);
        setEditImageFile(null);
        setEditImagePreview("");
        fetchEvents();
        // 달력 업데이트
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eventDeleted"));
        }
      }
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 수정 중 오류가 발생했습니다.");
    }
  };

  // 카테고리 버튼이 활성화되어야 하는지 확인하는 함수
  const isCategoryActive = (categoryId: string) => {
    // 날짜가 선택되었고 selectedCategory가 "all"일 때
    if (selectedDate && selectedCategory === "all") {
      // 해당 날짜에 실제로 이벤트가 있는지 확인
      const hasEvents = filteredEvents.length > 0;

      // 이벤트가 있을 때만 강습/행사 버튼 활성화
      if (categoryId === "all") {
        return false;
      } else if (
        (categoryId === "class" || categoryId === "event") &&
        hasEvents
      ) {
        return true;
      }
    }

    // 그 외의 경우는 현재 선택된 카테고리인지 확인
    return selectedCategory === categoryId;
  };

  // 새로운 카테고리 클릭 핸들러 (practice 방 추가)
  const handleCategoryClick = (categoryId: string) => {
    if (categoryId === "practice") {
      setShowPracticeRoomModal(true);
    } else {
      onCategoryChange(categoryId);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-none p-4">
        <div className="text-center py-8">
          <i className="ri-loader-4-line text-4xl text-gray-500 mb-4 animate-spin"></i>
          <p className="text-gray-400">이벤트를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="p-4"
        style={{
          margin: "14px",
          borderRadius: "11px",
          backgroundColor: "var(--event-list-outer-bg-color)",
        }}
      >
        {/* Events List */}
        <div>
          {sortedEvents.length > 0 ? (
            <>
              {/* Grid layout with 3 columns - poster ratio */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {sortedEvents.map((event) => {
                  const startDate = event.start_date || event.date || "";
                  const endDate = event.end_date || event.date || "";
                  const isMultiDay = startDate !== endDate;
                  const eventColor = isMultiDay
                    ? getEventColor(event.id)
                    : { bg: "bg-gray-500" };

                  const isHighlighted = highlightEventId === event.id;
                  const highlightBorderColor =
                    event.category === "class" ? "#9333ea" : "#2563eb"; // purple-600 : blue-600

                  return (
                    <div
                      key={event.id}
                      data-event-id={event.id}
                      onClick={() => handleEventClick(event)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#374151";
                        if (viewMode === "month" && onEventHover) {
                          onEventHover(event.id);
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--event-list-bg-color)";
                        if (viewMode === "month" && onEventHover) {
                          onEventHover(null);
                        }
                      }}
                      className={`rounded-xl overflow-hidden transition-all cursor-pointer relative border-2 ${
                        isHighlighted ? "" : "border-[#3d3d3d]"
                      }`}
                      style={{
                        backgroundColor: "var(--event-list-bg-color)",
                        borderColor: isHighlighted
                          ? highlightBorderColor
                          : undefined,
                        boxShadow: isHighlighted
                          ? `0 0 20px ${highlightBorderColor}`
                          : undefined,
                      }}
                    >
                      {/* 색상 배너 - 연속 일정은 고유 색상, 단일 일정은 회색 */}
                      <div
                        className={`absolute top-0 left-0 right-0 h-1 ${eventColor.bg}`}
                      ></div>

                      {/* 이미지와 제목 오버레이 */}
                      <div className="relative">
                        {event.image ? (
                          <img
                            src={event.image}
                            alt={event.title}
                            className="w-full aspect-[3/4] object-cover object-top"
                          />
                        ) : (
                          <div
                            className="w-full aspect-[3/4] flex items-center justify-center bg-cover bg-center relative"
                            style={{
                              backgroundImage: "url(/grunge.png)",
                            }}
                          >
                            <div
                              className={`absolute inset-0 ${event.category === "class" ? "bg-purple-500/30" : "bg-blue-500/30"}`}
                            ></div>
                            <span className="text-white/10 text-4xl font-bold relative">
                              {event.category === "class" ? "강습" : "행사"}
                            </span>
                          </div>
                        )}
                        {/* 왼쪽 상단 카테고리 배지 */}
                        <div
                          className={`absolute top-1 left-0 px-2 py-0.5 text-white text-[10px] font-bold ${event.category === "class" ? "bg-purple-600" : "bg-blue-600"}`}
                        >
                          {event.category === "class" ? "강습" : "행사"}
                        </div>
                        {/* 하단 그라데이션 오버레이 */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                          <h3 className="text-white text-xs font-bold leading-tight line-clamp-2">
                            {event.title}
                          </h3>
                        </div>
                      </div>

                      <div className="p-2">
                        <p className="text-xs text-gray-300 text-center">
                          {(() => {
                            const startDate = event.start_date || event.date;
                            const endDate = event.end_date || event.date;

                            if (!startDate) return "날짜 미정";

                            const formatDate = (dateStr: string) => {
                              const date = new Date(dateStr);
                              return `${date.getMonth() + 1}/${date.getDate()}`;
                            };

                            if (startDate !== endDate) {
                              return `${formatDate(startDate)} ~ ${formatDate(endDate || startDate)}`;
                            }
                            return formatDate(startDate);
                          })()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <i className="ri-calendar-line text-4xl text-gray-500 mb-4"></i>
              <p className="text-gray-400">
                {selectedDate && selectedCategory === "class"
                  ? "강습이 없습니다"
                  : selectedDate && selectedCategory === "event"
                    ? "행사가 없습니다"
                    : "해당 조건에 맞는 이벤트가 없습니다"}
              </p>
            </div>
          )}
        </div>
      </div>

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
                          className="w-full text-left bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-2 rounded-lg transition-colors cursor-pointer text-sm"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">이벤트 수정</h3>
            <p className="text-gray-300 mb-4">
              &quot;{eventToEdit.title}&quot; 이벤트를 수정하려면 비밀번호를
              입력하세요.
            </p>
            <input
              type="password"
              value={eventPassword}
              onChange={(e) => setEventPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handlePasswordSubmit();
                }
              }}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="이벤트 비밀번호"
              autoFocus
            />
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setEventPassword("");
                  setEventToEdit(null);
                }}
                className="flex-1 bg-gray-700 hover-bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 bg-blue-600 hover-bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && eventToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-white">이벤트 수정</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEventToEdit(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3">
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
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 text-sm"
                  >
                    {categories
                      .filter((cat) => cat.id === "class" || cat.id === "event")
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </div>

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
                          ? new Date(editFormData.end_date).toLocaleDateString(
                              "ko-KR",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              },
                            )
                          : "날짜 선택"}
                      </span>
                      <i className="ri-calendar-line"></i>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
                      장소
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
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
                      주최자
                    </label>
                    <input
                      type="text"
                      value={editFormData.organizer}
                      onChange={(e) =>
                        setEditFormData((prev) => ({
                          ...prev,
                          organizer: e.target.value,
                        }))
                      }
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    바로가기 링크
                  </label>
                  <div className="space-y-2">
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
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="링크 1 URL"
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
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="링크 1 이름"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="url"
                        value={editFormData.link2}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            link2: e.target.value,
                          }))
                        }
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="링크 2 URL"
                      />
                      <input
                        type="text"
                        value={editFormData.linkName2}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            linkName2: e.target.value,
                          }))
                        }
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-5
                        text-sm"
                        placeholder="링크 2 이름"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="url"
                        value={editFormData.link3}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            link3: e.target.value,
                          }))
                        }
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="링크 3 URL"
                      />
                      <input
                        type="text"
                        value={editFormData.linkName3}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            linkName3: e.target.value,
                          }))
                        }
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-
                        none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="링크 3 이름"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    이벤트 이미지
                  </label>
                  <div className="space-y-2">
                    {editImagePreview && (
                      <div className="relative">
                        <img
                          src={editImagePreview}
                          alt="이벤트 이미지"
                          className="w-full h-48 object-cover rounded-lg"
                        />
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
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                        >
                          이미지 삭제
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditImageChange}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
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
                      }}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap text-sm"
                    >
                      수정 완료
                    </button>
                  </div>
                </div>
              </form>
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

      {/* Event Detail Modal - 새로운 세로 배치 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border-2" style={{ borderColor: 'rgb(61, 61, 61)' }}>
            {/* 상단 고정 버튼 - 우측 상단 */}
            <div className="absolute top-4 right-4 z-30 flex space-x-2">
              <button
                onClick={(e) => handleEditClick(selectedEvent, e)}
                className="bg-yellow-600/90 hover:bg-yellow-700 text-white p-2 rounded-full transition-colors cursor-pointer backdrop-blur-sm"
                title="이벤트 수정"
              >
                <i className="ri-edit-line text-xl"></i>
              </button>
              <button
                onClick={closeModal}
                className="bg-gray-700/90 hover:bg-gray-600 text-white p-2 rounded-full transition-colors cursor-pointer backdrop-blur-sm"
                title="닫기"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* 이미지 영역 - 클릭 시 풀스크린 */}
            <div
              className={`relative w-full h-64 flex-shrink-0 cursor-pointer ${selectedEvent.image ? "bg-black" : "bg-cover bg-center"}`}
              style={
                !selectedEvent.image
                  ? {
                      backgroundImage: "url(/grunge.png)",
                    }
                  : undefined
              }
              onClick={() => selectedEvent.image && setShowFullscreenImage(true)}
            >
              {selectedEvent.image ? (
                <>
                  <img
                    src={selectedEvent.image}
                    alt={selectedEvent.title}
                    className="w-full h-full object-cover"
                  />
                  {/* 이미지 확대 아이콘 */}
                  <div className="absolute top-4 left-4 bg-black/50 text-white px-2 py-1 rounded-lg text-xs backdrop-blur-sm">
                    <i className="ri-zoom-in-line mr-1"></i>
                    클릭하여 크게 보기
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`absolute inset-0 ${selectedEvent.category === "class" ? "bg-purple-500/30" : "bg-blue-500/30"}`}
                  ></div>
                  <span className="absolute inset-0 flex items-center justify-center text-white/10 text-6xl font-bold">
                    {selectedEvent.category === "class" ? "강습" : "행사"}
                  </span>
                </>
              )}

              {/* 카테고리 배지 - 좌측 하단 */}
              <div
                className={`absolute bottom-4 left-4 px-3 py-1 text-white text-sm font-bold rounded-lg ${selectedEvent.category === "class" ? "bg-purple-600" : "bg-blue-600"}`}
              >
                {selectedEvent.category === "class" ? "강습" : "행사"}
              </div>

              {/* 제목 - 이미지 위 그라데이션 오버레이 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-4 pt-16">
                <h2 className="text-2xl font-bold text-white leading-tight">
                  {selectedEvent.title}
                </h2>
              </div>
            </div>

            {/* 스크롤 가능한 컨텐츠 영역 */}
            <div className="flex-1 overflow-y-auto">
              {/* 세부 정보 */}
              <div className="p-4 space-y-3">
                <div className="flex items-center space-x-3 text-gray-300">
                  <i className="ri-calendar-line text-blue-400 text-xl"></i>
                  <span>
                    {(() => {
                      const startDate =
                        selectedEvent.start_date || selectedEvent.date;
                      const endDate = selectedEvent.end_date;

                      if (!startDate) return "날짜 미정";

                      const start = new Date(startDate);
                      const startMonth = start.toLocaleDateString("ko-KR", {
                        month: "long",
                      });
                      const startDay = start.getDate();

                      if (endDate && endDate !== startDate) {
                        const end = new Date(endDate);
                        const endMonth = end.toLocaleDateString("ko-KR", {
                          month: "long",
                        });
                        const endDay = end.getDate();

                        if (startMonth === endMonth) {
                          return `${startMonth} ${startDay}~${endDay}일`;
                        } else {
                          return `${startMonth} ${startDay}일~${endMonth} ${endDay}일`;
                        }
                      }

                      return `${startMonth} ${startDay}일`;
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
                    <span>{selectedEvent.location}</span>
                  </div>
                )}


                {/* 바로가기 링크 */}
                {(selectedEvent.link1 ||
                  selectedEvent.link2 ||
                  selectedEvent.link3) && (
                  <div className="pt-3 border-t border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      링크
                    </h3>
                    <div className="space-y-2">
                      {selectedEvent.link1 && (
                        <a
                          href={selectedEvent.link1}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-external-link-line"></i>
                          <span className="truncate">
                            {selectedEvent.link_name1 || "링크 1"}
                          </span>
                        </a>
                      )}
                      {selectedEvent.link2 && (
                        <a
                          href={selectedEvent.link2}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-external-link-line"></i>
                          <span className="truncate">
                            {selectedEvent.link_name2 || "링크 2"}
                          </span>
                        </a>
                      )}
                      {selectedEvent.link3 && (
                        <a
                          href={selectedEvent.link3}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-external-link-line"></i>
                          <span className="truncate">
                            {selectedEvent.link_name3 || "링크 3"}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* 등록 날짜 */}
                {selectedEvent.created_at && (
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
          </div>
        </div>
      )}

      {/* 풀스크린 이미지 모달 */}
      {showFullscreenImage && selectedEvent?.image && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowFullscreenImage(false)}
        >
          <button
            onClick={() => setShowFullscreenImage(false)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors cursor-pointer backdrop-blur-sm"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
          <img
            src={selectedEvent.image}
            alt={selectedEvent.title}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Practice Room Modal */}
      <PracticeRoomModal
        isOpen={showPracticeRoomModal}
        onClose={() => setShowPracticeRoomModal(false)}
        isAdminMode={isAdminMode}
      />
    </>
  );
}
