import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import SocialSubMenu from '../components/SocialSubMenu';
import SocialEventModal from '../components/SocialEventModal';
import './socialcal.css';

interface SocialEvent {
  id: number;
  place_id: number;
  place_name: string;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}

export default function SocialCalendarPage() {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);

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

      const { data, error } = await supabase
        .from('social_schedules')
        .select(`
          id,
          place_id,
          title,
          date,
          start_time,
          end_time,
          description,
          social_places!inner(name)
        `)
        .gte('date', firstDay.toISOString().split('T')[0])
        .lte('date', lastDay.toISOString().split('T')[0])
        .order('date')
        .order('start_time');

      if (error) throw error;

      const formattedEvents = (data || []).map((item: any) => ({
        id: item.id,
        place_id: item.place_id,
        place_name: item.social_places?.name || '알 수 없음',
        title: item.title,
        date: item.date,
        start_time: item.start_time,
        end_time: item.end_time,
        description: item.description,
      }));

      setEvents(formattedEvents);
    } catch (error) {
      console.error('일정 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = (date: Date) => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      handleDoubleClick(date);
    } else {
      const timeout = setTimeout(() => {
        setClickTimeout(null);
      }, 300);
      setClickTimeout(timeout);
    }
  };

  const handleDoubleClick = (date: Date) => {
    if (isAdmin) {
      setSelectedDate(date);
      setShowEventModal(true);
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
    return events.filter(event => event.date === dateStr);
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

            {/* 요일 헤더 */}
            <div className="socialcal-weekday-header">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div
                  key={day}
                  className={`socialcal-weekday ${
                    index === 0 ? 'socialcal-weekday-sun' : 
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
                    onClick={() => handleDateClick(date)}
                    className={`socialcal-day-cell ${isToday ? 'socialcal-day-cell-today' : ''}`}
                  >
                    <div
                      className={`socialcal-day-number ${
                        index % 7 === 0 ? 'socialcal-day-number-sun' :
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
                  events.map((event) => (
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

      {showEventModal && selectedDate && (
        <SocialEventModal
          date={selectedDate}
          onClose={() => {
            setShowEventModal(false);
            setSelectedDate(null);
          }}
          onSaved={loadEvents}
        />
      )}
    </div>
  );
}
