
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";

interface UseDeepLinkLogicProps {
    setCurrentMonth: (date: Date) => void;
}

export function useDeepLinkLogic({ setCurrentMonth }: UseDeepLinkLogicProps) {
    const [qrLoading, setQrLoading] = useState(false);
    const [highlightEvent, setHighlightEvent] = useState<{ id: number; nonce: number } | null>(null);
    const [sharedEventId, setSharedEventId] = useState<number | null>(null);

    // Scroll to event in preview mode with horizontal scroll support
    const scrollToEventInPreview = useCallback((eventId: number, category: string) => {
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
                    const slideContainer = eventCard.closest('.evt-v2-horizontal-scroll');

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
                }, 500); // Wait for vertical scroll to settle

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
            setQrLoading(true);

            // Set shared event ID for non-QR sources
            if (!source || (source !== "qr" && source !== "edit")) {
                setSharedEventId(id);
            }

            const loadEventAndScroll = async () => {
                try {
                    const { data: event } = await supabase
                        .from("events")
                        .select("id, start_date, date, category, venue_id")
                        .eq("id", id)
                        .single();

                    if (event) {
                        // Navigate to event's month
                        const eventDate = event.start_date || event.date;
                        if (eventDate) {
                            setCurrentMonth(new Date(eventDate));
                        }

                        // Wait for DOM to render, then scroll
                        setTimeout(() => {
                            setQrLoading(false);

                            if (source === "qr" || source === "edit") {
                                // QR/Edit: Scroll to event in preview mode with horizontal scroll
                                const categoryParam = params.get("category");
                                scrollToEventInPreview(id, categoryParam || event.category);
                            } else {
                                // Regular deep link: Just highlight
                                setTimeout(() => {
                                    setHighlightEvent({ id: event.id, nonce: Date.now() });
                                }, 500);
                            }
                        }, 1200); // Increased delay for DOM rendering
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
    }, [setCurrentMonth, scrollToEventInPreview]);

    return {
        qrLoading,
        highlightEvent,
        setHighlightEvent,
        sharedEventId,
        setSharedEventId
    };
}
