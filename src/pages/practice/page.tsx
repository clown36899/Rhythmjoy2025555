import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PracticeRoomList from "./components/PracticeRoomList";
import PracticeRoomModal from "../../components/PracticeRoomModal";
import PracticeRoomDetail from "./components/PracticeRoomDetail";
import SimpleHeader from "../../components/SimpleHeader";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import { useAuth } from "../../contexts/AuthContext";
import './practice.css';

export default function PracticeRoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const { isAdmin } = useAuth();
  const isDevAdmin = localStorage.getItem('isDevAdmin') === 'true';
  const isEffectiveAdmin = isAdmin || isDevAdmin;

  // Get room ID from URL params
  const roomId = searchParams.get('id');

  // 페이지 로드 시 랜덤 순서 초기화 (새로고침 시 재정렬)
  useEffect(() => {
    sessionStorage.removeItem('practiceRoomsRandomOrder');
  }, []);

  // Event search from header
  useEffect(() => {
    const handleOpenEventSearch = () => setShowGlobalSearch(true);
    window.addEventListener('openEventSearch', handleOpenEventSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenEventSearch);
  }, []);

  useEffect(() => {
    const handleRegisterEvent = () => {
      if (isEffectiveAdmin) {
        setShowRegisterModal(true);
      } else {
        setShowContactModal(true);
      }
    };

    window.addEventListener('practiceRoomRegister', handleRegisterEvent);

    return () => {
      window.removeEventListener('practiceRoomRegister', handleRegisterEvent);
    };
  }, [isEffectiveAdmin]);

  const handleCloseDetail = () => {
    // Use navigate to go back in history instead of just clearing params
    // This ensures back button works correctly
    const params = new URLSearchParams(searchParams);
    params.delete('id');
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="practice-page-container" >
      {/* Fixed Header - Conditional */}


      {/* Main Content - Show either list or detail */}
      <div className="practice-main-content">
        {roomId ? (
          <PracticeRoomDetail roomId={roomId} onClose={handleCloseDetail} />
        ) : (
          <PracticeRoomList
            adminType={isEffectiveAdmin ? "super" : null}
            showSearchModal={showSearchModal}
            setShowSearchModal={setShowSearchModal}
            showSortModal={showSortModal}
            setShowSortModal={setShowSortModal}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        )}
      </div>

      {/* Registration Modal */}
      <PracticeRoomModal
        isOpen={showRegisterModal}
        onClose={() => {
          setShowRegisterModal(false);
        }}
        isAdminMode={isEffectiveAdmin}
        openToForm={true}
      />

      {/* Contact Modal */}
      {showContactModal && (
        <div className="practice-contact-modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="practice-contact-modal" onClick={(e) => e.stopPropagation()}>
            <h3>연습실 등록 문의</h3>
            <p>연습실 등록을 원하시면 관리자에게 문의해주세요.</p>
            <button onClick={() => setShowContactModal(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      <CalendarSearchModal
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        onSelectEvent={(event) => {
          setSelectedEvent(event);
        }}
        searchMode="all"
      />
    </div>
  );
}
