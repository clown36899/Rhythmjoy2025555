import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Event } from "../../../lib/supabase";

interface EventSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSearch: (term: string) => void;
    events: Event[]; // 검색 추천어 생성을 위해 전체 이벤트 목록 필요
}

export default function EventSearchModal({
    isOpen,
    onClose,
    onSearch,
    events,
}: EventSearchModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);

    // 모달이 열릴 때 초기화
    useEffect(() => {
        if (isOpen) {
            setSearchQuery("");
            setSearchSuggestions([]);
        }
    }, [isOpen]);

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
                            e.description.toLowerCase().includes(cleanWord.toLowerCase())
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
                    event.description.toLowerCase().includes(suggestionLower)
            );
        });

        setSearchSuggestions(validSuggestions.slice(0, 8));
    };

    const handleSearchQueryChange = (query: string) => {
        setSearchQuery(query);
        generateSearchSuggestions(query);
    };

    const handleSearchSubmit = () => {
        onSearch(searchQuery);
        onClose();
    };

    const handleSuggestionClick = (suggestion: string) => {
        setSearchQuery(suggestion);
        onSearch(suggestion);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="evt-modal-overlay">
            <div className="evt-modal-container">
                <div className="evt-modal-body">
                    <div className="evt-flex evt-justify-between evt-items-center evt-mb-4">
                        <h3 className="evt-modal-title">이벤트 검색</h3>
                        <button onClick={onClose} className="evt-modal-close-btn">
                            <i className="ri-close-line evt-icon-xl"></i>
                        </button>
                    </div>

                    <div className="evt-space-y-4">
                        {/* 검색 입력창 */}
                        <div className="evt-relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchQueryChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleSearchSubmit();
                                    }
                                }}
                                className="evt-form-input-with-icon"
                                placeholder="이벤트 제목, 장소, 주최자로 검색..."
                                autoFocus
                            />
                            <i className="ri-search-line evt-icon-absolute-left"></i>
                        </div>

                        {/* 자동완성 제안 */}
                        {searchSuggestions.length > 0 && (
                            <div className="evt-space-y-1">
                                <p className="evt-info-text-xs evt-mb-2">추천 검색어</p>
                                <div className="evt-max-h-48 evt-overflow-y-auto evt-space-y-1">
                                    {searchSuggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handleSuggestionClick(suggestion)}
                                            className="evt-search-suggestion-item"
                                        >
                                            <i className="ri-search-line evt-icon-text-xs evt-icon-mr-2 evt-text-gray-400"></i>
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 검색 버튼 */}
                        <div className="evt-flex evt-space-x-3">
                            <button
                                onClick={onClose}
                                className="evt-flex-1 evt-btn-base evt-btn-gray"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSearchSubmit}
                                className="evt-flex-1 evt-btn-base evt-btn-blue evt-whitespace-nowrap"
                            >
                                검색
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
