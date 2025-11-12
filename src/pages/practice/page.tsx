import { useState, useEffect } from "react";
import PracticeRoomList from "../home/components/PracticeRoomList";
import PracticeRoomModal from "../../components/PracticeRoomModal";
import SimpleHeader from "../../components/SimpleHeader";
import { useAuth } from "../../contexts/AuthContext";

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
    <div className="min-h-screen" style={{ backgroundColor: "var(--page-bg-color)" }}>
      {/* Fixed Header */}
      <div
        className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <SimpleHeader title="연습실" />
      </div>

      {/* Practice Room List - 달력 없음 */}
      <div className="pt-16 pb-16">
        <PracticeRoomList
          adminType={null}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-4 text-center">등록 문의</h3>
            <p className="text-gray-300 text-center mb-2">
              관리자에게 문의하세요
            </p>
            <p className="text-gray-400 text-sm text-center mb-6">
              시설 상태와 평판등 다양한 기준으로 등록됩니다.
            </p>
            <a
              href="tel:010-4801-7180"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg text-center font-semibold transition-colors cursor-pointer mb-3"
            >
              <i className="ri-phone-line mr-2"></i>
              010-4801-7180
            </a>
            <button
              onClick={() => setShowContactModal(false)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
