import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import PracticeRoomModal from "../../../components/PracticeRoomModal";
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
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PracticeRoom | null>(null);
  const [openToForm, setOpenToForm] = useState(false);
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
    setOpenToForm(false);
    setShowModal(true);
  };

  const handleAddNewRoom = () => {
    setSelectedRoom(null);
    setOpenToForm(true);
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
    }
    // 연습실에는 "time" 정렬이 없음 (이벤트만 해당)

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
          <div className="mt-4">
            <button
              onClick={() => setShowModal(true)}
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
        {adminType === "super" && (
          <div className="prl-admin-section" style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={async () => {
                if (!confirm("모든 연습실 이미지를 최적화(WebP 변환)하시겠습니까?\n이 작업은 시간이 걸릴 수 있습니다.")) return;

                setLoading(true);
                try {
                  const { data: allRooms } = await supabase.from("practice_rooms").select("*");
                  if (!allRooms) return;

                  let totalUpdated = 0;
                  const { createResizedImages } = await import("../../../utils/imageResize");

                  for (const room of allRooms) {
                    let images = typeof room.images === 'string' ? JSON.parse(room.images) : room.images || [];
                    let changed = false;
                    const newImages = [];

                    for (let i = 0; i < images.length; i++) {
                      const url = images[i];
                      // 이미 WebP이면 건너뛰기
                      if (url.includes('.webp')) {
                        newImages.push(url);
                        continue;
                      }

                      try {
                        // Fetch blob
                        const response = await fetch(url);
                        const blob = await response.blob();
                        const file = new File([blob], "image.jpg", { type: blob.type });

                        // Resize
                        const resized = await createResizedImages(file);
                        const targetImage = resized.full || resized.medium || resized.thumbnail;

                        // Upload
                        const filename = `practice-rooms/optimized_${room.id}_${i}_${Date.now()}.webp`;
                        const { error: uploadError } = await supabase.storage
                          .from("images")
                          .upload(filename, targetImage, {
                            contentType: 'image/webp',
                            cacheControl: '31536000',
                            upsert: true
                          });

                        if (uploadError) throw uploadError;

                        const { data } = supabase.storage.from("images").getPublicUrl(filename);
                        newImages.push(data.publicUrl);
                        changed = true;
                      } catch (e) {
                        console.error(`Failed to optimize image for room ${room.id}:`, e);
                        newImages.push(url); // Keep original if failed
                      }
                    }

                    if (changed) {
                      await supabase
                        .from("practice_rooms")
                        .update({
                          images: JSON.stringify(newImages),
                          image: newImages[0] // Update main image too
                        })
                        .eq("id", room.id);
                      totalUpdated++;
                    }
                  }
                  alert(`작업 완료! 총 ${totalUpdated}개의 연습실 정보가 업데이트되었습니다.`);
                  fetchRooms();
                } catch (e) {
                  console.error(e);
                  alert("이미지 최적화 중 오류가 발생했습니다.");
                } finally {
                  setLoading(false);
                }
              }}
              className="prl-add-room-btn"
              style={{ backgroundColor: '#10b981' }}
            >
              <i className="ri-image-edit-line"></i>
              <span>이미지 전체 최적화</span>
            </button>
            <button
              onClick={handleAddNewRoom}
              className="prl-add-room-btn"
            >
              <i className="ri-add-line"></i>
              <span>연습실 등록</span>
            </button>
          </div>
        )}

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
                className="prl-card animate-fadeIn"
                style={{
                  animationDelay: `${index * 100}ms`
                }}
              >
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

      <PracticeRoomModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedRoom(null);
          setOpenToForm(false);
          // 모달 닫을 때 리스트 새로고침 (정렬 순서는 유지됨)
          fetchRooms();
        }}
        isAdminMode={adminType === "super"}
        selectedRoom={selectedRoom}
        initialRoom={selectedRoom}
        openToForm={openToForm}
      />

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
                  className={`prl-sort-option flex items-center gap-3 ${sortBy === "random"
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
                  className={`prl-sort-option flex items-center gap-3 ${sortBy === "title"
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
