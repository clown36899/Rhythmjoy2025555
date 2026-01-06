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

const AllSocialSchedules: React.FC<AllSocialSchedulesProps> = memo(({ schedules, onViewAll, onEventClick, onRefresh }) => {
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
            // 오늘 일정이 1개일 때는 오늘 일정도 포함 (>= todayStr)
            // 오늘 일정이 2개 이상일 때는 오늘 제외 (> todayStr)
            const shouldIncludeToday = todaySchedulesCount === 1;

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

    if (filteredSchedules.length === 0 && weekMode === 'this') return null;

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
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.start_time || '').localeCompare(b.start_time || '');
    });

    // D-day 계산 함수
    const calculateDDay = (scheduleDate: string | null): string | null => {
        if (!scheduleDate) return null;

        const today = new Date(todayStr);
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
                <div className={`all-social-scroller all-social-count-${Math.min(sortedSchedules.length, 4)}`}>
                    {sortedSchedules.length > 0 ? (
                        sortedSchedules.map((item) => (
                            <div
                                key={item.id}
                                className={`all-social-card all-social-card-count-${Math.min(sortedSchedules.length, 4)}`}
                                data-analytics-id={item.id > 1000000 ? Math.floor(item.id / 10000) : item.id}
                                data-analytics-type={item.group_id === -1 ? 'event' : 'social_schedule'}
                                data-analytics-title={item.title}
                                data-analytics-section={`weekly_social_${weekMode}`}
                                onClick={(e) => handleScheduleClick(e, item)}
                            >
                                <div className="all-social-card-image">
                                    {getMediumImage(item) ? (
                                        <img src={getMediumImage(item)} alt={item.title} loading="lazy" />
                                    ) : (
                                        <div className="all-social-placeholder">
                                            <i className="ri-calendar-event-line"></i>
                                        </div>
                                    )}
                                    {item.start_time && (
                                        <div className="all-social-card-overlay">
                                            <span className="all-social-time">{item.start_time.substring(0, 5)}</span>
                                        </div>
                                    )}
                                    {(() => {
                                        const dDay = calculateDDay(item.date || null);
                                        return dDay ? (
                                            <div className={`all-social-dday-badge ${dDay === 'D-Day' ? 'all-social-dday-today' : ''}`}>
                                                {dDay}
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                                <div className="all-social-card-info">
                                    <h3 className="all-social-card-title">{item.title}</h3>
                                    <p className="all-social-card-meta">
                                        {item.date && (
                                            <span className="all-social-day-badge">
                                                {new Date(item.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                                            </span>
                                        )}
                                        <span className="all-social-place">
                                            <i className="ri-map-pin-line"></i>
                                            {item.place_name || '장소 미정'}
                                        </span>
                                    </p>
                                </div>
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
