import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import PracticeRoomList from "../../practice/components/PracticeRoomList";
import VenueTabBar from "../../practice/components/VenueTabBar";
import { useModal } from "../../../hooks/useModal";
import { useAuth } from "../../../contexts/AuthContext";
import '../../practice/practice.css';

// Reuse existing styles or create specific ones if needed
// import './PracticeSection.css'; 

export default function PracticeSection() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [showSortModal, setShowSortModal] = useState(false);
    const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
    const venueDetailModal = useModal('venueDetail');
    const venueRegistrationModal = useModal('venueRegistration');
    const [showContactModal, setShowContactModal] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>("연습실");
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const { user, isAdmin } = useAuth();
    const isDevAdmin = localStorage.getItem('isDevAdmin') === 'true';
    const isEffectiveAdmin = isAdmin || isDevAdmin;

    // Get room ID from URL params (This will now coexist with social page params)
    const roomId = searchParams.get('id');

    // Load categories for swipe logic (if needed, or reuse)
    const [categories, setCategories] = useState<string[]>([]);

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

    // Handle URL param for room detail
    useEffect(() => {
        // Only open if URL has 'id' param and we haven't opened it yet (basic check)
        // Actually Modal registry handles idempotency usually, but we should be careful 
        // to distinct between 'event' id and 'venue' id if they use same param. 
        // Current code uses 'event' param for events and 'id' param for venues/practice.
        // Social page uses 'event' param. Practice uses 'id'. So they shouldn't collide.

        if (roomId) {
            venueDetailModal.open({
                venueId: roomId,
                onClose: handleCloseDetail,
                onEdit: () => handleEditVenue(roomId)
            });
        }

        // Handle action=register param
        const action = searchParams.get('action');
        if (action === 'register') {
            const handleAutoRegister = () => {
                if (!user) {
                    window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                        detail: { message: '연습실 등록을 위해 로그인이 필요합니다.' }
                    }));
                } else {
                    venueRegistrationModal.open({
                        editVenueId: null,
                        onVenueCreated: handleVenueCreatedOrUpdated,
                        onVenueDeleted: handleVenueCreatedOrUpdated
                    });
                }
                // Clear the param so it doesn't reopen on refresh/nav
                const params = new URLSearchParams(searchParams);
                params.delete('action');
                setSearchParams(params, { replace: true });
            };
            // Small timeout to ensure modal context is ready or just run it
            setTimeout(handleAutoRegister, 100);
        }
    }, [roomId, searchParams]);

    // Register event listener for venue registration (from FAB or other triggers)
    useEffect(() => {
        const handleRegisterEvent = () => {
            if (!user) {
                window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                    detail: { message: '연습실 등록을 위해 로그인이 필요합니다.' }
                }));
                return;
            }

            venueRegistrationModal.open({
                editVenueId: null,
                onVenueCreated: handleVenueCreatedOrUpdated,
                onVenueDeleted: handleVenueCreatedOrUpdated
            });
        };

        window.addEventListener('practiceRoomRegister', handleRegisterEvent);

        return () => {
            window.removeEventListener('practiceRoomRegister', handleRegisterEvent);
        };
    }, [user, isEffectiveAdmin]);

    const handleCloseDetail = () => {
        venueDetailModal.close();
        // Clear URL param
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        setSearchParams(params, { replace: true });
    };

    const handleVenueClick = (venueId: string) => {
        venueDetailModal.open({
            venueId,
            onClose: handleCloseDetail,
            onEdit: () => handleEditVenue(venueId)
        });
        // Update URL param
        const params = new URLSearchParams(searchParams);
        params.set('id', venueId);
        setSearchParams(params, { replace: true });
    };

    const handleEditVenue = (venueId: string) => {
        venueDetailModal.close(); // Close detail modal
        venueRegistrationModal.open({
            editVenueId: venueId,
            onVenueCreated: handleVenueCreatedOrUpdated,
            onVenueDeleted: handleVenueCreatedOrUpdated
        });
    };

    const handleVenueCreatedOrUpdated = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="practice-section" style={{ position: 'relative', marginTop: '20px' }}>
            {/* Section Header or Divider can go here if needed */}

            {/* Tab Menu - Reusing VenueTabBar */}
            <VenueTabBar
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
            />

            {/* Venue List - Reusing PracticeRoomList */}
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
