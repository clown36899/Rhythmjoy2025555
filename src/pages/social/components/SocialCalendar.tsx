import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import SocialEditModal from './SocialEditModal';
import SocialEventModal from './SocialEventModal';
import SocialDetailModal from './SocialDetailModal';
import VenueDetailModal from '../../practice/components/VenueDetailModal';
import type { UnifiedSocialEvent } from '../types';
import './SocialCalendar.css';

interface SocialCalendarProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  events: UnifiedSocialEvent[];
  loading: boolean;
  onEventCreated: (data: any) => void;
  onEventUpdated: (data: any) => void;
  onEventDeleted: (originalId: number) => void;
  readonly?: boolean;
}

export default function SocialCalendar({
  showModal,
  setShowModal,
  events,
  loading,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
  readonly = false
}: SocialCalendarProps) {
  // Modals Local State
  const [editingItem, setEditingItem] = useState<{ item: any; type: 'event' | 'schedule' } | null>(null);
  const [detailItem, setDetailItem] = useState<UnifiedSocialEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

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
    setDetailItem(event);
  };

  const handleVenueClick = (e: React.MouseEvent, venueId: string) => {
    e.stopPropagation();
    setSelectedVenueId(venueId);
  };

  const handleEditClick = async (unifiedEvent: UnifiedSocialEvent) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch the schedule data
      const { data: scheduleData, error } = await supabase
        .from('social_schedules')
        .select('*')
        .eq('id', unifiedEvent.originalId)
        .single();

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
      setEditingItem({ item: scheduleData, type: 'schedule' });
      setDetailItem(null);
    } catch (error) {
      console.error('Permission check error:', error);
      alert('권한 확인 중 오류가 발생했습니다.');
    }
  };

  const handleAddEvent = (dayId: number) => {
    setSelectedDay(dayId);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDay(null);
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
                              <img src={event.imageUrl} alt={event.title} className="compact-image" loading="lazy" />
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

      {showModal && (
        <SocialEventModal
          onClose={handleCloseModal}
          onEventCreated={(data) => {
            onEventCreated(data);
            handleCloseModal();
          }}
          preselectedDay={selectedDay ?? undefined}
        />
      )}

      {detailItem && (
        <SocialDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => handleEditClick(detailItem)}
          readonly={readonly}
          onVenueClick={(venueId) => {
            setSelectedVenueId(venueId);
            // Optionally close detail modal if you want to switch context, 
            // but keeping it open underneath or closing it is a design choice.
            // Let's keep detail item open? No, venue detail is a modal on top.
          }}
        />
      )}


      {editingItem && (
        <SocialEditModal
          item={editingItem.item}
          itemType={'schedule'}
          onClose={() => setEditingItem(null)}
          onSuccess={(data, isDelete) => {
            if (isDelete) {
              // editingItem.item.id는 number 타입이어야 함
              onEventDeleted(editingItem.item.id);
            } else if (data) {
              onEventUpdated(data);
            }
            setEditingItem(null);
          }}
        />
      )}
      {editingItem && (
        <SocialEditModal
          item={editingItem.item}
          itemType={'schedule'}
          onClose={() => setEditingItem(null)}
          onSuccess={(data, isDelete) => {
            if (isDelete) {
              // editingItem.item.id는 number 타입이어야 함
              onEventDeleted(editingItem.item.id);
            } else if (data) {
              onEventUpdated(data);
            }
            setEditingItem(null);
          }}
        />
      )}

      {selectedVenueId && (
        <VenueDetailModal
          venueId={selectedVenueId}
          onClose={() => setSelectedVenueId(null)}
        />
      )}
    </>
  );
}