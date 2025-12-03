import { useState, useEffect } from "react";
import PracticeRoomList from "../home/components/PracticeRoomList";
import PracticeRoomModal from "../../components/PracticeRoomModal";
import SimpleHeader from "../../components/SimpleHeader";
import { useAuth } from "../../contexts/AuthContext";
import './practice.css';

export default function PracticeRoomsPage() {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const { isAdmin } = useAuth();
  const isDevAdmin = localStorage.getItem('isDevAdmin') === 'true';
  const isEffectiveAdmin = isAdmin || isDevAdmin;

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

  return (
    <div className="practice-page-container" style={{ backgroundColor: "var(--page-bg-color)" }}>
      {/* Fixed Header */}
      <div
        className="practice-header"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <SimpleHeader title="연습실" />
      </div>

      {/* Practice Room List - 달력 없음 */}
      <div className="practice-main-content">
        <PracticeRoomList
          adminType={isEffectiveAdmin ? "super" : null}
          showSearchModal={showSearchModal}
          setShowSearchModal={setShowSearchModal}
          showSortModal={showSortModal}
          setShowSortModal={setShowSortModal}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      </div>

      {/* Register Modal (Admin Only) */}
      <PracticeRoomModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        isAdminMode={true}
        openToForm={true}
      />

      {/* Contact Modal (Non-Admin) */}
      {showContactModal && (
        <div className="practice-modal-overlay">
          <div className="practice-modal-container">
            <h3 className="practice-modal-title">등록 문의</h3>
            <p className="practice-modal-subtitle">
              관리자에게 문의하세요
            </p>
            <p className="practice-modal-description">
              시설 상태와 평판등 다양한 기준으로 등록됩니다.
            </p>
            <a
              href="tel:010-4801-7180"
              className="practice-modal-phone-link"
            >
              <i className="ri-phone-line practice-modal-phone-icon"></i>
              010-4801-7180
            </a>
            <button
              onClick={() => setShowContactModal(false)}
              className="practice-modal-close-btn"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
