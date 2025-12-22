import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useEventActions } from "../pages/v2/hooks/useEventActions";
import { useModalStack } from "../hooks/useModalStack";
import EventDetailModal from "../pages/v2/components/EventDetailModal";
import VenueDetailModal from "../pages/practice/components/VenueDetailModal";
import SocialPlaceDetailModal from "../pages/social/components/SocialPlaceDetailModal";
import SocialDetailModal from "../pages/social/components/SocialDetailModal";
import SocialEditModal from "../pages/social/components/SocialEditModal";

/**
 * GlobalModalManager
 * 
 * Renders modals from the global modal stack.
 * Only the topmost modal is visible; others are hidden with display: none.
 * This optimizes performance on mobile by reducing rendering load.
 */
export default function GlobalModalManager() {
    const { user, signInWithKakao, isAdmin } = useAuth();
    const { stack } = useModalStack();

    const adminType = isAdmin ? "super" : null;

    // Local state for SocialEditModal (legacy support)
    const [editingSocialEvent, setEditingSocialEvent] = useState<any>(null);

    const {
        selectedEvent,
        closeModal,
        handleEditClick,
        handleDeleteClick,
        selectedVenueId,
        closeVenueModal,
        selectedPlace,
        closePlaceModal,
        handleVenueClick,
        selectedSocialEvent
    } = useEventActions({
        adminType,
        user,
        signInWithKakao
    });

    // Determine if legacy modals should be hidden
    const hasStackModals = stack.length > 0;

    // Render modals from stack
    // Only the topmost modal (index === stack.length - 1) is visible
    return (
        <>
            {/* Stack-based modals */}
            {stack.map((modal, index) => {
                const isTop = index === stack.length - 1;

                return (
                    <div
                        key={modal.id}
                        style={{ display: isTop ? 'block' : 'none' }}
                    >
                        {renderModal(modal, {
                            user,
                            isAdmin,
                            handleEditClick,
                            handleDeleteClick,
                            handleVenueClick,
                            closeModal,
                            closeVenueModal,
                            closePlaceModal,
                            setEditingSocialEvent
                        })}
                    </div>
                );
            })}

            {/* Legacy modals - hidden when stack is active */}
            <div style={{ display: hasStackModals ? 'none' : 'block' }}>
                {selectedEvent && (
                    <EventDetailModal
                        isOpen={!!selectedEvent}
                        event={selectedEvent}
                        onClose={closeModal}
                        onEdit={handleEditClick}
                        onDelete={handleDeleteClick}
                        isAdminMode={!!isAdmin}
                        currentUserId={user?.id}
                        onOpenVenueDetail={handleVenueClick}
                    />
                )}

                {selectedVenueId && (
                    <VenueDetailModal
                        venueId={selectedVenueId}
                        onClose={closeVenueModal}
                        onEdit={() => window.dispatchEvent(new CustomEvent('editVenue', { detail: selectedVenueId }))}
                    />
                )}

                {selectedPlace && (
                    <SocialPlaceDetailModal
                        place={selectedPlace}
                        onClose={closePlaceModal}
                    />
                )}

                {selectedSocialEvent && (
                    <SocialDetailModal
                        item={selectedSocialEvent}
                        onClose={closeModal}
                        onVenueClick={handleVenueClick}
                        onEdit={() => {
                            setEditingSocialEvent(selectedSocialEvent);
                        }}
                    />
                )}

                {editingSocialEvent && (
                    <SocialEditModal
                        item={editingSocialEvent}
                        itemType="schedule"
                        onClose={() => setEditingSocialEvent(null)}
                        onSuccess={() => {
                            setEditingSocialEvent(null);
                            window.dispatchEvent(new Event('socialEventUpdated'));
                        }}
                    />
                )}
            </div>
        </>
    );
}

// Helper function to render modal based on type
function renderModal(modal: any, context: any) {
    const { type, props } = modal;

    switch (type) {
        case 'detail':
            return (
                <EventDetailModal
                    isOpen={true}
                    event={props.event}
                    onClose={props.onClose}
                    onEdit={context.handleEditClick}
                    onDelete={context.handleDeleteClick}
                    isAdminMode={!!context.isAdmin}
                    currentUserId={context.user?.id}
                    onOpenVenueDetail={context.handleVenueClick}
                />
            );

        case 'venue':
            return (
                <VenueDetailModal
                    venueId={props.venueId}
                    onClose={props.onClose}
                    onEdit={props.onEdit}
                />
            );

        case 'social_place':
            return (
                <SocialPlaceDetailModal
                    place={props.place}
                    onClose={props.onClose}
                />
            );

        case 'social_detail':
            return (
                <SocialDetailModal
                    item={props.item}
                    onClose={props.onClose}
                    onVenueClick={context.handleVenueClick}
                    onEdit={() => context.setEditingSocialEvent(props.item)}
                />
            );

        default:
            return null;
    }
}
