import React, { useMemo, useRef, useState, useCallback } from 'react';
import type { SocialSchedule } from '../../social/types';
import '../styles/UnifiedScheduleSection.css';
import { getLocalDateString, getKSTDay } from '../utils/eventListUtils';
import { HorizontalScrollNav } from './HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';
import { useModalActions } from '../../../contexts/ModalContext';

interface UnifiedScheduleSectionProps {
    todaySchedules: SocialSchedule[];
    futureSchedules: SocialSchedule[];
    onEventClick?: (event: any) => void;
    onRefresh?: () => void;
}

export const UnifiedScheduleSection: React.FC<UnifiedScheduleSectionProps> = ({
    todaySchedules,
    futureSchedules,
    onEventClick,
    onRefresh
}) => {
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'today' | 'thisWeek' | 'nextWeek'>('today');

    // Stable Randomization: Store weights once per ID to keep order fixed during session
    const shuffleWeights = useRef<Record<string | number, number>>({});
    const getStableWeight = useCallback((id: string | number) => {
        if (shuffleWeights.current[id] === undefined) {
            shuffleWeights.current[id] = Math.random();
        }
        return shuffleWeights.current[id];
    }, []);

    const stableShuffle = useCallback(<T extends { id: string | number }>(array: T[]): T[] => {
        return [...array].sort((a, b) => getStableWeight(a.id) - getStableWeight(b.id));
    }, [getStableWeight]);

    // 1. Calculate Date Ranges
    const todayStr = getLocalDateString();
    const kstDay = getKSTDay();
    const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;

    const todayDate = new Date(todayStr);
    const thisWeekStart = new Date(todayDate);
    thisWeekStart.setDate(todayDate.getDate() - daysFromMonday);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(thisWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    const thisWeekEndStr = getLocalDateString(thisWeekEnd);
    const nextWeekStartStr = getLocalDateString(nextWeekStart);
    const nextWeekEndStr = getLocalDateString(nextWeekEnd);

    // 2. Partition & Randomize (Stably)
    const partitionedData = useMemo(() => {
        // Use todaySchedules directly (range check already done by parent)
        const todayIds = new Set(todaySchedules.map(s => s.id));

        // Filter futureSchedules for the rest of this week and next week
        const thisWeekRestList = futureSchedules.filter(s =>
            !todayIds.has(s.id) &&
            !!s.date && !s.day_of_week &&
            s.date > todayStr && s.date <= thisWeekEndStr
        );
        const nextWeekList = futureSchedules.filter(s =>
            !todayIds.has(s.id) &&
            !!s.date && !s.day_of_week &&
            s.date >= nextWeekStartStr && s.date <= nextWeekEndStr
        );

        // Stably randomize within each group
        return {
            today: stableShuffle(todaySchedules),
            thisWeekRest: stableShuffle(thisWeekRestList),
            nextWeek: stableShuffle(nextWeekList)
        };
    }, [todaySchedules, futureSchedules, todayStr, thisWeekEndStr, nextWeekStartStr, nextWeekEndStr, stableShuffle]);

    const combinedList = [
        ...partitionedData.today.map(item => ({ ...item, group: 'today' })),
        ...partitionedData.thisWeekRest.map(item => ({ ...item, group: 'thisWeek' })),
        ...partitionedData.nextWeek.map(item => ({ ...item, group: 'nextWeek' }))
    ];

    // 3. Sunday Check
    const isSunday = kstDay === 0;

    // 4. Scroll Navigation
    const scrollToGroup = useCallback((group: 'today' | 'thisWeek' | 'nextWeek') => {
        setActiveTab(group);
        if (!scrollerRef.current) return;

        const firstInGroup = scrollerRef.current.querySelector(`[data-group="${group}"]`);
        if (firstInGroup) {
            firstInGroup.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'start'
            });
        }
    }, []);

    const handleScheduleClick = (e: React.MouseEvent, item: SocialSchedule) => {
        e.stopPropagation();
        if (item.group_id === -1) {
            onEventClick?.(item);
            return;
        }

        const openDetail = (scheduleItem: SocialSchedule) => {
            const isOwner = user && scheduleItem.user_id === user.id;
            openModal('socialDetail', {
                schedule: scheduleItem,
                isAdmin: isOwner || isAdmin,
                onEdit: (s: any) => openModal('socialSchedule', {
                    editSchedule: s,
                    groupId: s.group_id,
                    onSuccess: (data: any) => {
                        onRefresh?.();
                        if (data) openDetail(data);
                    }
                })
            });
        };
        openDetail(item);
    };

    if (combinedList.length === 0) return null;

    return (
        <section className="unified-schedule-section">
            <div className="unified-schedule-header">
                <div className="unified-tab-group">
                    <div
                        className={`unified-tab-item ${activeTab === 'today' ? 'active' : ''}`}
                        onClick={() => scrollToGroup('today')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        오늘 소셜 ({partitionedData.today.length})
                        {partitionedData.today.length > 0 && (
                            <span className="live-badge manual-label-wrapper" style={{ fontSize: '9px', padding: '1px 4px' }}>
                                <span className="translated-part">LIVE {partitionedData.today.length}</span>
                                <span className="fixed-part ko" translate="no">LIVE {partitionedData.today.length}</span>
                                <span className="fixed-part en" translate="no">LIVE {partitionedData.today.length}</span>
                            </span>
                        )}
                    </div>

                    {!isSunday && partitionedData.thisWeekRest.length > 0 && (
                        <>
                            <div className="menu-sep">|</div>
                            <div
                                className={`unified-tab-item ${activeTab === 'thisWeek' ? 'active' : ''}`}
                                onClick={() => scrollToGroup('thisWeek')}
                            >
                                이번주 ({partitionedData.thisWeekRest.length})
                            </div>
                        </>
                    )}

                    {partitionedData.nextWeek.length > 0 && (
                        <>
                            <div className="menu-sep">|</div>
                            <div
                                className={`unified-tab-item ${activeTab === 'nextWeek' ? 'active' : ''}`}
                                onClick={() => scrollToGroup('nextWeek')}
                            >
                                다음주 ({partitionedData.nextWeek.length})
                            </div>
                        </>
                    )}
                </div>
                <button
                    className="evt-view-all-btn manual-label-wrapper"
                    onClick={() => window.location.href = '/calendar'}
                    style={{ marginLeft: 'auto' }}
                >
                    <span className="translated-part">View All</span>
                    <span className="fixed-part ko" translate="no">전체보기</span>
                    <span className="fixed-part en" translate="no">All</span>
                    <span style={{ marginLeft: 'min(0.5vw, 4px)' }}>❯</span>
                </button>
            </div>

            <HorizontalScrollNav ref={scrollerRef}>
                <div className="unified-scroller">
                    {combinedList.map((item, idx) => {
                        // Find first index of each group for anchor identification
                        const isFirstInGroup = combinedList.findIndex(x => x.group === item.group) === idx;

                        return (
                            <div
                                key={item.id}
                                className={`today-card ${isFirstInGroup ? 'unified-anchor-item' : ''}`}
                                data-group={isFirstInGroup ? item.group : undefined}
                                onClick={(e) => handleScheduleClick(e, item)}
                            >
                                <div className="today-card-image">
                                    {(item.image_thumbnail || item.image_medium || item.image_url) ? (
                                        <img
                                            src={item.image_thumbnail || item.image_medium || item.image_url || ''}
                                            alt={item.title}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="today-placeholder">
                                            <i className="ri-calendar-event-line"></i>
                                        </div>
                                    )}
                                    {item.start_time && (
                                        <div className="today-card-overlay">
                                            <span className="today-time">{item.start_time.substring(0, 5)}</span>
                                        </div>
                                    )}
                                    {item.group !== 'today' && item.date && (
                                        <div className="today-card-date-line">
                                            {new Date(item.date + 'T00:00:00').toLocaleDateString('ko-KR', { weekday: 'short' })} {new Date(item.date + 'T00:00:00').getDate()}일
                                        </div>
                                    )}
                                </div>
                                <div className="today-card-info">
                                    <h3 className="today-card-title">{item.title}</h3>
                                    <p className="today-card-place">
                                        <i className="ri-map-pin-line"></i>
                                        <span className="today-card-place-text">{item.place_name || '장소 미정'}</span>
                                    </p>
                                </div>

                                {item.group === 'today' && (
                                    <div className="all-social-dday-badge all-social-dday-today">
                                        D-Day
                                    </div>
                                )}
                                {item.group === 'thisWeek' && (
                                    <div className="all-social-dday-badge">
                                        이번주
                                    </div>
                                )}
                                {item.group === 'nextWeek' && (
                                    <div className="all-social-dday-badge all-social-dday-next">
                                        다음주
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="scroller-spacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
};
