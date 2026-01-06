import React, { useMemo } from 'react';
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
    // Get today's date in YYYY-MM-DD format (KST)
    const today = useMemo(() => {
        const now = new Date();
        const kstOffset = 9 * 60; // KST is UTC+9
        const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
        return kstTime.toISOString().split('T')[0];
    }, []);

    // Filter and sort future schedules for this group
    const futureSchedules = useMemo(() => {
        const groupSchedules = allSchedules.filter(s => s.group_id === group.id);

        // Filter for future schedules only
        const future = groupSchedules.filter(s => {
            // If schedule has a specific date, check if it's today or later
            if (s.date) {
                return s.date >= today;
            }
            // If no date (recurring), include it
            return true;
        });

        // Sort by date and time
        return future.sort((a, b) => {
            // First sort by date (recurring schedules without date go to end)
            if (a.date && b.date) {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
            } else if (a.date && !b.date) {
                return -1; // a comes first
            } else if (!a.date && b.date) {
                return 1; // b comes first
            }

            // Then sort by time
            const timeA = a.start_time || '';
            const timeB = b.start_time || '';
            return timeA.localeCompare(timeB);
        });
    }, [allSchedules, group.id, today]);

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

                {/* Schedule List */}
                <div className="daily-schedule-list expanded">
                    <div className="selected-date-info">
                        <span className="info-label">예정된 일정</span>
                        <span className="event-count-badge">{futureSchedules.length}건</span>
                    </div>
                    <div className="daily-items-scroll">
                        {futureSchedules.length > 0 ? (
                            futureSchedules.map(s => (
                                <div key={s.id} className="daily-schedule-item" onClick={() => onScheduleClick(s)}>
                                    <div className="daily-item-image">
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
                                    <div className="daily-item-time">
                                        {s.date ? (
                                            <>
                                                <div>{s.date.split('-')[1]}/{s.date.split('-')[2]}</div>
                                                <div style={{ fontSize: '0.75em', opacity: 0.8 }}>
                                                    {s.start_time?.substring(0, 5)}
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                {['일', '월', '화', '수', '목', '금', '토'][s.day_of_week || 0]}
                                                <div style={{ fontSize: '0.75em', opacity: 0.8 }}>
                                                    {s.start_time?.substring(0, 5)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="daily-item-content">
                                        <div className="daily-item-title">{s.title}</div>
                                        <div className="daily-item-place">{s.place_name}</div>
                                    </div>
                                    <i className="ri-arrow-right-s-line"></i>
                                </div>
                            ))
                        ) : (
                            <div className="daily-empty">예정된 일정이 없습니다.</div>
                        )}
                    </div>
                </div>

                <div className="calendar-footer-legend">
                    <p><i className="ri-information-line"></i> 오늘 이후 예정된 일정 목록입니다.</p>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GroupCalendarModal;
