import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import type { Event as AppEvent } from "../lib/supabase";
import { useModalHistory } from "../hooks/useModalHistory";
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

  useEffect(() => {
    if (!isOpen) return;

    const fetchEvents = async () => {
      setLoading(false);
      try {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        setLoading(true);
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .order("time", { ascending: true });

        if (error) throw error;

        const filteredEvents = (data || []).filter((event: any) => {
          if (selectedCategory && selectedCategory !== "all" && event.category !== selectedCategory) {
            return false;
          }
          if (event.event_dates && event.event_dates.length > 0) {
            return event.event_dates.includes(dateStr);
          }
          const startDate = event.start_date || event.date;
          const endDate = event.end_date || event.start_date || event.date;
          return (startDate && endDate && dateStr >= startDate && dateStr <= endDate);
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
  }, [isOpen, selectedDate, selectedCategory]);

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
              <i className="ri-loader-4-line is-spin" style={{ fontSize: '2rem' }}></i>
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
                        <img src={thumbnail} alt={event.title} loading="lazy" />
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
