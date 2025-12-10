import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import SocialEditModal from './SocialEditModal';
import SocialEventModal from './SocialEventModal';
import SocialDetailModal from './SocialDetailModal';
import './SocialCalendar.css';

export interface UnifiedSocialEvent {
  id: string;
  type: 'event' | 'schedule';
  originalId: number;
  title: string;
  placeName?: string;
  dayOfWeek?: number;
  startTime?: string;
  date?: string;
  imageUrl?: string;
  inquiryContact?: string;
  linkName?: string;
  linkUrl?: string;
  description?: string;
  placeId?: number;
}

interface SocialCalendarProps {
  currentMonth: Date;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
}

export default function SocialCalendar({ currentMonth, showModal, setShowModal }: SocialCalendarProps) {
  const [events, setEvents] = useState<UnifiedSocialEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [editingItem, setEditingItem] = useState<{ item: any; type: 'event' | 'schedule' } | null>(null);
  const [detailItem, setDetailItem] = useState<UnifiedSocialEvent | null>(null);

  const weekdays = [
    { id: 0, name: "일" },
    { id: 1, name: "월" },
    { id: 2, name: "화" },
    { id: 3, name: "수" },
    { id: 4, name: "목" },
    { id: 5, name: "금" },
    { id: 6, name: "토" },
  ];

  const fetchUnifiedEvents = async () => {
    setLoading(true);
    try {
      const { data: placeSchedules, error: placeSchedulesError } = await supabase
        .from('social_schedules')
        .select(`
          id, title, date, start_time, day_of_week, 
          inquiry_contact, link_name, link_url, description, place_id,
          social_places(name)
        `);

      if (placeSchedulesError) throw placeSchedulesError;

      const { data: socialEvents, error: socialEventsError } = await supabase
        .from('social_events')
        .select(`
          id, title, event_date, image_url, description, place_id,
          social_places(name)
        `);

      if (socialEventsError) throw socialEventsError;

      const unifiedEvents: UnifiedSocialEvent[] = [];

      if (placeSchedules) {
        placeSchedules.forEach(schedule => {
          let dow = schedule.day_of_week;
          if (dow === null || dow === undefined) {
            if (schedule.date) {
              dow = new Date(schedule.date).getDay();
            }
          }

          if (dow !== null && dow !== undefined) {
            unifiedEvents.push({
              id: `schedule-${schedule.id}`,
              type: 'schedule',
              originalId: schedule.id,
              title: schedule.title,
              dayOfWeek: dow,
              startTime: schedule.start_time,
              placeName: (schedule.social_places as any)?.name,
              placeId: schedule.place_id,
              inquiryContact: schedule.inquiry_contact,
              linkName: schedule.link_name,
              linkUrl: schedule.link_url,
              description: schedule.description,
            });
          }
        });
      }

      if (socialEvents) {
        socialEvents.forEach(event => {
          const date = new Date(event.event_date);
          const dow = date.getDay();
          unifiedEvents.push({
            id: `event-${event.id}`,
            type: 'event',
            originalId: event.id,
            title: event.title,
            date: event.event_date,
            dayOfWeek: dow,
            imageUrl: event.image_url,
            placeName: (event.social_places as any)?.name,
            placeId: event.place_id,
            description: event.description,
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

  const handleCardClick = (event: UnifiedSocialEvent) => {
    setDetailItem(event);
  };

  const handleEditClick = async (unifiedEvent: UnifiedSocialEvent) => {
    if (unifiedEvent.type === 'schedule') {
      const { data } = await supabase
        .from('social_schedules')
        .select('*')
        .eq('id', unifiedEvent.originalId)
        .single();
      if (data) setEditingItem({ item: data, type: 'schedule' });
    } else {
      const { data } = await supabase
        .from('social_events')
        .select('*')
        .eq('id', unifiedEvent.originalId)
        .single();
      if (data) setEditingItem({ item: data, type: 'event' });
    }
    setDetailItem(null);
  };

  return (
    <>
      <div className="social-weekly-container">
        {loading ? (
          <div className="scal-loader">일정 로딩 중...</div>
        ) : (
          <div className="weekly-grid">
            {weekdays.map((day) => (
              <div key={day.id} className="day-column">
                <div className="column-header">
                  {day.name}
                </div>
                <div className="column-content">
                  {events
                    .filter(e => e.dayOfWeek === day.id)
                    .map(event => (
                      <div
                        key={event.id}
                        className="compact-event-card"
                        onClick={() => handleCardClick(event)}
                      >
                        <div className="compact-place">{event.placeName || '미정'}</div>
                        <div className="compact-title">{event.title}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <SocialEventModal
          onClose={() => setShowModal(false)}
          onEventCreated={() => { setShowModal(false); fetchUnifiedEvents(); }}
        />
      )}

      {detailItem && (
        <SocialDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => handleEditClick(detailItem)}
        />
      )}

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