import React, { memo } from 'react';
import type { SocialSchedule } from '../types';
import './AllSocialSchedules.css';
import { useModalActions } from '../../../contexts/ModalContext';
import { HorizontalScrollNav } from '../../v2/components/HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';

interface AllSocialSchedulesProps {
    schedules: SocialSchedule[];
    onViewAll?: () => void;
    onEventClick?: (event: any) => void;
}

const AllSocialSchedules: React.FC<AllSocialSchedulesProps> = memo(({ schedules, onViewAll, onEventClick }) => {
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();

    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Calculate this week's date range (Monday to Sunday)
    const currentDayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
    const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (day - 1)

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysFromMonday); // Go back to Monday
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday
    weekEnd.setHours(23, 59, 59, 999);

    const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;

    // Filter schedules:
    // 1. Exclude regular schedules (those with day_of_week set)
    // 2. Only show one-time event schedules (those with specific dates)
    // 3. Exclude today - only show tomorrow and future dates
    // 4. Only show schedules within this week (Monday to Sunday)
    const nonRegularSchedules = schedules.filter(schedule => {
        // Must not have day_of_week (exclude regular schedules)
        if (schedule.day_of_week !== null && schedule.day_of_week !== undefined) return false;

        // Must have a date
        if (!schedule.date) return false;

        // Must be after today (exclude today)
        if (schedule.date <= todayStr) return false;

        // Must be within this week
        if (schedule.date < weekStartStr || schedule.date > weekEndStr) return false;

        return true;
    });

    if (nonRegularSchedules.length === 0) return null;

    const getMediumImage = (item: SocialSchedule) => {
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_medium) return item.image_medium;
        if (item.image_micro) return item.image_micro;
        const fallback = item.image_url || '';
        return fallback;
    };

    const handleScheduleClick = (e: React.MouseEvent, item: SocialSchedule) => {
        e.stopPropagation();

        // Check if this is a regular event (converted from Event type)
        if (item.group_id === -1) {
            // This is a regular event, use onEventClick callback
            if (onEventClick) {
                onEventClick(item as any);
            }
            return;
        }

        // 일회성 일정만 수정 가능 (date가 있는 경우)
        const isOneTimeSchedule = !!item.date;

        // 등록자 본인이거나 관리자인 경우 수정 가능
        const isOwner = user && item.user_id === user.id;
        const canEdit = (isOwner || isAdmin) && isOneTimeSchedule;

        openModal('socialDetail', {
            schedule: item,
            isAdmin: canEdit,
            showCopyButton: false,
            onEdit: (s: any) => openModal('socialEdit', { item: s, itemType: 'schedule' })
        });
    };

    // Sort schedules by date and start_time
    const sortedSchedules = [...nonRegularSchedules].sort((a, b) => {
        // First sort by date
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        // Then sort by start_time
        const timeA = a.start_time || '';
        const timeB = b.start_time || '';
        return timeA.localeCompare(timeB);
    });

    return (
        <section className="all-social-container">
            <div className="all-social-title-area">
                <i className="ri-calendar-line" style={{ color: '#4a9eff', fontSize: '1.2rem' }}></i>
                <h2 className="all-social-title">이번주 소셜 일정</h2>
                <span className="all-social-count">{nonRegularSchedules.length}</span>
                {onViewAll && (
                    <button className="evt-view-all-btn" onClick={onViewAll}>
                        전체보기 ❯
                    </button>
                )}
            </div>

            <HorizontalScrollNav>
                <div className="all-social-scroller">
                    {sortedSchedules.map((item) => (
                        <div
                            key={item.id}
                            className="all-social-card"
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
                    ))}
                    {/* Spacer for last item padding */}
                    <div className="all-social-scroller-spacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
});

AllSocialSchedules.displayName = 'AllSocialSchedules';

export default AllSocialSchedules;
