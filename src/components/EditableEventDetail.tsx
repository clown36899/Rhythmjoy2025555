import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Event as BaseEvent } from '../lib/supabase';
import { useDefaultThumbnail } from '../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../utils/getEventThumbnail';
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/components/EventDetailModal.css";
import "../styles/components/InteractivePreview.css";

// Register locale
registerLocale("ko", ko);

interface Event extends BaseEvent {
    storage_path?: string | null;
    genre?: string | null;
    event_dates?: string[];
}

interface EditableEventDetailProps {
    event: Event;
    onUpdate: (field: string, value: any) => void;
    onImageUpload: () => void;
    genreSuggestions: string[];
    className?: string;
    style?: React.CSSProperties;
    // Footer Props
    password?: string;
    setPassword?: (password: string) => void;
    link?: string;
    setLink?: (link: string) => void;
    linkName?: string;
    setLinkName?: (linkName: string) => void;
    onRegister?: () => void;
    onClose?: () => void;
    isSubmitting?: boolean;
    // DatePicker props
    date?: Date | null;
    setDate?: (date: Date | null) => void;
    endDate?: Date | null;
    setEndDate?: (date: Date | null) => void;
    eventDates?: string[];
    setEventDates?: (dates: string[]) => void;
}

const genreColorPalette = [
    'card-genre-red', 'card-genre-orange', 'card-genre-amber', 'card-genre-yellow',
    'card-genre-lime', 'card-genre-green', 'card-genre-emerald', 'card-genre-teal',
    'card-genre-cyan', 'card-genre-sky', 'card-genre-blue', 'card-genre-indigo',
    'card-genre-violet', 'card-genre-purple', 'card-genre-fuchsia', 'card-genre-pink', 'card-genre-rose',
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

// Edit Badge Component
const EditBadge = () => (
    <div className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10 border border-white/20">
        <i className="ri-add-line text-xs font-bold"></i>
    </div>
);

export default function EditableEventDetail({
    event,
    onUpdate,
    onImageUpload,
    genreSuggestions,
    className = "",
    password,
    setPassword,
    link,
    setLink,
    linkName,
    setLinkName,
    onRegister,
    onClose,
    isSubmitting,
    date,
    setDate,
    endDate,
    setEndDate,
    eventDates = [],
    setEventDates,
}: EditableEventDetailProps) {
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();
    const [activeModal, setActiveModal] = useState<'genre' | 'location' | 'link' | 'date' | null>(null);
    const titleRef = React.useRef<HTMLTextAreaElement>(null);

    // Date Picker Mode
    const [dateMode, setDateMode] = useState<'range' | 'dates'>('range');

    // Auto-resize and font scaling for Title
    useEffect(() => {
        const textarea = titleRef.current;
        if (!textarea) return;

        // Reset to auto to correctly calculate scrollHeight
        textarea.style.height = 'auto';

        // Start with max size
        let currentFontSize = 1.75; // rem
        textarea.style.fontSize = `${currentFontSize}rem`;

        // Target max height for 2 lines:
        // 1.75rem * 1.3 (line-height) * 2 lines = ~4.55rem (~72.8px at 16px root)
        // We want to keep the visual height around this value even if text wraps more.
        const MAX_HEIGHT_PX = 75;

        // Iteratively reduce font size if scrollHeight exceeds target
        while (textarea.scrollHeight > MAX_HEIGHT_PX && currentFontSize > 1.0) {
            currentFontSize -= 0.1;
            textarea.style.fontSize = `${currentFontSize}rem`;
        }

        // Set final height
        textarea.style.height = textarea.scrollHeight + 'px';
    }, [event.title]);

    // Local state for modals
    const [tempLocation, setTempLocation] = useState("");
    const [tempLocationLink, setTempLocationLink] = useState("");
    const [customGenreInput, setCustomGenreInput] = useState("");
    const [showCustomGenreInput, setShowCustomGenreInput] = useState(false);

    // Initialize local state when modal opens
    useEffect(() => {
        if (activeModal === 'location') {
            setTempLocation(event.location);
            setTempLocationLink(event.location_link || "");
        }
        if (activeModal === 'genre') {
            setShowCustomGenreInput(false);
            setCustomGenreInput("");
        }
        // Initialize date mode based on existing data
        if (activeModal === 'date') {
            if (eventDates && eventDates.length > 0) {
                setDateMode('dates');
            } else {
                setDateMode('range');
            }
        }
    }, [activeModal, event, eventDates]);

    const detailImageUrl = event.image || getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const hasImage = !!event.image;

    const handleSave = (field: string, value: any) => {
        onUpdate(field, value);
        setActiveModal(null);
    };

    // Helper to format date string YYYY-MM-DD
    const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return (
        <div
            className={`event-detail-modal-container ${className}`}
            style={{ borderColor: "rgb(89, 89, 89)" }}
            onClick={() => setActiveModal(null)} // Close modals on background click
        >
            {/* Backdrop for Modals (Only if not using portal for some reason, but we are) */}
            {/* Keeping this as a fallback or for non-portal modals if any */}

            <div
                className="modal-scroll-container"
                style={{
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    paddingBottom: '120px' // Increased padding for footer
                }}
            >
                {/* Image Area */}
                <div
                    className={`image-area ${hasImage ? "bg-black" : "bg-pattern"} relative group cursor-pointer`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onImageUpload();
                    }}
                >
                    {hasImage ? (
                        <>
                            <div className="image-blur-bg" style={{ backgroundImage: `url(${detailImageUrl})` }} />
                            <img src={detailImageUrl} alt={event.title} className="detail-image" />
                            <div className="image-gradient-overlay" />
                            {/* Hover Overlay for changing image */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                                <span className="text-white font-bold border border-white/30 px-4 py-2 rounded-full backdrop-blur-sm flex items-center">
                                    <i className="ri-image-edit-line mr-2"></i>
                                    이미지 변경
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={`category-bg-overlay ${event.category === "class" ? "class" : "event"}`}></div>
                            {/* Explicit Upload Prompt */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                                <i className="ri-image-add-line text-4xl mb-2 opacity-80"></i>
                                <span className="font-bold text-lg opacity-90">클릭해서 이미지 등록</span>
                            </div>
                        </>
                    )}

                    {/* Category Badge */}
                    <div
                        className={`category-badge ${event.category === "class" ? "class" : "event"} relative group`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdate('category', event.category === 'class' ? 'event' : 'class');
                        }}
                        style={{ zIndex: 20 }}
                    >
                        {event.category === "class" ? "강습" : "행사"}
                        <EditBadge />
                    </div>
                </div>

                {/* Sticky Header */}
                <div
                    className="sticky-header"
                    style={{ padding: "16px" }}
                >
                    {/* Genre */}
                    <div
                        className="relative inline-block group cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal('genre');
                        }}
                    >
                        <EditBadge />
                        <p className={`genre-text ${getGenreColor(event.genre || '')}`}>
                            {event.genre || <span className="text-gray-500 text-sm">장르 선택</span>}
                        </p>

                        {/* Genre Bottom Sheet Portal */}
                        {activeModal === 'genre' && createPortal(
                            <div className="bottom-sheet-portal">
                                {/* Backdrop */}
                                <div
                                    className="bottom-sheet-backdrop"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModal(null);
                                    }}
                                />
                                {/* Content */}
                                <div
                                    className="bottom-sheet-content"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="bottom-sheet-handle"></div>
                                    <h3 className="bottom-sheet-header">
                                        <i className="ri-music-2-line"></i>
                                        장르 선택
                                    </h3>

                                    <div className="bottom-sheet-body">
                                        {showCustomGenreInput ? (
                                            <div className="genre-input-row">
                                                <input
                                                    value={customGenreInput}
                                                    onChange={(e) => setCustomGenreInput(e.target.value)}
                                                    className="bottom-sheet-input"
                                                    placeholder="직접 입력"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleSave('genre', customGenreInput)}
                                                    className="bottom-sheet-button"
                                                    style={{ width: 'auto', whiteSpace: 'nowrap' }}
                                                >
                                                    확인
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setShowCustomGenreInput(true)}
                                                    className="genre-direct-btn"
                                                >
                                                    <i className="ri-add-circle-line text-xl"></i>
                                                    직접 입력
                                                </button>
                                                <div className="genre-grid">
                                                    {genreSuggestions.map(g => (
                                                        <button
                                                            key={g}
                                                            onClick={() => handleSave('genre', g)}
                                                            className="genre-grid-btn"
                                                        >
                                                            {g}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>

                {/* Title */}
                <div className="relative group mt-3">
                    <EditBadge />
                    <textarea
                        ref={titleRef}
                        value={event.title}
                        onChange={(e) => {
                            onUpdate('title', e.target.value);
                        }}
                        onFocus={(e) => {
                            // Scroll into view to prevent keyboard hiding it
                            setTimeout(() => {
                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 300);
                        }}
                        className="title-textarea"
                        placeholder="제목을 입력하세요"
                        rows={1}
                        style={{
                            fontSize: '1.75rem',
                            height: 'auto'
                        }}
                    />
                </div>

                {/* Info Section */}
                <div className="info-section">
                    {/* Date */}
                    <div
                        className="info-item cursor-pointer relative group hover:bg-white/5 rounded-lg -mx-2 px-2 py-2 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal('date');
                        }}
                    >
                        <EditBadge />
                        <i className="ri-calendar-line info-icon text-gray-400 group-hover:text-blue-400 transition-colors text-xl"></i>
                        <span className="group-hover:text-white transition-colors text-base">
                            {eventDates && eventDates.length > 0 ? (
                                // Multiple Dates Display
                                <span className="text-sm">
                                    {eventDates.length}일 선택됨: {eventDates.map(d => {
                                        const dateObj = new Date(d);
                                        return `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                                    }).join(', ')}
                                </span>
                            ) : event.start_date ? (
                                // Range Display
                                (() => {
                                    const start = new Date(event.start_date);
                                    const end = event.end_date ? new Date(event.end_date) : null;
                                    const startStr = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일`;
                                    if (end && start.getTime() !== end.getTime()) {
                                        return `${startStr} ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
                                    }
                                    return startStr;
                                })()
                            ) : (
                                <span className="text-gray-500">날짜를 선택하세요</span>
                            )}
                        </span>

                        {/* Date Picker Bottom Sheet Portal */}
                        {activeModal === 'date' && setDate && setEndDate && setEventDates && createPortal(
                            <div className="bottom-sheet-portal">
                                {/* Backdrop */}
                                <div
                                    className="bottom-sheet-backdrop"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModal(null);
                                    }}
                                />
                                {/* Content */}
                                <div
                                    className="bottom-sheet-content"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="bottom-sheet-handle"></div>
                                    <div className="flex items-center justify-between bottom-sheet-header">
                                        <h3 className="flex items-center gap-2">
                                            <i className="ri-calendar-check-line"></i>
                                            날짜 선택
                                        </h3>
                                        {/* Toggle Switch */}
                                        <div className="date-mode-toggle">
                                            <button
                                                onClick={() => {
                                                    setDateMode('range');
                                                    setEventDates && setEventDates([]);
                                                }}
                                                className={`date-mode-btn ${dateMode === 'range' ? 'active' : ''}`}
                                            >
                                                기간
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDateMode('dates');
                                                    setDate && setDate(null);
                                                    setEndDate && setEndDate(null);
                                                }}
                                                className={`date-mode-btn ${dateMode === 'dates' ? 'active' : ''}`}
                                            >
                                                개별
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bottom-sheet-body flex justify-center pb-8">
                                        {dateMode === 'range' ? (
                                            <DatePicker
                                                selected={date}
                                                onChange={(dates) => {
                                                    const [start, end] = dates as [Date | null, Date | null];
                                                    setDate(start);
                                                    setEndDate(end);
                                                }}
                                                startDate={date}
                                                endDate={endDate}
                                                selectsRange
                                                locale={ko}
                                                inline
                                            />
                                        ) : (
                                            <DatePicker
                                                selected={null}
                                                onChange={(d: Date | null) => {
                                                    if (!d) return;
                                                    const dateStr = formatDateStr(d);
                                                    const newDates = eventDates.includes(dateStr)
                                                        ? eventDates.filter(ed => ed !== dateStr)
                                                        : [...eventDates, dateStr].sort();
                                                    setEventDates && setEventDates(newDates);
                                                }}
                                                highlightDates={eventDates.map(d => new Date(d))}
                                                locale={ko}
                                                inline
                                                shouldCloseOnSelect={false}
                                            />
                                        )}
                                    </div>
                                    <div className="bottom-sheet-actions">
                                        <button
                                            onClick={() => setActiveModal(null)}
                                            className="bottom-sheet-button"
                                        >
                                            확인
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* Location */}
                    <div
                        className="info-item relative group cursor-pointer hover:bg-white/5 rounded-lg -mx-2 px-2 py-2 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal('location');
                        }}
                    >
                        <EditBadge />
                        <i className="ri-map-pin-line info-icon text-gray-400 group-hover:text-blue-400 transition-colors text-xl"></i>
                        <div className="info-flex-gap-1 w-full">
                            <span className="group-hover:text-white transition-colors text-base">{event.location || <span className="text-gray-500">장소를 입력하세요</span>}</span>
                            {event.location_link && (
                                <span className="location-link text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full text-xs">
                                    <i className="ri-map-2-line mr-1"></i>
                                    지도
                                </span>
                            )}
                        </div>

                        {/* Location Bottom Sheet Portal */}
                        {activeModal === 'location' && createPortal(
                            <div className="bottom-sheet-portal">
                                {/* Backdrop */}
                                <div
                                    className="bottom-sheet-backdrop"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModal(null);
                                    }}
                                />
                                {/* Content */}
                                <div
                                    className="bottom-sheet-content"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="bottom-sheet-handle"></div>
                                    <h3 className="bottom-sheet-header">
                                        <i className="ri-map-pin-user-line"></i>
                                        장소 정보 입력
                                    </h3>

                                    <div className="bottom-sheet-body">
                                        <div className="bottom-sheet-input-group">
                                            <label className="bottom-sheet-label">장소명</label>
                                            <input
                                                value={tempLocation}
                                                onChange={(e) => setTempLocation(e.target.value)}
                                                className="bottom-sheet-input"
                                                placeholder="예: 강남역 1번출구, 00댄스스튜디오"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="bottom-sheet-input-group">
                                            <label className="bottom-sheet-label">지도 링크 (선택)</label>
                                            <div className="bottom-sheet-input-wrapper">
                                                <i className="ri-link bottom-sheet-input-icon"></i>
                                                <input
                                                    value={tempLocationLink}
                                                    onChange={(e) => setTempLocationLink(e.target.value)}
                                                    className="bottom-sheet-input has-icon"
                                                    placeholder="네이버/카카오맵 URL"
                                                />
                                            </div>
                                        </div>
                                        <div className="bottom-sheet-actions">
                                            <button
                                                onClick={() => {
                                                    onUpdate('location', tempLocation);
                                                    onUpdate('location_link', tempLocationLink);
                                                    setActiveModal(null);
                                                }}
                                                className="bottom-sheet-button"
                                            >
                                                저장
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* Description */}
                    <div className="info-divider">
                        <div className="info-item items-start relative group hover:bg-white/5 rounded-lg -mx-2 px-2 py-2 transition-colors">
                            <EditBadge />
                            <i className="ri-file-text-line info-icon mt-1.5 text-gray-400 group-hover:text-blue-400 transition-colors text-xl"></i>
                            <div className="info-item-content w-full">
                                <textarea
                                    value={event.description}
                                    onChange={(e) => {
                                        onUpdate('description', e.target.value);
                                        // Auto-expand height
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    className="w-full bg-transparent text-gray-300 resize-none outline-none min-h-[200px] overflow-hidden placeholder-gray-600 leading-relaxed text-base"
                                    placeholder="행사 내용을 상세히 입력해주세요..."
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="modal-footer">
                <div className="footer-links-container">
                    {/* Link Input Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal(activeModal === 'link' ? null : 'link');
                        }}
                        className="footer-link relative hover:bg-white/5 rounded-lg transition-colors p-2"
                        title={link ? "링크 수정" : "링크 추가"}
                    >
                        <i className={`ri-external-link-line footer-link-icon text-xl ${link ? 'text-blue-400' : 'text-gray-400'}`}></i>
                        <span className={`footer-link-text text-sm ml-2 ${link ? 'text-blue-100' : 'text-gray-400'}`}>
                            {linkName || (link ? "링크" : "링크 추가")}
                        </span>

                        {/* Link Bottom Sheet Portal */}
                        {activeModal === 'link' && createPortal(
                            <div className="bottom-sheet-portal">
                                {/* Backdrop */}
                                <div
                                    className="bottom-sheet-backdrop"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModal(null);
                                    }}
                                />
                                {/* Content */}
                                <div
                                    className="bottom-sheet-content"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="bottom-sheet-handle"></div>
                                    <h3 className="bottom-sheet-header">
                                        <i className="ri-link-m"></i>
                                        외부 링크 연결
                                    </h3>

                                    <div className="bottom-sheet-body">
                                        <div className="bottom-sheet-input-group">
                                            <label className="bottom-sheet-label">버튼 이름</label>
                                            <input
                                                value={linkName}
                                                onChange={(e) => setLinkName?.(e.target.value)}
                                                placeholder="예: 신청서 작성, 인스타그램"
                                                className="bottom-sheet-input"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="bottom-sheet-input-group">
                                            <label className="bottom-sheet-label">URL 주소</label>
                                            <div className="bottom-sheet-input-wrapper">
                                                <i className="ri-global-line bottom-sheet-input-icon"></i>
                                                <input
                                                    value={link}
                                                    onChange={(e) => setLink?.(e.target.value)}
                                                    placeholder="https://..."
                                                    className="bottom-sheet-input has-icon"
                                                />
                                            </div>
                                        </div>
                                        <div className="bottom-sheet-actions">
                                            <button
                                                onClick={() => setActiveModal(null)}
                                                className="bottom-sheet-button"
                                            >
                                                완료
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </button>
                </div>

                <div className="footer-actions-container">
                    {/* Password Input */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <i className="ri-lock-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword?.(e.target.value)}
                                placeholder="비밀번호"
                                className="bg-gray-800/50 text-white pl-7 pr-2 py-2 rounded-lg text-xs border border-gray-700/50 focus:border-blue-500/50 focus:bg-gray-800 outline-none w-24 text-center h-10 transition-all placeholder-gray-600"
                                maxLength={4}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose?.();
                        }}
                        className="close-button hover:bg-red-600/20 hover:text-red-400"
                        title="닫기"
                    >
                        <i className="ri-close-line action-icon"></i>
                    </button>

                    {/* Register Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegister?.();
                        }}
                        disabled={isSubmitting}
                        className={`close-button ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500'}`}
                        title="등록하기"
                        style={{ width: 'auto', padding: '0 1.5rem', fontSize: '1rem', fontWeight: 'bold' }}
                    >
                        {isSubmitting ? '등록 중...' : '등록'}
                    </button>
                </div>
            </div>
        </div>
    );
}
