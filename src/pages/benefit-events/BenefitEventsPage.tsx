import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Event as AppEvent } from '../../lib/cafe24Client';
import { fetchCafe24Events } from '../../lib/cafe24EventsApi';
import { getEventThumbnail } from '../../utils/getEventThumbnail';
import { getLocalDateString } from '../v2/utils/eventListUtils';
import './BenefitEventsPage.css';

const BENEFIT_EVENT_QUERY_VERSION = 'benefit-events-v1';

function normalizeDate(value: unknown) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function getEventDateCandidates(event: AppEvent) {
  return [
    ...(Array.isArray(event.event_dates) ? event.event_dates : []),
    event.start_date,
    event.date,
    event.end_date,
  ]
    .map(normalizeDate)
    .filter(Boolean)
    .sort();
}

function getDisplayDate(event: AppEvent, today = getLocalDateString()) {
  const dates = getEventDateCandidates(event);
  return dates.find((date) => date >= today) || dates[0] || '';
}

function isPastEvent(event: AppEvent, today = getLocalDateString()) {
  const dates = getEventDateCandidates(event);
  const endDate = normalizeDate(event.end_date);
  const lastDate = [endDate, ...dates].filter(Boolean).sort().at(-1) || '';
  return Boolean(lastDate && lastDate < today);
}

function getEventText(event: AppEvent) {
  return [
    event.title,
    event.description,
    event.genre,
    event.category,
    event.activity_type,
    event.location,
    event.venue_name,
    event.link_name1,
    ...(Array.isArray(event.dance_tags) ? event.dance_tags : []),
  ].filter(Boolean).join(' ');
}

function isBenefitEvent(event: AppEvent) {
  return (event as AppEvent & { benefit_eligible?: boolean }).benefit_eligible === true;
}

function getKindLabel(event: AppEvent) {
  const activityType = String(event.activity_type || '').toLowerCase();
  const tags = Array.isArray(event.dance_tags) ? event.dance_tags.map(String) : [];
  const text = getEventText(event);

  if (tags.includes('season_pass') || /정기권|시즌권|월정액|멤버십|membership|\bpass\b/i.test(text)) return '정기권';
  if (tags.includes('free_event') || /무료|free/i.test(text)) return '무료';
  if (tags.includes('discount_event') || /할인|특가|얼리\s*버드|쿠폰|프로모션|discount|promotion/i.test(text)) return '할인';
  if (activityType === 'sale' || tags.includes('sale_event') || /판매\s*이벤트|이벤트\s*판매|\bsale\b/i.test(text)) return '판매이벤트';
  return '혜택';
}

function getPlaceLabel(event: AppEvent) {
  return event.venue_name || event.location || event.address || '장소 미정';
}

function formatDateLabel(date: string) {
  if (!date) return '날짜 미정';
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed);
}

export default function BenefitEventsPage() {
  const today = getLocalDateString();
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ['benefit-events', BENEFIT_EVENT_QUERY_VERSION],
    queryFn: () => fetchCafe24Events({ limit: 3000 }),
    staleTime: 5 * 60 * 1000,
  });

  const benefitEvents = useMemo(() => {
    return events
      .filter(isBenefitEvent)
      .sort((a, b) => {
        const left = getDisplayDate(a, today);
        const right = getDisplayDate(b, today);
        return left.localeCompare(right) || String(a.title || '').localeCompare(String(b.title || ''), 'ko');
      });
  }, [events, today]);

  return (
    <main className="benefit-events-page">
      <header className="benefit-events-header">
        <a className="benefit-events-back" href="/" aria-label="메인으로 이동">
          <i className="ri-arrow-left-line" aria-hidden="true" />
        </a>
        <div>
          <h1>무료, 할인 이벤트</h1>
          <p>무료·할인 혜택과 정기권·시즌권·멤버십 판매</p>
        </div>
      </header>

      <section className="benefit-events-summary" aria-label="목록 요약">
        <strong>{benefitEvents.filter((event) => !isPastEvent(event, today)).length}</strong>
        <span>오늘 이후</span>
        <em>{benefitEvents.length}개 수집</em>
      </section>

      {isLoading && <div className="benefit-events-status">불러오는 중...</div>}
      {error && <div className="benefit-events-status is-error">목록을 불러오지 못했습니다.</div>}

      {!isLoading && !error && (
        <ol className="benefit-events-list">
          {benefitEvents.map((event, index) => {
            const displayDate = getDisplayDate(event, today);
            const isPast = isPastEvent(event, today);
            const thumbnail = getEventThumbnail(event) || '';

            return (
              <li
                key={event.id}
                className={`benefit-event-item ${isPast ? 'is-past' : 'is-current-or-future'}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedEvent(event)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    keyboardEvent.preventDefault();
                    setSelectedEvent(event);
                  }
                }}
              >
                <div className="benefit-event-date">
                  <time dateTime={displayDate || undefined}>{formatDateLabel(displayDate)}</time>
                  <span>{isPast ? '지난 이벤트' : '진행 예정'}</span>
                </div>
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    loading={index < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                  />
                ) : (
                  <div className="benefit-event-empty-image" aria-hidden="true">
                    <i className="ri-coupon-3-line" />
                  </div>
                )}
                <div className="benefit-event-content">
                  <div className="benefit-event-kicker">
                    <span>{getKindLabel(event)}</span>
                    {event.time && <em>{event.time}</em>}
                  </div>
                  <h2>{event.title}</h2>
                  <p>
                    <i className="ri-map-pin-line" aria-hidden="true" />
                    {getPlaceLabel(event)}
                  </p>
                  {event.description && <small>{event.description}</small>}
                  {event.link1 && (
                    <a
                      href={event.link1}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(mouseEvent) => mouseEvent.stopPropagation()}
                    >
                      원본 링크
                      <i className="ri-external-link-line" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
          {benefitEvents.length === 0 && (
            <li className="benefit-events-empty">표시할 혜택 이벤트가 없습니다.</li>
          )}
        </ol>
      )}

      {selectedEvent && (
        <div
          className="benefit-event-modal-backdrop"
          role="presentation"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="benefit-event-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="benefit-event-modal-title"
          >
            <button
              type="button"
              className="benefit-event-modal-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="상세창 닫기"
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
            <div className="benefit-event-kicker">
              <span>{getKindLabel(selectedEvent)}</span>
              {selectedEvent.time && <em>{selectedEvent.time}</em>}
            </div>
            <h2 id="benefit-event-modal-title">{selectedEvent.title}</h2>
            {getEventThumbnail(selectedEvent) && (
              <a
                className="benefit-event-modal-poster"
                href={getEventThumbnail(selectedEvent)}
                target="_blank"
                rel="noreferrer"
                aria-label="포스터 원본 이미지 확대"
              >
                <img
                  src={getEventThumbnail(selectedEvent)}
                  alt={`${selectedEvent.title} 포스터`}
                  draggable={false}
                />
                <span>
                  <i className="ri-zoom-in-line" aria-hidden="true" />
                  눌러서 원본 확대
                </span>
              </a>
            )}
            <dl>
              <div>
                <dt>일정</dt>
                <dd>{formatDateLabel(getDisplayDate(selectedEvent, today))}</dd>
              </div>
              <div>
                <dt>장소</dt>
                <dd>{getPlaceLabel(selectedEvent)}</dd>
              </div>
            </dl>
            <p>{selectedEvent.description || '등록된 상세 설명이 없습니다.'}</p>
            {selectedEvent.link1 && (
              <a href={selectedEvent.link1} target="_blank" rel="noreferrer">
                원본 링크
                <i className="ri-external-link-line" aria-hidden="true" />
              </a>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
