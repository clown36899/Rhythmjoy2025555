import { useState, useEffect, useRef } from 'react';
import {
  SocialCalendar,
} from './components';
import SocialEditModal from './components/SocialEditModal';

import CalendarSearchModal from '../v2/components/CalendarSearchModal';
import EventDetailModal from '../v2/components/EventDetailModal';
import './social.css';

import { useSocialSchedules } from './hooks/useSocialSchedules';
import { useModal } from '../../hooks/useModal';


export default function SocialPage() {
  // Modal State
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Layout State



  // Data Fetching Hook
  const {
    events,
    loading: schedulesLoading
  } = useSocialSchedules();

  const socialEventModal = useModal('socialEvent');

  // Note: Social event registration is now handled by SocialCalendar internally via useModal

  // Search from header
  useEffect(() => {
    const handleOpenSearch = () => setShowSearchModal(true);
    const handleOpenRegistration = () => {
      socialEventModal.open({
        onEventCreated: handleForceReload
      });
    };

    window.addEventListener('openEventSearch', handleOpenSearch);
    window.addEventListener('openSocialRegistration', handleOpenRegistration);

    return () => {
      window.removeEventListener('openEventSearch', handleOpenSearch);
      window.removeEventListener('openSocialRegistration', handleOpenRegistration);
    };
  }, [socialEventModal]);

  // Edit State
  const [selectedEventForEdit, setSelectedEventForEdit] = useState<any | null>(null);


  // 강제 새로고침 핸들러 (사용자 요청: 확실한 반영을 위해)
  const handleForceReload = () => {
    window.location.reload();
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  // 메인 화면: 주간 스케줄표 (상단)
  return (
    <div className="social-page-container" style={{}}>
      {/* 상단 고정 헤더 - SimpleHeader 사용으로 통일성 확보 */}


      {/* 메인 콘텐츠 */}
      <div style={{ paddingBottom: '80px' }}>
        {schedulesLoading ? (
          <div className="social-loader">
            <div className="loader-text">로딩 중...</div>
          </div>
        ) : (
          <div className="social-merged-view">
            {/* 1. 주간 스케줄표 */}
            <section className="social-section-schedule">
              <SocialCalendar
                events={events}
                loading={schedulesLoading}
                onEventCreated={handleForceReload}
                onEventUpdated={handleForceReload}
                onEventDeleted={handleForceReload}
              />
            </section>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {selectedEventForEdit && (
        <SocialEditModal
          item={selectedEventForEdit}
          itemType="schedule"
          onClose={() => setSelectedEventForEdit(null)}
          onSuccess={() => {
            handleForceReload();
            setSelectedEventForEdit(null);
          }}
        />
      )}

      {/* Global Search Modal */}
      <CalendarSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectEvent={(event) => {
          setSelectedEvent(event);
        }}
        searchMode="all"
      />

      {/* Event Detail Modal */}
      <EventDetailModal
        isOpen={!!selectedEvent}
        event={selectedEvent!}
        onClose={closeModal}
        onEdit={() => { }}
        onDelete={() => { }}
        isAdminMode={false}
      />
    </div>
  );
}
