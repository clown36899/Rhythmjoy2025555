import { useState, useEffect, useRef } from 'react';
import {
  SocialCalendar,
} from './components';
import SocialEditModal from './components/SocialEditModal';
import SimpleHeader from '../../components/SimpleHeader';
import './social.css';

import { useSocialSchedules } from './hooks/useSocialSchedules';

export default function SocialPage() {

  // Modal State
  const [showEventModal, setShowEventModal] = useState(false);

  // Layout State
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // Data Fetching Hook
  const {
    events,
    loading: schedulesLoading
  } = useSocialSchedules();

  useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) return;

    const observer = new ResizeObserver(() => {
      setHeaderHeight(headerElement.offsetHeight);
    });
    observer.observe(headerElement);
    return () => observer.disconnect();
  }, []);

  // Listeners from MobileShell
  useEffect(() => {
    const handleOpenRegistration = () => setShowEventModal(true);
    window.addEventListener('openSocialRegistration', handleOpenRegistration);
    return () => window.removeEventListener('openSocialRegistration', handleOpenRegistration);
  }, []);

  // Edit State
  const [selectedEventForEdit, setSelectedEventForEdit] = useState<any | null>(null);


  // 강제 새로고침 핸들러 (사용자 요청: 확실한 반영을 위해)
  const handleForceReload = () => {
    window.location.reload();
  };

  // 메인 화면: 주간 스케줄표 (상단)
  return (
    <div className="social-page-container" style={{}}>
      {/* 상단 고정 헤더 - SimpleHeader 사용으로 통일성 확보 */}
      <div
        ref={headerRef}
        className="social-header global-header"
      >
        <SimpleHeader title="정기 소셜 일정" />
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ paddingTop: `51px`, paddingBottom: '80px' }}>
        {schedulesLoading ? (
          <div className="social-loader">
            <div className="loader-text">로딩 중...</div>
          </div>
        ) : (
          <div className="social-merged-view">
            {/* 1. 주간 스케줄표 */}
            <section className="social-section-schedule">
              <SocialCalendar
                showModal={showEventModal}
                setShowModal={setShowEventModal}
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
          onSuccess={(data, isDelete) => {
            handleForceReload();
            setSelectedEventForEdit(null);
          }}
        />
      )}
    </div>
  );
}
