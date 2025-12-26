import React, { memo } from 'react';
import type { SocialSchedule } from '../types';
import './TodaySocial.css';
import { useModalActions } from '../../../contexts/ModalContext';
import { HorizontalScrollNav } from '../../v2/components/HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';

// 1. Props 인터페이스 수정
interface TodaySocialProps {
    schedules: SocialSchedule[];
    onViewAll?: () => void;
    onEventClick?: (event: any) => void;
}

const TodaySocial: React.FC<TodaySocialProps> = memo(({ schedules, onViewAll, onEventClick }) => {
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();

    // Generate a random key on mount to trigger shuffle
    const [mountKey] = React.useState(() => Math.random());

    // Shuffle schedules randomly on each mount (page entry)
    const shuffledSchedules = React.useMemo(() => {
        const shuffled = [...schedules];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }, [schedules, mountKey]);

    if (shuffledSchedules.length === 0) return null;

    const getMediumImage = (item: SocialSchedule) => {
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_medium) return item.image_medium;
        if (item.image_micro) return item.image_micro;
        if (item.image_full) return item.image_full;
        if (item.image_url) return item.image_url;
        return '';
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

        // This is a social schedule
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

    return (
        <section className="today-social-container">
            <div className="section-title-area">
                <i className="ri-fire-fill" style={{ color: '#ff4b2b', fontSize: '1.2rem' }}></i>
                <h2 className="section-title">오늘 일정</h2>
                <span className="live-badge">LIVE</span>
                {onViewAll && (
                    <button className="evt-view-all-btn" onClick={onViewAll}>
                        전체보기 ❯
                    </button>
                )}
            </div>

            <HorizontalScrollNav>
                <div className="today-scroller">
                    {shuffledSchedules.map((item) => (
                        <div
                            key={item.id}
                            className="today-card"
                            onClick={(e) => handleScheduleClick(e, item)}
                        >
                            <div className="today-card-image">
                                {getMediumImage(item) ? (
                                    <img src={getMediumImage(item)} alt={item.title} loading="lazy" />
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
                            </div>
                            <div className="today-card-info">
                                <h3 className="today-card-title">{item.title}</h3>
                                <p className="today-card-place">
                                    <i className="ri-map-pin-line"></i>
                                    {item.place_name || '장소 미정'}
                                </p>
                            </div>
                        </div>
                    ))}
                    {/* Spacer for last item padding */}
                    <div className="scroller-spacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
});

export default TodaySocial;
