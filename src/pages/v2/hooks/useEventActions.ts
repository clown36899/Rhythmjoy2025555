
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

    const handleEditClick = useCallback((event: AppEvent, arg?: React.MouseEvent | string) => {
        const e = typeof arg === 'object' ? arg : undefined;
        const field = typeof arg === 'string' ? arg : null;
        e?.stopPropagation();

        // 1. 로그인 체크
        if (!user) {
            if (confirm("이벤트를 수정하려면 로그인이 필요합니다.\n로그인 하시겠습니까?")) {
                signInWithKakao();
            }
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

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        // Passing object with event and field
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: { event, field } }));
    }, [user, signInWithKakao, adminType]);

    const deleteEvent = async (eventId: number, password: string | null = null) => {
        try {
            console.log(`[deleteEvent] Deleting event ${eventId}, user: ${user?.id}`);

            // 1. Try Direct RLS Deletion first (for logged-in users)
            if (user) {
                // RLS Policy가 권한(본인 또는 관리자)을 확인하므로 단순히 ID로 삭제 요청
                // .eq('user_id', user.id)를 제거하여 관리자가 타인의 ID를 삭제할 수 있도록 함
                const { error: rlsError, count } = await supabase
                    .from('events')
                    .delete({ count: 'exact' })
                    .eq('id', eventId);

                if (!rlsError && count !== null && count > 0) {
                    alert("이벤트가 삭제되었습니다.");
                    window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
                    closeModal();
                    return;
                }

                // If RLS failed/returned 0 rows, log and proceed to Edge Function
                if (rlsError) console.warn("Direct delete failed, falling back to Edge Function", rlsError);
            }

            // 2. Edge Function Fallback (for guests or complex cases)
            const { error } = await supabase.functions.invoke('delete-event', { body: { eventId, password } });
            if (error) throw error;
            alert("이벤트가 삭제되었습니다.");
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
            closeModal();
        } catch (error: any) {
            console.error("이벤트 삭제 중 오류 발생:", error);
            alert(`삭제하지 못했습니다.\n권한이 없거나 오류가 발생했습니다.`);
        }
    };

    const handleDeleteClick = useCallback((event: AppEvent, e?: React.MouseEvent) => {
        e?.stopPropagation();

        // 1. Super Admin Request
        if (adminType === "super") {
            if (confirm("정말로 이 이벤트를 삭제하시겠습니까? (슈퍼관리자 권한)\n이 작업은 되돌릴 수 없습니다.")) {
                deleteEvent(event.id);
            }
            return;
        }

        // 2. Owner Request
        const isOwner = user?.id && event.user_id && user.id === event.user_id;
        if (isOwner) {
            if (confirm("정말로 이 이벤트를 삭제하시겠습니까? (작성자 권한)\n이 작업은 되돌릴 수 없습니다.")) {
                deleteEvent(event.id);
            }
            return;
        }

        // 3. Password Fallback (Guest or legacy events)
        const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
        if (password === null) return;

        // Local password validation (if event has password)
        if (event.password && password !== event.password) {
            alert("비밀번호가 올바르지 않습니다.");
            return;
        }

        if (confirm("정말로 이 이벤트를 삭제하시겠습니까? (비밀번호 인증)\n이 작업은 되돌릴 수 없습니다.")) {
            deleteEvent(event.id, password);
        }
    }, [adminType, closeModal, user]);

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
        closeVenueModal
    };
}
