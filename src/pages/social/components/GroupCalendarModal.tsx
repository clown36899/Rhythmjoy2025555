import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { SocialSchedule, SocialGroup } from '../types';
import './GroupCalendarModal.css';

interface GroupCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: SocialGroup;
    onScheduleClick: (schedule: SocialSchedule) => void;
    allSchedules: SocialSchedule[];
}

const GroupCalendarModal: React.FC<GroupCalendarModalProps> = ({
    isOpen,
    onClose,
    group,
    onScheduleClick,
    allSchedules
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [viewMode, setViewMode] = useState<'month' | 'day'>('month');

    // 전달받은 전체 스케줄에서 현재 그룹의 스케줄만 필터링
    const groupSchedules = useMemo(() => {
        return allSchedules.filter(s => s.group_id === group.id);
    }, [allSchedules, group.id]);

    const daysInMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];
        const startDay = firstDay.getDay();

        for (let i = 0; i < startDay; i++) {
            days.push({ day: null, fullDate: null, dayOfWeek: i });
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            days.push({
                day: i,
                fullDate: dateStr,
                dayOfWeek: new Date(year, month, i).getDay()
            });
        }
        return days;
    }, [currentDate]);

    const getSchedulesForDate = (fullDate: string | null, dayOfWeek: number | undefined) => {
        if (!fullDate) return [];
        return groupSchedules.filter(s => {
            if (s.date === fullDate) return true;
            if (!s.date && s.day_of_week === dayOfWeek) return true;
            return false;
        }).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    };

    const selectedDateSchedules = useMemo(() => {
        if (!selectedDate) return [];
        const dateObj = new Date(selectedDate);
        return getSchedulesForDate(selectedDate, dateObj.getDay());
    }, [selectedDate, groupSchedules]);

    if (!isOpen) return null;

    return createPortal(
        <div className="group-calendar-overlay" onClick={onClose}>
            <div className="group-calendar-container" onClick={(e) => e.stopPropagation()}>
                <div className="calendar-header">
                    {viewMode === 'day' ? (
                        <button className="back-to-month-btn" onClick={() => setViewMode('month')}>
                            <i className="ri-arrow-left-line"></i> 달력으로
                        </button>
                    ) : (
                        <div className="group-mini-info">
                            <span className="group-badge">{group.type === 'club' ? '동호회' : '바'}</span>
                            <h3>{group.name}</h3>
                        </div>
                    )}
                    <button className="close-btn-circle" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className={`calendar-month-selector ${viewMode === 'day' ? 'hidden' : ''}`}>
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

                <div className={`calendar-grid ${viewMode === 'day' ? 'hidden' : ''}`}>
                    {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <div key={d} className="weekday-label">{d}</div>
                    ))}
                    {daysInMonth.map((item, idx) => {
                        const dateSchedules = getSchedulesForDate(item.fullDate, item.dayOfWeek);
                        const hasEvents = dateSchedules.length > 0;
                        const isSelected = item.fullDate === selectedDate;

                        return (
                            <div
                                key={idx}
                                className={`calendar-cell ${!item.day ? 'empty' : ''} ${hasEvents ? 'has-events' : ''} ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                    if (item.day && item.fullDate) {
                                        setSelectedDate(item.fullDate);
                                        setViewMode('day'); // 날짜 선택 시 상세 뷰로 전환
                                    }
                                }}
                            >
                                {item.day && (
                                    <>
                                        <span className="date-num">{item.day}</span>
                                        {hasEvents && (
                                            <div className="event-indicators">
                                                {dateSchedules.map(s => (
                                                    <div key={s.id} className="event-dot" />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Day 모드일 때만 리스트 표시 (화면 전환) */}
                {viewMode === 'day' && (
                    <div className="daily-schedule-list expanded">
                        {selectedDate && (
                            <div className="selected-date-info">
                                <span className="info-label">{selectedDate.split('-')[1]}월 {selectedDate.split('-')[2]}일 일정</span>
                                <span className="event-count-badge">{selectedDateSchedules.length}건</span>
                            </div>
                        )}
                        <div className="daily-items-scroll">
                            {selectedDateSchedules.length > 0 ? (
                                selectedDateSchedules.map(s => (
                                    <div key={s.id} className="daily-schedule-item" onClick={() => onScheduleClick(s)}>
                                        <div className="daily-item-image">
                                            {/* 가장 작은 이미지 우선 사용 */}
                                            {(s.image_micro || s.image_thumbnail || s.image_url) ? (
                                                <img
                                                    src={s.image_micro || s.image_thumbnail || s.image_url || ''}
                                                    alt={s.title}
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <i className="ri-image-line"></i>
                                            )}
                                        </div>
                                        <div className="daily-item-time">{s.start_time?.substring(0, 5)}</div>
                                        <div className="daily-item-content">
                                            <div className="daily-item-title">{s.title}</div>
                                            <div className="daily-item-place">{s.place_name}</div>
                                        </div>
                                        <i className="ri-arrow-right-s-line"></i>
                                    </div>
                                ))
                            ) : (
                                <div className="daily-empty">일정이 없습니다.</div>
                            )}
                        </div>
                    </div>
                )}

                <div className="calendar-footer-legend">
                    {viewMode === 'month' ? (
                        <p><i className="ri-cursor-line"></i> 날짜를 클릭하면 상세 일정을 볼 수 있습니다.</p>
                    ) : (
                        <p><i className="ri-information-line"></i> 시간순으로 정렬된 일정 목록입니다.</p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GroupCalendarModal;
