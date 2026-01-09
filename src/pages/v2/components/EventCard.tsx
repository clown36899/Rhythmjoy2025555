import React, { memo, useMemo } from "react";
import { getEventThumbnail, getCardThumbnail } from "../../../utils/getEventThumbnail";
import { getLocalDateString, formatEventDate } from "../../../utils/dateUtils";
import { getGenreColorClass } from "../../../constants/genreColors";
import "../styles/EventCard.css";

import type { Event } from "../../../pages/v2/utils/eventListUtils";


interface EventCardProps {
  event: Event;
  onClick: () => void;
  onMouseEnter?: (eventId: number | string) => void;
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
  // 2. Use optimized card thumbnail helper
  const explicitThumbnail = event.image_thumbnail;

  // Use the new getCardThumbnail helper which handles resizing params
  const optimizedUrl = getCardThumbnail(event);

  const thumbnailUrl =
    explicitThumbnail ||
    optimizedUrl ||
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
    let formattedDate = '';

    if (event.event_dates && event.event_dates.length > 0) {
      if (variant === "sliding" && event.event_dates.length > 1) {
        formattedDate = `${formatEventDate(event.event_dates[0])}~`;
      } else {
        formattedDate = event.event_dates.map(formatEventDate).join(", ");
      }
    } else {
      const startDate = event.start_date || event.date;
      const endDate = event.end_date || event.date;

      if (!startDate) {
        return "날짜 미정";
      }

      if (startDate !== endDate) {
        formattedDate = `${formatEventDate(startDate)}~${formatEventDate(endDate || startDate)}`;
      } else {
        formattedDate = formatEventDate(startDate);
      }
    }

    // 강습/동호회 카테고리일 때 "시작" 추가
    return (event.category === 'class' || event.category === 'club') ? `${formattedDate} 시작` : formattedDate;
  }, [event.event_dates, event.start_date, event.end_date, event.date, event.category, variant]);

  const todayString = getLocalDateString();
  const isPast = event.end_date ? event.end_date < todayString : (event.date ? event.date < todayString : false);

  // D-day 계산 로직
  const dDay = useMemo(() => {
    if (isPast) return null; // 지난 이벤트는 D-day 표시 안 함

    const today = new Date(todayString);
    let targetDate: Date | null = null;

    // 이벤트 시작일 결정
    if (event.event_dates && event.event_dates.length > 0) {
      // 다중 날짜 중 가장 빠른 날짜
      const sortedDates = [...event.event_dates].sort();
      targetDate = new Date(sortedDates[0] + 'T00:00:00');
    } else {
      const startDate = event.start_date || event.date;
      if (startDate) {
        targetDate = new Date(startDate + 'T00:00:00');
      }
    }

    if (!targetDate) return null;

    // 날짜 차이 계산 (밀리초 -> 일)
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null; // 이미 시작한 이벤트
    if (diffDays === 0) return 'D-Day';
    return `D-${diffDays}일`;
  }, [todayString, isPast, event.event_dates, event.start_date, event.date]);

  // category 기반 클래스 추가
  const categoryClass = event.category === 'class' ? 'card-category-class' : 'card-category-event';



  return (
    <div
      key={event.id}
      data-event-id={event.id}
      data-analytics-id={event.id}
      data-analytics-type={event.category === 'class' ? 'class' : 'event'}
      data-analytics-title={event.title}
      data-analytics-section={variant === 'favorite' ? 'favorites' : (variant === 'sliding' ? 'upcoming_events' : 'filtered_grid')}
      data-analytics-category={event.category}
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
                <span className="card-overlay-text-semi manual-label-wrapper">
                  {event.category === "class" ? (
                    <>
                      <span className="translated-part">Class</span>
                      <span className="fixed-part ko" translate="no">강습</span>
                      <span className="fixed-part en" translate="no">Class</span>
                    </>
                  ) : "행사"}
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
            <span className="card-overlay-text-faint manual-label-wrapper">
              {event.category === "class" ? (
                <>
                  <span className="translated-part">Class</span>
                  <span className="fixed-part ko" translate="no">강습</span>
                  <span className="fixed-part en" translate="no">Class</span>
                </>
              ) : "행사"}
            </span>
          </div>
        )}

        <div
          className={`card-badge manual-label-wrapper ${isPast
            ? "card-badge-past"
            : event.category === "class"
              ? "card-badge-class"
              : "card-badge-event"
            }`}
        >
          {isPast ? "종료" : event.category === "class" ? (
            <>
              <span className="translated-part">Class</span>
              <span className="fixed-part ko" translate="no">강습</span>
              <span className="fixed-part en" translate="no">Class</span>
            </>
          ) : "행사"}
        </div>

        {dDay && (
          <div className={`card-dday-badge ${dDay === 'D-Day' ? 'card-dday-today' : ''}`}>
            {dDay}
          </div>
        )}

        {onToggleFavorite && (
          <button
            className={`card-favorite-btn ${isFavorite ? 'is-active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <i className={`card-favorite-icon ${isFavorite ? "ri-star-fill" : "ri-star-line"}`}></i>
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
