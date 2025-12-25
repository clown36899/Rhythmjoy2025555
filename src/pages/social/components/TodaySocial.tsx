import React from 'react';
import type { SocialSchedule } from '../types';
import './TodaySocial.css';

// 1. Props 인터페이스 수정
interface TodaySocialProps {
    schedules: SocialSchedule[];
    onScheduleClick: (schedule: SocialSchedule) => void;
}

// 2. 컴포넌트 정의 수정
const TodaySocial: React.FC<TodaySocialProps> = ({ schedules, onScheduleClick }) => {
    if (schedules.length === 0) return null;

    const getMediumImage = (item: SocialSchedule) => {
        // ... (이미지 처리 로직 그대로 유지)
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_micro) return item.image_micro;
        const fallback = item.image_url || '';
        if (fallback.includes('/social/full/')) {
            return fallback.replace('/social/full/', '/social/thumbnail/');
        }
        if (fallback.includes('/social-schedules/full/')) {
            return fallback.replace('/social-schedules/full/', '/social-schedules/thumbnail/');
        }
        if (fallback.includes('/event-posters/full/')) {
            return fallback.replace('/event-posters/full/', '/event-posters/thumbnail/');
        }
        return fallback;
    };

    return (
        <section className="today-social-container">
            <div className="section-title-area">
                <h2 className="section-title">오늘의 소셜</h2>
                <span className="live-badge">LIVE</span>
            </div>

            <div className="today-scroller">
                {schedules.map((item) => (
                    <div
                        key={item.id}
                        className="today-card"
                        onClick={() => onScheduleClick(item)}
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
                                <i className="ri-map-pin-2-fill"></i> {item.place_name}
                            </p>
                        </div>
                    </div>
                ))}
                {/* 여유 공간을 위한 더미 */}
                <div className="scroller-spacer" />
            </div>
        </section>
    );
};

export default TodaySocial;
