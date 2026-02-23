
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { BillboardSettings } from "../../../hooks/useBillboardSettings";
import type { Event as AppEvent } from "../../../lib/supabase";

interface UseBillboardLogicProps {
    settings: BillboardSettings;
    fromQR: boolean;
    setCurrentMonth: (date: Date) => void;
    setHighlightEvent: (event: { id: number; nonce: number } | null) => void;
}

export function useBillboardLogic({ settings, fromQR, setCurrentMonth, setHighlightEvent }: UseBillboardLogicProps) {
    const [isBillboardOpen, setIsBillboardOpen] = useState(false);
    const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
    const [billboardImages, setBillboardImages] = useState<string[]>([]);
    const [billboardEvents, setBillboardEvents] = useState<AppEvent[]>([]);
    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Inactivity Timer Logic
    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        // settings.enabled check, etc.
        if (!settings.enabled || isBillboardOpen || settings.inactivityTimeout === 0 || fromQR) return;

        inactivityTimerRef.current = setTimeout(() => {
            if (billboardImages.length > 0) setIsBillboardOpen(true);
        }, settings.inactivityTimeout);
    }, [settings.enabled, settings.inactivityTimeout, isBillboardOpen, billboardImages.length, fromQR]);

    // User Activity Listener
    useEffect(() => {
        const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
        let lastCallTime = 0;
        const throttleDelay = 200;

        const handleUserActivity = () => {
            const now = Date.now();
            if (now - lastCallTime >= throttleDelay) {
                lastCallTime = now;
                resetInactivityTimer();
            }
        };

        resetInactivityTimer();
        activityEvents.forEach((event) => window.addEventListener(event, handleUserActivity));

        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            activityEvents.forEach((event) => window.removeEventListener(event, handleUserActivity));
        };
    }, [resetInactivityTimer]);

    // Load Billboard Images
    useEffect(() => {
        const loadBillboardImages = async () => {
            if (!settings.enabled) {
                setBillboardImages([]);
                setBillboardEvents([]);
                return;
            }
            try {
                let query = supabase.from("events").select("id,title,date,start_date,end_date,time,location,category,price,image,image_micro,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at");
                query = query.or("image_full.not.is.null,image.not.is.null,video_url.not.is.null");

                if (settings.dateRangeStart) query = query.gte("start_date", settings.dateRangeStart);
                if (settings.dateRangeEnd) query = query.lte("start_date", settings.dateRangeEnd);

                query = query.order("date", { ascending: true });

                const { data: events } = await query;
                if (events && events.length > 0) {
                    const filteredEvents = events.filter((event) => {
                        const endDate = event.end_date || event.start_date || event.date;
                        if (!endDate) return false;

                        if (settings.excludedEventIds && settings.excludedEventIds.includes(event.id)) return false;

                        // Weekday exclusion logic
                        if (settings.excludedWeekdays && settings.excludedWeekdays.length > 0) {
                            // Assuming event.start_date or event.date is valid string
                            const dStr = event.start_date || event.date;
                            if (dStr) {
                                const eventDate = new Date(dStr);
                                if (settings.excludedWeekdays.includes(eventDate.getDay())) return false;
                            }
                        }
                        return true;
                    });

                    const imagesOrVideos = filteredEvents.map((event) => event?.video_url || event?.image_full || event?.image);
                    setBillboardImages(imagesOrVideos);
                    setBillboardEvents(filteredEvents);

                    if (settings.autoOpenOnLoad && !fromQR) {
                        const todayStr = new Date().toDateString();
                        const dismissedDate = localStorage.getItem("billboardDismissedDate");
                        if (dismissedDate !== todayStr && imagesOrVideos.length > 0) setIsBillboardOpen(true);
                    }
                }
            } catch (error) {
                console.error("Error loading billboard images", error);
            }
        };

        loadBillboardImages();
    }, [settings, fromQR]);

    // Handlers
    const handleBillboardClose = useCallback(() => {
        setIsBillboardOpen(false);
        localStorage.setItem("billboardDismissedDate", new Date().toDateString());
    }, []);

    const handleBillboardSettingsClose = useCallback(() => {
        setIsBillboardSettingsOpen(false);
    }, []);

    const handleBillboardEventClick = useCallback((event: AppEvent) => {
        setIsBillboardOpen(false);
        if (event && event.id) {
            const eventDate = event.start_date || event.date;
            if (eventDate) setCurrentMonth(new Date(eventDate));
            // [Optimization] Removed artificial 100ms delay
            setHighlightEvent({ id: Number(event.id), nonce: Date.now() });
        }
    }, [setCurrentMonth, setHighlightEvent]);

    return {
        isBillboardOpen,
        setIsBillboardOpen,
        isBillboardSettingsOpen,
        setIsBillboardSettingsOpen,
        billboardImages,
        billboardEvents,
        handleBillboardClose,
        handleBillboardSettingsClose,
        handleBillboardEventClick,
        resetInactivityTimer // Exposed if needed by manual triggers
    };
}
