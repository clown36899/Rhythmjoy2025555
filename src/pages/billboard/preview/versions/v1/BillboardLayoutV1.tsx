import React, { useMemo, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV1.css';

const BillboardLayoutV1: React.FC = () => {
    const { data: events = [] } = useEventsQuery();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [highlightIndex, setHighlightIndex] = useState(0);

    // 1. Filter and Prepare All Future Data (Events + Classes)
    const allData = useMemo(() => {
        const todayStr = getLocalDateString();
        return events
            .filter(e => {
                const isFuture = (e.date || e.start_date || '') >= todayStr;
                const isExcludedCategory = e.category === 'club' || e.category === 'regular';
                return isFuture && !isExcludedCategory;
            })
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''));
    }, [events]);

    // 2. Identify "Events" (행사) for Random Highlighting
    const eventOnlyData = useMemo(() => {
        return allData.filter(item => item.category === 'event' || !item.category || item.category === 'social');
    }, [allData]);

    // 3. Select a random highlight event every 10 seconds (optional rotation) or just once
    useEffect(() => {
        if (eventOnlyData.length > 0) {
            const pickRandom = () => {
                const randomIndex = Math.floor(Math.random() * eventOnlyData.length);
                setHighlightIndex(randomIndex);
            };
            pickRandom();
            const interval = setInterval(pickRandom, 15000); // Rotate large tile every 15s
            return () => clearInterval(interval);
        }
    }, [eventOnlyData.length]);

    // 4. Arrange tiles: Main (Random Event) + Others
    const tileData = useMemo(() => {
        if (eventOnlyData.length === 0) return allData.slice(0, 24);

        const mainItem = eventOnlyData[highlightIndex];
        const others = allData.filter(item => item.id !== mainItem?.id).slice(0, 18);

        return [mainItem, ...others];
    }, [allData, eventOnlyData, highlightIndex]);

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
                    <div className="h-logo">DANCE BILLBOARD</div>
                    <div className="h-tag">KOREA </div>
                </div>
            </div>

            {/* Mosaic Grid */}
            <div className="vertical-mosaic-grid">
                {tileData.map((event, idx) => {
                    if (!event) return null;
                    const isMain = idx === 0;
                    const typeClass = isMain ? 'main' : (idx < 6 ? 'social' : 'upcoming');
                    const category = event.category || 'event';
                    const tagType = category === 'social' ? 'social-t' : (category === 'event' ? 'event-t' : 'class-t');

                    return (
                        <div
                            key={event.id || idx}
                            className={`wall-portrait-card ${typeClass}`}
                            style={{ backgroundImage: `url(${getImageUrl(event)})` }}
                        >
                            <div className="card-wall-shader">
                                <span className={`card-tag ${tagType}`}>{category.toUpperCase()}</span>
                                <div className="card-time">{event.time?.substring(0, 5)}</div>
                                <div className="card-title">{event.title}</div>
                                {isMain && <div className="card-date">{event.date || event.start_date}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* HUD Footer */}
            <div className="wall-hud-footer">
                <div className="h-ticker-box">
                    <div className="h-ticker-text">
                        WELCOME TO RHYTHMJOY DANCE BILLBOARD • CHECK OUT OUR UPCOMING SOCIALS AND EVENTS • STAY TUNED FOR NEW CLASSES • NO.1 DANCE PLATFORM •
                    </div>
                </div>
                <div className="h-qr-box">
                    <div className="h-qr-info">
                        <div className="q-t1">SCAN FOR MORE</div>
                        <div className="q-t2">상세확인, 등록, 홍보</div>
                    </div>
                    <QRCodeSVG value="https://swingenjoy.com" size={100} level="H" />
                </div>
            </div>
        </div>
    );
};

export default BillboardLayoutV1;
