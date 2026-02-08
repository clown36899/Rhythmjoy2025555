import React, { useMemo, useRef, useState, useCallback } from 'react';
import type { SocialSchedule } from '../../social/types';
import { getLocalDateString, getKSTDay } from '../utils/eventListUtils';
import { HorizontalScrollNav } from './HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';
import { useModalActions } from '../../../contexts/ModalContext';
import { useNavigate } from 'react-router-dom';
import "../../../styles/components/UnifiedScheduleSection.css";

interface UnifiedScheduleSectionProps {
    todaySchedules: SocialSchedule[];
    futureSchedules: SocialSchedule[];
    onEventClick?: (event: SocialSchedule) => void;
    onRefresh?: () => void;
}

export const UnifiedScheduleSection: React.FC<UnifiedScheduleSectionProps> = ({
    todaySchedules,
    futureSchedules,
    onEventClick,
    onRefresh
}) => {
    const navigate = useNavigate();
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'thisWeek' | 'nextWeek'>('thisWeek');

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

        // Stably randomize within each group, BUT keep today's prioritized in the final list
        const shuffledToday = stableShuffle(todaySchedules);
        const shuffledRestOfWeek = stableShuffle(thisWeekRestList);

        return {
            thisWeek: [...shuffledToday, ...shuffledRestOfWeek], // Today first, then rest
            nextWeek: stableShuffle(nextWeekList),
            todayIdSet: todayIds // For badge logic
        };
    }, [todaySchedules, futureSchedules, todayStr, thisWeekEndStr, nextWeekStartStr, nextWeekEndStr, stableShuffle]);

    const combinedList = [
        ...partitionedData.thisWeek.map(item => ({ ...item, group: 'thisWeek' })),
        ...partitionedData.nextWeek.map(item => ({ ...item, group: 'nextWeek' }))
    ];

    // 3. Scroll Navigation
    const scrollToGroup = useCallback((group: 'thisWeek' | 'nextWeek') => {
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
                onEdit: (s: SocialSchedule) => openModal('socialSchedule', {
                    editSchedule: s,
                    groupId: s.group_id,
                    onSuccess: (data: SocialSchedule | null) => {
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
        <section className="USS-container">
            <div className="USS-header">
                <div className="USS-tabGroup">
                    <div
                        className={`USS-tabItem ${activeTab === 'thisWeek' ? 'is-active' : ''}`}
                        onClick={() => scrollToGroup('thisWeek')}
                    >
                        이번주 소셜
                        <span className="countBadge">{partitionedData.thisWeek.length}</span>
                        {todaySchedules.length > 0 && (
                            <span className="USS-liveBadge manual-label-wrapper">
                                <span className="translated-part">LIVE {todaySchedules.length}</span>
                                <span className="fixed-part ko" translate="no">LIVE {todaySchedules.length}</span>
                                <span className="fixed-part en" translate="no">LIVE {todaySchedules.length}</span>
                            </span>
                        )}
                    </div>

                    {partitionedData.nextWeek.length > 0 && (
                        <>
                            <div className="USS-separator">|</div>
                            <div
                                className={`USS-tabItem ${activeTab === 'nextWeek' ? 'is-active' : ''}`}
                                onClick={() => scrollToGroup('nextWeek')}
                            >
                                다음주
                                <span className="countBadge">{partitionedData.nextWeek.length}</span>
                            </div>
                        </>
                    )}
                </div>
                <button
                    className="manual-label-wrapper"
                    onClick={() => {
                        // "소셜 탭이 선택된 상태로 바로가야한다" -> /calendar?category=social
                        // CalendarPage.tsx handles scrollToToday=true to scroll to today
                        navigate('/calendar?category=social&scrollToToday=true');
                    }}
                    style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: '4px'
                    }}
                >
                    <span className="translated-part">View All</span>
                    <span className="fixed-part ko" translate="no">전체보기</span>
                    <span className="fixed-part en" translate="no">All</span>
                    <span style={{ marginLeft: 'min(0.5vw, 4px)' }}>❯</span>
                </button>
            </div>

            <HorizontalScrollNav ref={scrollerRef}>
                <div className="USS-scroller">
                    {combinedList.map((item, idx) => {
                        // Find first index of each group for anchor identification
                        const isFirstInGroup = combinedList.findIndex(x => x.group === item.group) === idx;
                        const isTodayItem = partitionedData.todayIdSet.has(item.id);

                        return (
                            <div
                                key={item.id}
                                className={`USS-card ${isFirstInGroup ? 'USS-anchorItem' : ''}`}
                                data-group={isFirstInGroup ? item.group : undefined}
                                onClick={(e) => handleScheduleClick(e, item)}
                            >
                                <div className="USS-cardImage">
                                    {(item.image_thumbnail || item.image_medium || item.image_url) ? (
                                        <img
                                            src={item.image_thumbnail || item.image_medium || item.image_url || ''}
                                            alt={item.title}
                                        />
                                    ) : (
                                        <div className="USS-placeholder">
                                            <i className="ri-calendar-event-line"></i>
                                        </div>
                                    )}
                                    {item.start_time && (
                                        <div className="USS-cardOverlay">
                                            <span className="USS-time">{item.start_time.substring(0, 5)}</span>
                                        </div>
                                    )}
                                    {/* Date Logic: Hide for Today items ONLY IF they were in 'today' tab, but here they are all mixed.
                                        User asked to keep today's item visible.
                                        Previously: {item.group !== 'today' && ...}
                                        Now "today" items are in 'thisWeek'.
                                        If we want to show date for everyone, we can remove the condition.
                                        But typically "Today" items might show "Today" or just the date.
                                        Let's show date for everyone for consistency in "This Week" view,
                                        or hide if it is strictly today??
                                        Original code hid date for 'today' group.
                                        Let's keep showing date for non-today items, and maybe a special label for today?
                                        Actually design usually implies just showing the date is fine.
                                    */}
                                    {item.date && (
                                        <div className="USS-dateLine">
                                            {new Date(item.date + 'T00:00:00').toLocaleDateString('ko-KR', { weekday: 'short' })} {new Date(item.date + 'T00:00:00').getDate()}일
                                        </div>
                                    )}
                                </div>
                                <div className="USS-cardInfo">
                                    <h3 className="USS-title">{item.title}</h3>
                                    <p className="USS-place">
                                        <i className="ri-map-pin-line"></i>
                                        <span>{item.place_name || '장소 미정'}</span>
                                    </p>
                                </div>

                                {isTodayItem && (
                                    <div className="USS-ddayBadge is-today">
                                        D-Day
                                    </div>
                                )}
                                {item.group === 'thisWeek' && !isTodayItem && (
                                    <div className="USS-ddayBadge">
                                        이번주
                                    </div>
                                )}
                                {item.group === 'nextWeek' && (
                                    <div className="USS-ddayBadge is-next">
                                        다음주
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="USS-scrollerSpacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
};
