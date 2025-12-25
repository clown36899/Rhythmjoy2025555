import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { SocialSchedule, SocialGroup } from '../types';
import { useSocialSchedulesNew } from '../hooks/useSocialSchedulesNew';
import './GroupCalendarModal.css';

interface GroupCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: SocialGroup;
    onScheduleClick: (schedule: SocialSchedule) => void;
}

const GroupCalendarModal: React.FC<GroupCalendarModalProps> = ({
    isOpen,
    onClose,
    group,
    onScheduleClick
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const { schedules } = useSocialSchedulesNew(group.id);

    const daysInMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        const days = [];
        // Previous month filler
        for (let i = 0; i < firstDay; i++) {
            days.push({ day: null, fullDate: null });
        }
        // Current month days
        for (let i = 1; i <= lastDate; i++) {
            const d = new Date(year, month, i);
            const iso = d.toISOString().split('T')[0];
            days.push({ day: i, fullDate: iso, dayOfWeek: d.getDay() });
        }
        return days;
    }, [currentDate]);

    const getSchedulesForDate = (fullDate: string | null, dayOfWeek: number | undefined) => {
        if (!fullDate) return [];
        return schedules.filter(s => {
            if (s.date === fullDate) return true;
            if (!s.date && s.day_of_week === dayOfWeek) return true;
            return false;
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="group-calendar-overlay" onClick={onClose}>
            <div className="group-calendar-container" onClick={(e) => e.stopPropagation()}>
                <div className="calendar-header">
                    <div className="group-mini-info">
                        <span className="group-badge">{group.type === 'club' ? '동호회' : '바'}</span>
                        <h3>{group.name}</h3>
                    </div>
                    <button className="close-btn-circle" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="calendar-month-selector">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>
                        <i className="ri-arrow-left-s-line"></i>
                    </button>
                    <span className="current-month-label">
                        {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                    </span>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>
                        <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>

                <div className="calendar-grid">
                    {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <div key={d} className="weekday-label">{d}</div>
                    ))}
                    {daysInMonth.map((item, idx) => {
                        const dateSchedules = getSchedulesForDate(item.fullDate, item.dayOfWeek);
                        const hasEvents = dateSchedules.length > 0;

                        return (
                            <div key={idx} className={`calendar-cell ${!item.day ? 'empty' : ''} ${hasEvents ? 'has-events' : ''}`}>
                                {item.day && (
                                    <>
                                        <span className="date-num">{item.day}</span>
                                        {hasEvents && (
                                            <div className="event-indicators">
                                                {dateSchedules.map(s => (
                                                    <div
                                                        key={s.id}
                                                        className="event-dot"
                                                        onClick={() => onScheduleClick(s)}
                                                        title={s.title}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="calendar-footer-legend">
                    <p><i className="ri-information-line"></i> 점이 있는 날짜는 소셜 일정이 있는 날입니다.</p>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GroupCalendarModal;
