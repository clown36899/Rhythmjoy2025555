import React, { memo, useMemo } from "react";
import { getEventThumbnail, getCardThumbnail } from "../../../utils/getEventThumbnail";
import { getLocalDateString, formatEventDate } from "../../../utils/dateUtils";
import { getGenreColorClass } from "../../../constants/genreColors";
import "../../../styles/components/EventCard.css";

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

  // 1. Try explicit thumbnail
  // 2. Use optimized card thumbnail helper
  const explicitThumbnail = event.image_thumbnail;
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
    if (isPast) return null; // 완전히 지난 이벤트는 D-day 표시 안 함

    // 1. 오늘이 행사 날짜 목록(개별 일정)에 포함되는지 확인 -> 'D-Day' 표시
    if (event.event_dates && event.event_dates.length > 0) {
      if (event.event_dates.includes(todayString)) {
        return 'D-Day';
      }
    } else {
      // event_dates가 없는 경우
      const startDateStr = event.start_date || event.date;
      const endDateStr = event.end_date || event.date;
      if (startDateStr === todayString || endDateStr === todayString) {
        return 'D-Day';
      }
    }

    // 2. 미래의 행사에 대한 D-Day 계산
    const today = new Date(todayString);
    let targetDate: Date | null = null;

    if (event.event_dates && event.event_dates.length > 0) {
      const futureDates = event.event_dates.filter(d => d >= todayString).sort();
      if (futureDates.length > 0) {
        targetDate = new Date(futureDates[0] + 'T00:00:00');
      } else if (event.event_dates.length > 0) {
        const sortedDates = [...event.event_dates].sort();
        targetDate = new Date(sortedDates[0] + 'T00:00:00');
      }
    } else {
      const startDate = event.start_date || event.date;
      if (startDate) {
        targetDate = new Date(startDate + 'T00:00:00');
      }
    }

    if (!targetDate) return null;

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;
    if (diffDays === 0) return 'D-Day';
    return `D-${diffDays}일`;
  }, [todayString, isPast, event.event_dates, event.start_date, event.date, event.end_date]);


  // Determine modifiers
  const catModifier = event.category === 'class' ? 'ECARD-cat-class' : 'ECARD-cat-event';
  const pastModifier = isPast ? 'is-past' : '';
  const highlightModifier = isHighlighted ? 'is-highlighted' : '';
  const favoriteVariantClass = variant === 'favorite' ? 'is-variant-favorite' : '';

  return (
    <div
      key={event.id}
      data-event-id={event.id}
      data-analytics-id={event.id}
      data-analytics-type={event.category === 'class' ? 'class' : 'event'}
      data-analytics-title={event.title}
      data-analytics-section={variant === 'favorite' ? 'favorites' : (variant === 'sliding' ? 'upcoming_events' : 'filtered_grid')}
      data-analytics-category={event.category}
      className={`ECARD-container ${catModifier} ${pastModifier} ${highlightModifier} ${favoriteVariantClass} ${className}`}
      onClick={onClick}
      onMouseEnter={() => onMouseEnter?.(event.id)}
      onMouseLeave={onMouseLeave}
      style={{
        ...(isHighlighted ? { '--highlight-color': highlightBorderColor } as React.CSSProperties : {}),
      }}
    >
      <div
        className={`ECARD-imageWrapper ${isHighlighted ? "is-active-qr" : ""}`}
        style={{
          "--highlight-color": isHighlighted ? highlightBorderColor : "transparent"
        } as React.CSSProperties}
      >
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={event.title}
              className="ECARD-image"
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
              <div className="ECARD-overlayCenter">
                <span className="ECARD-overlayText-semi manual-label-wrapper">
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
            className="ECARD-placeholderBg"
            style={{
              backgroundImage: "url(/grunge.png)",
            }}
          >
            <div
              className={`ECARD-absoluteInset0 ${event.category === "class"
                ? "ECARD-bgOverlay-purple"
                : "ECARD-bgOverlay-blue"
                }`}
            ></div>
            <span className="ECARD-overlayText-faint manual-label-wrapper">
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
          className={`ECARD-badge manual-label-wrapper ${isPast
            ? "is-past"
            : event.category === "class"
              ? "is-class"
              : "is-event"
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

        {onToggleFavorite && (
          <button
            className={`ECARD-favoriteBtn ${isFavorite ? 'is-active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <i className={`ECARD-favoriteIcon ${isFavorite ? "ri-star-fill" : "ri-star-line"}`}></i>
          </button>
        )}

      </div>

      {dDay && (
        <div className={`ECARD-ddayBadge ${dDay === 'D-Day' ? 'is-today' : ''}`}>
          {dDay}
        </div>
      )}

      <div className="ECARD-textContainer">
        {event.genre && !hideGenre && (
          <p className={`ECARD-genre ${getGenreColorClass(event.genre, 'ECARD-genre')}`}>
            {event.genre}
          </p>
        )}
        <h3 className="ECARD-title">{event.title}</h3>
        {!hideDate && (
          <div className="ECARD-dateContainer">
            {isOnSelectedDate && (
              <span className="ECARD-dateIndicator"></span>
            )}
            <span className="ECARD-date">{dateText}</span>
          </div>
        )}
      </div>
    </div>
  );
});

EventCard.displayName = "EventCard";
