import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import type { Event } from "../../../utils/eventListUtils";

interface EventFilteredGridViewProps {
    sortedEvents: Event[];
    selectedDate: Date | null;
    selectedCategory: string;
    onEventClick: (event: Event) => void;
    onEventHover: (eventId: number | string | null) => void;
    highlightEvent: any;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (eventId: number | string, e?: React.MouseEvent) => void;
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
        <div className="ELS-section evt-favorites-view-container">
            <div className="ELS-gridContainer">
                <div className="ELS-grid">
                    {/* '전체 일정 보기' 배너 */}
                    {(selectedDate || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'none')) && (
                        <div
                            onClick={() => window.dispatchEvent(new CustomEvent('clearAllFilters'))}
                            className="ELS-banner-card ELS-banner-card--primary"
                            title="전체 일정 보기"
                        >
                            <i className="ri-arrow-go-back-line ELS-banner-icon"></i>
                            <span className="ELS-banner-label">전체 일정 보기</span>
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
                        className="ELS-banner-card"
                    >
                        <i className="ri-add-line ELS-banner-icon"></i>
                        <span className="ELS-banner-label">새 일정 등록</span>
                    </div>
                </div>
            </div>

            {sortedEvents.length === 0 && (
                <div className="ELS-empty">
                    {selectedDate && selectedCategory === "class"
                        ? "강습이 없습니다"
                        : selectedDate && selectedCategory === "event"
                            ? "행사가 없습니다"
                            : "해당 조건에 맞는 이벤트가 없습니다"}
                </div>
            )}
            <Footer />
        </div>
    );
}
