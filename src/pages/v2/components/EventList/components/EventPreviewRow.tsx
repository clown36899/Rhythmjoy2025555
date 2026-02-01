import React from "react";
import { HorizontalScrollNav } from "../../HorizontalScrollNav";
import { EventCard } from "../../EventCard";
import type { Event } from "../../../utils/eventListUtils";

interface EventPreviewRowProps {
    title: string | React.ReactNode;
    subtitle?: string;
    icon?: string; // Remix Icon class
    iconColor?: string;
    count?: number;
    viewAllUrl?: string;
    viewAllLabel?: string;
    genres?: string[];
    selectedGenre?: string | null;
    onGenreChange?: (genre: string | null) => void;
    renderGenreLabel?: (genre: string) => React.ReactNode;
    events: Event[];
    onEventClick: (event: Event) => void;
    onEventHover?: (id: number | string | null) => void;
    highlightEventId?: number | string | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (id: number | string, e: React.MouseEvent) => void;
    className?: string;
    rightElement?: React.ReactNode; // Extra elements like toggles
}

export const EventPreviewRow: React.FC<EventPreviewRowProps> = ({
    title,
    icon,
    iconColor,
    count,
    viewAllUrl,
    viewAllLabel = "전체보기",
    genres,
    selectedGenre,
    onGenreChange,
    renderGenreLabel,
    events,
    onEventClick,
    onEventHover,
    highlightEventId,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
    className = "",
    rightElement
}) => {
    return (
        <div className={`evt-v2-section ${className}`}>
            <div className="evt-v2-section-title">
                <div className="evt-v2-title-main">
                    {icon && <i className={icon} style={{ color: iconColor }}></i>}
                    <span>{title}</span>
                    {count !== undefined && <span className="evt-v2-count-badge">{count}</span>}
                    {rightElement}
                </div>

                {viewAllUrl && (
                    <button
                        onClick={() => window.location.href = viewAllUrl}
                        className="evt-view-all-btn manual-label-wrapper"
                    >
                        <i className="ri-calendar-event-line"></i>
                        <span className="translated-part">{viewAllLabel}</span>
                        <span className="fixed-part ko" translate="no">{viewAllLabel}</span>
                        <span className="fixed-part en" translate="no">{viewAllLabel}</span>
                        <i className="ri-arrow-right-s-line"></i>
                    </button>
                )}
            </div>

            {genres && genres.length > 0 && (
                <div className="evt-v2-genre-container">
                    <div className="evt-v2-genre-grid">
                        {genres.map(g => (
                            <button
                                key={g}
                                className={`evt-genre-btn-v3 ${((selectedGenre || '전체') === g) ? 'active' : ''}`}
                                onClick={() => onGenreChange?.(g === '전체' ? null : g)}
                            >
                                {renderGenreLabel ? renderGenreLabel(g) : g}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <HorizontalScrollNav>
                <div className="evt-v2-horizontal-scroll">
                    {events.length > 0 ? (
                        events.map(e => (
                            <div key={e.id} className="card-container">
                                <EventCard
                                    event={e}
                                    onClick={() => onEventClick(e)}
                                    defaultThumbnailClass={defaultThumbnailClass}
                                    defaultThumbnailEvent={defaultThumbnailEvent}
                                    onMouseEnter={(id) => onEventHover?.(id)}
                                    onMouseLeave={() => onEventHover?.(null)}
                                    isFavorite={effectiveFavoriteIds.has(e.id)}
                                    onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                    isHighlighted={highlightEventId === e.id}
                                />
                            </div>
                        ))
                    ) : (
                        <div className="evt-v2-empty" style={{ padding: '20px', width: '100%', textAlign: 'center' }}>
                            표시할 항목이 없습니다.
                        </div>
                    )}
                </div>
            </HorizontalScrollNav>
        </div>
    );
};
