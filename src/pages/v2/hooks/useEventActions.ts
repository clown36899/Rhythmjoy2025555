
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

    const deleteEvent = async (eventId: number | string, password: string | null = null): Promise<boolean> => {
        console.log('%c🚀 [useEventActions/V2] deleteEvent Triggered!', 'background: #222; color: #55ff55; font-size: 14px');
        if (isDeleting) return false; // Prevent double click

        // Double Confirmation Removed
        // UI handles the confirmation. Just proceed.

        setIsDeleting(true);
        setDeleteProgress(10); // Start progress

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            setDeleteProgress(30);

            const response = await fetch('/.netlify/functions/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ eventId, password })
            });
            setDeleteProgress(60);

            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error?.includes('foreign key constraint') || errorData.message?.includes('foreign key constraint')) {
                    alert("다른 사용자가 '즐겨찾기' 및 '관심설정'한 이벤트는 삭제할 수 없습니다.");
                    return false;
                }
                throw new Error(errorData.error || 'Server error');
            }

            setDeleteProgress(90);

            // Success
            alert("삭제되었습니다."); // Keep consistent with V1

            // Clean up state
            closeModal(); // Local cleanup
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));

            return true;
        } catch (error: any) {
            console.error('Delete error:', error);
            alert("삭제 실패: " + (error.message || "알 수 없는 오류"));
            return false;
        } finally {
            setIsDeleting(false);
            setDeleteProgress(0);
        }
    };

    const handleDeleteClick = useCallback(async (event: AppEvent, e?: React.MouseEvent): Promise<boolean> => {
        e?.stopPropagation();
        console.log('%c🚀 [useEventActions/V2] handleDeleteClick Triggered!', 'background: #222; color: #55ff55; font-size: 14px');

        // 1. Super Admin Request
        if (adminType === "super") {
            // Confirm removed - UI already confirmed
            return await deleteEvent(event.id);
        }

        // 2. Owner Request
        const isOwner = user?.id && event.user_id && user.id === event.user_id;
        if (isOwner) {
            // Confirm removed - UI already confirmed
            return await deleteEvent(event.id);
        }

        // 3. Guest/User with Password
        // UI Prompt for password if not provided?
        // Wait, V2 uses `prompt` usually? No, `useEventActions` relied on existing password logic?
        // Actually V2 Logic (lines 151+) asks for password via `prompt`!

        let password = null;
        if (event.password) {
            password = prompt("비밀번호를 입력하세요:");
            if (!password) return false; // Cancelled
        } else {
            // If no password set on event but user is not owner/admin?
            // Usually blocked by UI, but if triggered:
            // Just try delete? Or prompt?
            // Existing logic matches password.   
        }

        // Local password validation (if event has password)
        if (event.password && password !== event.password) {
            alert("비밀번호가 올바르지 않습니다.");
            return false;
        }

        // Confirm removed - UI already confirmed
        return await deleteEvent(event.id, password);
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
