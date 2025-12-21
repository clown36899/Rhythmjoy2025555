import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PracticeRoomList from "./components/PracticeRoomList";
import VenueTabBar from "./components/VenueTabBar";
import VenueDetailModal from "./components/VenueDetailModal";
import VenueRegistrationModal from "./components/VenueRegistrationModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import { useAuth } from "../../contexts/AuthContext";
import './practice.css';

export default function PracticeRoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("연습실");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { isAdmin } = useAuth();
  const isDevAdmin = localStorage.getItem('isDevAdmin') === 'true';
  const isEffectiveAdmin = isAdmin || isDevAdmin;

  // Get room ID from URL params
  const roomId = searchParams.get('id');

  // 페이지 로드 시 랜덤 순서 초기화 (새로고침 시 재정렬)
  useEffect(() => {
    sessionStorage.removeItem('practiceRoomsRandomOrder');
  }, []);

  // Handle URL param for room detail
  useEffect(() => {
    if (roomId) {
      setSelectedVenueId(roomId);
      setShowDetailModal(true);
    }
  }, [roomId]);

  // Event search from header
  useEffect(() => {
    const handleOpenEventSearch = () => setShowGlobalSearch(true);
    window.addEventListener('openEventSearch', handleOpenEventSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenEventSearch);
  }, []);

  useEffect(() => {
    const handleRegisterEvent = () => {
      if (isEffectiveAdmin) {
        setEditingVenueId(null);
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
    setShowDetailModal(false);
    setSelectedVenueId(null);
    // Clear URL param
    const params = new URLSearchParams(searchParams);
    params.delete('id');
    setSearchParams(params, { replace: true });
  };

  const handleVenueClick = (venueId: string) => {
    setSelectedVenueId(venueId);
    setShowDetailModal(true);
    // Update URL param
    const params = new URLSearchParams(searchParams);
    params.set('id', venueId);
    setSearchParams(params, { replace: true });
  };

  const handleEditVenue = (venueId: string) => {
    setEditingVenueId(venueId);
    setShowDetailModal(false); // Close detail modal
    setShowRegisterModal(true); // Open registration modal in edit mode
  };

  const handleVenueCreatedOrUpdated = () => {
    setEditingVenueId(null);
    setRefreshTrigger(prev => prev + 1);
  };

  // Swipe Navigation
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const minSwipeDistance = 50;

  // Load venue categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data } = await supabase
          .from('venues')
          .select('category')
          .eq('is_active', true);

        if (data) {
          const uniqueCategories = [...new Set(data.map(v => v.category))];
          setCategories(uniqueCategories);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    const currentIndex = categories.findIndex(cat => cat === activeCategory);

    if (isLeftSwipe && currentIndex < categories.length - 1) {
      setActiveCategory(categories[currentIndex + 1]);
    }
    if (isRightSwipe && currentIndex > 0) {
      setActiveCategory(categories[currentIndex - 1]);
    }
  };

  return (
    <div className="practice-page-container" >
      {/* Main Content */}
      <div className="practice-main-content"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Tab Menu */}
        <VenueTabBar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />

        {/* Venue List */}
        <PracticeRoomList
          adminType={isEffectiveAdmin ? "super" : null}
          showSearchModal={showSearchModal}
          setShowSearchModal={setShowSearchModal}
          showSortModal={showSortModal}
          setShowSortModal={setShowSortModal}
          sortBy={sortBy}
          setSortBy={setSortBy}
          activeCategory={activeCategory}
          onVenueClick={handleVenueClick}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Venue Detail Modal */}
      {showDetailModal && selectedVenueId && (
        <VenueDetailModal
          venueId={selectedVenueId}
          onClose={handleCloseDetail}
          onEdit={isEffectiveAdmin ? () => handleEditVenue(selectedVenueId) : undefined}
        />
      )}

      {/* Registration Modal - Replaces old PracticeRoomModal */}
      <VenueRegistrationModal
        isOpen={showRegisterModal}
        onClose={() => {
          setShowRegisterModal(false);
          setEditingVenueId(null);
        }}
        editVenueId={editingVenueId}
        onVenueCreated={handleVenueCreatedOrUpdated}
        onVenueDeleted={handleVenueCreatedOrUpdated}
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
        onSelectEvent={() => { }}
        searchMode="all"
      />
      <button
        className="practice-fab-btn"
        onClick={() => {
          const event = new CustomEvent('practiceRoomRegister');
          window.dispatchEvent(event);
        }}
      >
        <i className="ri-pencil-fill"></i>
      </button>
    </div>
  );
}
