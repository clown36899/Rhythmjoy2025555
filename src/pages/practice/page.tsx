import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PracticeRoomList from "../home/components/PracticeRoomList";
import PracticeRoomModal from "../../components/PracticeRoomModal";
import PracticeRoomDetail from "./components/PracticeRoomDetail";
import SimpleHeader from "../../components/SimpleHeader";
import { useAuth } from "../../contexts/AuthContext";
import './practice.css';

export default function PracticeRoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const { isAdmin } = useAuth();
  const isDevAdmin = localStorage.getItem('isDevAdmin') === 'true';
  const isEffectiveAdmin = isAdmin || isDevAdmin;

  // Get room ID from URL params
  const roomId = searchParams.get('id');

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
    setSearchParams({});
  };

  return (
    <div className="practice-page-container" >
      {/* Fixed Header - Conditional */}
      <div className="practice-header global-header">
        {roomId ? (
          <div className="practice-header-inner">
            <div className="practice-header-content">
              <div className="practice-header-left">
                <button onClick={handleCloseDetail} className="practice-back-btn">
                  <span>❮ 돌아가기</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <SimpleHeader title="연습실" />
        )}
      </div>

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
    </div>
  );
}
