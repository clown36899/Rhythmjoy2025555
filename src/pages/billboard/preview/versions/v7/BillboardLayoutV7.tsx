import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV7.css';

// Import Full Calendar
import FullEventCalendar from '../../../../calendar/components/FullEventCalendar';

const BillboardLayoutV7: React.FC = () => {
    // 1. DATA SOURCES for Right Column
    const { data: events = [] } = useEventsQuery();

    // Calendar State
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [viewMode, setViewMode] = useState<"month" | "year">("month");

    // --- SCALING LOGIC START (CONTAINER AWARE) ---
    const TARGET_WIDTH = 1080;
    const TARGET_HEIGHT = 1920;
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const handleResize = () => {
            if (!containerRef.current) return;
            const containerW = containerRef.current.clientWidth || window.innerWidth;

            // Calculate scale to FIT WIDTH (100% Width Match)
            // Even if height overflows, we prioritize width filling.
            // Safety measure: ensure non-zero width
            const effectiveWidth = Math.max(containerW, 100);
            const scaleX = effectiveWidth / TARGET_WIDTH;

            // Apply scale
            // Min scale 0.1 to prevent invisible render
            const newScale = Math.max(scaleX, 0.1);
            setScale(newScale);
        };

        const observer = new ResizeObserver(handleResize);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        // Initial calculation
        handleResize();

        return () => observer.disconnect();
    }, []);

    // Calendar Height based on Fixed Design Height (larger to allow scrolling)
    const calendarHeight = TARGET_HEIGHT * 1.5;
    // --- SCALING LOGIC END ---


    // Scroll "Today" to top
    useEffect(() => {
        const attemptScroll = (attempts = 0) => {
            if (attempts > 30) return;

            // Target the specific scrolling container for the active month
            // Note: The selector depends on FullEventCalendar struct
            const container = document.querySelector('.v7-col-left .calendar-month-slide[data-active-month="true"]');
            const todayEl = container?.querySelector('.calendar-date-number-today');

            if (container && todayEl) {
                const cell = todayEl.closest('.calendar-cell-fullscreen') as HTMLElement;
                if (cell) {
                    // Force scroll "Today" to the very top (start of block)
                    cell.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
                }
            } else {
                // Retry if not rendered yet
                setTimeout(() => attemptScroll(attempts + 1), 100);
            }
        };

        // Trigger after a slight delay to allow layout/scale stabilization
        const timer = setTimeout(() => attemptScroll(), 100);
        return () => clearTimeout(timer);
    }, [currentMonth, scale]); // Re-run whenever month changes or scale updates

    // 2. EVENTS ONLY LOGIC (Right Column)
    // Filter to show ONLY 'Events' (category='event') - From Today onwards
    const upcomingEvents = useMemo(() => {
        const todayStr = getLocalDateString();

        // 1. Events (category='event') - From Today onwards
        const filteredEvents = events.filter(e => {
            if (e.category !== 'event') return false;
            const start = e.date || e.start_date;
            return start && start >= todayStr;
        });

        // Sort by Date then Time
        return filteredEvents.map(e => ({
            ...e,
            type: 'event',
            sortDate: e.date || e.start_date
        })).sort((a, b) => {
            const dateA = a.sortDate || '';
            const dateB = b.sortDate || '';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.time || '').localeCompare(b.time || '');
        });
    }, [events]);

    const getImageUrl = (item: any): string => {
        return item.image_full || item.image || item.image_url || item.image_medium || item.image_thumbnail || '';
    };

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
    };

    return (
        <div ref={containerRef} style={{
            width: '100%',
            height: '100%',
            background: '#000',
            display: 'flex',
            alignItems: 'flex-start', // Top alignment (important for overflowing height)
            justifyContent: 'center', // Center horizontally
            overflow: 'hidden',
            position: 'absolute',
            top: 0,
            left: 0
        }}>
            <div className="v7-static-root" style={{
                width: `${TARGET_WIDTH}px`,
                height: `${TARGET_HEIGHT}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top center', // Scale from Top-Center
                flexShrink: 0,
                top: 0,
                position: 'fixed'
            }}>
                <div className="v7-static-header">
                    <div className="v7-brand-mark">SOCIAL & EVENTS</div>
                    <div className="v7-header-qr">
                        <div className="v7-qr-text" style={{ textAlign: 'right', marginRight: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '2px', whiteSpace: 'nowrap' }}>코리아 댄스빌보드</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: '1.2', whiteSpace: 'nowrap' }}>QR 스캔하여 상세 정보 확인</div>
                        </div>
                        <QRCodeSVG value="https://swingenjoy.com" size={46} />
                    </div>
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

                    {/* Right: UPCOMING EVENTS (Merged) */}
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
        </div>
    );
};

export default BillboardLayoutV7;
