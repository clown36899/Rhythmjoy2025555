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
    isDeleting: boolean;

    // 핸들러
    handleEditClick: (event: AppEvent, e?: React.MouseEvent) => void;
    handlePasswordSubmit: () => Promise<void>;
    handleDeleteEvent: (eventId: number | string, password?: string) => Promise<void>;
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
    const [isDeleting, setIsDeleting] = useState(false);

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
    const handleDeleteEvent = useCallback(async (eventId: number | string, password?: string) => {
        // Double confirm removal: The caller (UI) handles confirmation.
        console.log('%c🔥 [useEventModal/Legacy] handleDeleteEvent Triggered!', 'background: #222; color: #ff5555; font-size: 14px');
        console.log('[useEventModal] ID:', eventId, 'Password Provided:', !!password);

        try {
            console.log('[useEventModal] Setting isDeleting to TRUE');
            setIsDeleting(true);
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            console.log('[useEventModal] Got auth token, starting fetch...');

            const response = await fetch('/.netlify/functions/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ eventId, password })
            });

            console.log('[useEventModal] Fetch returned, status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[useEventModal] Delete failed with data:', errorData);

                // Foreign Key Constraint Check
                if (errorData.error?.includes('foreign key constraint') || errorData.message?.includes('foreign key constraint')) {
                    alert("다른 사용자가 '즐겨찾기' 및 '관심설정'한 이벤트는 삭제할 수 없습니다.");
                    return;
                }

                throw new Error(errorData.error || `Server returned ${response.status}`);
            }

            console.log('[useEventModal] Deletion successful');
            alert("삭제되었습니다.");

            // Clean up state
            console.log('[useEventModal] Cleaning up state...');
            setSelectedEvent(null);
            setShowEditModal(false);
            setEventToEdit(null);

            // 다른 컴포넌트에 삭제 이벤트 알림
            console.log('[useEventModal] Dispatching eventDeleted');
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
        } catch (error: any) {
            console.error("이벤트 삭제 중 오류 발생:", error);
            alert("삭제 실패: " + (error.message || "알 수 없는 오류"));
        } finally {
            console.log('[useEventModal] Setting isDeleting to FALSE');
            setIsDeleting(false);
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
        isDeleting,

        // 핸들러
        handleEditClick,
        handlePasswordSubmit,
        handleDeleteEvent,
        closeAllModals,
    };
}
