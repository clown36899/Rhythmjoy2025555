import React from 'react';
import type { SocialSchedule } from '../types';
import './TodaySocial.css';

interface TodaySocialProps {
    schedules: SocialSchedule[];
    onScheduleClick: (schedule: SocialSchedule) => void;
}

const TodaySocial: React.FC<TodaySocialProps> = ({ schedules, onScheduleClick }) => {
    if (schedules.length === 0) return null;

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
                            {item.image_medium ? (
                                <img src={item.image_medium} alt={item.title} loading="lazy" />
                            ) : (
                                <div className="today-placeholder">
                                    <i className="ri-calendar-event-line"></i>
                                </div>
                            )}
                            <div className="today-card-overlay">
                                <span className="today-time">{item.start_time?.substring(0, 5)}</span>
                            </div>
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
