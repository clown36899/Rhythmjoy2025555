
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useModal } from '../../../hooks/useModal';
import type { UnifiedSocialEvent } from '../types';
import './SocialCalendar.css';

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
  const socialEventModal = useModal('socialEvent');
  const socialEditModal = useModal('socialEdit');
  const socialDetailModal = useModal('socialDetail');
  const venueDetailModal = useModal('venueDetail');

  const { isAdmin } = useAuth();

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
      onEdit: () => handleEditClick(event),
      readonly,
      onVenueClick: (venueId: string) => {
        venueDetailModal.open({ venueId });
      }
    });
  };



  const handleEditClick = async (unifiedEvent: UnifiedSocialEvent) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch the schedule data
      const { data: scheduleData, error } = await supabase
        .from('social_schedules')
        .select('id, user_id, created_at, day_of_week, place_name, title, image_url, image_micro, image_thumbnail, image_medium, image_full, start_time, description, link_name, link_url, venue_id')
        .eq('id', unifiedEvent.originalId)
        .maybeSingle();

      if (error || !scheduleData) {
        console.error('Error fetching schedule:', error);
        alert('일정을 불러오는 데 실패했습니다.');
        return;
      }

      // Check permission: user_id must match OR user is admin
      if (scheduleData.user_id !== user?.id && !isAdmin) {
        alert('수정 권한이 없습니다. 본인이 등록한 일정만 수정할 수 있습니다.');
        return;
      }

      // Permission granted - open edit modal
      socialEditModal.open({
        item: scheduleData,
        itemType: 'schedule',
        onSuccess: (data: any, isDelete?: boolean) => {
          if (isDelete) {
            onEventDeleted(scheduleData.id);
          } else if (data) {
            onEventUpdated(data);
          }
        }
      });
      socialDetailModal.close();
    } catch (error) {
      console.error('Permission check error:', error);
      alert('권한 확인 중 오류가 발생했습니다.');
    }
  };

  const handleAddEvent = (dayId: number) => {
    socialEventModal.open({
      preselectedDay: dayId,
      onEventCreated: (data: any) => {
        onEventCreated(data);
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