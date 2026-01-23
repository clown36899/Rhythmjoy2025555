import React, { useMemo, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV5.css';

const BillboardLayoutV5: React.FC = () => {
    const { data: events = [] } = useEventsQuery();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [currentIndex, setCurrentIndex] = useState(0);

    // Filter events (V5 typically shows curated events/socials)
    const displayEvents = useMemo(() => {
        const todayStr = getLocalDateString();
        return events
            .filter(e => (e.date || e.start_date || '') >= todayStr)
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''))
            .slice(0, 15);
    }, [events]);

    const currentEvent = displayEvents[currentIndex] || null;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (displayEvents.length > 1) {
            const interval = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % displayEvents.length);
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [displayEvents.length]);

    const getImageUrl = (item: any): string => {
        return item.image_full || item.image || item.image_url || '';
    };

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
    };

    return (
        <div className="v5-gallery-root">
            {/* Hero Section (Left) */}
            <div className="v5-hero-section">
                <div className="v5-hero-image-container">
                    {currentEvent && getImageUrl(currentEvent) ? (
                        <>
                            <img src={getImageUrl(currentEvent)} className="v5-hero-bg-blur" alt="" />
                            <img src={getImageUrl(currentEvent)} className="v5-hero-img-contain" alt="" />
                        </>
                    ) : (
                        <div className="v5-no-image">DANCE BILLBOARD</div>
                    )}
                </div>

                <div className="v5-hero-overlay">
                    <div className="v5-hero-content-left">
                        <span className="v5-hero-tag">FEATURED EVENT</span>
                        <h1 className="v5-hero-title">{currentEvent?.title || 'Welcome'}</h1>
                        <div className="v5-hero-info">
                            <span><i className="fas fa-calendar-alt"></i> {formatDate(currentEvent?.date || currentEvent?.start_date)}</span>
                            <span><i className="fas fa-clock"></i> {currentEvent?.time?.substring(0, 5)}</span>
                            <span><i className="fas fa-map-marker-alt"></i> {currentEvent?.location}</span>
                        </div>
                    </div>
                    <div className="v5-hero-qr-area">
                        <QRCodeSVG value={`https://swingenjoy.com/events/${currentEvent?.id || ''}`} size={80} />
                        <span className="v5-hero-qr-text">SCAN FOR INFO</span>
                    </div>
                </div>
            </div>

            {/* List Section (Right) */}
            <div className="v5-list-section">
                <div className="v5-list-header">
                    <div className="v5-brand">DANCE BILLBOARD</div>
                    <div className="v5-clock">{currentTime.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>
                </div>

                <div className="v5-today-section">
                    <div className="v5-section-title">UPCOMING SCHEDULE</div>
                    <div className="v5-event-list">
                        {displayEvents.map((event, idx) => (
                            <div
                                key={event.id || idx}
                                className={`v5-event-item ${idx === currentIndex ? 'active' : ''}`}
                                onClick={() => setCurrentIndex(idx)}
                            >
                                {getImageUrl(event) ? (
                                    <img src={getImageUrl(event)} className="v5-item-thumb" alt="" />
                                ) : (
                                    <div className="v5-thumb-placeholder"><i className="fas fa-image"></i></div>
                                )}
                                <div className="v5-item-content">
                                    <div className="v5-item-date">{formatDate(event.date || event.start_date)} {event.time?.substring(0, 5)}</div>
                                    <div className="v5-item-title">{event.title}</div>
                                    <div className="v5-item-location">{event.location || 'See Details'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BillboardLayoutV5;
