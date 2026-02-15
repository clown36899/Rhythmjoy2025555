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
                        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
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
                                        <div className="NEB-category">
                                            {event.category === 'class' ? '강습' : '행사'}
                                        </div>
                                        <img
                                            src={eventThumbnail}
                                            alt={event.title}
                                            className="NEB-image"
                                        />
                                        <div className="NEB-overlay"></div>
                                    </div>

                                    <div className="NEB-content">
                                        <div className="NEB-textContent">
                                            {event.genre && (
                                                <div className="NEB-genre">{event.genre}</div>
                                            )}
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
                                            <h4 className="NEB-eventTitle">{event.title}</h4>
                                        </div>

                                        {/* Full Image Preview Thumbnail (Moved inside content for split layout) */}
                                        <div className="NEB-mini-thumbnail">
                                            <img
                                                src={eventThumbnail}
                                                alt="Full Preview"
                                                className="NEB-mini-image"
                                            />
                                        </div>
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
            {
                showInfoModal && (
                    <div className="neb-modal-overlay" onClick={() => setShowInfoModal(false)}>
                        <div className="neb-modal" onClick={e => e.stopPropagation()}>
                            <h3 className="neb-modal-title">📢 신규 등록 노출 기준</h3>
                            <div className="neb-modal-content">
                                <p className="neb-highlight">등록 후 72시간 동안 이 섹션에 노출됩니다.</p>
                                <p className="neb-highlight" style={{ color: '#4ade80', marginTop: '4px' }}>※ 라이브밴드 파티는 기간 제한 없이 계속 노출됩니다.</p>
                                <ul className="neb-modal-list">
                                    <li>자동 슬라이드: 5초마다 전환</li>
                                    <li>마우스 호버 시 일시정지</li>
                                    <li>좌우 화살표로 수동 전환 가능</li>
                                </ul>
                            </div>
                            <button className="neb-modal-close" onClick={() => setShowInfoModal(false)}>확인</button>
                        </div>
                        <style>{`
                        .neb-modal-overlay {
                            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
                            z-index: 9999;
                            display: flex; align-items: center; justify-content: center;
                            padding: 20px;
                            animation: fadeIn 0.2s ease-out;
                        }
                        .neb-modal {
                            background: #1a1a1a;
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 16px;
                            padding: 24px;
                            width: 100%; max-width: 320px;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                            text-align: center;
                            transform: translateY(0);
                            animation: slideUp 0.2s ease-out;
                        }
                        .neb-modal-title {
                            font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 16px;
                        }
                        .neb-modal-content {
                            font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 24px; text-align: left;
                        }
                        .neb-highlight {
                            color: #fbbf24; font-weight: 600; margin-bottom: 12px; text-align: center;
                        }
                        .neb-modal-list {
                            list-style: none; padding: 0; margin: 0;
                            background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;
                        }
                        .neb-modal-list li {
                            margin-bottom: 4px; display: flex; align-items: center; gap: 6px;
                            font-size: 13px; color: #aaa;
                        }
                        .neb-modal-list li::before {
                            content: "•"; color: #666;
                        }
                        .neb-modal-list li:last-child { margin-bottom: 0; }
                        .neb-modal-close {
                            background: #3b82f6; color: #fff; border: none; padding: 10px 0; width: 100%;
                            border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 15px;
                            transition: background 0.2s;
                        }
                        .neb-modal-close:hover { background: #2563eb; }
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    `}</style>
                    </div>
                )
            }
        </>
    );
};
