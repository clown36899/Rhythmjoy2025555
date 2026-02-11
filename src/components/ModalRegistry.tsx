import { memo, lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalContext } from '../contexts/ModalContext';

// --- Lazy Loading Definitions ---

// Event Modals (v2)
const EventDetailModal = lazy(() => import('../pages/v2/components/EventDetailModal'));
const EventPasswordModal = lazy(() => import('../pages/v2/components/EventPasswordModal'));
const EventSearchModal = lazy(() => import('../pages/v2/components/EventSearchModal'));
const EventSortModal = lazy(() => import('../pages/v2/components/EventSortModal'));
const CalendarSearchModal = lazy(() => import('../pages/v2/components/CalendarSearchModal'));
const VenueSelectModal = lazy(() => import('../pages/v2/components/VenueSelectModal'));
const ManualVenueInputModal = lazy(() => import('../pages/v2/components/ManualVenueInputModal'));
const AdminBillboardModal = lazy(() => import('../pages/v2/components/AdminBillboardModal'));
const StatsModal = lazy(() => import('../pages/v2/components/StatsModal'));
const RegistrationChoiceModal = lazy(() => import('../pages/v2/components/RegistrationChoiceModal'));
const NewEventsListModal = lazy(() => import('../pages/v2/components/NewEventsListModal'));

// Social Modals
const SocialDetailModal = lazy(() => import('../pages/social/components/SocialDetailModal'));
const SocialEditModal = lazy(() => import('../pages/social/components/SocialEditModal'));
const SocialEventModal = lazy(() => import('../pages/social/components/SocialEventModal'));
const SocialPasswordModal = lazy(() => import('../pages/social/components/SocialPasswordModal'));
const SocialPlaceDetailModal = lazy(() => import('../pages/social/components/SocialPlaceDetailModal'));
const PlaceModal = lazy(() => import('../pages/social/components/PlaceModal'));
const ScheduleModal = lazy(() => import('../pages/social/components/ScheduleModal'));
const SocialScheduleModal = lazy(() => import('../pages/social/components/SocialScheduleModal'));

// Shopping Modals
const ShopDetailModal = lazy(() => import('../pages/shopping/components/ShopDetailModal'));
const ShopEditModal = lazy(() => import('../pages/shopping/components/ShopEditModal'));
const ShopRegisterModal = lazy(() => import('../pages/shopping/components/ShopRegisterModal'));

// Practice Modals
const VenueDetailModal = lazy(() => import('../pages/practice/components/VenueDetailModal'));
const VenueRegistrationModal = lazy(() => import('../pages/practice/components/VenueRegistrationModal'));

// Board Modals
const PostDetailModal = lazy(() => import('../pages/board/components/PostDetailModal'));
const PostEditorModal = lazy(() => import('../pages/board/components/PostEditorModal'));
const ProfileEditModal = lazy(() => import('../pages/board/components/ProfileEditModal'));
const UserRegistrationModal = lazy(() => import('../pages/board/components/UserRegistrationModal'));
const BoardManagementModal = lazy(() => import('../pages/board/components/BoardManagementModal'));

// Global Component Modals
const EventRegistrationModal = lazy(() => import('../components/EventRegistrationModal'));
const FullscreenDateEventsModal = lazy(() => import('../components/FullscreenDateEventsModal'));
const GlobalSearchModal = lazy(() => import('../components/GlobalSearchModal'));
const LoginModal = lazy(() => import('../components/LoginModal'));
const QRCodeModal = lazy(() => import('../components/QRCodeModal'));
const ColorSettingsModal = lazy(() => import('../components/ColorSettingsModal'));
const DefaultThumbnailSettingsModal = lazy(() => import('../components/DefaultThumbnailSettingsModal'));
const InvitationManagementModal = lazy(() => import('../components/InvitationManagementModal'));
const GlobalNoticeEditor = lazy(() => import('../components/GlobalNoticeEditor'));
const NotificationHistoryModal = lazy(() => import('../components/NotificationHistoryModal'));

// Admin Modals
const BillboardUserManagementModal = lazy(() => import('../components/BillboardUserManagementModal'));
const BoardPrefixManagementModal = lazy(() => import('../components/BoardPrefixManagementModal'));
const BoardUserManagementModal = lazy(() => import('../components/BoardUserManagementModal'));
const AdminFavoritesModal = lazy(() => import('../components/AdminFavoritesModal'));
const AdminSecureMembersModal = lazy(() => import('../components/AdminSecureMembersModal'));
const GenreWeightSettingsModal = lazy(() => import('../components/GenreWeightSettingsModal'));
const SiteAnalyticsModal = lazy(() => import('../components/SiteAnalyticsModal'));
const AdminPushTestModal = lazy(() => import('../components/AdminPushTestModal'));
const OnlineUsersModal = lazy(() => import('../components/OnlineUsersModal').then(module => ({ default: module.OnlineUsersModal })));

/**
 * 모든 모달 컴포넌트를 ID로 매핑
 */
const MODAL_COMPONENTS: Record<string, any> = {
    // Event Modals (v2)
    'eventDetail': EventDetailModal,
    'eventPassword': EventPasswordModal,
    'eventSearch': EventSearchModal,
    'eventSort': EventSortModal,
    'calendarSearch': CalendarSearchModal,
    'venueSelect': VenueSelectModal,
    'manualVenueInput': ManualVenueInputModal,
    'adminBillboard': AdminBillboardModal,
    'stats': StatsModal,
    'registrationChoice': RegistrationChoiceModal,

    // Social Modals
    'socialDetail': SocialDetailModal,
    'socialEdit': SocialEditModal,
    'socialEvent': SocialEventModal,
    'socialPassword': SocialPasswordModal,
    'socialPlaceDetail': SocialPlaceDetailModal,
    'place': PlaceModal,
    'schedule': ScheduleModal,
    'socialSchedule': SocialScheduleModal,

    // Shopping Modals
    'shopDetail': ShopDetailModal,
    'shopEdit': ShopEditModal,
    'shopRegister': ShopRegisterModal,

    // Practice Modals
    'venueDetail': VenueDetailModal,
    'venueRegistration': VenueRegistrationModal,

    // Board Modals
    'postDetail': PostDetailModal,
    'postEditor': PostEditorModal,
    'profileEdit': ProfileEditModal,
    'userRegistration': UserRegistrationModal,
    'boardManagement': BoardManagementModal,

    // Global Component Modals
    'eventRegistration': EventRegistrationModal,
    'fullscreenDateEvents': FullscreenDateEventsModal,
    'globalSearch': GlobalSearchModal,
    'qrCode': QRCodeModal,
    'login': LoginModal,
    'colorSettings': ColorSettingsModal,
    'defaultThumbnailSettings': DefaultThumbnailSettingsModal,
    'invitationManagement': InvitationManagementModal,
    'onlineUsers': OnlineUsersModal,
    'notificationHistory': NotificationHistoryModal,

    // Admin Modals
    'billboardUserManagement': BillboardUserManagementModal,
    'boardPrefixManagement': BoardPrefixManagementModal,
    'boardUserManagement': BoardUserManagementModal,
    'adminFavorites': AdminFavoritesModal,
    'adminSecureMembers': AdminSecureMembersModal,
    'genreWeightSettings': GenreWeightSettingsModal,
    'globalNoticeEditor': GlobalNoticeEditor,
    'siteAnalytics': SiteAnalyticsModal,
    'adminPushTest': AdminPushTestModal,
    'newEventsList': NewEventsListModal,
};

/**
 * 모든 모달을 렌더링하는 레지스트리 컴포넌트
 */
export const ModalRegistry = memo(function ModalRegistry() {
    const { modalStack, getModalProps, closeModal } = useModalContext();

    // ESC 키로 모달 닫기
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && modalStack.length > 0) {
                const topModalId = modalStack[modalStack.length - 1];
                closeModal(topModalId);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [modalStack, closeModal]);

    const modals = modalStack.map(modalId => {
        const ModalComponent = MODAL_COMPONENTS[modalId];

        if (!ModalComponent) {
            console.warn(`[ModalRegistry] Unknown modal ID: ${modalId}`);
            return null;
        }

        const props = getModalProps(modalId);

        return (
            <Suspense key={modalId} fallback={null}>
                <ModalComponent
                    isOpen={true}
                    onClose={() => closeModal(modalId)}
                    {...props}
                />
            </Suspense>
        );
    });

    return createPortal(
        <>{modals}</>,
        document.body
    );
});
