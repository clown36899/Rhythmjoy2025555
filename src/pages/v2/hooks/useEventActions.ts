
import { useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";

interface UseEventActionsProps {
    adminType: "super" | "sub" | null;
}

export function useEventActions({ adminType }: UseEventActionsProps) {
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

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        // Page.tsx delegates editing UI to EventList via this event
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: event }));
    }, []);

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
