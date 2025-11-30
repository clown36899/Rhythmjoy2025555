import { memo } from "react";
import type { Event as BaseEvent } from "../../../lib/supabase";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";

interface Event extends BaseEvent {
  genre?: string | null;
}

const genreColorPalette = [
  'text-red-400',
  'text-orange-400',
  'text-amber-400',
  'text-yellow-400',
  'text-lime-400',
  'text-green-400',
  'text-emerald-400',
  'text-teal-400',
  'text-cyan-400',
  'text-sky-400',
  'text-blue-400',
  'text-indigo-400',
  'text-violet-400',
  'text-purple-400',
  'text-fuchsia-400',
  'text-pink-400',
  'text-rose-400',
];

function getGenreColor(genre: string): string {
  if (!genre) return 'text-gray-400';
  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    hash = genre.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % genreColorPalette.length);
  return genreColorPalette[index];
}

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
      onMouseEnter={() => onMouseEnter?.(event.id)}
      onMouseLeave={onMouseLeave}
      className={`group cursor-pointer transition-all duration-200 ${
        isPast ? "opacity-60" : ""
      }`}
    >
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-md bg-gray-800 transition-all duration-200 ${
          isHighlighted ? "ring-2 ring-offset-2 ring-offset-gray-900" : ""
        }`}
        style={{ borderColor: isHighlighted ? highlightBorderColor : "transparent" }}
      >
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={event.title}
              loading="lazy"  // 이미지가 뷰포트에 가까워질 때 로딩을 시작합니다.
              decoding="async" // 이미지 디코딩을 다른 작업과 병렬로 처리합니다.
              className="h-full w-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
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
            className="h-full w-full flex items-center justify-center bg-cover bg-center"
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
          className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-white text-[10px] font-medium rounded-sm ${
            isPast
              ? "bg-gray-500/80"
              : event.category === "class"
                ? "bg-purple-600/80"
                : "bg-blue-600/80"
          }`}
        >
          {isPast ? "종료" : event.category === "class" ? "강습" : "행사"}
        </div>

      </div>

      {/* Text content */}
      <div className="pt-2">
        {event.genre && (
          <p className={`truncate text-[1.1rem] font-semibold ${getGenreColor(event.genre)} mb-0.5`}>
            {event.genre}
          </p>
        )}
        <h3 className="truncate text-sm font-bold text-gray-100">{event.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
          {isOnSelectedDate && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
          )}
          <span>{dateText}</span>
        </div>
      </div>
    </div>
  );
});

EventCard.displayName = "EventCard";
