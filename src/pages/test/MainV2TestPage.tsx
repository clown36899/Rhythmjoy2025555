import React, { useState, useMemo, useEffect } from 'react';
import './MainV2TestPage.css';
import '../../pages/calendar/styles/FullEventCalendar.css';
import { supabase } from '../../lib/supabase'; // Direct Supabase Import
import { getLocalDateString, getKSTDay, getDayName } from '../v2/utils/eventListUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useEventModal } from '../../hooks/useEventModal';
import EventDetailModal from '../v2/components/EventDetailModal';
import LoginModal from '../../components/LoginModal';

// Custom SVG Icons for Menu Items - Improved Design (No Gradients)
const TodayBarIcon = () => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#FF3B30" rx="18" />
        <rect y="22" width="100" height="78" fill="#FFFFFF" rx="0" />
        <text x="50" y="16" fontSize="11" fill="white" textAnchor="middle" fontWeight="700" letterSpacing="0.5">
            {getDayName(getLocalDateString())}
        </text>
        <text x="50" y="68" fontSize="40" fill="#000000" textAnchor="middle" fontWeight="600" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">
            {parseInt(getLocalDateString().split('-')[2])}
        </text>
    </svg>
);

const WorkshopIcon = () => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#007AFF" rx="18" />
        {/* Person silhouette */}
        <circle cx="50" cy="32" r="14" fill="white" />
        <ellipse cx="50" cy="65" rx="22" ry="18" fill="white" />
        {/* Book/Teaching element */}
        <rect x="38" y="70" width="24" height="3" fill="#007AFF" rx="1.5" />
        <rect x="42" y="75" width="16" height="2" fill="#007AFF" rx="1" />
    </svg>
);

const EventIcon = () => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#FF2D55" rx="18" />
        {/* Confetti/celebration elements */}
        <circle cx="30" cy="25" r="4" fill="#FFD60A" />
        <circle cx="70" cy="30" r="5" fill="#FFD60A" />
        <rect x="25" y="45" width="6" height="12" fill="#FFD60A" rx="3" transform="rotate(20 28 51)" />
        <rect x="68" y="50" width="6" height="12" fill="#FFD60A" rx="3" transform="rotate(-15 71 56)" />
        {/* Star */}
        <polygon points="50,35 54,45 65,46 57,53 59,64 50,58 41,64 43,53 35,46 46,45" fill="white" />
        {/* Streamers */}
        <path d="M 20 70 Q 25 75 30 70 Q 35 65 40 70" stroke="#FFD60A" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 60 70 Q 65 75 70 70 Q 75 65 80 70" stroke="#FFD60A" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
);

const CalendarIcon = () => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#34C759" rx="18" />
        {/* Calendar body */}
        <rect x="18" y="28" width="64" height="56" fill="white" rx="6" />
        {/* Calendar header */}
        <rect x="18" y="28" width="64" height="16" fill="#2A9D3F" rx="6" />
        <rect x="18" y="36" width="64" height="8" fill="#2A9D3F" />
        {/* Binding rings */}
        <circle cx="32" cy="28" r="3" fill="white" />
        <circle cx="50" cy="28" r="3" fill="white" />
        <circle cx="68" cy="28" r="3" fill="white" />
        {/* Date grid */}
        <rect x="24" y="50" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="36" y="50" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="48" y="50" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="60" y="50" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="24" y="60" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="36" y="60" width="8" height="7" fill="#34C759" rx="2" />
        {/* Highlighted date */}
        <rect x="48" y="60" width="8" height="7" fill="#FF3B30" rx="2" />
        <rect x="60" y="60" width="8" height="7" fill="#34C759" rx="2" />
        <rect x="24" y="70" width="8" height="7" fill="#34C759" rx="2" />
    </svg>
);

const ClubIcon = () => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#AF52DE" rx="18" />
        {/* Three people silhouettes */}
        {/* Left person */}
        <circle cx="32" cy="38" r="9" fill="white" opacity="0.9" />
        <ellipse cx="32" cy="58" rx="13" ry="11" fill="white" opacity="0.9" />
        {/* Right person */}
        <circle cx="68" cy="38" r="9" fill="white" opacity="0.9" />
        <ellipse cx="68" cy="58" rx="13" ry="11" fill="white" opacity="0.9" />
        {/* Center person (front) */}
        <circle cx="50" cy="42" r="11" fill="white" />
        <ellipse cx="50" cy="66" rx="16" ry="13" fill="white" />
        {/* Connection line */}
        <path d="M 25 75 Q 50 82 75 75" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
);

// Menu Items
const MENU_ITEMS = [
    { id: 'today_bar', label: '오늘연bar', type: 'icon', component: TodayBarIcon },
    { id: 'guest_workshop', label: '외강', type: 'icon', component: WorkshopIcon },
    { id: 'events', label: '행사', type: 'icon', component: EventIcon },
    { id: 'calendar', label: '전체달력', type: 'icon', component: CalendarIcon },
    { id: 'club_schedule', label: '동호회일정', type: 'icon', component: ClubIcon },
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
    const { user, isAdmin, loading } = useAuth();
    const eventModal = useEventModal();
    const [activeTab, setActiveTab] = useState<string>(MENU_ITEMS[0].id);
    const [viewType, setViewType] = useState<'list' | 'week' | 'calendar'>('week');
    const [selectedDateForView, setSelectedDateForView] = useState<string>(getLocalDateString());
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    // Auto Login Prompt
    useEffect(() => {
        if (!loading && !user) {
            setIsLoginModalOpen(true);
        }
    }, [loading, user]);

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

                // 2. Fetch Social Schedules (from events table with group_id)
                const socialPromise = supabase
                    .from("events")
                    .select("*")
                    .not("group_id", "is", null)
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
                id: String(schedule.id),
                title: schedule.title,
                date: schedule.date,
                start_date: schedule.date,
                end_date: schedule.date,
                category: schedule.v2_category || 'social',
                image: schedule.image_full || schedule.image_url || schedule.image,
                image_micro: schedule.image_micro,
                location: schedule.location,
                time: schedule.time,
                originalEvent: schedule
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
            'calendar-bg-red-500', 'calendar-bg-orange-500', 'calendar-bg-amber-500', 'calendar-bg-yellow-500',
            'calendar-bg-lime-500', 'calendar-bg-green-500', 'calendar-bg-emerald-500', 'calendar-bg-teal-500',
            'calendar-bg-cyan-500', 'calendar-bg-sky-500', 'calendar-bg-blue-500', 'calendar-bg-indigo-500',
            'calendar-bg-violet-500', 'calendar-bg-purple-500', 'calendar-bg-fuchsia-500', 'calendar-bg-pink-500',
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
                            <div className="menu-thumb-box">
                                {item.component && <item.component />}
                            </div>
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

            {/* Login Modal */}
            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                message={`리듬조이에 오신 것을 환영합니다!\n로그인 후 더 많은 기능을 이용해보세요.`}
            />
        </div>
    );
};

export default MainV2TestPage;
