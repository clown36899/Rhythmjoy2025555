import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import PracticeRoomModal from "../../../components/PracticeRoomModal";

interface PracticeRoom {
  id: number;
  name: string;
  address: string;
  address_link: string;
  additional_link: string;
  images: string[];
  description: string;
  created_at?: string;
  additional_link_title?: string;
  location?: string;
  hourly_rate?: number;
  contact_info?: string;
  capacity?: number;
}

interface PracticeRoomListProps {
  isAdminMode: boolean;
  showSearchModal: boolean;
  setShowSearchModal: (show: boolean) => void;
  showSortModal: boolean;
  setShowSortModal: (show: boolean) => void;
  sortBy: "random" | "time" | "title" | "newest";
  setSortBy: (sortBy: "random" | "time" | "title" | "newest") => void;
}

export default function PracticeRoomList({ 
  isAdminMode,
  showSearchModal,
  setShowSearchModal,
  showSortModal,
  setShowSortModal,
  sortBy,
  setSortBy
}: PracticeRoomListProps) {
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PracticeRoom | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("practice_rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching practice rooms:", error);
        return;
      }

      const processedData = (data ?? []).map((room) => ({
        ...room,
        images:
          typeof room.images === "string"
            ? JSON.parse(room.images)
            : (room.images ?? []),
      })) as PracticeRoom[];

      setRooms(processedData);
    } catch (err) {
      console.error("Unexpected error while fetching rooms:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = (room: PracticeRoom) => {
    setSelectedRoom(room);
    setShowModal(true);
  };

  const handleAddNewRoom = () => {
    setSelectedRoom(null);
    setShowModal(true);
  };

  // 검색 필터링 및 정렬된 연습실 목록
  const filteredAndSortedRooms = useMemo(() => {
    // 먼저 필터링
    let filtered = rooms.filter((room) => {
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      return (
        room.name.toLowerCase().includes(query) ||
        room.address?.toLowerCase().includes(query) ||
        room.description?.toLowerCase().includes(query)
      );
    });

    // 그 다음 정렬
    if (sortBy === "random") {
      filtered = [...filtered].sort(() => Math.random() - 0.5);
    } else if (sortBy === "title") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "newest") {
      filtered = [...filtered].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    }

    return filtered;
  }, [rooms, searchQuery, sortBy]);

  // 자동완성 제안 생성
  const generateSearchSuggestions = (query: string) => {
    if (!query.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    rooms.forEach((room) => {
      // 이름 전체가 검색어를 포함하는 경우
      if (room.name.toLowerCase().includes(queryLower)) {
        suggestions.add(room.name);
      }

      // 주소 전체가 검색어를 포함하는 경우
      if (room.address?.toLowerCase().includes(queryLower)) {
        suggestions.add(room.address);
      }

      // 설명에서 의미있는 단어 추출 (3글자 이상)
      const descWords = room.description?.split(/\s+/) || [];
      descWords.forEach((word) => {
        const cleanWord = word.replace(/[^\w가-힣]/g, ""); // 특수문자 제거
        if (
          cleanWord.length >= 3 &&
          cleanWord.toLowerCase().includes(queryLower)
        ) {
          // 해당 단어로 실제 검색 결과가 있는지 확인
          const hasResults = rooms.some(
            (r) =>
              r.name.toLowerCase().includes(cleanWord.toLowerCase()) ||
              r.address?.toLowerCase().includes(cleanWord.toLowerCase()) ||
              r.description?.toLowerCase().includes(cleanWord.toLowerCase()),
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
      return rooms.some(
        (room) =>
          room.name.toLowerCase().includes(suggestionLower) ||
          room.address?.toLowerCase().includes(suggestionLower) ||
          room.description?.toLowerCase().includes(suggestionLower),
      );
    });

    setSearchSuggestions(validSuggestions.slice(0, 8));
  };

  const handleSearchQueryChange = (query: string) => {
    setInternalSearchQuery(query);
    generateSearchSuggestions(query);
  };

  const handleSearchSubmit = () => {
    setSearchQuery(internalSearchQuery);
    setShowSearchModal(false);
    setSearchSuggestions([]);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInternalSearchQuery(suggestion);
    setSearchQuery(suggestion);
    setShowSearchModal(false);
    setSearchSuggestions([]);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        등록된 연습실이 없습니다
        {isAdminMode && (
          <div className="mt-4">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              연습실 등록
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-6">
        {isAdminMode && (
          <div className="mb-4">
            <button
              onClick={handleAddNewRoom}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <i className="ri-add-line"></i>
              <span>연습실 등록</span>
            </button>
          </div>
        )}

        {/* 검색 키워드 배너 (Compact Style) */}
        {searchQuery && (
          <div className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/40 px-2.5 py-0.5 rounded-full text-xs font-medium mb-2">
            <i className="ri-search-line text-[11px]"></i>
            <span>"{searchQuery}"</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setInternalSearchQuery("");
              }}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-600/20 transition-colors cursor-pointer"
              aria-label="검색 취소"
            >
              <i className="ri-close-line text-[10px]"></i>
            </button>
          </div>
        )}

        {filteredAndSortedRooms.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAndSortedRooms.map((room, index) => (
            <div
              key={room.id}
              onClick={() => handleRoomClick(room)}
              className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-750 transition-all animate-fadeIn"
              style={{
                animationDelay: `${index * 100}ms`
              }}
            >
              {room.images && room.images.length > 0 && (
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {room.name}
                </h3>
                {room.address && (
                  <p className="text-sm text-gray-400 mb-2 flex items-start gap-2">
                    <i className="ri-map-pin-line mt-0.5"></i>
                    <span>{room.address}</span>
                  </p>
                )}
                {room.description && (
                  <p className="text-sm text-gray-300 line-clamp-2">
                    {room.description}
                  </p>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      <PracticeRoomModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedRoom(null);
          fetchRooms();
        }}
        isAdminMode={isAdminMode}
        selectedRoom={selectedRoom}
        initialRoom={selectedRoom}
      />

      {/* 검색 모달 */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">연습실 검색</h3>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setInternalSearchQuery("");
                    setSearchSuggestions([]);
                    setShowSearchModal(false);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* 검색 입력창 */}
                <div className="relative">
                  <input
                    type="text"
                    value={internalSearchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSearchSubmit();
                      }
                    }}
                    className="w-full bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="연습실 이름, 주소, 설명으로 검색..."
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
                      setSearchQuery("");
                      setInternalSearchQuery("");
                      setSearchSuggestions([]);
                      setShowSearchModal(false);
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    초기화
                  </button>
                  <button
                    onClick={handleSearchSubmit}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    검색
                  </button>
                </div>
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
                  className="text-gray-400 hover:text-white"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSortBy("random");
                    setShowSortModal(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    sortBy === "random"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-shuffle-line"></i>
                  <span>랜덤</span>
                </button>

                <button
                  onClick={() => {
                    setSortBy("title");
                    setShowSortModal(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    sortBy === "title"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-sort-alphabet-asc"></i>
                  <span>이름순</span>
                </button>

                <button
                  onClick={() => {
                    setSortBy("newest");
                    setShowSortModal(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    sortBy === "newest"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-calendar-line"></i>
                  <span>최신순</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
