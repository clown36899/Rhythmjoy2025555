import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import type { Event } from "../../../utils/eventListUtils";

interface EventFilteredGridViewProps {
    sortedEvents: Event[];
    selectedDate: Date | null;
    selectedCategory: string;
    onEventClick: (event: Event) => void;
    onEventHover: (eventId: number | null) => void;
    highlightEvent: any;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number>;
    handleToggleFavorite: (eventId: number, e?: React.MouseEvent) => void;
    currentMonth: Date | undefined;
}

export function EventFilteredGridView({
    sortedEvents,
    selectedDate,
    selectedCategory,
    onEventClick,
    onEventHover,
    highlightEvent,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
    currentMonth
}: EventFilteredGridViewProps) {
    return (
        <div className="event-list-search-container evt-single-view-scroll evt-list-bg-container evt-single-view-container">
            <div className="evt-grid-3-4-10">
                {/* '전체 일정 보기' 배너 */}
                {(selectedDate || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'none')) && (
                    <div
                        onClick={() => window.dispatchEvent(new CustomEvent('clearAllFilters'))}
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
                        onClick={() => onEventClick(event)}
                        onMouseEnter={onEventHover}
                        onMouseLeave={() => onEventHover?.(null)}
                        isHighlighted={highlightEvent?.id === event.id}
                        selectedDate={selectedDate}
                        defaultThumbnailClass={defaultThumbnailClass}
                        defaultThumbnailEvent={defaultThumbnailEvent}
                        isFavorite={effectiveFavoriteIds.has(event.id)}
                        onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
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
                    className="evt-cursor-pointer"
                >
                    <div className="evt-add-banner-card">
                        <div className="evt-add-banner-icon">
                            <i className="ri-add-line event-list-add-icon"></i>
                        </div>
                    </div>
                </div>
            </div>

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
    );
}
