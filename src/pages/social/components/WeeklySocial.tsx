import React, { useState, useMemo } from 'react';
import type { SocialSchedule } from '../types';
import './WeeklySocial.css';

interface WeeklySocialProps {
    schedules: SocialSchedule[];
    onScheduleClick: (schedule: SocialSchedule) => void;
}

const WeeklySocial: React.FC<WeeklySocialProps> = ({ schedules, onScheduleClick }) => {
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());

    const weekdays = [
        { id: 0, name: '일' }, { id: 1, name: '월' }, { id: 2, name: '화' },
        { id: 3, name: '수' }, { id: 4, name: '목' }, { id: 5, name: '금' }, { id: 6, name: '토' }
    ];

    const filteredSchedules = useMemo(() => {
        return schedules.filter(s => {
            if (s.date) {
                return new Date(s.date).getDay() === selectedDay;
            }
            return s.day_of_week === selectedDay;
        });
    }, [schedules, selectedDay]);

    return (
        <section className="weekly-social-container">
            <h2 className="section-title">금주의 일정</h2>

            <div className="day-selector">
                {weekdays.map((day) => (
                    <button
                        key={day.id}
                        className={`day-btn ${selectedDay === day.id ? 'active' : ''}`}
                        onClick={() => setSelectedDay(day.id)}
                    >
                        <span className="day-name">{day.name}</span>
                        {selectedDay === day.id && <div className="active-indicator" />}
                    </button>
                ))}
            </div>

            <div className="weekly-list">
                {filteredSchedules.length > 0 ? (
                    filteredSchedules.map((item) => (
                        <div
                            key={item.id}
                            className="weekly-item"
                            onClick={() => onScheduleClick(item)}
                        >
                            <div className="weekly-time-box">
                                <span className="weekly-time">{item.start_time?.substring(0, 5) || '--:--'}</span>
                            </div>
                            <div className="weekly-details">
                                <h3 className="weekly-item-title">{item.title}</h3>
                                <div className="weekly-meta">
                                    <span className="weekly-place">
                                        <i className="ri-map-pin-line"></i> {item.place_name}
                                    </span>
                                </div>
                            </div>
                            <div className="weekly-arrow">
                                <i className="ri-arrow-right-s-line"></i>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-weekly">
                        <i className="ri-calendar-todo-line"></i>
                        <p>선택한 요일에 예정된 소셜이 없습니다.</p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default WeeklySocial;
