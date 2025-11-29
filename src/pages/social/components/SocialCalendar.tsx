import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
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

  const fetchUnifiedEvents = async () => {
    setLoading(true);
    try {
      // 1. social_events (별도 등록된 소셜 일정) 가져오기
      const { data: socialEvents, error: socialEventsError } = await supabase
        .from('social_events')
        .select('*, social_places(name)');

      if (socialEventsError) throw socialEventsError;

      // 2. social_schedules (장소별 일정) 가져오기
      const { data: placeSchedules, error: placeSchedulesError } = await supabase
        .from('social_schedules')
        .select('*, social_places(name)');

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
            // @ts-ignore
            placeName: event.social_places?.name || '장소 미정',
          });
        });
      }

      if (placeSchedules) {
        placeSchedules.forEach(schedule => {
          unifiedEvents.push({
            id: `schedule-${schedule.id}`,
            title: schedule.title,
            date: schedule.date,
            // social_schedules에는 이미지가 없으므로 imageUrl은 undefined
            // @ts-ignore
            placeName: schedule.social_places?.name,
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
                  {dayInfo.events.map(event => (
                    <div key={event.id} className="event-item">
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
    </>
  );
}