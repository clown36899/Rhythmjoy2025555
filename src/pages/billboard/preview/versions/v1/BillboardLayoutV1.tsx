import React, { useMemo, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV1.css';

const BillboardLayoutV1: React.FC = () => {
    const { data: events = [] } = useEventsQuery();
    const [currentTime, setCurrentTime] = useState(new Date());

    const displayEvents = useMemo(() => {
        const todayStr = getLocalDateString();
        return events
            .filter(e => (e.date || e.start_date || '') >= todayStr)
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''))
            .slice(0, 12); // Grid size is around 12-16
    }, [events]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getImageUrl = (item: any): string => {
        return item.image_full || item.image || item.image_url || '';
    };

    return (
        <div className="vertical-wall-root">
            {/* HUD Header */}
            <div className="wall-hud-header">
                <div className="hud-time-block">
                    <div className="h-time">{currentTime.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="h-date">{currentTime.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
                </div>
                <div className="hud-brand-block">
                    <div className="h-logo">RHYTHMJOY</div>
                    <div className="h-tag">KOREA DANCE BILLBOARD</div>
                </div>
            </div>

            {/* Mosaic Grid */}
            <div className="vertical-mosaic-grid">
                {displayEvents.map((event, idx) => {
                    const typeClass = idx === 0 ? 'main' : (idx < 4 ? 'social' : 'upcoming');
                    const tagType = event.category === 'social' ? 'social-t' : (event.category === 'event' ? 'event-t' : 'class-t');

                    return (
                        <div
                            key={event.id || idx}
                            className={`wall-portrait-card ${typeClass}`}
                            style={{ backgroundImage: `url(${getImageUrl(event)})` }}
                        >
                            <div className="card-wall-shader">
                                <span className={`card-tag ${tagType}`}>{event.category === 'social' ? 'SOCIAL' : 'EVENT'}</span>
                                <div className="card-time">{event.time?.substring(0, 5)}</div>
                                <div className="card-title">{event.title}</div>
                                {idx === 0 && <div className="card-date">{event.date || event.start_date}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* HUD Footer */}
            <div className="wall-hud-footer">
                <div className="h-ticker-box">
                    <div className="h-ticker-text">
                        WELCOME TO RHYTHMJOY DANCE BILLBOARD • CHECK OUT OUR UPCOMING SOCIALS AND EVENTS • RAW DATA DRIVEN DISPLAY •
                    </div>
                </div>
                <div className="h-qr-box">
                    <div className="h-qr-info">
                        <div className="q-t1">SCAN FOR MORE</div>
                        <div className="q-t2">JOIN SOCIAL</div>
                    </div>
                    <QRCodeSVG value="https://swingenjoy.com" size={100} />
                </div>
            </div>
        </div>
    );
};

export default BillboardLayoutV1;
