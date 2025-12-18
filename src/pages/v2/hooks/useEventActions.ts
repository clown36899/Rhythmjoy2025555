
import { useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";

interface UseEventActionsProps {
    adminType: "super" | "sub" | null;
    user: any; // User type from AuthContext
    signInWithKakao: () => void;
}

export function useEventActions({ adminType, user, signInWithKakao }: UseEventActionsProps) {
    const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);

    const handleDailyModalEventClick = useCallback((event: AppEvent) => {
        // 약간의 딜레이 후 상세 모달을 열어 애니메이션이 겹치지 않게 함
        setTimeout(() => {
            setSelectedEvent(event);
        }, 100);
    }, []);

    const closeModal = useCallback(() => {
        setSelectedEvent(null);
        // Don't close search modal - keep it open so user can select other events
    }, []);

    const handleEditClick = useCallback((event: AppEvent, e?: React.MouseEvent) => {
        e?.stopPropagation();

        // 1. 로그인 체크
        if (!user) {
            if (confirm("이벤트를 수정하려면 로그인이 필요합니다.\n로그인 하시겠습니까?")) {
                signInWithKakao();
            }
            return;
        }

        // 2. 권한 체크 (관리자 또는 작성자 본인)
        // adminType이 있거나(관리자 모드), 사용자 ID가 일치해야 함
        // isAdminMode는 Page.tsx에서 effectiveIsAdmin으로 넘겨받는게 좋은데, 
        // 여기서는 user 객체와 adminType을 활용
        const isOwner = user.id === event.user_id;
        // 하지만 여기선 user.app_metadata.is_admin 체크가 더 안전할 수도 있음.
        // 심플하게: user.id === event.user_id 체크가 핵심.

        // Note: adminType is derived from Page.tsx logic which considers isAdmin.
        // If adminType is set, it means we are in some admin mode.
        // However, Page.tsx passes `adminType` based on complex logic.
        // Let's blindly trust the specific check: if not owner and not adminType, block.

        // 더 정확한 체크를 위해 user.app_metadata.is_admin 확인 (AuthContext의 user 객체)
        // 더 정확한 체크를 위해 user.app_metadata.is_admin 확인 (AuthContext의 user 객체)
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
        const isSuperAdmin = user.app_metadata?.is_admin === true || (!!adminEmail && user.email === adminEmail);

        if (!isOwner && !isSuperAdmin && !adminType) {
            alert("본인이 작성한 이벤트만 수정할 수 있습니다.");
            return;
        }

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        // Page.tsx delegates editing UI to EventList via this event
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: event }));
    }, [user, signInWithKakao, adminType]);

    const deleteEvent = async (eventId: number, password: string | null = null) => {
        try {
            const { error } = await supabase.functions.invoke('delete-event', { body: { eventId, password } });
            if (error) throw error;
            alert("이벤트가 삭제되었습니다.");
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
            closeModal();
        } catch (error: any) {
            console.error("이벤트 삭제 중 오류 발생:", error);
            alert(`이벤트 삭제 중 오류가 발생했습니다: ${error.context?.error_description || error.message || '알 수 없는 오류'}`);
        }
    };

    const handleDeleteClick = useCallback((event: AppEvent, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (adminType === "super") {
            if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
                deleteEvent(event.id);
            }
            return;
        }

        // Page.tsx uses native prompt for password in delete action
        const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
        if (password === null) return;
        if (password !== event.password) {
            alert("비밀번호가 올바르지 않습니다.");
            return;
        }
        if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            deleteEvent(event.id, password);
        }
    }, [adminType, closeModal]); // deleteEvent captures closure

    return {
        selectedEvent,
        setSelectedEvent,
        handleDailyModalEventClick,
        closeModal,
        handleEditClick,
        handleDeleteClick
    };
}
