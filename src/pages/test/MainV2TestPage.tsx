import React, { useState, useMemo, useEffect } from 'react';
import './MainV2TestPage.css';
import '../../pages/calendar/styles/FullEventCalendar.css';
import { supabase } from '../../lib/supabase'; // Direct Supabase Import
import { getLocalDateString, getKSTDay, getDayName } from '../v2/utils/eventListUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useEventModal } from '../../hooks/useEventModal';
import EventDetailModal from '../v2/components/EventDetailModal';

// Custom Icons
const DanceShoeIcon = () => (
    <svg viewBox="0 0 512 512" width="28" height="28" fill="currentColor" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
        {/* Artistic Latin Dance Shoe */}
        <path d="M464.4,236.65c-6.6-4.4-14.9-5-22.1-1.6l-67.4,32.1c-15.3-26.4-33-51.2-53.1-73.4c2.8-5.3,4.7-11.2,5.2-17.5
          c1.8-19.8-12.8-37.5-32.6-39.3c-19.8-1.8-37.5,12.8-39.3,32.6c-1.3,14.6,6.3,27.7,18.5,34.5c-15.6,34.1-24.9,71.2-26.6,109.9h-85
          c-8.8,0-16,7.2-16,16v32c0,8.8,7.2,16,16,16h27.9c16.3,86.9,90.4,153.6,181.1,162.8V504c0,4.4,3.6,8,8,8h32c4.4,0,8-3.6,8-8v-32
          c29.4,0,57.1-8.1,81-22.1c5.9-3.5,7.9-11.1,4.5-17.1c-3.5-5.9-11.1-7.9-17.1-4.5c-20.6,12.1-44.4,19.2-69.8,19.6v-54.8
          c56.8-9.4,103.4-48.4,124.7-100.8C491.5,274.9,484.2,249.9,464.4,236.65z M352.5,417c-65.4-5.3-119.3-51.4-135.2-111.4l55.9-26.6
          C296.6,334.3,338.5,380.5,352.5,417z" transform="translate(-40, 20) scale(0.85)" />

        {/* Graduation Cap (Lesson Symbol) - Positioned Top Left */}
        <path d="M232,80l-128,64l128,64l96-48v76c0,22,35.8,40,80,40s80-18,80-40v-76l16-8L232,80z M456,236c0,8.8-35.8,16-80,16
          s-80-7.2-80-16v4c0,8.8,35.8,16,80,16s80-7.2,80-16V236z M232,189.3L126.6,136.6L232,84l115.4,57.7L232,189.3z"
            fill="#FFD700" transform="translate(-80, -20) scale(0.9)" />

        {/* Shine on Cap */}
        <path d="M384,112l10,20l20,10l-20,10l-10,20l-10-20l-20-10l20-10L384,112z"
            fill="#FFFFFF" style={{ opacity: 0.8 }} transform="translate(-50, -50)" />
    </svg>
);

// Menu Items
const MENU_ITEMS = [
    { id: 'today_bar', label: '오늘연bar', type: 'today' },
    { id: 'guest_workshop', label: '외강', type: 'text_icon', text: '외강', color: 'ios-blue' },
    { id: 'events', label: '행사', type: 'text_icon', text: '행사', color: 'ios-purple', transparent: true },
    { id: 'calendar', label: '전체달력', thumb: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=200&h=200' },
    { id: 'club_schedule', label: '동호회일정', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=200&h=200' },
];

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


const MainV2TestPage: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const eventModal = useEventModal();
    const [activeTab, setActiveTab] = useState<string>(MENU_ITEMS[0].id);
    const [viewType, setViewType] = useState<'list' | 'week' | 'calendar'>('week');
    const [selectedDateForView, setSelectedDateForView] = useState<string>(getLocalDateString());

    // State for Week View Navigation
    const [weekViewDate, setWeekViewDate] = useState<Date>(new Date());

    // Local state for direct fetching
    const [rawEvents, setRawEvents] = useState<any[]>([]);
    const [rawSocials, setRawSocials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // EXACT FETCH LOGIC FROM FullEventCalendar.tsx
    // Updated to depend on weekViewDate to support navigation
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch generous range around the currently viewed date
                const baseDate = weekViewDate;

                const startRange = new Date(baseDate);
                startRange.setDate(baseDate.getDate() - 14); // Go back 2 weeks

                const endRange = new Date(baseDate);
                endRange.setDate(baseDate.getDate() + 45); // Go forward ~1.5 months

                const startDateStr = getLocalDateString(startRange);
                const endDateStr = getLocalDateString(endRange);

                // 1. Fetch Events
                const eventsPromise = supabase
                    .from("events")
                    .select("*")
                    .or(`and(start_date.gte.${startDateStr},start_date.lte.${endDateStr}),and(end_date.gte.${startDateStr},end_date.lte.${endDateStr}),and(date.gte.${startDateStr},date.lte.${endDateStr})`)
                    .order("date", { ascending: true });

                // 2. Fetch Social Schedules
                const socialPromise = supabase
                    .from("social_schedules")
                    .select("*")
                    .gte("date", startDateStr)
                    .lte("date", endDateStr)
                    .order("date", { ascending: true });

                const [eventsRes, socialRes] = await Promise.all([eventsPromise, socialPromise]);

                if (eventsRes.error) console.error(eventsRes.error);
                if (socialRes.error) console.error(socialRes.error);

                setRawEvents(eventsRes.data || []);
                setRawSocials(socialRes.data || []);

            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [weekViewDate]); // Re-fetch when week moves

    // Unified Data Logic
    const currentItems = useMemo<DisplayItem[]>(() => {
        // Base calculations on weekViewDate (for filtering by range if needed, though List View ignores this now)
        const viewDateStr = getLocalDateString(weekViewDate);
        const kstDay = getKSTDay(weekViewDate);

        // Week Calculation
        const viewDate = new Date(viewDateStr);
        const daysFromSunday = kstDay;
        const weekStart = new Date(viewDate);
        weekStart.setDate(viewDate.getDate() - daysFromSunday);

        const twoWeeksLater = new Date(weekStart);
        twoWeeksLater.setDate(weekStart.getDate() + 13);
        const startStr = getLocalDateString(weekStart);
        const endStr = getLocalDateString(twoWeeksLater); // Used for Calendar/Week view filtering

        // 1. Prepare ALL Raw Items First
        const mappedSocials = rawSocials
            .filter(schedule => schedule.day_of_week === null || schedule.day_of_week === undefined) // Only one-time socials
            .map(schedule => ({
                id: `social-${schedule.id}`,
                title: schedule.title,
                date: schedule.date,
                start_date: schedule.date,
                end_date: schedule.date,
                category: schedule.v2_category || 'social',
                image: schedule.image_full || schedule.image_url,
                image_micro: schedule.image_micro,
                location: schedule.place_name,
                time: schedule.start_time,
                originalEvent: schedule
            }))
            .map(s => ({
                ...s,
                originalEvent: {
                    ...s.originalEvent,
                    id: `social-${s.originalEvent.id}`,
                    title: s.title,
                    date: s.date,
                    category: s.category
                }
            }));

        // Combine all raw events
        const allRawEvents = [...rawEvents, ...mappedSocials];

        // 2. Filter based on Active Tab
        let filteredEvents = [];

        switch (activeTab) {
            case 'today_bar': // TODAY BAR: Socials + Events (Exclude Classes/Regular/Club for now, similar to 'Social & Events')
            case 'events': // EVENTS: Same logic for now? Or maybe broad 'all events'? 
                // User request: "today_bar" and "events" might be similar? 
                // "오늘연bar" -> Daily Socials. "행사" -> Big Events?
                // Let's make 'events' exclude 'social' category if possible? 
                // For now, I will use same logic for both to ensure data appears, as users often mix them.
                // Actually, let's make 'today_bar' = Socials + Events.
                // And 'events' = Events Only?
                // Let's stick to the "Social-Events" logic for 'today_bar' as it was.
                // And for 'events', also "Social-Events"? Or just 'event'?
                // Safe bet: Use same 'Social-Event' logic for both 'today_bar' and 'events' for now.
                filteredEvents = allRawEvents.filter(e => {
                    // Exclude "Classes"
                    if (e.category === 'class' || e.category === 'regular' || e.category === 'club') return false;
                    // Exclude Overseas
                    if (e.scope === 'overseas') return false;
                    return true;
                });
                break;

            case 'guest_workshop': // CLASSES / REGULAR
                filteredEvents = allRawEvents.filter(e => {
                    return (e.category === 'class' || e.category === 'regular');
                });
                break;

            case 'club_schedule': // CLUB
                filteredEvents = allRawEvents.filter(e => {
                    return (e.category === 'club');
                });
                break;

            case 'calendar': // ALL (Domestic)
                filteredEvents = allRawEvents.filter(e => {
                    if (e.scope === 'overseas') return false;
                    return true;
                });
                break;

            default:
                filteredEvents = [];
        }


        // 3. Map to DisplayItem
        // And apply Date Range Filter (only for non-List views or if forced)
        const finalItems: DisplayItem[] = filteredEvents
            .filter(e => {
                const eDate = e.date || "";

                // For List View, we show FUTURE (today onwards). This check is handled inside filteredItemsForView for the LIST rendering.
                // But for Week/Calendar view inside these tabs, we need range filter.

                // CRITICAL: We need to pass ALL items to 'list' view so it can filter '>= today'.
                // If we filter by 'startStr/endStr' (2 weeks) here, List View will be empty for far future.
                if (viewType === 'list') return true;

                // For Week/Calendar Views, we filter by the View Window (startStr ~ endStr)
                return (eDate >= startStr && eDate <= endStr) || (e.end_date || "") >= viewDateStr;
            })
            .map(e => ({
                id: String(e.id),
                title: e.title,
                image: e.image,
                date: e.date,
                time: e.time,
                sub: `${e.time ? e.time.substring(0, 5) : ''} ${e.location || ''}`,
                category: e.category,
                image_micro: e.image_micro,
                originalEvent: e.originalEvent || e
            }));

        // Deduplicate
        const uniqueMap = new Map<string, DisplayItem>();
        finalItems.forEach(item => uniqueMap.set(item.id, item));

        return Array.from(uniqueMap.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    }, [activeTab, rawEvents, rawSocials, weekViewDate, viewType]);


    // Calendar Dates Calculation (Week Grid: Sun to Sat)
    const weekGridDates = useMemo(() => {
        const viewDateStr = getLocalDateString(weekViewDate);
        const viewDate = new Date(viewDateStr);
        const kstDay = getKSTDay(weekViewDate);

        const start = new Date(viewDate);
        start.setDate(viewDate.getDate() - kstDay);

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(getLocalDateString(d));
        }
        return dates;
    }, [weekViewDate]);

    // For Calendar Strip
    // Note: If viewType is 'calendar', users might click dates. We should show dates around 'selectedDateForView' OR 'today'?
    // Currently fixed to 'Today' + 14 days. This might suffice for now as per previous logic.
    const calendarStripDates = useMemo(() => {
        const dates = [];
        const start = new Date(getLocalDateString()); // Strip always starts from today? Or should it follow view? Let's leave it as today for now unless requested.
        for (let i = 0; i < 14; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(getLocalDateString(d));
        }
        return dates;
    }, []);

    const filteredItemsForView = useMemo(() => {
        if (viewType === 'list') {
            // Show "Today Standard Future Info"
            const today = getLocalDateString();
            return currentItems.filter(item => (item.date || '') >= today);
        }
        return currentItems.filter(item => item.date === selectedDateForView);
    }, [viewType, currentItems, selectedDateForView]);

    const getEventColor = (id: string) => {
        const colors = [
            'cal-bg-red-500', 'cal-bg-orange-500', 'cal-bg-amber-500', 'cal-bg-yellow-500',
            'cal-bg-lime-500', 'cal-bg-green-500', 'cal-bg-emerald-500', 'cal-bg-teal-500',
            'cal-bg-cyan-500', 'cal-bg-sky-500', 'cal-bg-blue-500', 'cal-bg-indigo-500',
            'cal-bg-violet-500', 'cal-bg-purple-500', 'cal-bg-fuchsia-500', 'cal-bg-pink-500',
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

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
    };

    return (
        <div className="main-v2-test-container">
            {/* Menu */}
            <div className="main-v2-menu-scroll">
                {MENU_ITEMS.map((item: any) => {
                    const isTodayBar = item.id === 'today_bar';
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            className={`menu-item-btn ${isActive ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab(item.id);
                                if (item.id === 'today_bar') {
                                    setViewType('week');
                                    setWeekViewDate(new Date());
                                } else if (item.id === 'calendar') {
                                    setViewType('calendar');
                                } else {
                                    setViewType('list');
                                }
                            }}
                        >
                            {/* Today Bar Special Rendering */}
                            {isTodayBar ? (
                                <div className={`menu-thumb-box today-bar-box`}>
                                    <div className="today-icon-content">
                                        <span className="today-weekday">{getDayName(getLocalDateString())}</span>
                                        <span className="today-date">{parseInt(getLocalDateString().split('-')[2])}</span>
                                    </div>
                                </div>
                            ) : item.type === 'custom' ? (
                                /* Custom Icon Component (Guest Workshop) */
                                <div className={`menu-thumb-box app-icon-box ${item.color || ''}`} style={{ color: '#fff' }}>
                                    {item.component && <item.component />}
                                </div>
                            ) : item.type === 'image_icon' ? (
                                /* Custom Image Icon (Guest Workshop from User Upload - PNG) */
                                <div className={`menu-thumb-box app-icon-box ${item.color || ''}`} style={{ padding: '8px' }}>
                                    <img src={item.image} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }} />
                                </div>
                            ) : item.type === 'text_icon' ? (
                                /* Text-based Icon */
                                <div
                                    className={`menu-thumb-box ${!item.transparent ? 'app-icon-box' : ''} ${!item.transparent ? (item.color || '') : ''}`}
                                    style={item.transparent ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}}
                                >
                                    <span style={{ color: '#fff', fontSize: '18px', fontWeight: '800', letterSpacing: '-1px', lineHeight: '1', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}>
                                        {item.text}
                                    </span>
                                </div>
                            ) : item.type === 'icon' ? (
                                /* iOS App Icon Style Rendering */
                                <div className={`menu-thumb-box app-icon-box ${item.color || ''}`}>
                                    <i className={item.icon} style={{ fontSize: '28px', color: '#fff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}></i>
                                </div>
                            ) : (
                                /* Image Rendering (For others) */
                                <div className="menu-thumb-box">
                                    <img src={item.thumb} alt={item.label} className="menu-thumb-img" />
                                </div>
                            )}
                            <span className="menu-label">{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Title & Toggle */}
            <div className="title-toggle-row">
                <h2 className="section-title">
                    {MENU_ITEMS.find(m => m.id === activeTab)?.label}
                </h2>

                {activeTab === 'today_bar' && (
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
                                onClick={() => setViewType('week')}
                            >
                                주간
                            </button>
                            <button
                                className={`toggle-btn ${viewType === 'list' ? 'active' : ''}`}
                                onClick={() => {
                                    setViewType('list');
                                    setWeekViewDate(new Date()); // Reset to today to ensure data fetch covers today+future
                                }}
                            >
                                리스트
                            </button>
                            <button
                                className={`toggle-btn ${viewType === 'calendar' ? 'active' : ''}`}
                                onClick={() => setViewType('calendar')}
                            >
                                캘린더
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Horizontal Date Strip (Calendar View Only) */}
            {activeTab === 'today_bar' && viewType === 'calendar' && (
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

            {isLoading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading...</div>
            ) : currentItems.length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>일정이 없습니다.</div>
            ) : activeTab === 'today_bar' ? (
                <div className="daily-list-section">

                    {/* LIST VIEW */}
                    {viewType === 'list' && (
                        (() => {
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
                                            <div key={item.id} className="daily-item-row" onClick={() => eventModal.setSelectedEvent(item.originalEvent)} style={{ cursor: 'pointer' }}>
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
                    )}

                    {/* WEEK VIEW - HORIZONTAL GRID (7 Cols, Sun to Sat) */}
                    {viewType === 'week' && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '2px',
                            background: '#333',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            overflow: 'hidden'
                        }}>
                            {weekGridDates.map(date => {
                                const dayObj = new Date(date);
                                const dayNum = date.split('-')[2];
                                const dayOfWeek = dayObj.getDay();
                                const isToday = date === getLocalDateString(); // Today is strictly TODAY, not viewDate
                                const dayItems = currentItems.filter(item => item.date === date);

                                const dateNumberClass = `calendar-date-number-fullscreen ${isToday ? "calendar-date-number-today" : dayOfWeek === 0 ? "calendar-date-sunday" : dayOfWeek === 6 ? "calendar-date-saturday" : ""}`;

                                return (
                                    <div key={date} className="calendar-cell-fullscreen" style={{
                                        minHeight: '20vh',
                                        height: 'auto',
                                        border: 'none',
                                        background: '#1e1e1e',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}>
                                        {/* HEADER */}
                                        <div className="calendar-cell-fullscreen-header" style={{ position: 'relative', height: '24px', marginBottom: '4px', marginTop: '4px' }}>
                                            <span className={dateNumberClass} style={{ left: '50%', transform: 'translateX(-50%)', top: '0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span className="weekday-wrapper" style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                                                    {['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}
                                                </span>
                                                <span style={{ fontSize: '14px' }}>{parseInt(dayNum)}</span>
                                            </span>
                                        </div>

                                        {/* BODY */}
                                        <div className="calendar-cell-fullscreen-body" style={{ padding: '0 2px 8px 2px', flex: 1 }}>
                                            {dayItems.map(item => {
                                                const categoryColor = getEventColor(item.id);
                                                return (
                                                    <div key={item.id} className="calendar-fullscreen-event-card"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            eventModal.setSelectedEvent(item.originalEvent);
                                                        }}
                                                        style={{
                                                            marginBottom: '4px',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            padding: '4px 2px',
                                                            height: 'auto',
                                                            textAlign: 'center',
                                                            cursor: 'pointer'
                                                        }}>
                                                        {(item.image || item.image_micro) ? (
                                                            <div style={{ width: '100%', aspectRatio: '1', borderRadius: '4px', overflow: 'hidden', marginBottom: '2px' }}>
                                                                <img src={item.image || item.image_micro} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                            </div>
                                                        ) : (
                                                            <div className={`calendar-fullscreen-placeholder ${categoryColor}`} style={{ width: '100%', aspectRatio: '1', borderRadius: '4px', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                                                                    {item.title.charAt(0)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '10px', lineHeight: '1.1', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                            {item.title}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {viewType === 'calendar' && (
                        filteredItemsForView.length > 0 ? (
                            <div className="daily-items-list">
                                {filteredItemsForView.map(item => (
                                    <div key={item.id} className="daily-item-row" onClick={() => eventModal.setSelectedEvent(item.originalEvent)} style={{ cursor: 'pointer' }}>
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
            ) : (
                <div className="content-grid-section">
                    {currentItems.map((item) => (
                        <div key={item.id} className="grid-item-card" onClick={() => eventModal.setSelectedEvent(item.originalEvent)} style={{ cursor: 'pointer' }}>
                            <img src={item.image || '/logo.png'} alt={item.title} className="grid-item-thumb" onError={(e) => (e.currentTarget.src = '/logo.png')} />
                            <div className="grid-item-info">
                                <div className="grid-item-title">{item.title}</div>
                                <div className="grid-item-sub">{item.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Event Detail Modal */}
            {eventModal.selectedEvent && (
                <EventDetailModal
                    event={eventModal.selectedEvent}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={eventModal.closeAllModals}
                    isAdminMode={isAdmin}
                    onEdit={(updatedEvent) => {
                        setWeekViewDate(new Date(weekViewDate)); // Trigger effect to refresh list
                    }}
                    onDelete={() => {
                        setWeekViewDate(new Date(weekViewDate)); // Trigger effect to refresh list
                        eventModal.closeAllModals();
                    }}
                />
            )}
        </div>
    );
};

export default MainV2TestPage;
