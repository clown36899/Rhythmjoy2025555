import { useState, useCallback } from "react";
import { cafe24 } from "../../../../../lib/cafe24Client";
import { useAuth } from "../../../../../contexts/AuthContext";
import { addClientLog } from "../../../../../utils/clientLogBuffer";
import type { Event } from "../../../utils/eventListUtils";

interface UseEventSelectionProps {
    isAdminMode: boolean;
    adminType: "super" | "sub" | null;
    fetchEvents: () => Promise<void>;
}

const isLocalDebugHost = () => typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);

const deleteDiagnostic = (...args: unknown[]) => {
    if (!isLocalDebugHost()) return;
    console.info(...args);
    addClientLog('event', ...args);
};

export function useEventSelection({
    isAdminMode,
    // adminType, // Unused
    fetchEvents
}: UseEventSelectionProps) {
    const { user } = useAuth();
    const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
    const [isEditingWithDetail, setIsEditingWithDetail] = useState(false);
    const [isFetchingDetail, setIsFetchingDetail] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleEditClick = useCallback(async (event: Event) => {
        // Only owner or admin can edit
        const canEdit = isAdminMode || (user && user.id === event.user_id);
        if (!canEdit) {
            alert("수정 권한이 없습니다.");
            return;
        }

        try {
            setIsFetchingDetail(true);
            // Fetch fresh detail from DB (including description, organizer_phone, etc.)
            const { data, error } = await cafe24
                .from("events")
                .select("*")
                .eq("id", event.id)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Event not found");
            setEventToEdit(data as Event);
            setIsEditingWithDetail(true);
        } catch (error) {
            console.error("Error fetching event detail:", error);
            alert("데이터를 불러오는데 실패했습니다.");
            // Fallback to basic data
            setEventToEdit(event);
            setIsEditingWithDetail(true);
        } finally {
            setIsFetchingDetail(false);
        }
    }, [isAdminMode, user]);

    const handleDeleteClick = useCallback(async (eventId: number | string) => {
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;

        try {
            setIsDeleting(true);
            const cleanId = String(eventId).replace(/^social-/, '');
            const { data: { session }, error: sessionError } = await cafe24.auth.getSession();
            if (sessionError) console.error("[EventListDelete] Session Error:", sessionError);
            const token = session?.access_token;

            deleteDiagnostic('[EventDelete:EventListUI] prepared request', {
                originalEventId: eventId,
                cleanId,
                hasToken: Boolean(token),
                userId: user?.id || session?.user?.id || null,
                isAdminMode,
            });

            // Call Cafe24 API for deletion (handling storage cleanup)
            const response = await fetch('/api/delete-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    eventId: cleanId,
                }),
            });
            const responseText = await response.text();
            let result: any = null;
            try {
                result = responseText ? JSON.parse(responseText) : null;
            } catch {
                result = { raw: responseText };
            }

            deleteDiagnostic('[EventDelete:EventListUI] response', {
                status: response.status,
                ok: response.ok,
                body: result,
            });

            if (!response.ok) {
                throw new Error(result?.error || '삭제 실패');
            }

            // Success
            await fetchEvents();
            setIsEditingWithDetail(false);
            setEventToEdit(null);

            // Dispatch event to close detail modal if open
            window.dispatchEvent(new CustomEvent('closeEventDetailModal'));

        } catch (error: any) {
            console.error("Error deleting event:", error);
            alert(error.message || "삭제 중 오류가 발생했습니다.");
        } finally {
            setIsDeleting(false);
        }
    }, [user, isAdminMode, fetchEvents]);

    return {
        eventToEdit,
        setEventToEdit,
        isEditingWithDetail,
        setIsEditingWithDetail,
        isFetchingDetail,
        isDeleting,
        handleEditClick,
        handleDeleteClick
    };
}
