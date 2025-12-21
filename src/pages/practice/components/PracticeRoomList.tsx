import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import "./PracticeRoomList.css";

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
  adminType?: "super" | "sub" | null;
  showSearchModal: boolean;
  setShowSearchModal: (show: boolean) => void;
  showSortModal: boolean;
  setShowSortModal: (show: boolean) => void;
  sortBy: "random" | "time" | "title" | "newest";
  setSortBy: (sortBy: "random" | "time" | "title" | "newest") => void;
}

export default function PracticeRoomList({
  adminType = null,
  showSearchModal,
  setShowSearchModal,
  showSortModal,
  setShowSortModal,
  sortBy,
  setSortBy
}: PracticeRoomListProps) {
  const navigate = useNavigate();
  const { user, signInWithKakao } = useAuth();
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [randomizedRooms, setRandomizedRooms] = useState<PracticeRoom[]>([]); // 랜덤 정렬된 목록 저장
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [favoritePracticeRoomIds, setFavoritePracticeRoomIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchRooms();
  }, []);

  // Fetch favorites when user logs in
  useEffect(() => {
    if (user) {
      fetchFavorites();
    } else {
      setFavoritePracticeRoomIds(new Set());
    }
  }, [user]);

  const fetchFavorites = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('practice_room_favorites')
        .select('practice_room_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching practice room favorites:', error);
      } else {
        setFavoritePracticeRoomIds(new Set(data.map(f => f.practice_room_id)));
      }
    } catch (err) {
      console.error('Unexpected error fetching favorites:', err);
    }
  };

  const handleToggleFavorite = async (roomId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (!user) {
      if (confirm('로그인이 필요한 기능입니다. 카카오로 로그인하시겠습니까?')) {
        try {
          await signInWithKakao();
        } catch (err) {
          console.error(err);
        }
      }
      return;
    }

    const isFav = favoritePracticeRoomIds.has(roomId);

    // Optimistic Update
    setFavoritePracticeRoomIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(roomId);
      else next.add(roomId);
      return next;
    });

    if (isFav) {
      // Remove
      const { error } = await supabase
        .from('practice_room_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('practice_room_id', roomId);

      if (error) {
        console.error('Error removing favorite:', error);
        // Rollback
        setFavoritePracticeRoomIds(prev => {
          const next = new Set(prev);
          next.add(roomId);
          return next;
        });
      }
    } else {
      // Add
      const { error } = await supabase
        .from('practice_room_favorites')
        .insert({ user_id: user.id, practice_room_id: roomId });

      if (error) {
        console.error('Error adding favorite:', error);
        // Rollback
        setFavoritePracticeRoomIds(prev => {
          const next = new Set(prev);
          next.delete(roomId);
          return next;
        });
      }
    }
  };

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

      // sessionStorage에서 저장된 랜덤 순서 확인
      const savedRandomOrder = sessionStorage.getItem('practiceRoomsRandomOrder');
      if (savedRandomOrder) {
        try {
          const savedIds = JSON.parse(savedRandomOrder) as number[];
          // 저장된 순서대로 정렬
          const orderedRooms = savedIds
            .map(id => processedData.find(room => room.id === id))
            .filter(Boolean) as PracticeRoom[];
          // 새로 추가된 방이 있으면 끝에 추가
          const newRooms = processedData.filter(room => !savedIds.includes(room.id));
          setRandomizedRooms([...orderedRooms, ...newRooms]);
        } catch {
          // 파싱 실패 시 새로 생성
          const shuffled = [...processedData].sort(() => Math.random() - 0.5);
          setRandomizedRooms(shuffled);
          sessionStorage.setItem('practiceRoomsRandomOrder', JSON.stringify(shuffled.map(r => r.id)));
        }
      } else {
        // 초기 로드 시 랜덤 정렬된 목록 생성 및 저장
        const shuffled = [...processedData].sort(() => Math.random() - 0.5);
        setRandomizedRooms(shuffled);
        sessionStorage.setItem('practiceRoomsRandomOrder', JSON.stringify(shuffled.map(r => r.id)));
      }
    } catch (err) {
      console.error("Unexpected error while fetching rooms:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = (room: PracticeRoom) => {
    navigate(`/practice?id=${room.id}`);
  };
  // 검색 필터링 및 정렬된 연습실 목록
  const filteredAndSortedRooms = useMemo(() => {
    // 정렬 기준에 따라 소스 선택
    const sourceRooms = sortBy === "random" ? randomizedRooms : rooms;

    // 먼저 필터링
    let filtered = sourceRooms.filter((room) => {
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      return (
        room.name.toLowerCase().includes(query) ||
        room.address?.toLowerCase().includes(query) ||
        room.description?.toLowerCase().includes(query)
      );
    });

    // 그 다음 정렬 (랜덤은 이미 정렬되어 있으므로 스킵)
    if (sortBy === "title") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    // 연습실에는 "time" 정렬이 없음 (이벤트만 해당)

    return filtered;
  }, [rooms, randomizedRooms, searchQuery, sortBy]);

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
      <div className="prl-loading-container">
        <div className="prl-spinner"></div>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="prl-empty-state">
        등록된 연습실이 없습니다
        {adminType === "super" && (
          <div className="prl-empty-action">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('practiceRoomRegister'))}
              className="prl-empty-button"
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
      <div className="prl-main-container">

        {/* 검색 키워드 배너 (Compact Style) */}
        {searchQuery && (
          <div className="prl-search-banner">
            <i className="ri-search-line prl-search-banner-icon"></i>
            <span>"{searchQuery}"</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setInternalSearchQuery("");
              }}
              className="prl-search-banner-close"
              aria-label="검색 취소"
            >
              <i className="ri-close-line prl-search-banner-close-icon"></i>
            </button>
          </div>
        )}

        {filteredAndSortedRooms.length === 0 ? (
          <div className="prl-no-results">
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="prl-grid">
            {filteredAndSortedRooms.map((room, index) => (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room)}
                className="prl-card"
                style={{
                  animationDelay: `${index * 100}ms`,
                  position: 'relative'
                }}
              >
                {/* 즐겨찾기 버튼 */}
                <button
                  className="prl-favorite-btn"
                  onClick={(e) => handleToggleFavorite(room.id, e)}
                  title={favoritePracticeRoomIds.has(room.id) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                >
                  <i className={favoritePracticeRoomIds.has(room.id) ? "ri-heart-3-fill" : "ri-heart-3-line"}></i>
                </button>

                {/* 왼쪽: 정보 */}
                <div className="prl-card-info">
                  <h3 className="prl-card-name">
                    {room.name}
                  </h3>
                  {room.address && (
                    <p className="prl-card-address">
                      <i className="ri-map-pin-line prl-card-address-icon"></i>
                      <span className="prl-card-address-text">{room.address}</span>
                    </p>
                  )}
                  {room.description && (
                    <p className="prl-card-description">
                      {room.description}
                    </p>
                  )}
                </div>

                {/* 오른쪽: 정사각형 이미지 */}
                {room.images && room.images.length > 0 && (
                  <div className="prl-card-image-wrapper">
                    <img
                      src={room.images[0]}
                      alt={room.name}
                      className="prl-card-image"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 검색 모달 */}
      {showSearchModal && (
        <div className="prl-modal-overlay">
          <div className="prl-modal-container">
            <div className="prl-modal-content">
              <div className="prl-modal-header">
                <h3 className="prl-modal-title">연습실 검색</h3>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setInternalSearchQuery("");
                    setSearchSuggestions([]);
                    setShowSearchModal(false);
                  }}
                  className="prl-modal-close-btn"
                >
                  <i className="ri-close-line prl-modal-close-icon"></i>
                </button>
              </div>

              <div className="prl-search-modal-body">
                {/* 검색 입력창 */}
                <div className="prl-search-input-wrapper">
                  <input
                    type="text"
                    value={internalSearchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSearchSubmit();
                      }
                    }}
                    className="prl-search-input"
                    placeholder="연습실 이름, 주소, 설명으로 검색..."
                    autoFocus
                  />
                  <i className="ri-search-line prl-search-input-icon"></i>
                </div>

                {/* 자동완성 제안 */}
                {searchSuggestions.length > 0 && (
                  <div className="prl-suggestions-section">
                    <p className="prl-suggestions-header">추천 검색어</p>
                    <div className="prl-suggestions-list">
                      {searchSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="prl-suggestion-item"
                        >
                          <i className="ri-search-line prl-suggestion-icon"></i>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 검색 버튼 */}
                <div className="prl-modal-buttons">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setInternalSearchQuery("");
                      setSearchSuggestions([]);
                      setShowSearchModal(false);
                    }}
                    className="prl-modal-button prl-modal-button-secondary"
                  >
                    초기화
                  </button>
                  <button
                    onClick={handleSearchSubmit}
                    className="prl-modal-button prl-modal-button-primary"
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
        <div className="prl-modal-overlay">
          <div className="prl-modal-container">
            <div className="prl-modal-content">
              <div className="prl-modal-header">
                <h3 className="prl-modal-title">정렬 방식</h3>
                <button
                  onClick={() => setShowSortModal(false)}
                  className="prl-modal-close-btn"
                >
                  <i className="ri-close-line prl-modal-close-icon"></i>
                </button>
              </div>

              <div className="prl-sort-options-container">
                <button
                  onClick={() => {
                    setSortBy("random");
                    setShowSortModal(false);
                  }}
                  className={`prl-sort-option ${sortBy === "random"
                    ? "prl-sort-option-active"
                    : ""
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
                  className={`prl-sort-option ${sortBy === "title"
                    ? "prl-sort-option-active"
                    : ""
                    }`}
                >
                  <i className="ri-sort-alphabet-asc"></i>
                  <span>이름순</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
