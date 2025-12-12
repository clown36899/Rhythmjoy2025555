import { useState, useMemo } from 'react';
import type { Event as BaseEvent } from '../../../lib/supabase';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { useDefaultThumbnail } from '../../../hooks/useDefaultThumbnail';
import './BillboardSection.css';

interface Event extends BaseEvent {
    genre?: string | null;
}

interface BillboardSectionProps {
    events: Event[];
}

export default function BillboardSection({ events }: BillboardSectionProps) {
    const [isPaused, setIsPaused] = useState(false);
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

    // Filter to only show future/ongoing events and shuffle them
    const billboardEvents = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const futureEvents = events.filter(event => {
            const endDate = event.end_date || event.date;
            return endDate && endDate >= today;
        });

        // Shuffle events randomly
        const shuffled = [...futureEvents];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Duplicate events to create seamless loop
        return [...shuffled, ...shuffled];
    }, [events]);

    if (billboardEvents.length === 0) {
        return null;
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        return `${date.getMonth() + 1}/${date.getDate()}(${weekDay})`;
    };

    return (
        <div
            className="billboard-section"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            <div className={`billboard-track ${isPaused ? 'paused' : ''}`}>
                {billboardEvents.map((event, index) => {
                    const startDate = event.start_date || event.date;
                    const endDate = event.end_date || event.date;

                    let dateText = '';
                    if (event.event_dates && event.event_dates.length > 0) {
                        dateText = `${formatDate(event.event_dates[0])}~시작`;
                    } else if (startDate) {
                        if (startDate !== endDate) {
                            dateText = `${formatDate(startDate)}~${formatDate(endDate || startDate)}`;
                        } else {
                            dateText = formatDate(startDate);
                        }
                    }

                    const thumbnailUrl = getEventThumbnail(
                        event,
                        defaultThumbnailClass,
                        defaultThumbnailEvent
                    );

                    return (
                        <div key={`${event.id}-${index}`} className="billboard-item">
                            <div className="billboard-image-wrapper">
                                <img
                                    src={thumbnailUrl}
                                    alt={event.title}
                                    className="billboard-image"
                                />
                            </div>
                            <div className="billboard-info">
                                <span className="billboard-title">{event.title}</span>
                                <div className="billboard-meta">
                                    <span className="billboard-date">{dateText}</span>
                                    {event.location && (
                                        <>
                                            <span className="billboard-separator">•</span>
                                            <span className="billboard-location">{event.location}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
