import React, { useState, useMemo } from 'react';
import type { SocialSchedule } from '../types';
import { getLocalDateString, getKSTDay, getDayName } from '../../v2/utils/eventListUtils';
import { useEventModal } from '../../../hooks/useEventModal';
import EventDetailModal from '../../v2/components/EventDetailModal';
import './WeeklySocial.css';

interface WeeklySocialProps {
    schedules: SocialSchedule[];
    onScheduleClick: (schedule: SocialSchedule) => void;
    activeTab: 'weekly' | 'regular'; // Updated Prop
    onAddSchedule?: (date: string) => void;
}

type SubViewType = 'list' | 'week' | 'calendar';

interface DisplayItem {
    id: string;
    title: string;
    image?: string;
    date?: string;
    time?: string;
    sub: string;
    category?: string;
    image_micro?: string;
    originalEvent: any;
}

const WeeklySocial: React.FC<WeeklySocialProps> = ({
    schedules,
    onScheduleClick,
    activeTab, // Receive activeTab
    onAddSchedule
}) => {
    // Internal activeTab state Removed.

    // =========================================================================
    // V2 Logic for 'weekly' tab
    // =========================================================================

    const [viewType, setViewType] = useState<SubViewType>('week');
    const [weekViewDate, setWeekViewDate] = useState<Date>(new Date());
    const [selectedDateForView, setSelectedDateForView] = useState<string>(getLocalDateString());
    const [randomSeed, setRandomSeed] = useState<number>(Math.random()); // Seed for randomization

    // Auth/Admin state mocking or retrieving - context not passed, but EventDetailModal takes isAdminMode. 
    // We assume mostly read-only here or inherit from parent if needed. 
    // The previous WeeklySocial didn't use useAuth. We'll pass false or check if we need to add useAuth.
    // For now, let's keep it simple.

    const eventModal = useEventModal(); // Use the global modal hook

    // Mapping schedules to DisplayFormat
    const displayItems = useMemo<DisplayItem[]>(() => {
        const mapped = schedules.map(s => {
            const dateStr = s.date || '';
            return {
                id: String(s.id),
                title: s.title,
                image: s.image_thumbnail || s.image_url, // Prefer thumbnail 
                date: dateStr,
                time: s.start_time,
                sub: `${s.start_time ? s.start_time.substring(0, 5) : ''} ${s.place_name || ''}`,
                category: 'social', // Mostly social here
                image_micro: s.image_micro,
                originalEvent: s
            };
        });

        // Split into Domestic and Overseas
        const overseas = mapped.filter(item => item.originalEvent.scope === 'overseas');
        const domestic = mapped.filter(item => item.originalEvent.scope !== 'overseas');

        // Shuffle Domestic items using Fisher-Yates
        // Note: usage of randomSeed dependency guarantees re-shuffle only when seed changes
        for (let i = domestic.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [domestic[i], domestic[j]] = [domestic[j], domestic[i]];
        }

        // Return Domestic (shuffled) + Overseas (fixed at end)
        // Note: For grid view, the filtering by date is subsequent, so this relative order is preserved within each day.
        return [...domestic, ...overseas];
    }, [schedules, randomSeed]);

    // Filter Items based on SubView
    const filteredItemsForView = useMemo(() => {
        // Common filter: Must be a dated schedule (not regular)
        // AND for 'weekly' tab we generally want to exclude things that are irrelevant?
        // Actually the previous 'weekly' tab showed only THIS week.
        // The V2 'weekly' tab (which is really a full calendar/list view now) should probably show everything relevant to the view window.

        // 1. Filter out regular schedules (no date)
        const datedItems = displayItems.filter(item => item.date && item.date.length > 0);

        if (viewType === 'list') {
            // "List" view: Show future items from Today onwards (like main-v2)
            const today = getLocalDateString();
            return datedItems.filter(item => (item.date || '') >= today);
        }

        if (viewType === 'week') {
            // "Week" view: Filter by the weekGridDates logic is done in the RENDER loop usually, 
            // but here we just pass all valid dated items and let the grid map them?
            // Or we can optimize. Let's return all dated items for the week grid to pick from.
            return datedItems;
        }

        if (viewType === 'calendar') {
            // "Calendar" view: currently selected date
            return datedItems.filter(item => item.date === selectedDateForView);
        }

        return [];
    }, [displayItems, viewType, selectedDateForView]);

    // Navigation Handlers
    const handlePrevWeek = () => {
        const newDate = new Date(weekViewDate);
        newDate.setDate(weekViewDate.getDate() - 7);
        setWeekViewDate(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(weekViewDate);
        newDate.setDate(weekViewDate.getDate() + 7);
        setWeekViewDate(newDate);
    };

    const handleToday = () => {
        setWeekViewDate(new Date());
        setRandomSeed(Math.random());
    };

    // Week Grid Dates Calculation
    const weekGridDates = useMemo(() => {
        const viewDateStr = getLocalDateString(weekViewDate);
        const viewDate = new Date(viewDateStr);
        const kstDay = getKSTDay(weekViewDate);

        // Calculate Sunday of this week
        const start = new Date(viewDate);
        start.setDate(viewDate.getDate() - kstDay); // Subtract current day index (0=Sun)

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(getLocalDateString(d));
        }
        return dates;
    }, [weekViewDate]);

    // Calendar Strip Dates (Standard 14 days from Today for now, or match view?)
    const calendarStripDates = useMemo(() => {
        const dates = [];
        const start = new Date(getLocalDateString());
        for (let i = 0; i < 14; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(getLocalDateString(d));
        }
        return dates;
    }, []);

    const getEventColor = (id: string) => {
        const colors = [
            'cal-bg-red-500', 'cal-bg-orange-500', 'cal-bg-amber-500', 'cal-bg-yellow-500',
            'cal-bg-lime-500', 'cal-bg-green-500', 'cal-bg-emerald-500', 'cal-bg-teal-500',
            'cal-bg-cyan-500', 'cal-bg-sky-500', 'cal-bg-blue-500', 'cal-bg-indigo-500'
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const weekNames = ['일', '월', '화', '수', '목', '금', '토'];

    // =========================================================================
    // Legacy / Other Tabs Logic
    // =========================================================================

    // Regular Schedules (unchanged logic)
    const regularSchedulesByDay = useMemo(() => {
        const grouped: { [key: number]: SocialSchedule[] } = {};
        for (let i = 0; i < 7; i++) grouped[i] = [];

        schedules.forEach(s => {
            if (!s.date && s.day_of_week !== null && s.day_of_week !== undefined) {
                grouped[s.day_of_week].push(s);
            }
        });

        Object.values(grouped).forEach(list => {
            list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        });

        return grouped;
    }, [schedules]);

    const renderRegularCompactCard = (item: SocialSchedule) => {
        const getSmallImage = (item: SocialSchedule) => {
            if (item.image_micro) return item.image_micro;
            if (item.image_thumbnail) return item.image_thumbnail;
            return item.image_url || '';
        };

        return (
            <div
                key={item.id}
                className="regular-compact-card"
                onClick={() => onScheduleClick(item)}
            >
                <div className="compact-image-area">
                    {getSmallImage(item) ? (
                        <img src={getSmallImage(item)} alt={item.title} loading="lazy" />
                    ) : (
                        <div className="compact-placeholder">
                            <i className="ri-image-line"></i>
                        </div>
                    )}
                    <div className="compact-time-badge">{item.start_time?.substring(0, 5)}</div>
                </div>
                <div className="compact-title">{item.title}</div>
                <div className="compact-place">{item.place_name}</div>
            </div>
        );
    };

    // All Schedules List (Legacy Render Function)



    return (
        <section className="weekly-social-container">


            {/* TAB CONTENT: WEEKLY (New V2 Design) */}
            {activeTab === 'weekly' && (
                <>
                    {/* Title & View Toggles */}
                    <div className="title-toggle-row">


                        <div className="view-toggle-container">
                            {/* Week Navigation - Only Visible in Week View */}
                            {viewType === 'week' && (
                                <div className="week-nav-group">
                                    <button className="nav-btn" onClick={handlePrevWeek}>&lt;</button>
                                    <button className="nav-btn today" onClick={handleToday}>이번주</button>
                                    <button className="nav-btn" onClick={handleNextWeek}>&gt;</button>
                                </div>
                            )}

                            {/* View Type Toggles */}
                            <div className="view-type-toggles">
                                <button
                                    className={`toggle-btn ${viewType === 'week' ? 'active' : ''}`}
                                    onClick={() => {
                                        setViewType('week');
                                        setRandomSeed(Math.random());
                                    }}
                                >
                                    주간
                                </button>
                                <button
                                    className={`toggle-btn ${viewType === 'list' ? 'active' : ''}`}
                                    onClick={() => {
                                        setViewType('list');
                                        setWeekViewDate(new Date());
                                    }}
                                >
                                    리스트
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Horizontal Date Strip (Calendar View Only) */}
                    {viewType === 'calendar' && (
                        <div className="horizontal-date-strip">
                            {calendarStripDates.map(date => {
                                const dayName = getDayName(date);
                                const dayNum = date.split('-')[2];
                                return (
                                    <button
                                        key={date}
                                        className={`date-chip ${selectedDateForView === date ? 'selected' : ''}`}
                                        onClick={() => setSelectedDateForView(date)}
                                    >
                                        <span className="date-chip-day">{dayName}</span>
                                        <span className="date-chip-date">{dayNum}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Main Content Area */}
                    <div className="daily-list-section">

                        {/* LIST VIEW */}
                        {viewType === 'list' && (
                            filteredItemsForView.length > 0 ? (
                                (() => {
                                    // Group by Date
                                    const grouped = filteredItemsForView.reduce((acc, item) => {
                                        const date = item.date || '날짜 미정';
                                        if (!acc[date]) acc[date] = [];
                                        acc[date].push(item);
                                        return acc;
                                    }, {} as Record<string, DisplayItem[]>);
                                    const sortedDates = Object.keys(grouped).sort();

                                    return sortedDates.map(date => (
                                        <div key={date} className="daily-group">
                                            <div className="daily-header">
                                                {date} <span>({getDayName(date)})</span>
                                            </div>
                                            <div className="daily-items-list">
                                                {grouped[date].map(item => (
                                                    <div key={item.id} className="daily-item-row" onClick={() => eventModal.setSelectedEvent(item.originalEvent)}>
                                                        <img src={item.image || '/logo.png'} alt={item.title} className="daily-item-thumb" onError={e => e.currentTarget.src = '/logo.png'} />
                                                        <div className="daily-item-info">
                                                            <div className="daily-item-title">{item.title}</div>
                                                            <div className="daily-item-sub">{item.sub}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()
                            ) : (
                                <div className="empty-weekly">
                                    <i className="ri-calendar-check-line"></i>
                                    <p>예정된 일정이 없습니다.</p>
                                </div>
                            )
                        )}

                        {/* WEEK VIEW - Grid */}
                        {viewType === 'week' && (
                            <div className="week-view-grid">
                                {weekGridDates.map(date => {
                                    const dayObj = new Date(date);
                                    const dayNum = date.split('-')[2];
                                    const dayOfWeek = dayObj.getDay();
                                    const isToday = date === getLocalDateString();
                                    // Filter items for this specific date
                                    const dayItems = filteredItemsForView.filter(item => item.date === date);

                                    const dateNumberClass = `calendar-date-number-fullscreen ${isToday ? "calendar-date-number-today" : dayOfWeek === 0 ? "calendar-date-sunday" : dayOfWeek === 6 ? "calendar-date-saturday" : ""}`;

                                    return (
                                        <div key={date} className="week-view-cell">
                                            {/* Header */}
                                            <div className="week-view-cell-header">
                                                <span className={dateNumberClass}>
                                                    <span className="weekday-wrapper">
                                                        {weekNames[dayOfWeek]}
                                                    </span>
                                                    <span className="day-number">{parseInt(dayNum)}</span>
                                                </span>
                                            </div>

                                            {/* Body */}
                                            <div className="week-view-cell-body">
                                                {dayItems.map(item => {
                                                    const categoryColor = getEventColor(item.id);
                                                    return (
                                                        <div key={item.id} className="calendar-fullscreen-event-card"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                eventModal.setSelectedEvent(item.originalEvent);
                                                            }}>
                                                            {(item.image || item.image_micro) ? (
                                                                <div className="event-card-img-wrapper">
                                                                    <img src={item.image || item.image_micro} alt="" />
                                                                </div>
                                                            ) : (
                                                                <div className={`calendar-fullscreen-placeholder ${categoryColor} event-card-placeholder`}>
                                                                    <span>
                                                                        {item.title.charAt(0)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="event-card-title">
                                                                {item.title}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* Add Button */}
                                                <button
                                                    className="week-grid-add-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAddSchedule && onAddSchedule(date);
                                                    }}
                                                >
                                                    <i className="ri-add-line"></i>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* CALENDAR VIEW - Daily List for Selected Date */}
                        {viewType === 'calendar' && (
                            filteredItemsForView.length > 0 ? (
                                <div className="daily-items-list">
                                    {filteredItemsForView.map(item => (
                                        <div key={item.id} className="daily-item-row" onClick={() => eventModal.setSelectedEvent(item.originalEvent)}>
                                            <img src={item.image || '/logo.png'} alt={item.title} className="daily-item-thumb" onError={e => e.currentTarget.src = '/logo.png'} />
                                            <div className="daily-item-info">
                                                <div className="daily-item-title">{item.title}</div>
                                                <div className="daily-item-sub">{item.sub}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: '#666', textAlign: 'center', padding: '40px 0' }}>
                                    해당 날짜의 일정이 없습니다.
                                </div>
                            )
                        )}

                    </div>
                </>
            )}

            {/* TAB CONTENT: REGULAR */}
            {activeTab === 'regular' && (
                <>
                    <div style={{

                        marginBottom: '16px',
                        padding: '12px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        color: '#93c5fd',
                        lineHeight: '1.4',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <i className="ri-information-line" style={{ fontSize: '1.2rem' }}></i>
                        <span>
                            정기소셜일정은 언제든 취소될 수 있습니다.
                            <br />
                            <strong>금주의 일정</strong>은 확정된 일정입니다.
                        </span>
                    </div>

                    <div className="regular-kanban-container">
                        {([1, 2, 3, 4, 5, 6, 0] as const).map(dayIdx => {
                            const dayItems = regularSchedulesByDay[dayIdx];
                            return (
                                <div key={dayIdx} className="kanban-column">
                                    <div className={`kanban-header day-${dayIdx}`}>
                                        {weekNames[dayIdx]}
                                    </div>
                                    <div className="kanban-items">
                                        {dayItems.length > 0 ? (
                                            dayItems.map(renderRegularCompactCard)
                                        ) : (
                                            <div className="kanban-empty" style={{ textAlign: 'center', color: '#444', fontSize: '12px' }}>없음</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Event Detail Modal integration */}
            {eventModal.selectedEvent && (
                <EventDetailModal
                    event={eventModal.selectedEvent}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={eventModal.closeAllModals}
                    isAdminMode={false} // Defaulting to false as we don't have context here
                    onEdit={() => { }} // Read-only mostly? or parent handles reload? 
                    onDelete={() => {
                        eventModal.closeAllModals();
                    }}
                />
            )}
        </section>
    );
};

export default WeeklySocial;
