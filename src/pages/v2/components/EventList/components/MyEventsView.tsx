import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import type { Event } from "../../../utils/eventListUtils";
import "./EventFavoritesView.css";

interface MyEventsViewProps {
    myEvents: {
        future: Event[];
        past: Event[];
        all: Event[];
    };
    onEventClick: (event: Event) => void;
    onEventHover: (eventId: number | string | null) => void;
    highlightEvent: any;
    selectedDate: Date | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (eventId: number | string, e?: React.MouseEvent) => void;
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
        <div className="ELS-section evt-favorites-view-container">
            <div className="ELS-header">
                <div className="ELS-titleGroup">
                    <i className="ri-file-list-3-fill ELS-icon" style={{ '--els-icon-color': '#4da6ff' } as React.CSSProperties}></i>
                    <span className="ELS-title">내가 등록한 행사</span>
                </div>
            </div>

            <div className="EFV-tabContent">
                {/* 1. Future Events Section */}
                {myEvents.future.length > 0 && (
                    <div className="EFV-section">
                        <div className="ELS-subHeader">
                            <h3 className="ELS-subTitle">
                                진행 예정/중인 행사 <span className="ELS-countBadge">{myEvents.future.length}</span>
                            </h3>
                        </div>
                        <div className="ELS-gridContainer">
                            <div className="ELS-grid">
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
                    </div>
                )}

                {/* 2. Past Events Section */}
                {myEvents.past.length > 0 && (
                    <div className="EFV-section">
                        <div className="ELS-subHeader ELS-subHeader--large">
                            <h3 className="ELS-subTitle">
                                지난 행사 <span className="ELS-countBadge">{myEvents.past.length}</span>
                            </h3>
                        </div>

                        <div className="ELS-gridContainer">
                            <div className="ELS-grid">
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
                    </div>
                )}

                {myEvents.all.length === 0 && (
                    <div className="EFV-empty">
                        아직 등록한 행사가 없습니다.
                    </div>
                )}
            </div>

            <div className="evt-spacer-32"></div>
            <Footer />
        </div>
    );
}
