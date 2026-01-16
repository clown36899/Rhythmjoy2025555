import React, { memo } from 'react';
import type { SocialSchedule } from '../types';
import './AllSocialSchedules.css';
import { useModalActions } from '../../../contexts/ModalContext';
import { HorizontalScrollNav } from '../../v2/components/HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';
import { getLocalDateString, getKSTDay } from '../../v2/utils/eventListUtils';

interface AllSocialSchedulesProps {
    schedules: SocialSchedule[];
    onViewAll?: () => void;
    onEventClick?: (event: Event) => void;
    onRefresh?: () => void;
}

const AllSocialSchedules: React.FC<AllSocialSchedulesProps> = memo(({ schedules, onEventClick, onRefresh }) => {
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();
    const [weekMode, setWeekMode] = React.useState<'this' | 'next'>('this');

    // Get today's date in KST
    const todayStr = getLocalDateString();

    // Calculate ranges
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

    // 오늘 일정 개수 확인 (TodaySocial이 1개일 때 숨겨지므로 여기에 포함)
    const todaySchedulesCount = schedules.filter(schedule =>
        schedule.date === todayStr &&
        (schedule.day_of_week === null || schedule.day_of_week === undefined)
    ).length;

    // Filter schedules based on weekMode
    const filteredSchedules = schedules.filter(schedule => {
        if (schedule.day_of_week !== null && schedule.day_of_week !== undefined) return false;
        if (!schedule.date) return false;

        if (weekMode === 'this') {
            // Rule: If today has > 1 item, exclude them from 'This Week' (shown in Today section).
            // If today has 0 or 1 item, include them here.
            const shouldIncludeToday = todaySchedulesCount <= 1;

            if (shouldIncludeToday) {
                if (schedule.date < todayStr) return false;
            } else {
                if (schedule.date <= todayStr) return false;
            }

            if (schedule.date > thisWeekEndStr) return false;
        } else {
            // Show next week (Mon to Sun)
            if (schedule.date < nextWeekStartStr) return false;
            if (schedule.date > nextWeekEndStr) return false;
        }

        return true;
    });

    // 자동 탭 전환 로직: 이번주 일정이 없고 현재 '이번주' 탭이라면 '다음주'로 자동 전환
    // (특히 일요일처럼 이번주 잔여 일정이 없는 경우 유용)
    React.useEffect(() => {
        if (weekMode === 'this') {
            const thisWeekSchedules = schedules.filter(schedule => {
                if (schedule.day_of_week !== null && schedule.day_of_week !== undefined) return false;
                if (!schedule.date) return false;

                const shouldIncludeToday = todaySchedulesCount <= 1;
                if (shouldIncludeToday) {
                    if (schedule.date < todayStr) return false;
                } else {
                    if (schedule.date <= todayStr) return false;
                }

                if (schedule.date > thisWeekEndStr) return false;
                return true;
            });

            // 이번주는 없고 다음주는 일정이 있을 가능성이 높으므로 자동 전환
            if (thisWeekSchedules.length === 0) {
                setWeekMode('next');
            }
        }
    }, [schedules, todaySchedulesCount, todayStr, thisWeekEndStr]); // weekMode를 의존성에서 제외하여 수동 전환 방해 방지

    // 전체 일정이 하나도 없는 경우(이번주/다음주 모두)에만 섹션 숨김
    if (schedules.length === 0) return null;

    const getMediumImage = (item: SocialSchedule) => {
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_medium) return item.image_medium;
        return item.image_url || '';
    };

    const handleScheduleClick = (e: React.MouseEvent, item: SocialSchedule) => {
        e.stopPropagation();
        if (item.group_id === -1) {
            if (onEventClick) onEventClick(item as unknown as Event);
            return;
        }

        const openDetailModal = (scheduleItem: SocialSchedule) => {
            const isOneTimeSchedule = !!scheduleItem.date;
            const isOwner = user && scheduleItem.user_id === user.id;
            const canEdit = (isOwner || isAdmin) && isOneTimeSchedule;

            openModal('socialDetail', {
                schedule: scheduleItem,
                isAdmin: canEdit,
                showCopyButton: false,
                onEdit: (s: any) => openModal('socialSchedule', {
                    editSchedule: s,
                    groupId: s.group_id,
                    onSuccess: (data: any) => {
                        if (onRefresh) onRefresh();
                        if (data) openDetailModal(data);
                    }
                })
            });
        };
        openDetailModal(item);
    };

    const sortedSchedules = [...filteredSchedules].sort((a, b) => {
        // 1. Scope: Domestic first, Overseas last
        const isGlobalA = a.scope === 'overseas';
        const isGlobalB = b.scope === 'overseas';
        if (isGlobalA !== isGlobalB) return isGlobalA ? 1 : -1;

        // 2. Date
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        // 3. Time
        return (a.start_time || '').localeCompare(b.start_time || '');
    });

    // D-day 계산 함수
    const calculateDDay = (scheduleDate: string | null): string | null => {
        if (!scheduleDate) return null;

        // 날짜 문자열 직접 비교 (Timezone 문제 원천 차단)
        const todayStr = getLocalDateString();
        if (scheduleDate === todayStr) return 'D-Day';

        const today = new Date(todayStr + 'T00:00:00');
        const targetDate = new Date(scheduleDate + 'T00:00:00');

        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return null; // 지난 일정
        if (diffDays === 0) return 'D-Day';
        return `D-${diffDays}일`;
    };

    return (
        <section className="all-social-container">
            <div className="all-social-header">
                <div className="all-social-menu-group">
                    <i className="ri-calendar-line" style={{ color: '#4a9eff', fontSize: '1.2rem' }}></i>
                    <h2 className="all-social-title-menu manual-label-wrapper">
                        <span
                            className={`menu-item ${weekMode === 'this' ? 'active' : ''}`}
                            onClick={() => setWeekMode('this')}
                        >
                            이번주
                        </span>
                        <span className="menu-sep">|</span>
                        <span
                            className={`menu-item ${weekMode === 'next' ? 'active' : ''}`}
                            onClick={() => setWeekMode('next')}
                        >
                            다음주
                        </span>
                        <span className="title-suffix">
                            소셜일정
                        </span>
                    </h2>
                    <span className="all-social-count">{filteredSchedules.length}</span>
                </div>

                <button
                    className="all-social-calendar-btn"
                    onClick={() => window.location.href = '/calendar?category=social'}
                    title="전체달력 바로가기"
                    data-analytics-id="home_weekly_calendar_shortcut"
                    data-analytics-type="button"
                    data-analytics-section="weekly_social"
                >
                    <i className="ri-calendar-event-fill"></i>
                </button>
            </div>

            <HorizontalScrollNav>
                <div className="all-social-scroller">
                    {sortedSchedules.length > 0 ? (
                        sortedSchedules.map((item) => (
                            <div
                                key={item.id}
                                className="all-social-card"
                                data-analytics-id={Number(item.id) > 1000000 ? Math.floor(Number(item.id) / 10000) : item.id}
                                data-analytics-type={item.group_id === -1 ? 'event' : 'social_schedule'}
                                data-analytics-title={item.title}
                                data-analytics-section={`weekly_social_${weekMode}`}
                                onClick={(e) => handleScheduleClick(e, item)}
                            >
                                <div className="all-social-card-image">
                                    <div className="all-social-card-info">
                                        <span className="all-social-place">
                                            <i className="ri-map-pin-line"></i>
                                            {item.place_name || '장소 미정'}
                                        </span>
                                        {item.date && (
                                            <span className="all-social-day-badge">
                                                {new Date(item.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                                            </span>
                                        )}
                                        <h3 className="all-social-card-title">{item.title}</h3>
                                    </div>
                                    {getMediumImage(item) ? (
                                        <img src={getMediumImage(item)} alt={item.title} loading="lazy" />
                                    ) : (
                                        <div className="all-social-placeholder">
                                            <i className="ri-calendar-event-line"></i>
                                        </div>
                                    )}
                                    {/* {item.start_time && (
                                        <div className="all-social-card-overlay">
                                            <span className="all-social-time">{item.start_time.substring(0, 5)}</span>
                                        </div>
                                    )} */}
                                </div>
                                {(() => {
                                    const dDay = calculateDDay(item.date || null);
                                    return dDay ? (
                                        <div className={`all-social-dday-badge ${dDay === 'D-Day' ? 'all-social-dday-today' : ''}`}>
                                            {dDay}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        ))
                    ) : (
                        <div className="all-social-empty">
                            일정이 없습니다.
                        </div>
                    )}
                    <div className="all-social-scroller-spacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
});

AllSocialSchedules.displayName = 'AllSocialSchedules';

export default AllSocialSchedules;
