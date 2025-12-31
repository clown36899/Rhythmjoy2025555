import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import type { Event } from "../../../utils/eventListUtils";

interface MyEventsViewProps {
    myEvents: {
        future: Event[];
        past: Event[];
        all: Event[];
    };
    onEventClick: (event: Event) => void;
    onEventHover: (eventId: number | null) => void;
    highlightEvent: any;
    selectedDate: Date | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number>;
    handleToggleFavorite: (eventId: number, e?: React.MouseEvent) => void;
}

export function MyEventsView({
    myEvents,
    onEventClick,
    onEventHover,
    highlightEvent,
    selectedDate,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
}: MyEventsViewProps) {
    return (
        <div className="evt-ongoing-section evt-preview-section evt-favorites-view-container">
            <div className="evt-v2-section-title" style={{ padding: '0 16px', marginTop: '16px' }}>
                <i className="ri-file-list-3-fill" style={{ color: '#4da6ff', marginRight: '6px' }}></i>
                <span>내가 등록한 행사</span>
            </div>

            {/* 1. Future Events Section */}
            {myEvents.future.length > 0 && (
                <div className="evt-favorites-section">
                    <h3 className="evt-favorites-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                        진행 예정/중인 행사 <span className="evt-favorites-count">{myEvents.future.length}</span>
                    </h3>
                    <div className="evt-favorites-grid-2" style={{ padding: '0 8px' }}>
                        {myEvents.future.map(event => (
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
                    </div>
                </div>
            )}

            {/* 2. Past Events Section */}
            {myEvents.past.length > 0 && (
                <div className="evt-favorites-section" style={{ marginTop: '32px' }}>
                    <div className="evt-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: '12px' }}>
                        <h3 className="evt-favorites-title" style={{ fontSize: '14px', color: '#ccc', margin: 0 }}>
                            지난 행사 <span className="evt-favorites-count">{myEvents.past.length}</span>
                        </h3>
                    </div>

                    <div className="evt-favorites-grid-2" style={{ padding: '0 8px' }}>
                        {myEvents.past.map(event => (
                            <EventCard
                                key={event.id}
                                event={event}
                                onClick={() => onEventClick(event)}
                                defaultThumbnailClass={defaultThumbnailClass}
                                defaultThumbnailEvent={defaultThumbnailEvent}
                                isFavorite={effectiveFavoriteIds.has(event.id)}
                                onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {myEvents.all.length === 0 && (
                <div className="evt-v2-empty evt-mt-8">
                    아직 등록한 행사가 없습니다.
                </div>
            )}

            <div className="evt-spacer-16"></div>
            <Footer />
        </div>
    );
}
