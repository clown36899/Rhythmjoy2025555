import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import FullEventCalendar from '../../../../calendar/components/FullEventCalendar';
import './BillboardLayoutV7.css';

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

const BillboardLayoutV7: React.FC = () => {
    const { data: events = [] } = useEventsQuery();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const clientW = containerRef.current.clientWidth || window.innerWidth;
                const newScale = clientW / TARGET_WIDTH;
                setScale(Math.max(0.1, newScale));
            }
        };

        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);
        updateScale();

        return () => observer.disconnect();
    }, []);

    const calendarHeight = useMemo(() => {
        return (TARGET_HEIGHT * 0.9);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            const todayEl = document.querySelector('.calendar-day-item.is-today');
            if (todayEl) {
                todayEl.scrollIntoView({ block: 'start', behavior: 'instant' });
                const scrollContainer = document.querySelector('.v7-col-left .calendar-month-slide');
                if (scrollContainer) {
                    scrollContainer.scrollTop -= 0;
                }
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [scale, currentMonth]);

    const upcomingEvents = useMemo(() => {
        const today = getLocalDateString();
        return events
            .filter(e => (e.date || e.start_date || '') >= today)
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''))
            .slice(0, 15);
    }, [events]);

    const getImageUrl = (item: any) => item.image_medium || item.image || item.image_url || '';

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
    };

    return (
        <div className="v7-viewport-container" ref={containerRef} style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: '#000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            top: 0,
            left: 0,
            position: 'fixed'
        }}>
            <div className="v7-static-root" style={{
                width: `${TARGET_WIDTH}px`,
                height: `${TARGET_HEIGHT}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
                flexShrink: 0,
                position: 'relative'
            }}>
                {/* Header */}
                <div className="v7-static-header">
                    <div className="v7-brand-mark">SOCIAL & EVENTS</div>
                </div>

                <div className="v7-split-container">
                    {/* Left: Full Calendar */}
                    <div className="v7-col-left" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '100%', padding: '10px' }}>
                            <FullEventCalendar
                                currentMonth={currentMonth}
                                selectedDate={null}
                                onDateSelect={() => { }}
                                onMonthChange={setCurrentMonth}
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                                calendarHeightPx={calendarHeight}
                                onEventClick={() => { }}
                                tabFilter="all"
                                isAdminMode={false}
                            />
                        </div>
                    </div>

                    {/* Right: UPCOMING EVENTS */}
                    <div className="v7-col-right">
                        <div className="v7-col-header event">
                            <i className="fas fa-list"></i>
                            UPCOMING EVENTS
                        </div>
                        <div className="v7-list-area">
                            {upcomingEvents.length > 0 ? (
                                upcomingEvents.map((item: any, idx: number) => (
                                    <div key={item.id || idx} className="v7-item-card">
                                        <div className="v7-card-thumb-wrapper">
                                            {getImageUrl(item) ? (
                                                <img src={getImageUrl(item)} alt="" className="v7-card-thumb" />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', background: '#333' }}></div>
                                            )}
                                        </div>
                                        <div className="v7-card-content">
                                            <div className="v7-card-top">
                                                <span className="v7-card-tag" style={{ background: item.type === 'event' ? '#e54d4d' : '#f1c40f', color: '#000' }}>
                                                    {formatDate(item.sortDate)}
                                                </span>
                                                <span className="v7-card-time">{item.time?.substring(0, 5)}</span>
                                            </div>
                                            <div className="v7-card-title">{item.title}</div>
                                            <div className="v7-card-loc">
                                                <i className="fas fa-map-marker-alt"></i>
                                                {item.location || 'Info Check'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ color: '#666', fontSize: '1.2rem', textAlign: 'center', gridColumn: 'span 3', padding: '50px' }}>
                                    예정된 일정이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* V1 Style Footer ported to V7 (Outside Scale Container) */}
            <div className="v7-hud-footer">
                <div className="v7-ticker-box">
                    <div className="v7-ticker-text">
                        WELCOME TO RHYTHMJOY DANCE BILLBOARD • CHECK OUT OUR UPCOMING SOCIALS AND EVENTS • RAW DATA DRIVEN DISPLAY •
                    </div>
                </div>
                <div className="v7-qr-box">
                    <div className="v7-qr-info">
                        <div className="v7-q-t1">SCAN FOR MORE</div>
                        <div className="v7-q-t2">JOIN SOCIAL</div>
                    </div>
                    <QRCodeSVG value="https://swingenjoy.com" size={100} level="H" />
                </div>
            </div>
        </div>
    );
};

export default BillboardLayoutV7;
