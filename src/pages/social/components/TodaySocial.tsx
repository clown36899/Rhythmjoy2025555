import React, { memo } from 'react';
import type { SocialSchedule } from '../types';
import './TodaySocial.css';
import { useModalActions } from '../../../contexts/ModalContext';
import { HorizontalScrollNav } from '../../v2/components/HorizontalScrollNav';

// 1. Props 인터페이스 수정
interface TodaySocialProps {
    schedules: SocialSchedule[];
    onViewAll?: () => void;
}

const TodaySocial: React.FC<TodaySocialProps> = memo(({ schedules, onViewAll }) => {
    const { openModal } = useModalActions();

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
        if (item.image_medium) return item.image_medium;
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_micro) return item.image_micro;
        const fallback = item.image_url || '';
        return fallback;
    };

    const handleScheduleClick = (e: React.MouseEvent, item: SocialSchedule) => {
        e.stopPropagation();
        openModal('socialDetail', { schedule: item, isAdmin: false });
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
