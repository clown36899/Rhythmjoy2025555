import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import type { Event as AppEvent } from "../lib/supabase";

interface FullscreenDateEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  clickPosition?: { x: number; y: number };
  onEventClick: (event: AppEvent) => void;
}

export default function FullscreenDateEventsModal({
  isOpen,
  onClose,
  selectedDate,
  clickPosition,
  onEventClick,
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
        
        // 모든 이벤트를 가져온 후 클라이언트에서 필터링
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .order("time", { ascending: true });

        if (error) throw error;
        
        // 클라이언트에서 정확하게 필터링
        const filteredEvents = (data || []).filter((event: any) => {
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
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={onClose}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes popIn {
            from {
              opacity: 0;
              transform: scale(0);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}
      </style>
      
      <div
        ref={modalRef}
        className="bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          ...animationOrigin,
          animation: "popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <i className="ri-calendar-line text-blue-400 text-xl"></i>
            <h2 className="text-lg font-bold text-white">
              {formatDate(selectedDate)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line text-4xl text-gray-500 animate-spin"></i>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="ri-calendar-close-line text-6xl text-gray-600 mb-4"></i>
              <p className="text-gray-400">이 날짜에 등록된 이벤트가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
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
                    className="flex items-center gap-3 p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-all cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    {thumbnail && (
                      <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-gray-800">
                        <img
                          src={thumbnail}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            event.category === "class"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}
                        >
                          {event.category === "class" ? "강습" : "행사"}
                        </span>
                        {event.time && (
                          <span className="text-xs text-gray-400">
                            {event.time}
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-semibold truncate group-hover:text-blue-400 transition-colors">
                        {event.title}
                      </h3>
                      {event.location && (
                        <p className="text-sm text-gray-400 truncate mt-0.5">
                          <i className="ri-map-pin-line mr-1"></i>
                          {event.location}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0">
                      <i className="ri-arrow-right-s-line text-2xl text-gray-500 group-hover:text-blue-400 transition-colors"></i>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {events.length > 0 && (
          <div className="p-3 border-t border-gray-700 bg-gray-800/50">
            <p className="text-center text-sm text-gray-400">
              총 {events.length}개의 이벤트
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
