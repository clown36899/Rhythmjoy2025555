import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../../../styles/domains/events.css';
import '../../../styles/components/NewEventsListModal.css';
import { formatEventDate } from '../../../utils/dateUtils';

interface NewEventsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    events: AppEvent[];
    onEventClick: (event: AppEvent) => void;
}

export default function NewEventsListModal({
    isOpen,
    onClose,
    events,
    onEventClick
}: NewEventsListModalProps) {
    const [page, setPage] = useState(0);

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPage(0); // Reset page when opening
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Logic for balanced paging
    const pages = useMemo(() => {
        const count = events.length;
        if (count <= 6) return [events];

        // Balanced split for 7-12 items
        if (count >= 7 && count <= 12) {
            const firstPageCount = Math.ceil(count / 2);
            return [
                events.slice(0, firstPageCount),
                events.slice(firstPageCount)
            ];
        }

        // Default paging for 13+ items (6 per page)
        const result = [];
        for (let i = 0; i < events.length; i += 6) {
            result.push(events.slice(i, i + 6));
        }
        return result;
    }, [events]);

    if (!isOpen) return null;

    const currentEvents = pages[page] || [];
    const totalPages = pages.length;

    // Calculate grid columns for current page: Max 3, but 2 columns for 4 items (2x2)
    const currentCount = currentEvents.length;
    let gridCols = 3;
    if (currentCount === 4) {
        gridCols = 2;
    } else if (currentCount < 3) {
        gridCols = currentCount;
    }

    const getCategoryColor = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social' || cat === 'party') return 'cat-bg-social';
        if (cat === 'regular' || cat === 'club') return 'cat-bg-regular';
        if (cat === 'class') return 'cat-bg-class';
        return 'cat-bg-default';
    };

    const getCategoryName = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social') return '소셜';
        if (cat === 'party') return '파티';
        if (cat === 'regular') return '정모';
        if (cat === 'club') return '동호회';
        if (cat === 'class') return '강습';
        return '기타';
    };

    const getDateText = (event: AppEvent) => {
        if (event.event_dates && event.event_dates.length > 0) {
            return formatEventDate(event.event_dates[0]) + (event.event_dates.length > 1 ? ' ...' : '');
        }
        const startDate = event.start_date || event.date;
        return startDate ? formatEventDate(startDate) : '';
    };

    return createPortal(
        <div className="NewEventsListModal" onClick={onClose}>
            <div className="NEL-container" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="NEL-header">
                    <div className="NEL-titleInfo">
                        <h3 className="NEL-title">
                            신규 이벤트 <span className="NEL-badge">NEW</span>
                        </h3>
                        <span className="NEL-subtitle">최근 72시간 내 업데이트</span>
                    </div>
                    <button className="NEL-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* Body */}
                <div className="NEL-body">
                    {events.length > 0 ? (
                        <>
                            <div
                                className="NEL-grid"
                                key={page}
                                style={{ '--grid-cols': gridCols } as React.CSSProperties}
                            >
                                {currentEvents.map(event => {
                                    const imageUrl = event.image_thumbnail || event.image_micro || event.image_medium;
                                    const categoryClass = getCategoryColor(event.category);
                                    const categoryName = getCategoryName(event.category);
                                    const dateStr = getDateText(event);

                                    return (
                                        <div
                                            key={event.id}
                                            className="NEL-item"
                                            onClick={() => onEventClick(event)}
                                        >
                                            <div className="NEL-thumbnail">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt={event.title} loading="lazy" />
                                                ) : (
                                                    <div className="NEL-fallback">
                                                        <i className="ri-calendar-event-line"></i>
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`NEL-category ${categoryClass}`}>
                                                {categoryName}
                                            </span>
                                            <div className="NEL-info">
                                                <span className="NEL-eventTitle">{event.title}</span>
                                                {dateStr && <span className="NEL-date">{dateStr}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {totalPages > 1 && (
                                <div className="NEL-footer">
                                    <div className="NEL-pagination">
                                        <button
                                            className="NEL-navBtn"
                                            disabled={page === 0}
                                            onClick={() => setPage(page - 1)}
                                        >
                                            <i className="ri-arrow-left-s-line"></i>
                                        </button>
                                        <div className="NEL-pageIndicator">
                                            <span className="current">{page + 1}</span>
                                            <span className="sep">/</span>
                                            <span className="total">{totalPages}</span>
                                        </div>
                                        <button
                                            className="NEL-navBtn"
                                            disabled={page === totalPages - 1}
                                            onClick={() => setPage(page + 1)}
                                        >
                                            <i className="ri-arrow-right-s-line"></i>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="NEL-empty">등록된 이벤트가 없습니다.</div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
