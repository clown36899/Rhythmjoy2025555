import { memo } from 'react';
import { createPortal } from 'react-dom';
import { useModalContext } from '../contexts/ModalContext';

// Event Modals (v2)
import EventDetailModal from '../pages/v2/components/EventDetailModal';

import EventPasswordModal from '../pages/v2/components/EventPasswordModal';
import EventSearchModal from '../pages/v2/components/EventSearchModal';
import EventSortModal from '../pages/v2/components/EventSortModal';
import CalendarSearchModal from '../pages/v2/components/CalendarSearchModal';
import VenueSelectModal from '../pages/v2/components/VenueSelectModal';
import ManualVenueInputModal from '../pages/v2/components/ManualVenueInputModal';
import AdminBillboardModal from '../pages/v2/components/AdminBillboardModal';

// Social Modals
import SocialDetailModal from '../pages/social/components/SocialDetailModal';
import SocialEditModal from '../pages/social/components/SocialEditModal';
import SocialEventModal from '../pages/social/components/SocialEventModal';
import SocialPasswordModal from '../pages/social/components/SocialPasswordModal';
import SocialPlaceDetailModal from '../pages/social/components/SocialPlaceDetailModal';
import PlaceModal from '../pages/social/components/PlaceModal';
import ScheduleModal from '../pages/social/components/ScheduleModal';
import SocialScheduleModal from '../pages/social/components/SocialScheduleModal';

// Shopping Modals
import ShopDetailModal from '../pages/shopping/components/ShopDetailModal';
import ShopEditModal from '../pages/shopping/components/ShopEditModal';
import ShopRegisterModal from '../pages/shopping/components/ShopRegisterModal';

// Practice Modals
import VenueDetailModal from '../pages/practice/components/VenueDetailModal';
import VenueRegistrationModal from '../pages/practice/components/VenueRegistrationModal';

// Board Modals
import PostDetailModal from '../pages/board/components/PostDetailModal';
import PostEditorModal from '../pages/board/components/PostEditorModal';
import ProfileEditModal from '../pages/board/components/ProfileEditModal';
import UserRegistrationModal from '../pages/board/components/UserRegistrationModal';
import BoardManagementModal from '../pages/board/components/BoardManagementModal';

// Global Component Modals
import EventRegistrationModal from '../components/EventRegistrationModal';
import FullscreenDateEventsModal from '../components/FullscreenDateEventsModal';
import GlobalSearchModal from '../components/GlobalSearchModal';
import QRCodeModal from '../components/QRCodeModal';
import ColorSettingsModal from '../components/ColorSettingsModal';
import DefaultThumbnailSettingsModal from '../components/DefaultThumbnailSettingsModal';
import InvitationManagementModal from '../components/InvitationManagementModal';

import { OnlineUsersModal } from '../components/OnlineUsersModal';
import GlobalNoticeEditor from '../components/GlobalNoticeEditor';

// Admin Modals
import AdminUserInfoModal from '../components/AdminUserInfoModal';
import BillboardUserManagementModal from '../components/BillboardUserManagementModal';
import BoardPrefixManagementModal from '../components/BoardPrefixManagementModal';
import BoardUserManagementModal from '../components/BoardUserManagementModal';
import AdminFavoritesModal from '../components/AdminFavoritesModal';
import AdminSecureMembersModal from '../components/AdminSecureMembersModal';
import GenreWeightSettingsModal from '../components/GenreWeightSettingsModal';

/**
 * 모든 모달 컴포넌트를 ID로 매핑
 * 새로운 모달을 추가할 때는 여기에 등록해야 함
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
    // 'imageCrop': ImageCropModal, // 로컬 렌더링 사용 (EventList 등에서 중복 렌더링 방지)
    'qrCode': QRCodeModal,
    'colorSettings': ColorSettingsModal,
    'defaultThumbnailSettings': DefaultThumbnailSettingsModal,
    'invitationManagement': InvitationManagementModal,

    'onlineUsers': OnlineUsersModal,

    // Admin Modals
    'adminUserInfo': AdminUserInfoModal,
    'billboardUserManagement': BillboardUserManagementModal,
    'boardPrefixManagement': BoardPrefixManagementModal,
    'boardUserManagement': BoardUserManagementModal,
    'adminFavorites': AdminFavoritesModal,
    'adminSecureMembers': AdminSecureMembersModal,
    'genreWeightSettings': GenreWeightSettingsModal,
    'globalNoticeEditor': GlobalNoticeEditor,
};

/**
 * 모든 모달을 렌더링하는 레지스트리 컴포넌트
 * ModalContext의 modalStack을 기반으로 활성화된 모달만 렌더링
 * createPortal을 사용하여 document.body에 직접 렌더링
 */
export const ModalRegistry = memo(function ModalRegistry() {
    const { modalStack, getModalProps, closeModal } = useModalContext();

    const modals = modalStack.map(modalId => {
        const ModalComponent = MODAL_COMPONENTS[modalId];

        if (!ModalComponent) {
            console.warn(`[ModalRegistry] Unknown modal ID: ${modalId}`);
            return null;
        }

        const props = getModalProps(modalId);

        return (
            <ModalComponent
                key={modalId}
                isOpen={true}
                onClose={() => closeModal(modalId)}
                {...props}
            />
        );
    });

    // createPortal을 사용하여 모든 모달을 document.body에 렌더링
    return createPortal(
        <>{modals}</>,
        document.body
    );
});
