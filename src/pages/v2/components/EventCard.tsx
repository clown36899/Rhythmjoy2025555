import { memo } from "react";
import type { Event as BaseEvent } from "../../../lib/supabase";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";
import "../styles/EventCard.css";

interface Event extends BaseEvent {
  genre?: string | null;
}

const genreColorPalette = [
  'card-genre-red',
  'card-genre-orange',
  'card-genre-amber',
  'card-genre-yellow',
  'card-genre-lime',
  'card-genre-green',
  'card-genre-emerald',
  'card-genre-teal',
  'card-genre-cyan',
  'card-genre-sky',
  'card-genre-blue',
  'card-genre-indigo',
  'card-genre-violet',
  'card-genre-purple',
  'card-genre-fuchsia',
  'card-genre-pink',
  'card-genre-rose',
];

function getGenreColor(genre: string): string {
  if (!genre) return 'card-genre-gray';
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
  hideGenre?: boolean;
  hideDate?: boolean;
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
  hideGenre = false,
  hideDate = false,
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
      const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
      return `${date.getMonth() + 1}/${date.getDate()}(${weekDay})`;
    };
    if (variant === "sliding" && event.event_dates.length > 1) {
      dateText = `${formatDate(event.event_dates[0])}~시작`;
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
        const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        return `${date.getMonth() + 1}/${date.getDate()}(${weekDay})`;
      };

      if (startDate !== endDate) {
        dateText = `${formatDate(startDate)}~${formatDate(endDate || startDate)}`;
      } else {
        dateText = formatDate(startDate);
      }
    }
  }

  const todayString = getLocalDateString();
  const isPast = event.end_date ? event.end_date < todayString : (event.date ? event.date < todayString : false);

  // category 기반 클래스 추가
  const categoryClass = event.category === 'class' ? 'card-category-class' : 'card-category-event';

  return (
    <div
      key={event.id}
      data-event-id={event.id}
      className={`card-container ${isPast ? 'card-container-past' : ''} ${categoryClass} ${isHighlighted ? 'qr-highlighted' : ''}`}
      onClick={onClick}
      onMouseEnter={() => onMouseEnter?.(event.id)}
      onMouseLeave={onMouseLeave}
      style={{
        ...(isHighlighted ? { '--highlight-color': highlightBorderColor } as React.CSSProperties : {}),
      }}
    >  <div
      className={`card-image-wrapper ${event.category === 'class' ? 'card-image-wrapper-class' : 'card-image-wrapper-event'
        } ${isHighlighted ? "card-image-wrapper-highlighted" : ""}`}
      style={{
        "--highlight-color": isHighlighted ? highlightBorderColor : "transparent"
      } as React.CSSProperties}
    >
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={event.title}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="card-image"
            />
            {variant === "sliding" && !event?.image && !event?.image_thumbnail && (
              <div className="card-overlay-center">
                <span className="card-overlay-text-semi">
                  {event.category === "class" ? "강습" : "행사"}
                </span>
              </div>
            )}
          </>
        ) : (
          <div
            className="card-placeholder-bg"
            style={{
              backgroundImage: "url(/grunge.png)",
            }}
          >
            <div
              className={`card-absolute-inset-0 ${event.category === "class"
                ? "card-bg-overlay-purple"
                : "card-bg-overlay-blue"
                }`}
            ></div>
            <span className="card-overlay-text-faint">
              {event.category === "class" ? "강습" : "행사"}
            </span>
          </div>
        )}

        <div
          className={`card-badge ${isPast
            ? "card-badge-past"
            : event.category === "class"
              ? "card-badge-class"
              : "card-badge-event"
            }`}
        >
          {isPast ? "종료" : event.category === "class" ? "강습" : "행사"}
        </div>

      </div>

      <div className={`card-text-container ${event.category === 'class' ? 'card-text-container-class' : 'card-text-container-event'
        }`}>
        {event.genre && !hideGenre && (
          <p className={`card-genre-text ${event.category === 'class' ? 'card-genre-text-class' : 'card-genre-text-event'
            } ${getGenreColor(event.genre)}`}>
            {event.genre}
          </p>
        )}
        <h3 className={`card-title-text ${event.category === 'class' ? 'card-title-text-class' : 'card-title-text-event'
          }`}>{event.title}</h3>
        {!hideDate && (
          <div className="card-date-container">
            {isOnSelectedDate && (
              <span className="card-date-indicator"></span>
            )}
            <span className={`card-date-text ${event.category === 'class' ? 'card-date-text-class' : 'card-date-text-event'
              }`}>{dateText}</span>
          </div>
        )}
      </div>
    </div>
  );
});

EventCard.displayName = "EventCard";
