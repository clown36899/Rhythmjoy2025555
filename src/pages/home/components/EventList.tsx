import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import PracticeRoomModal from "../../../components/PracticeRoomModal";
import { getEventColor } from "../../../utils/eventColors";

interface EventListProps {
  selectedDate: Date | null;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  currentMonth?: Date;
  refreshTrigger?: number;
  isAdminMode?: boolean;
}

export default function EventList({
  selectedDate,
  selectedCategory,
  onCategoryChange,
  currentMonth,
  refreshTrigger,
  isAdminMode = false,
}: EventListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventPassword, setEventPassword] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">(
    "random",
  );
  const [showSortModal, setShowSortModal] = useState(false);
  const [showPracticeRoomModal, setShowPracticeRoomModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: "",
    time: "",
    location: "",
    category: "",
    description: "",
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
        // 최신순 정렬 (생성일 기준)
        return eventsCopy.sort((a, b) => {
          const dateStrA = a.created_at || a.start_date || a.date;
          const dateStrB = b.created_at || b.start_date || b.date;
          if (!dateStrA && !dateStrB) return 0;
          if (!dateStrA) return 1;
          if (!dateStrB) return -1;
          const dateA = new Date(dateStrA);
          const dateB = new Date(dateStrB);
          return dateB.getTime() - dateA.getTime();
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
      case "newest":
        return "최신순";
      default:
        return "정렬";
    }
  };

  const categories = [
    {
      id: "all",
      name: currentMonth
        ? `${currentMonth.getMonth() + 1}월 전체`
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
    { id: "newest", name: "최신순", icon: "ri-calendar-2-line" },
  ];

  const morningTimes = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];

  const afternoonTimes = [
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
    "22:30",
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

        const startDate = event.start_date || event.date || '';
        const endDate = event.end_date || event.date || '';
        const matchesDate = startDate && endDate && selectedDateString >= startDate && selectedDateString <= endDate;
        
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
          
          // 현재 월의 첫날과 마지막 날
          const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
          
          // 이벤트가 현재 월과 겹치는지 확인
          // 이벤트 시작일 <= 월 마지막 날 AND 이벤트 종료일 >= 월 첫 날
          matchesDate = eventStartDate <= monthEnd && eventEndDate >= monthStart;
        }
      }

      return matchesCategory && matchesSearch && matchesDate;
    });
  }, [events, selectedDate, selectedCategory, searchTerm, currentMonth]);

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
        description: event.description,
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
      }
    } else {
      // 일반 모드에서는 비밀번호 확인 후 삭제
      const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
      if (password && password === event.password) {
        if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
          deleteEvent(event.id);
          setSelectedEvent(null); // 상세 모달 닫기
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

  const handlePasswordSubmit = () => {
    if (eventToEdit && eventPassword === eventToEdit.password) {
      setEditFormData({
        title: eventToEdit.title,
        time: eventToEdit.time,
        location: eventToEdit.location,
        category: eventToEdit.category,
        description: eventToEdit.description,
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

  const handleTimeSelect = (time: string) => {
    setEditFormData((prev) => ({
      ...prev,
      time: time,
    }));
    setShowTimeModal(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToEdit) return;

    // 종료일이 시작일보다 빠르면 안됨
    if (editFormData.start_date && editFormData.end_date && editFormData.end_date < editFormData.start_date) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    try {
      let imageUrl = editFormData.image;

      // 새 이미지가 업로드되었으면 Supabase Storage에 업로드 시도
      if (editImageFile) {
        const fileExt = editImageFile.name.split('.').pop();
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

        const { data } = supabase.storage
          .from("images")
          .getPublicUrl(filePath);

        imageUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from("events")
        .update({
          title: editFormData.title,
          time: editFormData.time,
          location: editFormData.location,
          category: editFormData.category,
          description: editFormData.description,
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
      } else if ((categoryId === "class" || categoryId === "event") && hasEvents) {
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
      <div className="bg-gray-800 rounded-none lg:rounded-lg p-4 lg:p-6">
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
        className="bg-gray-800 p-4 lg:p-6"
        style={{ margin: "14px", borderRadius: "11px" }}
      >
        <div className="lg:mb-6">
          {/* 데스크톱에서도 제목 완전 제거 */}
          {isAdminMode && (
            <div className="mb-1">
              <span className="bg-red-600 text-white px-2 py-1 rounded text-sm">
                관리자 모드
              </span>
            </div>
          )}

          {/* Search Bar - Hidden on mobile */}
          <div className="relative mb-4 hidden lg:block">
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm"></i>
          </div>

          {/* Category Filter - Simplified for mobile */}
          <div className="flex items-center gap-2 lg:hidden mb-2">
            <div className="flex flex-wrap gap-2 flex-1">
              {categories.slice(0, 4).map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category.id)}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isCategoryActive(category.id)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className={`${category.icon} text-xs`}></i>
                  <span>{category.name}</span>
                </button>
              ))}
            </div>

            {/* 정렬 버튼 */}
            <button
              onClick={() => setShowSortModal(true)}
              className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <i className={`${getSortIcon()} text-sm`}></i>
            </button>

            {/* 검색 버튼 */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-search-line text-sm"></i>
            </button>
          </div>

          {/* 검색 결과 표시 (모바일) */}
          {searchTerm && (
            <div className="lg:hidden mb-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">검색:</span>
              <span className="text-xs text-blue-400 bg-blue-600/20 px-2 py-1 rounded">
                {searchTerm}
              </span>
              <button
                onClick={clearSearch}
                className="text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
          )}

          {/* Desktop Category Filter */}
          <div className="hidden lg:flex flex-wrap gap-2 items-center">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isCategoryActive(category.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className={`${category.icon} text-sm`}></i>
                <span>{category.name}</span>
              </button>
            ))}

            {/* 데스크톱 정렬 버튼 */}
            <button
              onClick={() => setShowSortModal(true)}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white ml-2"
            >
              <i className={`${getSortIcon()} text-sm`}></i>
              <span>{getSortLabel()}</span>
            </button>
          </div>
        </div>

        {/* Events List */}
        <div className="lg:space-y-4 lg:max-h-96 lg:overflow-y-auto">
          {sortedEvents.length > 0 ? (
            <>
              {/* Mobile: Grid layout with 3 columns - poster ratio */}
              <div className="grid grid-cols-3 gap-3 lg:hidden">
                {sortedEvents.map((event) => {
                  const startDate = event.start_date || event.date || '';
                  const endDate = event.end_date || event.date || '';
                  const isMultiDay = startDate !== endDate;
                  const eventColor = isMultiDay ? getEventColor(event.id) : { bg: 'bg-gray-500' };
                  
                  return (
                    <div
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className="bg-gray-700 rounded-xl overflow-hidden hover:bg-gray-600 transition-colors cursor-pointer relative"
                    >
                      {/* 색상 배너 - 연속 일정은 고유 색상, 단일 일정은 회색 */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${eventColor.bg} z-10`}></div>
                      <img
                        src={event.image}
                        alt={event.title}
                        className="w-full aspect-[3/4] object-cover object-top"
                      />
                      <div className="p-2">
                        <p className="text-xs text-gray-300 text-center">
                          {(event.start_date || event.date) 
                            ? new Date(event.start_date || event.date || '').toLocaleDateString()
                            : '날짜 미정'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: List layout */}
              <div className="hidden lg:block space-y-4">
                {sortedEvents.map((event) => {
                  const startDate = event.start_date || event.date || '';
                  const endDate = event.end_date || event.date || '';
                  const isMultiDay = startDate !== endDate;
                  const eventColor = isMultiDay ? getEventColor(event.id) : { bg: 'bg-gray-500' };
                  
                  return (
                    <div
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors cursor-pointer relative"
                    >
                      {/* 색상 배너 - 연속 일정은 고유 색상, 단일 일정은 회색 */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${eventColor.bg} rounded-l-lg`}></div>
                      <div className="flex space-x-4">
                        <img
                          src={event.image}
                          alt={event.title}
                          className="w-16 h-20 rounded-lg object-cover object-top"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">
                            {event.title}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-300 mb-2">
                            <div className="flex items-center space-x-1">
                              <i className="ri-calendar-line"></i>
                              <span>
                                {(event.start_date || event.date)
                                  ? new Date(event.start_date || event.date || '').toLocaleDateString()
                                  : '날짜 미정'}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <i className="ri-time-line"></i>
                              <span>{event.time}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1 text-sm text-gray-300">
                              <i className="ri-map-pin-line"></i>
                              <span>{event.location}</span>
                            </div>
                            <span className="text-blue-400 font-semibold">
                              {event.price}
                            </span>
                          </div>
                        </div>
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
                {selectedDate && selectedCategory === 'class' ? '강습이 없습니다' : 
                 selectedDate && selectedCategory === 'event' ? '행사가 없습니다' : 
                 '해당 조건에 맞는 이벤트가 없습니다'}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
                      시간
                    </label>
                    <div
                      onClick={() => setShowTimeModal(true)}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer hover:bg-gray-600 transition-colors flex items-center justify-between"
                    >
                      <span>{editFormData.time}</span>
                      <i className="ri-time-line"></i>
                    </div>
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
                      {categories.filter(cat => cat.id === 'class' || cat.id === 'event').map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={editFormData.start_date}
                      onChange={(e) => {
                        const newStartDate = e.target.value;
                        setEditFormData((prev) => ({
                          ...prev,
                          start_date: newStartDate,
                          // 종료일이 비어있거나 시작일보다 빠르면 시작일과 동일하게 설정
                          end_date: (!prev.end_date || prev.end_date < newStartDate) ? newStartDate : prev.end_date,
                        }));
                      }}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-xs font-medium mb-1">
                      종료일
                    </label>
                    <input
                      type="date"
                      value={editFormData.end_date}
                      onChange={(e) =>
                        setEditFormData((prev) => ({
                          ...prev,
                          end_date: e.target.value,
                        }))
                      }
                      min={editFormData.start_date}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
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

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    이벤트 설명
                  </label>
                  <div className="relative">
                    <textarea
                      value={editFormData.description}
                      onChange={(e) =>
                        setEditFormData((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      rows={isDescriptionExpanded ? 8 : 3}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-300 text-sm"
                      placeholder="이벤트에 대한 자세한 설명을 입력하세요"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setIsDescriptionExpanded(!isDescriptionExpanded)
                      }
                      className="absolute bottom-2 right-2 bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white p-1 rounded transition-colors cursor-pointer"
                      title={isDescriptionExpanded ? "축소" : "확장"}
                    >
                      <i
                        className={`ri-${isDescriptionExpanded ? "contract" : "expand"}-up-down-line text-sm`}
                      ></i>
                    </button>
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

      {/* 시간 선택 모달 */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[70] p-4 pt-10 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[70vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">시간 선택</h3>
                <button
                  onClick={() => setShowTimeModal(false)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* 오전 */}
                <div>
                  <h4 className="text-md font-semibold text-white mb-2">
                    오전
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {morningTimes.map((time) => (
                      <button
                        key={time}
                        onClick={() => handleTimeSelect(time)}
                        className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          editFormData.time === time
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 오후 */}
                <div>
                  <h4 className="text-md font-semibold text-white mb-2">
                    오후
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {afternoonTimes.map((time) => (
                      <button
                        key={time}
                        onClick={() => handleTimeSelect(time)}
                        className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          editFormData.time === time
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="relative h-full flex flex-col">
              {/* 상단 제목 영역 */}
              <div className="p-3 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white text-center overflow-hidden">
                  <span
                    className="block leading-tight whitespace-nowrap overflow-hidden"
                    style={{
                      fontSize:
                        Math.max(
                          12,
                          Math.min(24, 200 / selectedEvent.title.length),
                        ) + "px",
                      lineHeight: "1.2",
                    }}
                  >
                    {selectedEvent.title}
                  </span>
                </h2>
              </div>

              {/* 중단 영역 - 이미지와 기본 정보 */}
              <div className="flex h-80">
                {/* 왼쪽 이미지 - 배경색을 상세소개와 통일, 왼쪽 위로 붙임 */}
                <div className="w-1/2 bg-gray-800 flex items-start justify-start p-0">
                  <img
                    src={selectedEvent.image}
                    alt={selectedEvent.title}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                {/* 오른쪽 기본 정보 - 내부 여백 줄임 */}
                <div className="w-1/2 p-4 overflow-hidden">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3 text-gray-300 text-sm">
                      <i className="ri-calendar-line text-blue-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                      <span>
                        {(selectedEvent.start_date || selectedEvent.date)
                          ? new Date(selectedEvent.start_date || selectedEvent.date || '').toLocaleDateString(
                              "ko-KR",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                weekday: "long",
                              },
                            )
                          : '날짜 미정'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-gray-300 text-sm">
                      <i className="ri-time-line text-blue-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                      <span>{selectedEvent.time}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-gray-300 text-sm">
                      <i className="ri-user-line text-blue-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                      <span>{selectedEvent.organizer}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-gray-300 text-sm">
                      <i className="ri-map-pin-line text-blue-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                      <span>{selectedEvent.location}</span>
                    </div>

                    {/* 바로가기 링크 */}
                    {(selectedEvent.link1 ||
                      selectedEvent.link2 ||
                      selectedEvent.link3) && (
                      <div className="pt-1 border-t border-gray-700 mt-2">
                        <h3 className="text-sm font-semibold text-white mb-1">
                          링크
                        </h3>
                        <div className="space-y-1">
                          {selectedEvent.link1 && (
                            <a
                              href={selectedEvent.link1}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-7
                              text-white px-3 py-2 rounded-lg transition-colors cursor-pointer text-[10px]"
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
                              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-7
                              text-white px-3 py-2 rounded-lg transition-colors cursor-pointer text-[10px]"
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
                              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-7
                              text-white px-3 py-2 rounded-lg transition-colors cursor-pointer text-[10px]"
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
                  </div>
                </div>
              </div>

              {/* 하단 영역 - 이벤트 소개 */}
              <div className="flex-1 flex flex-col border-t border-gray-700">
                <div className="p-1 flex-1 overflow-hidden">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    이벤트 소개
                  </h3>
                  <div className="bg-gray-700 rounded-lg p-2 h-full overflow-y-auto">
                    <p className="text-gray-300 leading-relaxed whitespace-pre-wrap break-words text-[10px]">
                      {selectedEvent.description}
                    </p>
                  </div>
                </div>

                {/* 수정/닫기 버튼 - 하단 고정 */}
                <div className="p-1 border-t border-gray-700 bg-gray-800">
                  <div className="flex justify-center space-x-3">
                    <button
                      onClick={(e) => handleEditClick(selectedEvent, e)}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors cursor-pointer text-sm"
                    >
                      수정
                    </button>
                    <button
                      onClick={closeModal}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors cursor-pointer text-sm"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
