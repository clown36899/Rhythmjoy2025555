import { useState, useCallback } from 'react';
import { supabase } from '../lib/cafe24Client';
import type { Event as AppEvent } from '../lib/cafe24Client';
import { queryClient } from '../lib/queryClient';
import { addClientLog } from '../utils/clientLogBuffer';

const EVENT_MODAL_DEBUG = import.meta.env.VITE_EVENT_MODAL_DEBUG === 'true';
const debugEventModal = (...args: unknown[]) => {
    if (EVENT_MODAL_DEBUG) console.debug(...args);
};

const isLocalDebugHost = () => typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);

const deleteDiagnostic = (...args: unknown[]) => {
    if (!isLocalDebugHost()) return;
    console.info(...args);
    addClientLog('event', ...args);
};

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
        // [Final Analysis] 
        // 수정(Mutation) 로직은 EventDetailModal 내부의 saveChangesToDB에서 이미 'social-'을 떼고 처리하고 있었습니다.
        // 삭제(Deletion) 로직인 이 함수는 그동안 그 처리가 누락되어 실패했던 것입니다.
        // 이제 수정 로직과 동일하게 ID 정제를 수행합니다.

        debugEventModal(`[useEventModal] handleDeleteEvent 시작`, { originalEventId: eventId, hasPassword: !!password });

        try {
            setIsDeleting(true);

            // [FIX] ID 전처리: 'social-' 접두어만 제거한다. FullCalendar 오프셋 후보는 서버가 함께 검사한다.
            const strippedId = String(eventId).replace('social-', '');
            const cleanId = strippedId;

            debugEventModal('[useEventModal] Deletion ID Cleaned:', {
                input: eventId,
                afterStrip: strippedId,
                finalTarget: cleanId
            });
            deleteDiagnostic('[EventDelete:CalendarUI] prepared request', {
                originalEventId: eventId,
                cleanId,
                hasPassword: Boolean(password),
            });

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            deleteDiagnostic('[EventDelete:CalendarUI] session state', {
                hasToken: Boolean(token),
                userId: session?.user?.id || null,
            });

            debugEventModal('[useEventModal] API Call: /api/delete-event', { targetId: cleanId });
            const response = await fetch('/api/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ eventId: cleanId, password })
            });
            const responseText = await response.text();
            let responseData: any = null;
            try {
                responseData = responseText ? JSON.parse(responseText) : null;
            } catch {
                responseData = { raw: responseText };
            }

            debugEventModal('[useEventModal] API 응답 수신', { status: response.status, ok: response.ok });
            deleteDiagnostic('[EventDelete:CalendarUI] response', {
                status: response.status,
                ok: response.ok,
                body: responseData,
            });


            if (!response.ok) {
                const errorData = responseData || {};
                console.error('[useEventModal] 삭제 실패 상제 정보:', errorData);

                // Foreign Key Constraint Check
                if (errorData.error?.includes('foreign key constraint') || errorData.message?.includes('foreign key constraint')) {
                    alert("다른 사용자가 '즐겨찾기' 및 '관심설정'한 이벤트는 삭제할 수 없습니다.");
                    return;
                }

                throw new Error(errorData.error || `Server returned ${response.status}`);
            }


            debugEventModal('[useEventModal] 삭제 성공. 캐시 무효화 및 상태 초기화 진행');
            alert("삭제되었습니다.");

            // [Persistence] TanStack Query 캐시 무효화 (캘린더 페이지 등 연동)
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            
            // Clean up state

            setSelectedEvent(null);
            setShowEditModal(false);
            setEventToEdit(null);

            // 다른 컴포넌트에 삭제 이벤트 알림

            debugEventModal(`[useEventModal] eventDeleted 커스텀 이벤트 디스패치`);
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
        } catch (error: any) {
            console.error(`[useEventModal] 🚨 이벤트 삭제 중 오류 발생:`, error);
            alert("삭제 실패: " + (error.message || "알 수 없는 오류"));
        } finally {

            setIsDeleting(false);
            debugEventModal(`[useEventModal] handleDeleteEvent 종료`);
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
