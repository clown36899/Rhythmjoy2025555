import React, { useState, useEffect, useCallback } from 'react';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { formatEventDate } from '../../../utils/dateUtils';
import { useModalContext } from '../../../contexts/ModalContext';
import type { Event } from '../utils/eventListUtils';
import './NewEventsBanner.css';

interface NewEventsBannerProps {
    events: Event[];
    onEventClick: (event: Event) => void;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
}

export const NewEventsBanner: React.FC<NewEventsBannerProps> = ({
    events,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
}) => {
    const { openModal } = useModalContext();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // 최소 스와이프 거리 (픽셀)
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            goToNext();
        } else if (isRightSwipe) {
            goToPrevious();
        }
    };

    // 자동 슬라이드 (5초마다)
    useEffect(() => {
        if (events.length <= 1 || isPaused) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % events.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [events.length, isPaused]);

    const goToSlide = useCallback((index: number) => {
        setCurrentIndex(index);
    }, []);

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + events.length) % events.length);
    }, [events.length]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % events.length);
    }, [events.length]);

    if (events.length === 0) return null;

    const currentEvent = events[currentIndex];

    // PWA 재개 시 refetch 중 currentEvent가 undefined일 수 있음
    if (!currentEvent) return null;

    // 날짜 포맷팅
    let dateText = '';
    if (currentEvent.event_dates && currentEvent.event_dates.length > 0) {
        dateText = currentEvent.event_dates.map(formatEventDate).join(', ');
    } else {
        const startDate = currentEvent.start_date || currentEvent.date;
        const endDate = currentEvent.end_date || currentEvent.date;
        if (startDate && endDate) {
            if (startDate !== endDate) {
                dateText = `${formatEventDate(startDate)}~${formatEventDate(endDate)}`;
            } else {
                dateText = formatEventDate(startDate);
            }
        }
    }

    return (
        <>
            <div
                className="NEB-container"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div className="NEB-header">
                    <div className="NEB-headerLeft">
                        {/* <i className="ri-sparkling-fill NEB-icon"></i> */}
                        <h3 className="NEB-title">신규 등록</h3>
                        <span className="NEB-badge">NEW</span>
                        <button
                            className="NEB-infoBtn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInfoModal(true);
                            }}
                            title="노출 기준 안내"
                        >
                            <i className="ri-information-line"></i>
                        </button>
                    </div>
                    <div className="NEB-headerRight">
                        <button
                            className="NEB-viewAllBtn"
                            onClick={(e) => {
                                e.stopPropagation();
                                openModal('newEventsList', {
                                    events,
                                    onEventClick
                                });
                            }}
                        >
                            모아보기 <i className="ri-arrow-right-s-line"></i>
                        </button>
                        {events.length > 1 && (
                            <div className="NEB-counter">
                                {currentIndex + 1} / {events.length}
                            </div>
                        )}
                    </div>
                </div>

                <div className="NEB-slider">
                    <div
                        className="NEB-track"
                        style={{ '--neb-offset': `-${currentIndex * 100}%` } as React.CSSProperties}
                    >
                        {events.map((event) => {
                            // 큰 배너이므로 고해상도 이미지 우선 사용
                            const eventThumbnail = event.image_full ||
                                event.image ||
                                event.image_medium ||
                                event.image_thumbnail ||
                                getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

                            return (
                                <div
                                    key={event.id}
                                    className="NEB-slide"
                                    onClick={() => onEventClick(event)}
                                >
                                    <div className="NEB-imageWrapper">
                                        <img
                                            src={eventThumbnail}
                                            alt={event.title}
                                            className="NEB-image"
                                        />
                                        <div className="NEB-overlay"></div>
                                        {/* Full Image Preview Thumbnail */}
                                        <div className="NEB-mini-thumbnail">
                                            <img
                                                src={eventThumbnail}
                                                alt="Full Preview"
                                                className="NEB-mini-image"
                                            />
                                        </div>
                                    </div>

                                    <div className="NEB-content">
                                        <div className="NEB-category">
                                            {event.category === 'class' ? '강습' : '행사'}
                                        </div>
                                        {event.genre && (
                                            <div className="NEB-genre">{event.genre}</div>
                                        )}
                                        <h4 className="NEB-eventTitle">{event.title}</h4>
                                        <div className="NEB-info">
                                            <i className="ri-calendar-line"></i>
                                            <span>{dateText}</span>
                                        </div>
                                        {event.location && (
                                            <div className="NEB-info">
                                                <i className="ri-map-pin-line"></i>
                                                <span>{event.location}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 네비게이션 버튼 */}
                    {events.length > 1 && (
                        <>
                            <button
                                className="NEB-navBtn NEB-navBtn-prev"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToPrevious();
                                }}
                            >
                                <i className="ri-arrow-left-s-line"></i>
                            </button>
                            <button
                                className="NEB-navBtn NEB-navBtn-next"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToNext();
                                }}
                            >
                                <i className="ri-arrow-right-s-line"></i>
                            </button>
                        </>
                    )}
                </div>

                {/* 인디케이터 */}
                {events.length > 1 && (
                    <div className="NEB-indicators">
                        {events.map((_, index) => (
                            <button
                                key={index}
                                className={`NEB-indicator ${index === currentIndex ? 'is-active' : ''}`}
                                onClick={() => goToSlide(index)}
                            />
                        ))}
                    </div>
                )}
            </div >

            {/* Info Modal */}
            {showInfoModal && (
                <div className="NEB-modal-overlay" onClick={() => setShowInfoModal(false)}>
                    <div className="NEB-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="NEB-modal-title">📢 신규 등록 노출 기준</h3>
                        <div className="NEB-modal-content">
                            <p className="NEB-highlight">등록 후 72시간 동안 이 섹션에 노출됩니다.</p>
                            <ul className="NEB-modal-list">
                                <li><i className="ri-timer-flash-line"></i> 자동 슬라이드: 5초마다 전환</li>
                                <li><i className="ri-pause-circle-line"></i> 마우스 호버 시 일시정지</li>
                                <li><i className="ri-arrow-left-right-line"></i> 스와이프 및 버튼 전환 가능</li>
                            </ul>
                        </div>
                        <button className="NEB-modal-close" onClick={() => setShowInfoModal(false)}>확인</button>
                    </div>
                </div>
            )}
        </>
    );
};
