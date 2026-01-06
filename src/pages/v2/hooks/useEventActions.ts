
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

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        // Passing object with event and field
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: { event, field } }));
    }, [user, signInWithKakao, adminType]);

    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);

    const deleteEvent = async (eventId: number, password: string | null = null) => {
        if (isDeleting) return; // Prevent double click

        // Double Confirmation
        if (!confirm("삭제된 데이터는 복구할 수 없습니다.\n정말로 삭제하시겠습니까?")) {
            return;
        }

        // State update
        setIsDeleting(true);
        setDeleteProgress(0);

        // Fake progress interval
        const interval = setInterval(() => {
            setDeleteProgress(prev => {
                if (prev >= 90) return prev;
                return prev + 10;
            });
        }, 100);

        try {

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/.netlify/functions/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ eventId, password })
            });

            if (!response.ok) {
                const errorData = await response.json();

                // Foreign Key Constraint Check (즐겨찾기 삭제 방지 - 서버 에러 메시지 활용)
                if (errorData.error?.includes('foreign key constraint') || errorData.message?.includes('foreign key constraint')) {
                    alert("다른 사용자가 '즐겨찾기' 및 '관심설정'한 이벤트는 삭제할 수 없습니다.\n\n(참고: 데이터 보호를 위해 삭제가 제한됩니다)");
                    setIsDeleting(false); // Manually reset on early return
                    clearInterval(interval);
                    setDeleteProgress(0);
                    return;
                }

                throw new Error(errorData.error || `Server returned ${response.status}`);
            }

            // Success
            setDeleteProgress(100);
            clearInterval(interval);

            setTimeout(() => {
                // alert("이벤트가 삭제되었습니다."); // Removed as per request
                window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
                closeModal();
                setIsDeleting(false);
                setDeleteProgress(0);
            }, 500); // Slight delay to show 100%

        } catch (error: any) {
            console.error("이벤트 삭제 중 오류 발생:", error);
            alert(`삭제하지 못했습니다.\n권한이 없거나 오류가 발생했습니다.`);
            setIsDeleting(false); // Reset state on error
            setDeleteProgress(0);
            clearInterval(interval);
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
        closeVenueModal,
        isDeleting,
        deleteProgress
    };
}
