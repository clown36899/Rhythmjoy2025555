import { useEffect, useMemo, useRef } from 'react';
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
  const firstCurrentRef = useRef<HTMLLIElement | null>(null);
  const didAutoScrollRef = useRef(false);

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

  const firstCurrentIndex = useMemo(() => {
    return benefitEvents.findIndex((event) => !isPastEvent(event, today));
  }, [benefitEvents, today]);

  useEffect(() => {
    if (didAutoScrollRef.current || isLoading || firstCurrentIndex < 0) return;
    didAutoScrollRef.current = true;
    window.requestAnimationFrame(() => {
      firstCurrentRef.current?.scrollIntoView({ block: 'start' });
    });
  }, [firstCurrentIndex, isLoading]);

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
            const isCurrentAnchor = index === firstCurrentIndex;

            return (
              <li
                key={event.id}
                ref={isCurrentAnchor ? firstCurrentRef : undefined}
                className={`benefit-event-item ${isPast ? 'is-past' : 'is-current-or-future'}`}
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
                    <a href={event.link1} target="_blank" rel="noreferrer">
                      상세 링크
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
    </main>
  );
}
