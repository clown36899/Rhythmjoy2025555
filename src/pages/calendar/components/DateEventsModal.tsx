import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../styles/DateEventsModal.css';

interface DateEventsModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    events: AppEvent[];
    onEventClick: (event: AppEvent) => void;
    seed?: number;
}

export default function DateEventsModal({
    isOpen,
    onClose,
    date,
    events,
    onEventClick,
    seed
}: DateEventsModalProps) {
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

    // Sort events: Random using seed
    const sortedEvents = useMemo(() => {
        if (!events) return [];

        const seededRandom = (s: number) => {
            const mask = 0xffffffff;
            let m_w = (123456789 + s) & mask;
            let m_z = (987654321 - s) & mask;
            return () => {
                m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
                m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
                let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
                return result / 4294967296;
            };
        };
        const randomHelper = seededRandom(seed || 42);

        // [Fix] 기간 우선 정렬 + 동일 기간 내 랜덤 셔플
        return events
            .map(event => {
                const start = new Date(event.start_date || event.date || '').getTime();
                const end = new Date(event.end_date || event.date || '').getTime();
                return {
                    event,
                    weight: randomHelper(),
                    duration: end - start
                };
            })
            .sort((a, b) => {
                if (b.duration !== a.duration) return b.duration - a.duration;
                return a.weight - b.weight;
            })
            .map(({ event }) => event);
    }, [events, seed]);

    const weekDayNames = ['일', '월', '화', '수', '목', '금', '토'];

    if (!isOpen || !date) return null;

    // Determine grid density and columns based on event count
    const eventCount = sortedEvents.length;
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

    const formatTime = (dateStr?: string) => {
        if (!dateStr || dateStr.length < 16) return '';
        // Extract HH:MM from ISO string or YYYY-MM-DDTHH:MM:SS
        return dateStr.substring(11, 16);
    };

    return createPortal(
        <div className="date-events-modal-overlay" onClick={onClose}>
            <div className="date-events-modal-container" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="date-events-header">
                    <div className="date-info">
                        <span className="weekday">{weekDayNames[date.getDay()]}요일 <span className="day-num">{date.getDate()}일</span></span>
                        <span className="subtitle">소셜/이벤트</span>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* Body */}
                <div className={`date-events-body density-${density}`}>
                    {sortedEvents.length > 0 ? (
                        <div
                            className="events-grid"
                            style={{ '--grid-cols': gridCols } as React.CSSProperties}
                        >
                            {sortedEvents.map(event => {
                                // User requested 300px (thumbnail) size, not micro.
                                const imageUrl = event.image_thumbnail || event.image_medium || event.image_micro;
                                const categoryClass = getCategoryColor(event.category);
                                const categoryName = getCategoryName(event.category);
                                const timeStr = formatTime(event.start_date || event.date);

                                return (
                                    <div
                                        key={event.id}
                                        className="event-grid-item"
                                        onClick={() => onEventClick(event)}
                                    >
                                        <div className="event-item-thumbnail">
                                            {imageUrl ? (
                                                <img src={imageUrl} alt={event.title} loading="lazy" />
                                            ) : (
                                                <div className="event-item-fallback">
                                                    {event.title.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="event-item-info">
                                            <span className={`event-item-category ${categoryClass}`}>
                                                {categoryName}
                                            </span>
                                            <div className="event-item-title">{event.title}</div>
                                            {timeStr && <div className="event-item-time">{timeStr}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="empty-events-state">
                            등록된 일정이 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
