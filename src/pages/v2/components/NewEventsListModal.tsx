import React, { useEffect } from 'react';
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
    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    // Density calculation based on event count
    const eventCount = events.length;
    let gridCols = 2;
    let density: 'low' | 'medium' | 'high' | 'ultra' = 'low';

    if (eventCount > 15) {
        gridCols = 5;
        density = 'ultra';
    } else if (eventCount > 9) {
        gridCols = 4;
        density = 'high';
    } else if (eventCount > 4) {
        gridCols = 3;
        density = 'medium';
    } else {
        gridCols = 2;
        density = 'low';
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
            return formatEventDate(event.event_dates[0]);
        }
        const startDate = event.start_date || event.date;
        return startDate ? formatEventDate(startDate) : '';
    };

    return createPortal(
        <div className={`NewEventsListModal density-${density}`} onClick={onClose}>
            <div className="NEL-container" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="NEL-header">
                    <div className="NEL-titleInfo">
                        <h3 className="NEL-title">
                            신규 등록 <span className="NEL-badge">NEW</span>
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
                        <div
                            className="NEL-grid"
                            style={{ '--grid-cols': gridCols } as React.CSSProperties}
                        >
                            {events.map(event => {
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
                                        <div className="NEL-info">
                                            <span className={`NEL-category ${categoryClass}`}>
                                                {categoryName}
                                            </span>
                                            <span className="NEL-eventTitle">{event.title}</span>
                                            {dateStr && <span className="NEL-date">{dateStr}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="NEL-empty">등록된 이벤트가 없습니다.</div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
