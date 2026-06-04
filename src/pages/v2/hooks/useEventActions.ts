
import { useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useModalActions } from "../../../contexts/ModalContext";
import { queryClient } from "../../../lib/queryClient";
import { addClientLog } from "../../../utils/clientLogBuffer";

interface UseEventActionsProps {
    adminType: "super" | "sub" | null;
    user: User | null; // User type from AuthContext
    signInWithKakao: () => void;
}

const EVENT_ACTIONS_DEBUG = import.meta.env.VITE_EVENT_ACTIONS_DEBUG === 'true';
const eventActionsDebug = (...args: unknown[]) => {
    if (EVENT_ACTIONS_DEBUG) console.debug(...args);
};

const isLocalDebugHost = () => typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);

const eventDeleteDiagnostic = (...args: unknown[]) => {
    if (!isLocalDebugHost()) return;
    console.info(...args);
    addClientLog('event', ...args);
};

export function useEventActions({ adminType, user, signInWithKakao }: UseEventActionsProps) {
    const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
    const { openModal } = useModalActions();

    const handleDailyModalEventClick = useCallback((event: AppEvent) => {
        // [Optimization] Removed artificial 100ms delay
        setSelectedEvent(event);
    }, []);

    const closeModal = useCallback(() => {
        setSelectedEvent(null);
        // Don't close search modal - keep it open so user can select other events
    }, []);

    const handleEditClick = useCallback((event: AppEvent, arg?: React.MouseEvent | string) => {
        const e = typeof arg === 'object' ? arg : undefined;
        const field = typeof arg === 'string' ? arg : null;
        e?.stopPropagation();

        // 1. 로그인 체크
        if (!user) {
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: { message: '이벤트를 수정하려면 로그인이 필요합니다.' }
            }));
            return;
        }

        // 2. 권한 체크 (관리자 또는 작성자 본인)
        const isOwner = user.id === event.user_id;
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
        const isSuperAdmin = user.app_metadata?.is_admin === true || (!!adminEmail && user.email === adminEmail);

        if (!isOwner && !isSuperAdmin && !adminType) {
            alert("본인이 작성한 이벤트만 수정할 수 있습니다.");
            return;
        }

        // 3. 소셜 이벤트 여부 확인
        const isSocial = String(event.id).startsWith('social-') || !!(event as any).group_id || event.category === 'social';

        if (isSocial) {
            // 소셜 스케줄 수정을 위해 SocialScheduleModal 호출
            const socialId = typeof event.id === 'string' && event.id.startsWith('social-')
                ? parseInt(event.id.replace('social-', ''), 10)
                : event.id;

            openModal('socialSchedule', {
                editSchedule: {
                    ...event,
                    id: socialId // 숫자형 ID로 복원하여 전달 (SocialSchedule 타입 기대치 충족)
                },
                groupId: (event as AppEvent & { group_id?: number }).group_id || null,
                onSuccess: () => {
                    // 성공 시 이벤트 리스트 갱신을 위해 커스텀 이벤트 발생
                    window.dispatchEvent(new CustomEvent('eventUpdated'));
                }
            });

            // 상세 모달 닫기
            setSelectedEvent(null);
            return;
        }

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        // Passing object with event and field
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: { event, field } }));
    }, [user, signInWithKakao, adminType]);

    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);

    const deleteEvent = useCallback(async (eventId: number | string, password: string | null = null): Promise<boolean> => {
        eventActionsDebug('[useEventActions > deleteEvent] START', { eventId, hasPassword: !!password, isDeleting });

        if (isDeleting) {
            console.warn('[useEventActions > deleteEvent] ABORTED: Already deleting.');
            eventDeleteDiagnostic('[EventDelete:UI] blocked duplicate delete', { eventId });
            return false; // Prevent double click
        }

        setIsDeleting(true);
        setDeleteProgress(10); // Start progress

        try {
            // [CRITICAL FIX] ID 전처리: 'social-' 접두어 제거 및 FullCalendar 오프셋 처리
            const strippedId = String(eventId).replace('social-', '');
            const cleanId = strippedId;

            eventActionsDebug('[useEventActions > deleteEvent] Cleaned ID for API:', { original: eventId, cleanId });
            eventDeleteDiagnostic('[EventDelete:UI] prepared request', { originalEventId: eventId, cleanId, hasPassword: Boolean(password) });

            eventActionsDebug('[useEventActions > deleteEvent] Fetching session...');
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) console.error('[useEventActions > deleteEvent] Session Error:', sessionError);
            const token = session?.access_token;
            setDeleteProgress(30);
            eventDeleteDiagnostic('[EventDelete:UI] session state', {
                hasToken: Boolean(token),
                userId: user?.id || null,
                adminType,
            });

            eventActionsDebug('[useEventActions > deleteEvent] Calling /.netlify/functions/delete-event', { token: !!token, cleanId });
            const response = await fetch('/.netlify/functions/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ eventId: cleanId, password })
            });
            setDeleteProgress(60);
            const responseText = await response.text();
            let responseData: any = null;
            try {
                responseData = responseText ? JSON.parse(responseText) : null;
            } catch {
                responseData = { raw: responseText };
            }

            eventActionsDebug('[useEventActions > deleteEvent] Response received', { status: response.status, ok: response.ok });
            eventDeleteDiagnostic('[EventDelete:UI] response', {
                status: response.status,
                ok: response.ok,
                body: responseData,
            });

            if (!response.ok) {
                const errorData = responseData || {};
                console.error('[useEventActions > deleteEvent] API Error Response:', errorData);
                if (errorData.error?.includes('foreign key constraint') || errorData.message?.includes('foreign key constraint')) {
                    alert("다른 사용자가 '즐겨찾기' 및 '관심설정'한 이벤트는 삭제할 수 없습니다.");
                    return false;
                }
                throw new Error(errorData.error || 'Server error');
            }

            setDeleteProgress(90);

            // Success
            eventActionsDebug('[useEventActions > deleteEvent] SUCCESS! Invalidating queries and closing modal.');

            // [Persistence] TanStack Query 캐시 무효화 (캘린더 페이지 등 연동)
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });

            // Clean up state
            closeModal(); // Local cleanup
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));

            return true;
        } catch (error: unknown) {
            console.error('[useEventActions > deleteEvent] CATCH Error:', error);
            const message = error instanceof Error ? error.message : "알 수 없는 오류";
            alert("삭제 실패: " + message);
            return false;
        } finally {
            eventActionsDebug('[useEventActions > deleteEvent] FINALLY Block reached. Releasing lock.');
            setIsDeleting(false);
            setDeleteProgress(0);
        }
    }, [adminType, closeModal, isDeleting, user?.id]);

    const handleDeleteClick = useCallback(async (event: AppEvent, e?: React.MouseEvent | any): Promise<boolean> => {
        eventDeleteDiagnostic('[EventDelete:UI] handleDeleteClick start', {
            hasEvent: Boolean(event),
            eventId: event?.id,
            adminType,
            userId: user?.id || null,
            eventUserId: event?.user_id || null,
            isDeleting,
        });

        if (!event?.id) {
            console.error('[useEventActions > handleDeleteClick] Missing event or event.id', { event });
            alert('삭제할 이벤트 정보를 찾지 못했습니다.');
            return false;
        }

        eventActionsDebug('[useEventActions > handleDeleteClick] START', { eventId: event.id, adminType, userId: user?.id, eventUserId: event.user_id });

        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }

        // 1. Super Admin Request
        if (adminType === "super") {
            eventActionsDebug('[useEventActions > handleDeleteClick] Pathway: Super Admin');
            eventDeleteDiagnostic('[EventDelete:UI] path super admin', { eventId: event.id });
            return await deleteEvent(event.id);
        }

        // 2. Owner Request
        const isOwner = user?.id && event.user_id && user.id === event.user_id;
        if (isOwner) {
            eventActionsDebug('[useEventActions > handleDeleteClick] Pathway: Logic Owner');
            eventDeleteDiagnostic('[EventDelete:UI] path owner', { eventId: event.id, userId: user?.id });
            return await deleteEvent(event.id);
        }

        // 3. Guest/User with Password
        eventActionsDebug('[useEventActions > handleDeleteClick] Pathway: Guest/Password Check');
        eventDeleteDiagnostic('[EventDelete:UI] path password fallback', { eventId: event.id, hasPassword: Boolean(event.password) });
        let password = null;
        if (event.password) {
            password = prompt("비밀번호를 입력하세요:");
            if (!password) {
                eventActionsDebug('[useEventActions > handleDeleteClick] Password prompt cancelled.');
                return false; // Cancelled
            }
        } else {
            eventActionsDebug('[useEventActions > handleDeleteClick] No event password & Not owner. Attempting delete anyway (?)');
        }

        // Local password validation (if event has password)
        if (event.password && password !== event.password) {
            console.warn('[useEventActions > handleDeleteClick] Incorrect password entered.');
            alert("비밀번호가 올바르지 않습니다.");
            return false;
        }

        eventActionsDebug('[useEventActions > handleDeleteClick] Proceeding to deleteEvent with password.');
        return await deleteEvent(event.id, password);
    }, [adminType, deleteEvent, isDeleting, user]);

    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

    const handleVenueClick = useCallback((venueId: string) => {
        // Prevent event propagation if triggered from UI
        setSelectedVenueId(venueId);
    }, []);

    const closeVenueModal = useCallback(() => {
        setSelectedVenueId(null);
    }, []);

    return {
        selectedEvent,
        setSelectedEvent,
        handleDailyModalEventClick,
        closeModal,
        handleEditClick,
        handleDeleteClick,
        selectedVenueId,
        handleVenueClick,
        closeVenueModal,
        isDeleting,
        deleteProgress
    };
}
