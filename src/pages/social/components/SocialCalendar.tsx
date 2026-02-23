
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useModal } from '../../../hooks/useModal';
import type { UnifiedSocialEvent } from '../types';
import './SocialCalendar.css';
import { useEventActions } from '../../v2/hooks/useEventActions';

interface SocialCalendarProps {
  events: UnifiedSocialEvent[];
  loading: boolean;
  onEventCreated: (data: any) => void;
  onEventUpdated: (data: any) => void;
  onEventDeleted: (originalId: number) => void;
  readonly?: boolean;
}

export default function SocialCalendar({
  events,
  loading,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
  readonly = false
}: SocialCalendarProps) {
  // Global modals
  const eventRegisterModal = useModal('eventRegistration');
  const socialDetailModal = useModal('socialDetail');
  const venueDetailModal = useModal('venueDetail');

  const { isAdmin, user, signInWithKakao } = useAuth();
  const { handleDeleteClick, isDeleting, deleteProgress } = useEventActions({
    adminType: null,
    user,
    signInWithKakao
  });

  const weekdays = [
    { id: 0, name: "일" },
    { id: 1, name: "월" },
    { id: 2, name: "화" },
    { id: 3, name: "수" },
    { id: 4, name: "목" },
    { id: 5, name: "금" },
    { id: 6, name: "토" },
  ];

  const handleCardClick = (event: UnifiedSocialEvent) => {
    socialDetailModal.open({
      item: event,
      readonly,
      onDelete: async (_data: any, e: any) => {
        const success = await handleDeleteClick(event as any, e);
        if (success) {
          socialDetailModal.close();
        }
      },
      isDeleting,
      deleteProgress,
      onVenueClick: (venueId: string) => {
        venueDetailModal.open({ venueId });
      }
    });
  };




  const handleAddEvent = (dayId: number) => {
    eventRegisterModal.open({
      dayOfWeek: dayId,
      selectedDate: new Date(),
      onEventCreated: (_date: any, eventId?: any) => {
        // Fetch new event to sync
        if (eventId) {
          supabase.from('events').select('*').eq('id', eventId).maybeSingle().then(({ data }) => {
            if (data) onEventCreated(data);
          });
        }
      }
    });
  };

  return (
    <>
      <div className="social-weekly-container">
        {loading ? (
          <div className="scal-loader">일정 로딩 중...</div>
        ) : (
          <div className="weekly-grid">
            {weekdays.map((day) => {
              const today = new Date().getDay();
              const isToday = day.id === today;

              return (
                <div key={day.id} className="day-column">
                  <div className="column-header">
                    <div className="column-header-content">
                      {isToday && <span className="today-indicator">오늘</span>}
                      <span className="day-name">{day.name}</span>
                    </div>
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
                          {event.imageUrl && (
                            <div className="compact-image-wrapper">
                              <img
                                src={event.imageUrlThumbnail || event.imageUrl}
                                alt={event.title}
                                className="compact-image"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div className="compact-place">{event.placeName || '미정'}</div>
                          <div className="compact-title">{event.title}</div>
                        </div>
                      ))
                    }
                    {/* Add Button moved to bottom of list - Hide if readonly */}
                    {!readonly && (
                      <button
                        className="add-event-button-bottom"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddEvent(day.id);
                        }}
                        aria-label={`${day.name}요일에 이벤트 추가`}
                      >
                        <i className="ri-add-line"></i>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}