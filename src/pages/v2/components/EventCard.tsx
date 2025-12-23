import React, { memo, useMemo } from "react";
import type { Event as BaseEvent } from "../../../lib/supabase";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";
import { getLocalDateString, formatEventDate } from "../../../utils/dateUtils";
import { getGenreColorClass } from "../../../constants/genreColors";
import "../styles/EventCard.css";

interface Event extends BaseEvent {
  genre?: string | null;
}


interface EventCardProps {
  event: Event;
  onClick: () => void;
  onMouseEnter?: (eventId: number) => void;
  onMouseLeave?: () => void;
  isHighlighted?: boolean;
  selectedDate?: Date | null;
  defaultThumbnailClass: string;
  defaultThumbnailEvent: string;
  variant?: "single" | "sliding" | "favorite";
  hideGenre?: boolean;
  hideDate?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  className?: string; // Add className prop
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
  isFavorite = false,
  onToggleFavorite,
  className = "", // Destructure className
}: EventCardProps) => {
  const highlightBorderColor =
    event.category === "class" ? "#9333ea" : "#2563eb";

  // 이벤트에 가장 적합한 썸네일 URL을 가져옵니다.
  // 신규 이미지는 WebP 형식으로 업로드되므로, 이 함수는 자동으로 최적화된 이미지 URL을 반환합니다.
  // 이벤트 List Card용 썸네일 (Prioritize Thumbnail/Medium for better resolution than Micro)
  // getEventThumbnail prioritizes Micro (100px) which is too small for cards.
  // 이벤트 List Card용 썸네일 (Prioritize Thumbnail/Medium for better resolution than Micro)
  // getEventThumbnail prioritizes Micro (100px) which is too small for cards.

  // 1. Try explicit thumbnail
  // 2. Try deriving thumbnail from standard path structure
  // 3. Fallbacks
  const explicitThumbnail = event.image_thumbnail;

  const derivedThumbnail = useMemo(() => {
    if (explicitThumbnail) return explicitThumbnail;

    const sourceImage = event.image_full || event.image || event.image_medium;
    if (sourceImage && typeof sourceImage === 'string') {
      // Standardize checks for our known paths
      if (sourceImage.includes('/event-posters/full/')) {
        return sourceImage.replace('/event-posters/full/', '/event-posters/thumbnail/');
      }
      if (sourceImage.includes('/event-posters/medium/')) {
        return sourceImage.replace('/event-posters/medium/', '/event-posters/thumbnail/');
      }
    }
    return null;
  }, [explicitThumbnail, event.image_full, event.image, event.image_medium]);

  const thumbnailUrl =
    derivedThumbnail ||
    event.image_medium ||
    event.image_full ||
    event.image ||
    getEventThumbnail(
      event,
      defaultThumbnailClass,
      defaultThumbnailEvent,
    );

  const isOnSelectedDate = useMemo(() => {
    if (!selectedDate) return false;

    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const selectedDateString = `${year}-${month}-${day}`;

    if (event.event_dates && event.event_dates.length > 0) {
      return event.event_dates.includes(selectedDateString);
    } else {
      const eventStartDate = event.start_date || event.date;
      const eventEndDate = event.end_date || event.date;
      return !!(
        eventStartDate &&
        eventEndDate &&
        selectedDateString >= eventStartDate &&
        selectedDateString <= eventEndDate
      );
    }
  }, [selectedDate, event.event_dates, event.start_date, event.end_date, event.date]);

  // useMemo로 날짜 포맷팅 캐싱 - 성능 최적화
  const dateText = useMemo(() => {
    if (event.event_dates && event.event_dates.length > 0) {
      if (variant === "sliding" && event.event_dates.length > 1) {
        return `${formatEventDate(event.event_dates[0])}~시작`;
      } else {
        return event.event_dates.map(formatEventDate).join(", ");
      }
    } else {
      const startDate = event.start_date || event.date;
      const endDate = event.end_date || event.date;

      if (!startDate) {
        return "날짜 미정";
      }

      if (startDate !== endDate) {
        return `${formatEventDate(startDate)}~${formatEventDate(endDate || startDate)}`;
      } else {
        return formatEventDate(startDate);
      }
    }
  }, [event.event_dates, event.start_date, event.end_date, event.date, variant]);

  const todayString = getLocalDateString();
  const isPast = event.end_date ? event.end_date < todayString : (event.date ? event.date < todayString : false);

  // category 기반 클래스 추가
  const categoryClass = event.category === 'class' ? 'card-category-class' : 'card-category-event';



  return (
    <div
      key={event.id}
      data-event-id={event.id}
      className={`card-container ${isPast ? 'card-container-past' : ''} ${variant === 'favorite' ? 'evt-card-favorite' : categoryClass} ${isHighlighted ? 'qr-highlighted' : ''} ${className}`}
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
              className="card-image"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = event.category === 'class'
                  ? defaultThumbnailClass
                  : defaultThumbnailEvent;
              }}
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

        {onToggleFavorite && (
          <button
            className={`card-favorite-btn ${isFavorite ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(e);
            }}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <i className={`card-favorite-icon ${isFavorite ? "ri-heart-fill" : "ri-heart-line"}`}></i>
          </button>
        )}

      </div>

      <div className={`card-text-container ${event.category === 'class' ? 'card-text-container-class' : 'card-text-container-event'
        }`}>
        {event.genre && !hideGenre && (
          <p className={`card-genre-text ${event.category === 'class' ? 'card-genre-text-class' : 'card-genre-text-event'
            } ${getGenreColorClass(event.genre, 'card-genre')}`}>
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
