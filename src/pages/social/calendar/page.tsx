import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import SocialSubMenu from '../components/SocialSubMenu';
import SocialEventModal from '../components/SocialEventModal';

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
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div
        className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <h1 className="text-xl font-bold text-white">전체 소셜 일정</h1>
      </div>

      <SocialSubMenu />

      <div className="pt-28 px-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">로딩 중...</div>
          </div>
        ) : (
          <>
            {/* 달력 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <i className="ri-arrow-left-s-line text-xl"></i>
              </button>
              <h2 className="text-lg font-bold text-white">
                {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <i className="ri-arrow-right-s-line text-xl"></i>
              </button>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div
                  key={day}
                  className="text-center text-sm font-bold py-2"
                  style={{
                    color: index === 0 ? '#ef4444' : index === 6 ? '#3b82f6' : '#9ca3af',
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 달력 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const dayEvents = getEventsForDate(date);
                const isToday =
                  date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={date.toISOString()}
                    onClick={() => handleDateClick(date)}
                    className="aspect-square bg-gray-800 rounded-lg p-1 cursor-pointer hover:bg-gray-700 transition-colors overflow-hidden"
                    style={{
                      border: isToday ? '2px solid #10b981' : 'none',
                    }}
                  >
                    <div
                      className="text-xs font-medium mb-1"
                      style={{
                        color:
                          index % 7 === 0
                            ? '#ef4444'
                            : index % 7 === 6
                            ? '#3b82f6'
                            : '#fff',
                      }}
                    >
                      {date.getDate()}
                    </div>

                    {/* 일정 표시 */}
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className="text-[8px] bg-green-600 text-white px-1 rounded truncate"
                          title={`${event.place_name}: ${event.title}`}
                        >
                          {event.place_name}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[8px] text-gray-400 px-1">
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 일정 목록 */}
            <div className="mt-6">
              <h3 className="text-white font-bold mb-3">이번 달 일정</h3>
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="text-gray-400 text-center py-8">
                    등록된 일정이 없습니다
                  </div>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-gray-800 rounded-lg p-3"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-bold text-white">{event.title}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(event.date).getMonth() + 1}/{new Date(event.date).getDate()}
                        </div>
                      </div>
                      <div className="text-sm text-green-400 mb-1">
                        📍 {event.place_name}
                      </div>
                      {event.start_time && (
                        <div className="text-xs text-gray-400">
                          ⏰ {event.start_time.slice(0, 5)}
                          {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                        </div>
                      )}
                      {event.description && (
                        <div className="text-xs text-gray-300 mt-2">
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
