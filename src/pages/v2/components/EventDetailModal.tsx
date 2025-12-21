import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Event as BaseEvent } from '../../../lib/supabase';
import { useDefaultThumbnail } from '../../../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { parseMultipleContacts, copyToClipboard } from '../../../utils/contactLink';
import { useModalHistory } from '../../../hooks/useModalHistory';
import { logEvent, logPageView } from '../../../lib/analytics';
import "../../../styles/components/EventDetailModal.css";

interface Event extends BaseEvent {
  storage_path?: string | null;
  genre?: string | null;
}

const genreColorPalette = [
  'genre-color-red',
  'genre-color-orange',
  'genre-color-amber',
  'genre-color-yellow',
  'genre-color-lime',
  'genre-color-green',
  'genre-color-emerald',
  'genre-color-teal',
  'genre-color-cyan',
  'genre-color-sky',
  'genre-color-blue',
  'genre-color-indigo',
  'genre-color-violet',
  'genre-color-purple',
  'genre-color-fuchsia',
  'genre-color-pink',
  'genre-color-rose',
];

function getGenreColor(genre: string): string {
  if (!genre) return 'genre-color-gray';
  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    hash = genre.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % genreColorPalette.length);
  return genreColorPalette[index];
}

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (event: Event, e?: React.MouseEvent) => void;
  onDelete: (event: Event, e?: React.MouseEvent) => void;
  isAdminMode?: boolean;
  currentUserId?: string; // Add currentUserId prop
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  onOpenVenueDetail?: (venueId: string) => void;
}

export default function EventDetailModal({
  event,
  isOpen,
  onClose,
  onEdit,
  onDelete: _onDelete,
  isAdminMode = false,
  currentUserId,
  isFavorite = false,
  onToggleFavorite,
  onOpenVenueDetail,
}: EventDetailModalProps) {
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);

  const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

  // Smooth Transition State
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);

  // Derive sources (Handle potential null event since this runs before the early return)
  const thumbnailSrc = event ? (event.image_thumbnail ||
    getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent)) : null;

  const highResSrc = event ? (event.image_medium ||
    event.image_full ||
    event.image) : null;

  // Effect to preload high-res image
  useEffect(() => {
    setIsHighResLoaded(false);

    if (highResSrc && highResSrc !== thumbnailSrc) {
      const img = new Image();
      img.src = highResSrc;
      img.onload = () => {
        setIsHighResLoaded(true);
      };
    } else if (!highResSrc && thumbnailSrc) {
      // 고화질 없고 썸네일만 있는 경우 로딩 완료 처리 (사실상 변화 없음)
      setIsHighResLoaded(true);
    }
  }, [highResSrc, thumbnailSrc]);

  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  // Analytics: Log virtual page view for better reporting (Pages and Screens)
  useEffect(() => {
    if (isOpen && event) {
      // 1. 이벤트성 로그 (기존)
      logEvent('Event', 'View Detail', `${event.title} (ID: ${event.id})`);

      // 2. 가상 페이지뷰 로그 (신규 - 페이지 보고서 용)
      // 실제 URL은 변하지 않지만, GA4에는 페이지가 바뀐 것처럼 전송
      logPageView(`/event/${event.id}`, event.title);
    }
  }, [isOpen, event]);

  if (!isOpen || !event) {
    return null;
  }

  const selectedEvent = event;

  return (
    <>
      {createPortal(
        (
          <div
            className="event-detail-modal-overlay"
            onClick={handleOverlayClick}
            onTouchStartCapture={(e) => {
              e.stopPropagation();
            }}
            onTouchEndCapture={(e) => {
              e.stopPropagation();
            }}
          >
            <div
              className="event-detail-modal-container"
              style={{ borderColor: "rgb(89, 89, 89)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 스크롤 가능한 전체 영역 */}
              <div
                className="modal-scroll-container"
                style={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {/* 이미지 영역 (스크롤과 함께 사라짐) */}
                {/* 이미지 영역 (스크롤과 함께 사라짐) */}
                {(() => {
                  // Progressive Loading: thumbnail priority logic removed here as it is handled by state above
                  // We will render up to two images: Thumbnail (Base) and HighRes (Overlay)

                  const hasImage = !!(thumbnailSrc || highResSrc);
                  const isDefaultThumbnail = !selectedEvent.image_thumbnail && !highResSrc && !!thumbnailSrc;

                  // Transform style (shared)
                  const imageStyle = {
                    transform: `translate3d(${(selectedEvent as any).image_position_x || 0}%, ${(selectedEvent as any).image_position_y || 0}%, 0)`
                  };

                  return (
                    <div
                      className={`image-area ${hasImage ? "bg-black" : "bg-pattern"}`}
                      style={{
                        ...(!hasImage
                          ? { backgroundImage: "url(/grunge.png)" }
                          : {}),
                        // Ensure relative positioning for absolute children
                        position: 'relative',
                        justifyContent: 'center',
                        alignItems: 'center',
                        display: 'flex'
                      }}
                    >
                      {hasImage ? (
                        <>
                          {/* 1. Base Layer: Thumbnail */}
                          {thumbnailSrc && (
                            <img
                              src={thumbnailSrc}
                              alt={selectedEvent.title}
                              className="detail-image"
                              loading="eager"
                              style={{
                                ...imageStyle,
                                opacity: 1, // Always visible underneath
                                position: 'relative', // Dictates the container size
                                zIndex: 1
                              }}
                            />
                          )}

                          {/* 2. Overlay Layer: HighRes (Cross-fade) */}
                          {highResSrc && highResSrc !== thumbnailSrc && (
                            <img
                              src={highResSrc}
                              alt={selectedEvent.title}
                              className="detail-image"
                              loading="eager"
                              decoding="async"
                              style={{
                                ...imageStyle,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                opacity: isHighResLoaded ? 1 : 0,
                                transition: 'opacity 0.4s ease-in-out',
                                zIndex: 2
                              }}
                            />
                          )}

                          {/* Fallback if only HighRes exists and no thumbnail (Rare) */}
                          {!thumbnailSrc && highResSrc && (
                            <img
                              src={highResSrc}
                              alt={selectedEvent.title}
                              className="detail-image"
                              loading="eager"
                              style={{ ...imageStyle, zIndex: 1 }}
                            />
                          )}

                          {/* Gradient Overlay */}
                          <div className="image-gradient-overlay" style={{ zIndex: 10 }} />

                          {isDefaultThumbnail && (
                            <div className="default-thumbnail-overlay">
                              <span className="default-thumbnail-text">
                                {selectedEvent.category === "class"
                                  ? "강습"
                                  : "행사"}
                              </span>
                            </div>
                          )}
                          {/* 크게보기 버튼 */}
                          <button
                            onClick={() => setShowFullscreenImage(true)}
                            className="fullscreen-button"
                          >
                            크게 보기
                          </button>

                          {/* 즐겨찾기 버튼 (이미지 좌측 하단) */}
                          {onToggleFavorite && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(e);
                              }}
                              className={`card-favorite-btn ${isFavorite ? 'is-active' : ''}`}
                              title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                              style={{
                                top: 'auto',
                                bottom: '20px',
                                left: '20px',
                                right: 'auto',
                                width: '72px',
                                height: '72px'
                              }}
                            >
                              <i className={`card-favorite-icon ${isFavorite ? "ri-heart-fill" : "ri-heart-line"}`} style={{ fontSize: '40px' }}></i>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div
                            className={`category-bg-overlay ${selectedEvent.category === "class" ? "class" : "event"}`}
                          ></div>
                          <span className="category-bg-text">
                            {selectedEvent.category === "class" ? "강습" : "행사"}
                          </span>
                        </>
                      )}

                      {/* 카테고리 배지 - 좌측 하단 */}
                      <div
                        className={`category-badge ${selectedEvent.category === "class" ? "class" : "event"}`}
                      >
                        {selectedEvent.category === "class" ? "강습" : "행사"}
                      </div>
                    </div>
                  );
                })()}

                {/* 제목 - Sticky Header */}
                <div
                  className="sticky-header"

                >
                  {/* 장르 표시 */}
                  <h2 className="modal-title">
                    {selectedEvent.title}
                  </h2>
                  {selectedEvent.genre && (
                    <p className={`genre-text ${getGenreColor(selectedEvent.genre)}`}>
                      {selectedEvent.genre}
                    </p>
                  )}

                </div>

                {/* 세부 정보 */}
                <div className="info-section">
                  <div className="info-item">
                    <i className="ri-calendar-line info-icon"></i>
                    <span>
                      {(() => {
                        // 특정 날짜 모드: event_dates 배열이 있으면 개별 날짜 표시
                        if (
                          selectedEvent.event_dates &&
                          selectedEvent.event_dates.length > 0
                        ) {
                          const dates = selectedEvent.event_dates.map(
                            (dateStr) => new Date(dateStr),
                          );
                          const firstDate = dates[0];
                          const year = firstDate.getFullYear();
                          const month = firstDate.toLocaleDateString("ko-KR", {
                            month: "long",
                          });

                          // 같은 년월인지 확인
                          const sameYearMonth = dates.every(
                            (d) =>
                              d.getFullYear() === year &&
                              d.toLocaleDateString("ko-KR", { month: "long" }) ===
                              month,
                          );

                          if (sameYearMonth) {
                            // 같은 년월: "2025년 10월 11일, 25일, 31일"
                            const days = dates
                              .map((d) => d.getDate())
                              .join("일, ");
                            return `${year}년 ${month} ${days}일`;
                          } else {
                            // 다른 년월: "10/11, 11/25, 12/31"
                            return dates
                              .map((d) => `${d.getMonth() + 1}/${d.getDate()}`)
                              .join(", ");
                          }
                        }

                        // 연속 기간 모드
                        const startDate =
                          selectedEvent.start_date || selectedEvent.date;
                        const endDate = selectedEvent.end_date;

                        if (!startDate) return "날짜 미정";

                        const start = new Date(startDate);
                        const startYear = start.getFullYear();
                        const startMonth = start.toLocaleDateString("ko-KR", {
                          month: "long",
                        });
                        const startDay = start.getDate();

                        if (endDate && endDate !== startDate) {
                          const end = new Date(endDate);
                          const endYear = end.getFullYear();
                          const endMonth = end.toLocaleDateString("ko-KR", {
                            month: "long",
                          });
                          const endDay = end.getDate();

                          if (startYear === endYear && startMonth === endMonth) {
                            return `${startYear}년 ${startMonth} ${startDay}~${endDay}일`;
                          } else if (startYear === endYear) {
                            return `${startYear}년 ${startMonth} ${startDay}일~${endMonth} ${endDay}일`;
                          } else {
                            return `${startYear}년 ${startMonth} ${startDay}일~${endYear}년 ${endMonth} ${endDay}일`;
                          }
                        }

                        return `${startYear}년 ${startMonth} ${startDay}일`;
                      })()}
                    </span>
                  </div>

                  {/* {selectedEvent.organizer && (
                    <div className="info-item">
                      <i className="ri-user-line info-icon"></i>
                      <span>{selectedEvent.organizer}</span>
                    </div>
                  )} */}

                  {selectedEvent.location && (
                    <div className="info-item">
                      <i className="ri-map-pin-line info-icon"></i>
                      <div className="info-flex-gap-1">
                        {(selectedEvent as any).venue_id ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const venueId = (selectedEvent as any).venue_id;
                              onOpenVenueDetail?.(venueId);
                            }}
                            className="venue-link-button"
                          >
                            <span>{selectedEvent.location}</span>
                            <i className="ri-arrow-right-s-line" style={{ fontSize: '1.1em' }}></i>
                          </button>
                        ) : (
                          <span>{selectedEvent.location}</span>
                        )}
                        {!(selectedEvent as any).venue_id && (selectedEvent.location_link || (selectedEvent as any).venue_custom_link) && (
                          <a
                            href={(selectedEvent as any).venue_custom_link || selectedEvent.location_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="location-link"
                            title="지도 보기"
                          >
                            <i className="ri-external-link-line location-link-icon"></i>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="info-divider">
                      <div className="info-item">
                        <i className="ri-file-text-line info-icon"></i>
                        <div className="info-item-content">
                          <p>
                            {selectedEvent.description
                              .split(/(\bhttps?:\/\/[^\s]+)/g)
                              .map((part, idx) => {
                                if (part.match(/^https?:\/\//)) {
                                  return (
                                    <a
                                      key={idx}
                                      href={part}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="info-link"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {part}
                                    </a>
                                  );
                                }
                                return <span key={idx}>{part}</span>;
                              })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEvent.contact &&
                    (() => {
                      const contactInfos = parseMultipleContacts(
                        selectedEvent.contact,
                      );

                      return (
                        <div className="edm-space-y-2">
                          <span className="contact-label">
                            문의
                          </span>
                          <div className="contact-buttons-container">
                            {contactInfos.map((contactInfo, index) => {
                              const handleContactClick = async () => {
                                if (contactInfo.link) {
                                  window.open(contactInfo.link, "_blank");
                                } else {
                                  try {
                                    await copyToClipboard(contactInfo.value);
                                    alert(`복사되었습니다: ${contactInfo.value}`);
                                  } catch (err) {
                                    console.error("복사 실패:", err);
                                    alert("복사에 실패했습니다.");
                                  }
                                }
                              };

                              return (
                                <button
                                  key={index}
                                  onClick={handleContactClick}
                                  className="contact-button"
                                >
                                  <i
                                    className={`${contactInfo.icon} contact-icon`}
                                  ></i>
                                  <div className="edm-text-left">
                                    <div className="contact-text">
                                      {contactInfo.displayText}
                                    </div>
                                    <div className="contact-subtext">
                                      {contactInfo.link
                                        ? "탭하여 열기"
                                        : "탭하여 복사"}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {isAdminMode &&
                    (selectedEvent.organizer_name ||
                      selectedEvent.organizer_phone) && (
                      <div className="admin-info-section">
                        <div className="admin-info-header">
                          <i className="ri-admin-line"></i>
                          <span>등록자 정보 (관리자 전용)</span>
                        </div>
                        {selectedEvent.organizer_name && (
                          <div className="admin-info-item">
                            <i className="ri-user-star-line"></i>
                            <span>{selectedEvent.organizer_name}</span>
                          </div>
                        )}
                        {selectedEvent.organizer_phone && (
                          <div className="admin-info-item">
                            <i className="ri-phone-line"></i>
                            <span>{selectedEvent.organizer_phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                  {/* This section was commented out in the original file, but I've added classes just in case */}
                  {/* {selectedEvent.link1 && (
                  <div className="info-divider">
                    <div className="link-container">
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="main-link-button"
                      >
                        <i className="ri-external-link-line edm-text-lg"></i>
                        <span className="edm-font-medium">
                          {selectedEvent.link_name1 || "바로가기"}
                        </span>
                      </a>
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="qr-link-button"
                        title="QR 코드로 바로가기"
                      >
                        <QRCodeSVG
                          value={selectedEvent.link1}
                          size={64}
                          level="M"
                          includeMargin={false}
                        />
                      </a>
                    </div>
                  </div>
                )} */}

                  {isAdminMode && selectedEvent.created_at && (
                    <div className="created-at-text">
                      <span>
                        등록:{" "}
                        {new Date(selectedEvent.created_at).toLocaleDateString(
                          "ko-KR",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <div className="footer-links-container">
                  {selectedEvent.link1 && (
                    <a
                      href={selectedEvent.link1}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer-link"
                      title={selectedEvent.link_name1 || "바로가기 1"}
                    >
                      <i className="ri-external-link-line footer-link-icon"></i>
                      <span className="footer-link-text">
                        {selectedEvent.link_name1 || "링크1"}
                      </span>
                    </a>
                  )}
                  {selectedEvent.link2 && (
                    <a
                      href={selectedEvent.link2}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer-link"
                      title={selectedEvent.link_name2 || "바로가기 2"}
                    >
                      <i className="ri-external-link-line footer-link-icon"></i>
                      <span className="footer-link-text">
                        {selectedEvent.link_name2 || "링크2"}
                      </span>
                    </a>
                  )}
                  {selectedEvent.link3 && (
                    <a
                      href={selectedEvent.link3}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer-link"
                      title={selectedEvent.link_name3 || "바로가기 3"}
                    >
                      <i className="ri-external-link-line footer-link-icon"></i>
                      <span className="footer-link-text">
                        {selectedEvent.link_name3 || "링크3"}
                      </span>
                    </a>
                  )}
                </div>

                <div className="footer-actions-container">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url = new URL(window.location.href);
                      url.searchParams.set('event', selectedEvent.id.toString());
                      const shareUrl = url.toString();

                      const shareTitle = selectedEvent.title;
                      const shareText = `${selectedEvent.title}\n📍 ${selectedEvent.location}\n📅 ${selectedEvent.date || selectedEvent.start_date}`;

                      try {
                        if (navigator.share) {
                          await navigator.share({
                            title: shareTitle,
                            text: shareText,
                            url: shareUrl,
                          });
                        } else {
                          await navigator.clipboard.writeText(shareUrl);
                          const button = e.currentTarget;
                          button.classList.remove('share');
                          button.classList.add('share', 'copied');
                          const icon = button.querySelector('i');
                          if (icon) {
                            icon.classList.remove('ri-share-line');
                            icon.classList.add('ri-check-line');
                          }
                          setTimeout(() => {
                            button.classList.remove('copied');
                            if (icon) {
                              icon.classList.remove('ri-check-line');
                              icon.classList.add('ri-share-line');
                            }
                          }, 2000);
                        }
                      } catch (err) {
                        if ((err as Error).name !== 'AbortError') {
                          console.error("공유 실패:", err);
                          alert("카카오톡에서는 공유 기능이 제한됩니다.\n\n우측 상단 메뉴(⋮)에서\n'다른 브라우저로 열기'를 선택한 후\n공유해주세요.");
                        }
                      }
                    }}
                    className="action-button share"
                    title="공유하기"
                  >
                    <i className="ri-share-line action-icon"></i>
                  </button>

                  {/* Only show edit button if admin or owner */}
                  {(isAdminMode || (currentUserId && currentUserId === selectedEvent.user_id)) && (
                    <button
                      onClick={(e) => onEdit(selectedEvent, e)}
                      className="action-button edit"
                      title="이벤트 수정"
                    >
                      <i className="ri-edit-line action-icon"></i>
                    </button>
                  )}



                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose();
                    }}
                    className="close-button"
                    title="닫기"
                  >
                    <i className="ri-close-line action-icon"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ), document.body
      )}

      {showFullscreenImage &&
        (selectedEvent.image_full ||
          selectedEvent.image ||
          getEventThumbnail(
            selectedEvent,
            defaultThumbnailClass,
            defaultThumbnailEvent,
          )) && (
          createPortal(
            <div
              className="fullscreen-overlay"
              onClick={() => setShowFullscreenImage(false)}
              onTouchStartCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => {
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onTouchEndCapture={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowFullscreenImage(false)}
                className="fullscreen-close-button"
              >
                <i className="ri-close-line action-icon"></i>
              </button>
              <img
                src={
                  selectedEvent.image_full ||
                  selectedEvent.image ||
                  getEventThumbnail(
                    selectedEvent,
                    defaultThumbnailClass,
                    defaultThumbnailEvent,
                  )
                }
                alt={selectedEvent.title}
                loading="lazy"
                className="fullscreen-image"
                onClick={(e) => e.stopPropagation()}
              />
            </div>, document.body
          )
        )}

      {/* Venue Detail Modal - Removed (Hoisted to Page) */}
    </>
  );
}