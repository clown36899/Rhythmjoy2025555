import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../styles/DateEventsModal.css';

interface DateEventsModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    events: AppEvent[];
    onEventClick: (event: AppEvent) => void;
}

export default function DateEventsModal({
    isOpen,
    onClose,
    date,
    events,
    onEventClick
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

    // Sort events: Duration desc, then StartTime asc
    const sortedEvents = useMemo(() => {
        if (!events) return [];
        return [...events].sort((a, b) => {
            // 1. Duration (Longer first - somewhat arbitrary but often main events are longer/bigger)
            // Actually, for a list view, Time ascending is usually better.
            // Let's stick to Time ascending for clarity.
            const startA = a.start_date || a.date || '';
            const startB = b.start_date || b.date || '';
            return startA.localeCompare(startB);
        });
    }, [events]);

    const weekDayNames = ['일', '월', '화', '수', '목', '금', '토'];

    if (!isOpen || !date) return null;

    // Determine grid density based on event count
    // If more than 6 events, use 3 columns to try to fit them all
    const useDenseGrid = sortedEvents.length > 6;

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
                <div className="date-events-body">
                    {sortedEvents.length > 0 ? (
                        <div className={`events-grid ${useDenseGrid ? 'dense' : ''}`}>
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
