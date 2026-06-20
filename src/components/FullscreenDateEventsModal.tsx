import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { cafe24 } from "../lib/cafe24Client";
import type { Event as AppEvent } from "../lib/cafe24Client";
import { fetchCafe24Events, isCafe24EventsBackendEnabled } from "../lib/cafe24EventsApi";
import { useModalHistory } from "../hooks/useModalHistory";
import LocalLoading from "./LocalLoading";
import { eventOverlapsDate, getEventMutation, mergeEventIntoArray, removeEventFromArray } from "../utils/eventMutationSync";
import "../styles/domains/events.css";
import "../styles/components/DateEventsModal.css";

interface FullscreenDateEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  clickPosition?: { x: number; y: number };
  onEventClick: (event: AppEvent) => void;
  selectedCategory?: string;
  density?: 'low' | 'medium' | 'high' | 'ultra';
}

export default function FullscreenDateEventsModal({
  isOpen,
  onClose,
  selectedDate,
  clickPosition: _clickPosition,
  onEventClick,
  selectedCategory = "all",
  density = 'medium',
}: FullscreenDateEventsModalProps) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const selectedDateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    if (!isOpen) return;

    const fetchEvents = async () => {
      setLoading(false);
      try {
        setLoading(true);
        const data = isCafe24EventsBackendEnabled
          ? await fetchCafe24Events({ start: selectedDateStr, end: selectedDateStr, limit: 500 })
          : await (async () => {
            const { data, error } = await cafe24
              .from("events")
              .select("*")
              .order("time", { ascending: true });

            if (error) throw error;
            return data || [];
          })();

        const filteredEvents = (data || []).filter((event: any) => {
          if (selectedCategory && selectedCategory !== "all" && event.category !== selectedCategory) {
            return false;
          }
          if (event.event_dates && event.event_dates.length > 0) {
            return event.event_dates.includes(selectedDateStr);
          }
          const startDate = event.start_date || event.date;
          const endDate = event.end_date || event.start_date || event.date;
          return (startDate && endDate && selectedDateStr >= startDate && selectedDateStr <= endDate);
        });

        setEvents(filteredEvents);
      } catch (error) {
        console.error("Error fetching events:", error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [isOpen, selectedDateStr, selectedCategory]);

  useEffect(() => {
    if (!isOpen) return;

    const isVisibleForModal = (event: AppEvent) => (
      (!selectedCategory || selectedCategory === 'all' || event.category === selectedCategory)
      && eventOverlapsDate(event as any, selectedDateStr)
    );

    const handleEventChanged = (event: globalThis.Event) => {
      const detail = (event as CustomEvent).detail;
      const { event: updatedEvent } = getEventMutation(detail);
      if (!updatedEvent) return;

      setEvents(prev => mergeEventIntoArray(prev, detail, {
        insertIfMissing: event.type === 'eventCreated' && isVisibleForModal(updatedEvent as AppEvent),
      }).filter(isVisibleForModal));
    };

    const handleEventDeleted = (event: globalThis.Event) => {
      setEvents(prev => removeEventFromArray(prev, (event as CustomEvent).detail));
    };

    window.addEventListener('eventUpdated', handleEventChanged);
    window.addEventListener('eventCreated', handleEventChanged);
    window.addEventListener('eventDeleted', handleEventDeleted);

    return () => {
      window.removeEventListener('eventUpdated', handleEventChanged);
      window.removeEventListener('eventCreated', handleEventChanged);
      window.removeEventListener('eventDeleted', handleEventDeleted);
    };
  }, [isOpen, selectedCategory, selectedDateStr]);

  useModalHistory(isOpen, onClose);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getDayInfo = (date: Date) => {
    const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    return {
      weekday: weekdays[date.getDay()],
      dayNum: `${date.getDate()}일`,
      monthStr: `${date.getMonth() + 1}월`
    };
  };

  const { weekday, dayNum, monthStr } = getDayInfo(selectedDate);

  return createPortal(
    <div
      className={`DateEventsModal density-${density}`}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="DEM-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="DEM-header">
          <div className="DEM-dateInfo">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="DEM-weekday">{weekday}</span>
              <span className="DEM-dayNum">{dayNum}</span>
            </div>
            <span className="DEM-subtitle">{monthStr} 소셜/이벤트</span>
          </div>
          <button onClick={onClose} className="DEM-closeBtn">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="DEM-body">
          {loading ? (
            <div className="DEM-empty">
              <LocalLoading size="lg" />
            </div>
          ) : events.length === 0 ? (
            <div className="DEM-empty">
              <p>이 날짜에 등록된 이벤트가 없습니다.</p>
            </div>
          ) : (
            <div className="DEM-grid">
              {events.map((event) => {
                const thumbnail =
                  event.image_thumbnail ||
                  event.image_medium ||
                  event.image_full ||
                  event.image;

                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      onEventClick(event);
                      onClose();
                    }}
                    className="DEM-item"
                  >
                    <div className="DEM-thumbnail">
                      {thumbnail ? (
                        <img src={thumbnail} alt={event.title} loading="lazy" draggable={false} />
                      ) : (
                        <div className="DEM-fallback">
                          {event.title.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className={`DEM-category ${event.category === 'class' ? 'cat-bg-class' : 'cat-bg-social'}`}>
                      {event.category === 'class' ? '강습' : '소셜'}
                    </span>
                    <h3 className="DEM-title">{event.title}</h3>
                    {event.time && <span className="DEM-time">{event.time}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
