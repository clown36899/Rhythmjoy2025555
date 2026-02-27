
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";

interface UseDeepLinkLogicProps {
    setCurrentMonth: (date: Date) => void;
    setSelectedEvent: (event: AppEvent | null) => void;
}

export function useDeepLinkLogic({ setCurrentMonth, setSelectedEvent }: UseDeepLinkLogicProps) {
    const [qrLoading, setQrLoading] = useState(false);
    const [highlightEvent, setHighlightEvent] = useState<{ id: number | string; nonce: number } | null>(null);
    const [sharedEventId, setSharedEventId] = useState<number | string | null>(null);

    // Scroll to event in preview mode with horizontal scroll support
    const scrollToEventInPreview = useCallback((eventId: number | string) => {
        const scrollToEvent = (retries = 10) => {
            const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);

            if (eventCard) {
                // First, do vertical scroll to bring section into view
                // Use 'inline: nearest' to avoid resetting horizontal scroll
                eventCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Then, wait a bit and do horizontal scroll
                setTimeout(() => {
                    // Find the horizontal scroll container (correct class name)
                    const slideContainer = eventCard.closest('.ELS-scroller, .USS-scroller, .EHLV-list');

                    if (slideContainer) {
                        // Get fresh positions after vertical scroll
                        const cardRect = eventCard.getBoundingClientRect();
                        const containerRect = slideContainer.getBoundingClientRect();

                        // Calculate scroll position to center the card
                        const cardCenter = cardRect.left + (cardRect.width / 2);
                        const containerCenter = containerRect.left + (containerRect.width / 2);
                        const scrollOffset = cardCenter - containerCenter;

                        slideContainer.scrollTo({
                            left: slideContainer.scrollLeft + scrollOffset,
                            behavior: 'smooth'
                        });
                    }
                }, 200); // [Optimization] Reduced from 500ms

                // Highlight animation
                eventCard.classList.add('qr-highlighted');
                setTimeout(() => {
                    eventCard.classList.remove('qr-highlighted');
                }, 6000); // 3 pulses × 2s each

            } else if (retries > 0) {
                // Retry if DOM not ready
                setTimeout(() => scrollToEvent(retries - 1), 300);
            }
        };

        scrollToEvent();
    }, []);

    // QR Code & Deep Link Handling
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get("event");
        const source = params.get("from");

        if (eventId) {
            const id = parseInt(eventId);
            const isQrOrEdit = source === "qr" || source === "edit";

            if (isQrOrEdit) {
                // QR/Edit: 로딩 표시 후 스크롤
                setQrLoading(true);
            }

            const loadEventAndScroll = async () => {
                try {
                    const { data: event } = await supabase
                        .from("events")
                        .select("id,title,date,start_date,end_date,event_dates,time,location,location_link,category,genre,price,image,image_micro,image_thumbnail,image_medium,image_full,video_url,description,organizer,organizer_name,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at,user_id,venue_id,venue_name,venue_custom_link,scope,group_id,day_of_week,is_social_integrated,place_name")
                        .eq("id", id)
                        .maybeSingle();

                    if (event) {
                        if (isQrOrEdit) {
                            // QR/Edit: 달 이동 후 DOM 렌더 대기 → 스크롤
                            const eventDate = event.start_date || event.date;
                            if (eventDate) setCurrentMonth(new Date(eventDate));
                            setTimeout(() => {
                                setQrLoading(false);
                                scrollToEventInPreview(id);
                            }, 400);
                        } else {
                            // 공유 링크: 초기 렌더 완료 후 모달 오픈
                            setTimeout(() => {
                                setSelectedEvent(event as AppEvent);
                            }, 0);
                        }
                    } else {
                        setQrLoading(false);
                    }
                } catch (error) {
                    console.error("QR/Deep link error:", error);
                    setQrLoading(false);
                }
            };

            loadEventAndScroll();

            // Clean up URL parameters
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [setCurrentMonth, setSelectedEvent, scrollToEventInPreview]);

    return {
        qrLoading,
        highlightEvent,
        setHighlightEvent,
        sharedEventId,
        setSharedEventId,
        scrollToEventInPreview
    };
}
