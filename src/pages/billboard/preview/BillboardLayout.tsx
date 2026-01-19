import React, { useMemo, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../hooks/queries/useEventsQuery';
import { useSocialSchedulesQuery } from '../../../hooks/queries/useSocialSchedulesQuery';
import { getLocalDateString, getKSTDay } from '../../v2/utils/eventListUtils';
import './BillboardLayout.css';

const BillboardLayout: React.FC = () => {
    const { data: events = [], isLoading: eventsLoading } = useEventsQuery();
    const { data: socialSchedules = [], isLoading: socialLoading } = useSocialSchedulesQuery();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const todayStr = getLocalDateString();
    const kstDay = getKSTDay();

    // [Data Density Optimization] - Load as much as possible for a vertical wall
    const wallItems = useMemo(() => {
        // Today Main
        const main = events
            .filter(e => {
                const s = e.start_date || e.date || "";
                const end = e.end_date || e.date || "";
                return todayStr >= s && todayStr <= end && e.category === 'event';
            })
            .slice(0, 4)
            .map(e => ({ ...e, wall_type: 'main' }));

        // Today Socials
        const socials = socialSchedules
            .filter(s => s.date === todayStr || (s.day_of_week === kstDay && !s.date))
            .slice(0, 8)
            .map(s => ({ ...s, wall_type: 'social', category: 'social' }));

        // Classes / Clubs
        const programs = events
            .filter(e => {
                const s = e.start_date || e.date || "";
                return s >= todayStr && (e.category === 'class' || e.category === 'club');
            })
            .slice(0, 15)
            .map(e => ({ ...e, wall_type: 'program' }));

        // Future Events
        const future = events
            .filter(e => {
                const s = e.start_date || e.date || "";
                return s > todayStr && e.category === 'event';
            })
            .slice(0, 10)
            .map(e => ({ ...e, wall_type: 'upcoming' }));

        // Interleave to create a dynamic wall
        return [...main, ...socials, ...programs, ...future];
    }, [events, socialSchedules, todayStr, kstDay]);

    if (eventsLoading || socialLoading) {
        return <div className="billboard-loading-wall">WALL INITIALIZING...</div>;
    }

    return (
        <div className="vertical-wall-root">
            {/* 1. OVERLAY HUD (Top) */}
            <div className="wall-hud-header">
                <div className="hud-time-block">
                    <div className="h-time">{currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                    <div className="h-date">{currentTime.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
                </div>
                <div className="hud-brand-block">
                    <div className="h-logo">DANCE BILLBOARD</div>
                    <div className="h-tag">SITE REVIEW SERVICE</div>
                </div>
            </div>

            {/* 2. THE WALL: Vertical Portrait Cards, Zero Gaps */}
            <div className="vertical-mosaic-grid">
                {wallItems.map((item: any, idx) => (
                    <div
                        key={`${item.id}-${idx}`}
                        className={`wall-portrait-card ${item.wall_type}`}
                        style={{ backgroundImage: `url(${item.image || item.image_medium || '/default-event.jpg'})` }}
                    >
                        <div className="card-wall-shader">
                            <div className="card-wall-content">
                                {item.wall_type === 'social' ? (
                                    <>
                                        <div className="card-tag social-t">SOCIAL</div>
                                        <div className="card-time">{item.start_time?.substring(0, 5)}</div>
                                        <div className="card-title">{item.title}</div>
                                    </>
                                ) : (
                                    <>
                                        <div className={`card-tag ${item.category}-t`}>{(item.category || 'EVENT').toUpperCase()}</div>
                                        <div className="card-date">{item.date?.split('-')[2] || ''}일</div>
                                        <div className="card-title">{item.title}</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 3. OVERLAY HUD (Bottom) */}
            <div className="wall-hud-footer">
                <div className="h-ticker-box">
                    <div className="h-ticker-text">
                        DANCE BILLBOARD • 100% FULL-BLEED VERTICAL WALL • 실시간 전광판 업데이트 중 • swingenjoy.com • 빈공간 0% 고밀도 정보 레이아웃 •
                    </div>
                </div>
                <div className="h-qr-box">
                    <div className="h-qr-text">
                        <div className="q-t1">전체 일정 바로가기</div>
                        <div className="q-t2">swingenjoy.com</div>
                    </div>
                    <div className="h-qr-code">
                        <QRCodeSVG value="https://swingenjoy.com" size={120} marginSize={4} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BillboardLayout;
