import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/cafe24Client';
import SocialSubMenu from '../components/SocialSubMenu';
import './socialcal.css';

interface SocialEvent {
  id: string; // Changed to string to support prefixes
  place_id: number;
  place_name: string;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  scope?: string; // 'domestic' | 'overseas'
}

export default function SocialCalendarPage() {
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'all' | 'domestic' | 'overseas'>('all');

  useEffect(() => {
    loadEvents();
  }, [currentDate]);

  const loadEvents = async () => {
    try {
      setLoading(true);

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const firstDayStr = firstDay.toISOString().split('T')[0];
      const lastDayStr = lastDay.toISOString().split('T')[0];

      // Fetch Integrated Events
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          location,
          title,
          start_date,
          end_date,
          date,
          time,
          description,
          scope,
          category,
          event_dates,
          group_id
        `)
        .or(`date.gte.${firstDayStr},start_date.gte.${firstDayStr},end_date.gte.${firstDayStr}`)
        .not('group_id', 'is', null); // Focus on social events

      if (error) throw error;

      // Process Integrated Events
      const allEvents: SocialEvent[] = [];
      (data || []).forEach((item: any) => {
        const processDate = (d: string) => {
          if (d >= firstDayStr && d <= lastDayStr) {
            allEvents.push({
              id: item.group_id ? `social-${item.id}-${d}` : `event-${item.id}-${d}`,
              place_id: item.group_id || 0,
              place_name: item.location || '장소 미정',
              title: item.title,
              date: d,
              start_time: item.time,
              description: item.description,
              scope: item.scope || 'domestic'
            });
          }
        };

        if (item.event_dates && Array.isArray(item.event_dates)) {
          item.event_dates.forEach((d: string) => processDate(d));
        } else if (item.start_date && item.end_date) {
          const loopDate = new Date(item.start_date);
          const endDate = new Date(item.end_date);
          while (loopDate <= endDate) {
            processDate(loopDate.toISOString().split('T')[0]);
            loopDate.setDate(loopDate.getDate() + 1);
          }
        } else if (item.date) {
          processDate(item.date);
        }
      });

      // Sort by date then time
      allEvents.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('일정 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };


  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(event => {
      if (event.date !== dateStr) return false;
      if (activeTab === 'all') return true;
      if (activeTab === 'domestic') return event.scope !== 'overseas';
      if (activeTab === 'overseas') return event.scope === 'overseas';
      return true;
    });
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const days = getDaysInMonth();

  return (
    <div className="socialcal-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div
        className="socialcal-header"
        style={{
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <h1 className="socialcal-title">전체 소셜 일정</h1>
      </div>

      <SocialSubMenu />

      <div className="socialcal-content">
        {loading ? (
          <div className="socialcal-loading">
            <div className="socialcal-loading-text">로딩 중...</div>
          </div>
        ) : (
          <>
            {/* 달력 헤더 */}
            <div className="socialcal-controls">
              <button
                onClick={prevMonth}
                className="socialcal-nav-btn"
              >
                <i className="ri-arrow-left-s-line text-xl"></i>
              </button>
              <h2 className="socialcal-month-title">
                {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
              </h2>
              <button
                onClick={nextMonth}
                className="socialcal-nav-btn"
              >
                <i className="ri-arrow-right-s-line text-xl"></i>
              </button>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '8px' }}>
              {(['all', 'domestic', 'overseas'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '20px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: activeTab === tab ? '#111' : '#fff',
                    color: activeTab === tab ? '#fff' : '#64748b',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {tab === 'all' && <span>📅 전체</span>}
                  {tab === 'domestic' && <span>🇰🇷 국내</span>}
                  {tab === 'overseas' && <span>🌏 국외</span>}
                </button>
              ))}
            </div>

            {/* 요일 헤더 */}
            <div className="socialcal-weekday-header">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div
                  key={day}
                  className={`socialcal-weekday ${index === 0 ? 'socialcal-weekday-sun' :
                    index === 6 ? 'socialcal-weekday-sat' :
                      'socialcal-weekday-normal'
                    }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 달력 그리드 */}
            <div className="socialcal-grid">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="socialcal-empty-cell" />;
                }

                const dayEvents = getEventsForDate(date);
                const isToday =
                  date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={date.toISOString()}
                    className={`socialcal-day-cell ${isToday ? 'socialcal-day-cell-today' : ''}`}
                  >
                    <div
                      className={`socialcal-day-number ${index % 7 === 0 ? 'socialcal-day-number-sun' :
                        index % 7 === 6 ? 'socialcal-day-number-sat' :
                          'socialcal-day-number-normal'
                        }`}
                    >
                      {date.getDate()}
                    </div>

                    {/* 일정 표시 */}
                    <div className="socialcal-events">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className="socialcal-event-item"
                          title={`${event.place_name}: ${event.title}`}
                        >
                          {event.place_name}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="socialcal-more-events">
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 일정 목록 */}
            <div className="socialcal-event-list">
              <h3 className="socialcal-event-list-title">이번 달 일정</h3>
              <div className="socialcal-event-list-items">
                {events.length === 0 ? (
                  <div className="socialcal-event-list-empty">
                    등록된 일정이 없습니다
                  </div>
                ) : (
                  events.filter(e => {
                    if (activeTab === 'all') return true;
                    if (activeTab === 'domestic') return e.scope !== 'overseas';
                    if (activeTab === 'overseas') return e.scope === 'overseas';
                    return true;
                  }).map((event) => (
                    <div
                      key={event.id}
                      className="socialcal-event-card"
                    >
                      <div className="socialcal-event-header">
                        <div className="socialcal-event-title">{event.title}</div>
                        <div className="socialcal-event-date">
                          {new Date(event.date).getMonth() + 1}/{new Date(event.date).getDate()}
                        </div>
                      </div>
                      <div className="socialcal-event-place">
                        📍 {event.place_name}
                      </div>
                      {event.start_time && (
                        <div className="socialcal-event-time">
                          ⏰ {event.start_time.slice(0, 5)}
                          {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                        </div>
                      )}
                      {event.description && (
                        <div className="socialcal-event-description">
                          {event.description}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
