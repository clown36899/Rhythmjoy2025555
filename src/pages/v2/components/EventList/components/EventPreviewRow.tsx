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
        <div className={`ELS-section ${className}`}>
            <div className="ELS-header">
                <div className="ELS-titleGroup">
                    {icon && <i className={`${icon} ELS-icon`} style={{ color: iconColor }}></i>}
                    <span className="ELS-title">{title}</span>
                    {count !== undefined && <span className="ELS-countBadge">{count}</span>}
                    {rightElement}
                </div>

                {viewAllUrl && (
                    <button
                        onClick={() => window.location.href = viewAllUrl}
                        className="ELS-viewAllBtn manual-label-wrapper"
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
                <div className="ELS-genreContainer">
                    <div className="ELS-genreGrid">
                        {genres.map(g => (
                            <button
                                key={g}
                                className={`ELS-genreBtn ${((selectedGenre || '전체') === g) ? 'is-active' : ''}`}
                                onClick={() => onGenreChange?.(g === '전체' ? null : g)}
                            >
                                {renderGenreLabel ? renderGenreLabel(g) : g}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <HorizontalScrollNav>
                <div className="ELS-scroller">
                    {events.length > 0 ? (
                        events.map((e, index) => (
                            <EventCard
                                key={e.id}
                                event={e}
                                onClick={() => onEventClick(e)}
                                defaultThumbnailClass={defaultThumbnailClass}
                                defaultThumbnailEvent={defaultThumbnailEvent}
                                onMouseEnter={(id) => onEventHover?.(id)}
                                onMouseLeave={() => onEventHover?.(null)}
                                isFavorite={effectiveFavoriteIds.has(e.id)}
                                onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                isHighlighted={highlightEventId === e.id}
                                loading={index < 4 ? "eager" : "lazy"}
                            />
                        ))
                    ) : (
                        <div className="ELS-empty">
                            표시할 항목이 없습니다.
                        </div>
                    )}
                </div>
            </HorizontalScrollNav>
        </div>
    );
};
