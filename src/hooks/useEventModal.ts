import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Event as AppEvent } from '../lib/supabase';

/**
 * 이벤트 모달 관리를 위한 Hook의 반환 타입
 */
export interface UseEventModalReturn {
    // 상태
    selectedEvent: AppEvent | null;
    setSelectedEvent: (event: AppEvent | null) => void;
    showPasswordModal: boolean;
    setShowPasswordModal: (show: boolean) => void;
    eventToEdit: AppEvent | null;
    setEventToEdit: (event: AppEvent | null) => void;
    eventPassword: string;
    setEventPassword: (password: string) => void;
    showEditModal: boolean;
    setShowEditModal: (show: boolean) => void;

    // 핸들러
    handleEditClick: (event: AppEvent, e?: React.MouseEvent) => void;
    handlePasswordSubmit: () => Promise<void>;
    handleDeleteEvent: (eventId: number) => Promise<void>;
    closeAllModals: () => void;
}

/**
 * 이벤트 관련 모달(상세, 비밀번호, 편집)을 통합 관리하는 Hook
 * 
 * @example
 * ```tsx
 * function MyPage() {
 *   const eventModal = useEventModal();
 *   
 *   return (
 *     <div>
 *       <EventList onEventClick={(event) => eventModal.setSelectedEvent(event)} />
 *       
 *       {eventModal.selectedEvent && (
 *         <EventDetailModal
 *           event={eventModal.selectedEvent}
 *           onEdit={eventModal.handleEditClick}
 *           onDelete={eventModal.handleDeleteEvent}
 *         />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEventModal(): UseEventModalReturn {
    // 1. 상태 정의
    const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
    const [eventPassword, setEventPassword] = useState("");
    const [showEditModal, setShowEditModal] = useState(false);

    // 2. 이벤트 편집 클릭 핸들러
    const handleEditClick = useCallback((event: AppEvent, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }
        setEventToEdit(event);
        setShowPasswordModal(true);
        setSelectedEvent(null);
    }, []);

    // 3. 비밀번호 확인 핸들러
    const handlePasswordSubmit = useCallback(async () => {
        if (eventToEdit && eventPassword === eventToEdit.password) {
            setShowPasswordModal(false);
            setShowEditModal(true);
            setEventPassword("");
        } else {
            alert("비밀번호가 올바르지 않습니다.");
        }
    }, [eventToEdit, eventPassword]);

    // 4. 이벤트 삭제 핸들러
    const handleDeleteEvent = useCallback(async (eventId: number) => {
        if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
            const { error } = await supabase.from('events').delete().eq('id', eventId);
            if (!error) {
                alert("삭제되었습니다.");
                setSelectedEvent(null);
                // 다른 컴포넌트에 삭제 이벤트 알림
                window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
            } else {
                alert("삭제 실패: " + error.message);
            }
        }
    }, []);

    // 5. 모든 모달 닫기
    const closeAllModals = useCallback(() => {
        setSelectedEvent(null);
        setShowPasswordModal(false);
        setShowEditModal(false);
        setEventToEdit(null);
        setEventPassword("");
    }, []);

    return {
        // 상태
        selectedEvent,
        setSelectedEvent,
        showPasswordModal,
        setShowPasswordModal,
        eventToEdit,
        setEventToEdit,
        eventPassword,
        setEventPassword,
        showEditModal,
        setShowEditModal,

        // 핸들러
        handleEditClick,
        handlePasswordSubmit,
        handleDeleteEvent,
        closeAllModals,
    };
}
