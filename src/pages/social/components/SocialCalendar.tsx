import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import SocialEditModal from './SocialEditModal';
import SocialEventModal from './SocialEventModal';

// 두 종류의 이벤트를 통합하여 관리하기 위한 타입
interface UnifiedSocialEvent {
  id: string; // 'event-1' 또는 'schedule-1' 형식으로 고유성 보장
  title: string;
  date: string;
  imageUrl?: string;
  placeName?: string;
  startTime?: string;
}

interface SocialCalendarProps {
  currentMonth: Date;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
}

export default function SocialCalendar({ currentMonth, showModal, setShowModal }: SocialCalendarProps) {
  const [events, setEvents] = useState<UnifiedSocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<{ item: any; type: 'event' | 'schedule' } | null>(null);

  const fetchUnifiedEvents = async () => {
    setLoading(true);
    try {
      // 1. social_events (별도 등록된 소셜 일정) 가져오기
      const { data: socialEvents, error: socialEventsError } = await supabase
        .from('social_events')
        .select('id, title, event_date, image_url, social_places!place_id(name)');

      if (socialEventsError) throw socialEventsError;

      // 2. social_schedules (장소별 일정) 가져오기
      const { data: placeSchedules, error: placeSchedulesError } = await supabase
        .from('social_schedules')
        .select('id, title, date, start_time, social_places!place_id(name)');

      if (placeSchedulesError) throw placeSchedulesError;

      // 3. 두 데이터를 UnifiedSocialEvent 형태로 변환 및 병합
      const unifiedEvents: UnifiedSocialEvent[] = [];

      if (socialEvents) {
        socialEvents.forEach(event => {
          unifiedEvents.push({
            id: `event-${event.id}`,
            title: event.title,
            date: event.event_date,
            imageUrl: event.image_url,
            placeName: (event.social_places as { name: string }[])?.[0]?.name || '장소 미정',
          });
        });
      }

      if (placeSchedules) {
        placeSchedules.forEach(schedule => {
          unifiedEvents.push({
            id: `schedule-${schedule.id}`,
            title: schedule.title,
            date: schedule.date,
            placeName: (schedule.social_places as { name: string }[])?.[0]?.name,
            startTime: schedule.start_time,
          });
        });
      }

      setEvents(unifiedEvents);
    } catch (error) {
      console.error('소셜 일정 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnifiedEvents();
  }, []);

  const handleEventClick = async (unifiedEvent: UnifiedSocialEvent) => {
    const [type, idStr] = unifiedEvent.id.split('-');
    const id = parseInt(idStr, 10);

    if (type === 'event') {
      const { data } = await supabase
        .from('social_events')
        .select('id, title, event_date, place_id, description, image_url, social_places!place_id(name)')
        .eq('id', id)
        .single();
      if (data) setEditingItem({ item: data, type: 'event' });
    } else if (type === 'schedule') {
      const { data } = await supabase
        .from('social_schedules')
        .select('id, place_id, title, date, start_time, end_time, description, social_places!place_id(name)')
        .eq('id', id)
        .single();
      if (data) setEditingItem({ item: data, type: 'schedule' });
    }
  };

  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid = [];
    let day = 1;
    for (let i = 0; i < 6; i++) {
      const week = [];
      for (let j = 0; j < 7; j++) {
        if (i === 0 && j < firstDayOfMonth) {
          week.push(null);
        } else if (day > daysInMonth) {
          week.push(null);
        } else {
          const date = new Date(year, month, day);
          const dateString = date.toISOString().split('T')[0];
          const dayEvents = events.filter(e => e.date === dateString);
          week.push({ day, date, events: dayEvents });
          day++;
        }
      }
      grid.push(week);
      if (day > daysInMonth) break;
    }
    return grid;
  }, [currentMonth, events]);

  return (
    <>
      {loading ? <div className="loader-text" style={{textAlign: 'center', padding: '2.5rem 0'}}>일정 로딩 중...</div> : (
        <div className="calendar-grid">
          {calendarGrid.flat().map((dayInfo, index) => ( // .flat()으로 2차원 배열을 1차원으로 만듦
            <div key={index} className="calendar-cell">
              {dayInfo && <>
                <span className="day-number">{dayInfo.day}</span>
                <div className="events-container">
                  {dayInfo.events.map((event) => (
                    <div key={event.id} className="event-item" onClick={() => handleEventClick(event)}>
                      {event.imageUrl && (
                        <img src={event.imageUrl} alt={event.title} className="event-image" />
                      )}
                      <p className="event-title" title={event.title}>
                        {event.startTime && <span className="event-time">{event.startTime.substring(0, 5)}</span>}
                        {event.title}
                      </p>
                      {event.placeName && (
                        <p className="event-place">{event.placeName}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>}
            </div>
          ))}
        </div>
      )}

      {showModal && <SocialEventModal onClose={() => setShowModal(false)} onEventCreated={() => { setShowModal(false); fetchUnifiedEvents(); }} />}

      {editingItem && (
        <SocialEditModal
          item={editingItem.item}
          itemType={editingItem.type}
          onClose={() => setEditingItem(null)}
          onSuccess={() => {
            setEditingItem(null);
            fetchUnifiedEvents();
          }}
        />
      )}
    </>
  );
}