import { memo } from "react";
import type { Event } from "../../../lib/supabase";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";

const getLocalDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface EventCardProps {
  event: Event;
  onClick: () => void;
  onMouseEnter?: (eventId: number) => void;
  onMouseLeave?: () => void;
  isHighlighted?: boolean;
  selectedDate?: Date | null;
  defaultThumbnailClass: string;
  defaultThumbnailEvent: string;
  viewMode?: "month" | "year";
  variant?: "single" | "sliding";
}

export const EventCard = memo(({
  event,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isHighlighted = false,
  selectedDate = null,
  defaultThumbnailClass,
  defaultThumbnailEvent,
  viewMode = "month",
  variant = "single",
}: EventCardProps) => {
  const highlightBorderColor =
    event.category === "class" ? "#9333ea" : "#2563eb";

  // 이벤트에 가장 적합한 썸네일 URL을 가져옵니다.
  // 신규 이미지는 WebP 형식으로 업로드되므로, 이 함수는 자동으로 최적화된 이미지 URL을 반환합니다.
  const thumbnailUrl = getEventThumbnail(
    event,
    defaultThumbnailClass,
    defaultThumbnailEvent,
  );

  let isOnSelectedDate = false;
  if (selectedDate) {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const selectedDateString = `${year}-${month}-${day}`;

    if (event.event_dates && event.event_dates.length > 0) {
      isOnSelectedDate = event.event_dates.includes(selectedDateString);
    } else {
      const eventStartDate = event.start_date || event.date;
      const eventEndDate = event.end_date || event.date;
      isOnSelectedDate = !!(
        eventStartDate &&
        eventEndDate &&
        selectedDateString >= eventStartDate &&
        selectedDateString <= eventEndDate
      );
    }
  }

  let dateText = "";
  if (event.event_dates && event.event_dates.length > 0) {
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };
    if (variant === "sliding" && event.event_dates.length > 1) {
      dateText = `${formatDate(event.event_dates[0])} ~ 시작`;
    } else {
      dateText = event.event_dates.map(formatDate).join(", ");
    }
  } else {
    const startDate = event.start_date || event.date;
    const endDate = event.end_date || event.date;

    if (!startDate) {
      dateText = "날짜 미정";
    } else {
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      };

      if (startDate !== endDate) {
        dateText = `${formatDate(startDate)} ~ ${formatDate(endDate || startDate)}`;
      } else {
        dateText = formatDate(startDate);
      }
    }
  }

  const endDate = event.end_date || event.date;
  const today = getLocalDateString();
  const isPast = endDate ? endDate < today : false;
  return (
    <div
      key={event.id}
      data-event-id={event.id}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = highlightBorderColor;
        if (viewMode === "month" && onMouseEnter) onMouseEnter(event.id);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--event-list-bg-color)";
        e.currentTarget.style.borderColor = "#000000";
        if (viewMode === "month" && onMouseLeave) onMouseLeave();
      }}
      className={`overflow-hidden transition-all cursor-pointer relative border ${
        isHighlighted ? "" : "border-[#000000]"
      }`}
      style={{
        backgroundColor: "var(--event-list-bg-color)",
        borderColor: isHighlighted ? highlightBorderColor : undefined,
        borderRadius: "0.3rem",
      }}
    >
      <div className="relative aspect-[3/4]">
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={event.title}
              loading="lazy"  // 이미지가 뷰포트에 가까워질 때 로딩을 시작합니다.
              decoding="async" // 이미지 디코딩을 다른 작업과 병렬로 처리합니다.
              className="w-full object-contain object-top bg-gray-900"
              style={{ height: "-webkit-fill-available" }}
            />
            {variant === "sliding" && !event?.image && !event?.image_thumbnail && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-white/50 text-4xl font-bold">
                  {event.category === "class" ? "강습" : "행사"}
                </span>
              </div>
            )}
          </>
        ) : (
          <div
            className="w-full aspect-[3/4] flex items-center justify-center bg-cover bg-center relative"
            style={{
              backgroundImage: "url(/grunge.png)",
            }}
          >
            <div
              className={`absolute inset-0 ${
                event.category === "class"
                  ? "bg-purple-500/30"
                  : "bg-blue-500/30"
              }`}
            ></div>
            <span className="text-white/10 text-4xl font-bold relative">
              {event.category === "class" ? "강습" : "행사"}
            </span>
          </div>
        )}

        <div
          className={`absolute top-0.5 right-0.5 px-1.5 py-0.5 text-white text-[10px] font-medium rounded-sm ${
            isPast
              ? "bg-gray-500/80"
              : event.category === "class"
                ? "bg-purple-600/80"
                : "bg-blue-600/80"
          }`}
        >
          {isPast ? "종료" : event.category === "class" ? "강습" : "행사"}
        </div>

        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t ${variant === "sliding" ? "from-black/90 via-black/60" : "from-black/80 via-black/40"} to-transparent p-2 ${variant === "sliding" ? "pt-10" : "pt-6"}`}>
          <h3
            className={`text-white font-bold leading-tight ${variant === "sliding" ? "line-clamp-4" : "line-clamp-2"}`}
            style={{ fontSize: "0.8rem" }}
          >
            {event.title}
          </h3>
        </div>
      </div>

      <div className="p-1 h-7 flex items-center justify-center">
        <p className="text-xs text-gray-300 text-center flex items-center justify-center gap-1">
          {isOnSelectedDate && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
          )}
          <span>{dateText}</span>
        </p>
      </div>
    </div>
  );
});

EventCard.displayName = "EventCard";
