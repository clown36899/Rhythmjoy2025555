import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import type { Event as AppEvent } from "../lib/supabase";
import "./FullscreenDateEventsModal.css";

interface FullscreenDateEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  clickPosition?: { x: number; y: number };
  onEventClick: (event: AppEvent) => void;
  selectedCategory?: string;
}

export default function FullscreenDateEventsModal({
  isOpen,
  onClose,
  selectedDate,
  clickPosition,
  onEventClick,
  selectedCategory = "all",
}: FullscreenDateEventsModalProps) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // 로컬 시간대로 날짜 문자열 생성 (UTC 변환 방지)
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        console.log(`[Modal] Fetching events for: ${dateStr} (Original: ${selectedDate.toString()})`);
        console.log(`[Modal] Selected Category: ${selectedCategory}`);

        // 모든 이벤트를 가져온 후 클라이언트에서 필터링
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .order("time", { ascending: true });

        if (error) throw error;

        // 클라이언트에서 정확하게 필터링
        const filteredEvents = (data || []).filter((event: any) => {
          // 카테고리 필터링
          if (selectedCategory && selectedCategory !== "all" && event.category !== selectedCategory) {
            return false;
          }

          // event_dates 배열로 정의된 이벤트 체크
          if (event.event_dates && event.event_dates.length > 0) {
            return event.event_dates.includes(dateStr);
          }

          // start_date/end_date 범위로 정의된 이벤트 체크
          const startDate = event.start_date || event.date;
          const endDate = event.end_date || event.start_date || event.date;

          return (
            startDate &&
            endDate &&
            dateStr >= startDate &&
            dateStr <= endDate
          );
        });

        console.log(`[Modal] Filtered events count: ${filteredEvents.length}`);
        if (filteredEvents.length > 0) {
          console.log(`[Modal] First event match:`, {
            title: filteredEvents[0].title,
            start_date: filteredEvents[0].start_date,
            end_date: filteredEvents[0].end_date,
            date: filteredEvents[0].date,
            event_dates: filteredEvents[0].event_dates,
            dateStr_used: dateStr
          });
        }
        setEvents(filteredEvents);
      } catch (error) {
        console.error("Error fetching events:", error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [isOpen, selectedDate]);

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

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[date.getDay()];
    return `${month}월 ${day}일 (${weekday})`;
  };

  const animationOrigin = clickPosition
    ? {
      transformOrigin: `${clickPosition.x}px ${clickPosition.y}px`,
    }
    : {
      transformOrigin: "center center",
    };

  return createPortal(
    <div
      className="fsde-overlay"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="fsde-modal fsde-w-full fsde-flex fsde-flex-col"
        style={animationOrigin}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="fsde-header">
          <div className="fsde-header-title-wrapper">
            <i className="ri-calendar-line fsde-header-icon"></i>
            <h2 className="fsde-header-title">
              {formatDate(selectedDate)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="fsde-close-btn"
          >
            <i className="ri-close-line fsde-close-icon"></i>
          </button>
        </div>

        {/* Content */}
        <div className="fsde-content fsde-flex-1">
          {loading ? (
            <div className="fsde-loading fsde-flex-center">
              <i className="ri-loader-4-line fsde-loading-icon"></i>
            </div>
          ) : events.length === 0 ? (
            <div className="fsde-empty">
              <i className="ri-calendar-close-line fsde-empty-icon"></i>
              <p className="fsde-empty-text">이 날짜에 등록된 이벤트가 없습니다.</p>
            </div>
          ) : (
            <div className="fsde-event-list">
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
                    className="fsde-event-item"
                  >
                    {/* Thumbnail */}
                    {thumbnail && (
                      <div className="fsde-thumbnail">
                        <img
                          src={thumbnail}
                          alt={event.title}
                          className="fsde-thumbnail-img"
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="fsde-event-content">
                      <div className="fsde-event-meta">
                        <span
                          className={`fsde-badge ${event.category === "class"
                            ? "fsde-badge-class"
                            : "fsde-badge-event"
                            }`}
                        >
                          {event.category === "class" ? "강습" : "행사"}
                        </span>
                        {event.time && (
                          <span className="fsde-event-time">
                            {event.time}
                          </span>
                        )}
                      </div>
                      <h3 className="fsde-event-title truncate">
                        {event.title}
                      </h3>
                      {event.location && (
                        <p className="fsde-event-location truncate">
                          <i className="ri-map-pin-line fsde-location-icon"></i>
                          {event.location}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="fsde-arrow">
                      <i className="ri-arrow-right-s-line fsde-arrow-icon"></i>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {events.length > 0 && (
          <div className="fsde-footer">
            <p className="fsde-footer-text">
              총 {events.length}개의 이벤트
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
