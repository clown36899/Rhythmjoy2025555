import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Event as BaseEvent } from '../../../lib/supabase';
import { useDefaultThumbnail } from '../../../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { parseMultipleContacts, copyToClipboard } from '../../../utils/contactLink';
import { QRCodeSVG } from 'qrcode.react';

interface Event extends BaseEvent {
  storage_path?: string | null;
}

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (event: Event, e?: React.MouseEvent) => void;
  onDelete: (event: Event, e?: React.MouseEvent) => void;
  isAdminMode: boolean;
}

export default function EventDetailModal({
  event,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  isAdminMode,
}: EventDetailModalProps) {
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

  if (!isOpen || !event) {
    return null;
  }

  const selectedEvent = event;

  return (
    <>
      {createPortal(
        (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            onTouchStartCapture={(e) => {
              e.stopPropagation();
            }}
            onTouchMoveCapture={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onTouchEndCapture={(e) => {
              e.stopPropagation();
            }}
          >
            <div
              className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] overflow-hidden border relative flex flex-col"
              style={{ borderColor: "rgb(89, 89, 89)" }}
              onClick={(e) => e.stopPropagation()}
            >
            {/* 스크롤 가능한 전체 영역 */}
            <div 
              className="overflow-y-auto flex-1"
              style={{ 
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* 이미지 영역 (스크롤과 함께 사라짐) */}
              <div
                className={`relative w-full ${selectedEvent.image_medium || selectedEvent.image || getEventThumbnail(selectedEvent, defaultThumbnailClass, defaultThumbnailEvent) ? "bg-black" : "bg-cover bg-center"}`}
                style={{
                  height: "256px",
                  ...(!(
                    selectedEvent.image_medium ||
                    selectedEvent.image ||
                    getEventThumbnail(
                      selectedEvent,
                      defaultThumbnailClass,
                      defaultThumbnailEvent,
                    )
                  )
                    ? { backgroundImage: "url(/grunge.png)" }
                    : {}),
                }}
              >
                {(() => {
                  const detailImageUrl =
                    selectedEvent.image_medium ||
                    selectedEvent.image ||
                    getEventThumbnail(
                      selectedEvent,
                      defaultThumbnailClass,
                      defaultThumbnailEvent,
                    );
                  const isDefaultThumbnail =
                    !selectedEvent.image_medium &&
                    !selectedEvent.image &&
                    detailImageUrl;

                  if (detailImageUrl) {
                    return (
                      <>
                        <img
                          src={detailImageUrl}
                          alt={selectedEvent.title}
                          loading="lazy"
                          className="w-full h-full object-contain object-top"
                        />
                        {isDefaultThumbnail && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-white/50 text-6xl font-bold">
                              {selectedEvent.category === "class"
                                ? "강습"
                                : "행사"}
                            </span>
                          </div>
                        )}
                        {/* 크게보기 버튼 */}
                        <button
                          onClick={() => setShowFullscreenImage(true)}
                          className="absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white px-3 py-2 rounded-lg text-xs backdrop-blur-sm transition-colors cursor-pointer"
                        >
                          <i className="ri-zoom-in-line mr-1"></i>
                          크게 보기
                        </button>
                      </>
                    );
                  }

                  return (
                    <>
                      <div
                        className={`absolute inset-0 ${selectedEvent.category === "class" ? "bg-purple-500/30" : "bg-blue-500/30"}`}
                      ></div>
                      <span className="absolute inset-0 flex items-center justify-center text-white/10 text-6xl font-bold">
                        {selectedEvent.category === "class" ? "강습" : "행사"}
                      </span>
                    </>
                  );
                })()}

                {/* 카테고리 배지 - 좌측 하단 */}
                <div
                  className={`absolute bottom-4 left-4 px-3 py-1 text-white text-sm font-bold rounded-lg ${selectedEvent.category === "class" ? "bg-purple-600" : "bg-[#242424]"}`}
                >
                  {selectedEvent.category === "class" ? "강습" : "행사"}
                </div>
              </div>

              {/* 제목 - Sticky Header */}
              <div
                className="sticky top-0 z-40 bg-gray-800 border-b border-gray-700"
                style={{
                  padding: "16px",
                }}
              >
                <h2 className="text-xl font-bold text-white leading-tight break-words">
                  {selectedEvent.title}
                </h2>
              </div>

              {/* 세부 정보 */}
              <div className="p-4 space-y-3 bg-gray-800 overflow-x-hidden">
                <div className="flex items-center space-x-3 text-gray-300">
                  <i className="ri-calendar-line text-blue-400 text-xl"></i>
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

                {selectedEvent.organizer && (
                  <div className="flex items-center space-x-3 text-gray-300">
                    <i className="ri-user-line text-blue-400 text-xl"></i>
                    <span>{selectedEvent.organizer}</span>
                  </div>
                )}

                {selectedEvent.location && (
                  <div className="flex items-center space-x-3 text-gray-300">
                    <i className="ri-map-pin-line text-blue-400 text-xl"></i>
                    <div className="flex items-center gap-1">
                      <span>{selectedEvent.location}</span>
                      {selectedEvent.location_link && (
                        <a
                          href={selectedEvent.location_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-blue-600/20 rounded transition-colors"
                          title="지도 보기"
                        >
                          <i className="ri-external-link-line text-blue-400 text-lg"></i>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="flex items-start space-x-3 text-gray-300">
                      <i className="ri-file-text-line text-blue-400 text-xl flex-shrink-0 mt-0.5"></i>
                      <div className="flex-1 min-w-0">
                        <p className="whitespace-pre-wrap leading-relaxed break-words overflow-wrap-anywhere">
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
                                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer break-all"
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
                      <div className="space-y-2">
                        <span className="text-sm text-gray-400 block">
                          문의
                        </span>
                        <div className="flex flex-wrap gap-2">
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
                                className="flex items-center gap-2 bg-green-600/20 hover:bg-green-600/40 border border-green-600/50 text-gray-200 px-3 py-2 rounded-lg transition-colors group"
                              >
                                <i
                                  className={`${contactInfo.icon} text-green-400 text-lg`}
                                ></i>
                                <div className="text-left">
                                  <div className="text-sm font-medium">
                                    {contactInfo.displayText}
                                  </div>
                                  <div className="text-xs text-gray-400">
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
                    <div className="pt-3 border-t border-gray-700 space-y-2">
                      <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                        <i className="ri-admin-line"></i>
                        <span>등록자 정보 (관리자 전용)</span>
                      </div>
                      {selectedEvent.organizer_name && (
                        <div className="flex items-center space-x-3 text-gray-300">
                          <i className="ri-user-star-line text-red-400 text-xl"></i>
                          <span>{selectedEvent.organizer_name}</span>
                        </div>
                      )}
                      {selectedEvent.organizer_phone && (
                        <div className="flex items-center space-x-3 text-gray-300">
                          <i className="ri-phone-line text-red-400 text-xl"></i>
                          <span>{selectedEvent.organizer_phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                {selectedEvent.link1 && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="flex items-center gap-3">
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors cursor-pointer"
                      >
                        <i className="ri-external-link-line text-lg"></i>
                        <span className="font-medium">
                          {selectedEvent.link_name1 || "바로가기"}
                        </span>
                      </a>
                      <a
                        href={selectedEvent.link1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 bg-white p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
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
                )}

                {isAdminMode && selectedEvent.created_at && (
                  <div className="pt-3 border-t border-gray-700">
                    <span className="text-xs text-gray-500">
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
            
            <div className="border-t border-gray-700 bg-gray-800 p-4 flex flex-wrap gap-2 justify-between items-center">
              <div className="flex gap-2 flex-1 overflow-x-auto min-w-0">
                {selectedEvent.link1 && (
                  <a
                    href={selectedEvent.link1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    title={selectedEvent.link_name1 || "바로가기 1"}
                  >
                    <i className="ri-external-link-line text-base"></i>
                    <span className="text-sm font-medium">
                      {selectedEvent.link_name1 || "링크1"}
                    </span>
                  </a>
                )}
                {selectedEvent.link2 && (
                  <a
                    href={selectedEvent.link2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    title={selectedEvent.link_name2 || "바로가기 2"}
                  >
                    <i className="ri-external-link-line text-base"></i>
                    <span className="text-sm font-medium">
                      {selectedEvent.link_name2 || "링크2"}
                    </span>
                  </a>
                )}
                {selectedEvent.link3 && (
                  <a
                    href={selectedEvent.link3}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    title={selectedEvent.link_name3 || "바로가기 3"}
                  >
                    <i className="ri-external-link-line text-base"></i>
                    <span className="text-sm font-medium">
                      {selectedEvent.link_name3 || "링크3"}
                    </span>
                  </a>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0">
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
                        button.classList.remove('text-green-400', 'hover:text-green-300');
                        button.classList.add('text-blue-400', 'hover:text-blue-300');
                        const icon = button.querySelector('i');
                        if (icon) {
                          icon.classList.remove('ri-share-line');
                          icon.classList.add('ri-check-line');
                        }
                        setTimeout(() => {
                          button.classList.remove('text-blue-400', 'hover:text-blue-300');
                          button.classList.add('text-green-400', 'hover:text-green-300');
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
                  className="bg-black/30 hover:bg-black/50 text-green-400 hover:text-green-300 w-12 h-12 rounded-lg transition-all cursor-pointer backdrop-blur-sm flex items-center justify-center"
                  title="공유하기"
                >
                  <i className="ri-share-line text-2xl"></i>
                </button>
                
                <button
                  onClick={(e) => onEdit(selectedEvent, e)}
                  className="bg-black/30 hover:bg-black/50 text-yellow-400 hover:text-yellow-300 w-12 h-12 rounded-lg transition-all cursor-pointer backdrop-blur-sm flex items-center justify-center"
                  title="이벤트 수정"
                >
                  <i className="ri-edit-line text-2xl"></i>
                </button>
                <button
                  onClick={(e) => onDelete(selectedEvent, e)}
                  className="bg-black/30 hover:bg-black/50 text-red-400 hover:text-red-300 w-12 h-12 rounded-lg transition-all cursor-pointer backdrop-blur-sm flex items-center justify-center"
                  title="이벤트 삭제"
                >
                  <i className="ri-delete-bin-line text-2xl"></i>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white w-12 h-12 rounded-lg transition-all cursor-pointer shadow-lg flex items-center justify-center"
                  title="닫기"
                >
                  <i className="ri-close-line text-2xl"></i>
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
                className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[60] p-4"
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
                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors cursor-pointer backdrop-blur-sm"
              >
                <i className="ri-close-line text-2xl"></i>
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
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>, document.body
          )
        )}
    </>
  );
}