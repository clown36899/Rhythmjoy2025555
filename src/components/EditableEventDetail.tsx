import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Event as BaseEvent } from '../lib/supabase';
import { useDefaultThumbnail } from '../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../utils/getEventThumbnail';
import { formatDateForInput } from '../utils/fileUtils';
import { isValidVideoUrl } from '../utils/videoEmbed';
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
    onDelete?: () => void;
    // DatePicker props
    date?: Date | null;
    setDate?: (date: Date | null) => void;
    endDate?: Date | null;
    setEndDate?: (date: Date | null) => void;
    eventDates?: string[];
    setEventDates?: (dates: string[]) => void;
    // Image Position
    imagePosition?: { x: number; y: number };
    onImagePositionChange?: (pos: { x: number; y: number }) => void;
    // Video Props
    videoUrl?: string;
    onVideoChange?: (url: string) => void;
    onExtractThumbnail?: () => void;
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
const EditBadge = ({ isStatic = false }: { isStatic?: boolean }) => (
    <div className={`${isStatic ? "relative ml-1" : "absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2"} bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10 border border-white/20 shrink-0`}>
        <i className="ri-add-line text-xs font-bold"></i>
    </div>
);

export interface EditableEventDetailRef {
    openModal: (modalType: 'genre' | 'location' | 'link' | 'date' | 'title' | 'video') => void;
}

const EditableEventDetail = React.forwardRef<EditableEventDetailRef, EditableEventDetailProps>(({
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
    onDelete,
    date,
    setDate,
    endDate,
    setEndDate,
    eventDates = [],
    setEventDates,
    imagePosition = { x: 0, y: 0 },
    onImagePositionChange,
    videoUrl,
    onVideoChange,
}, ref) => {
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();
    const [activeModal, setActiveModal] = useState<'genre' | 'location' | 'link' | 'date' | 'title' | 'video' | 'imageSource' | null>(null);

    React.useImperativeHandle(ref, () => ({
        openModal: (modalType) => {
            setActiveModal(modalType as any); // Cast to any to allow string but still type safe internal
        }
    }));
    // const titleRef = React.useRef<HTMLTextAreaElement>(null); // No longer needed

    // Date Picker Mode
    const [dateMode, setDateMode] = useState<'single' | 'range' | 'dates'>(() => {
        if (eventDates && eventDates.length > 0) {
            return 'dates';
        } else if (date && endDate && date.getTime() !== endDate.getTime()) {
            return 'range';
        } else {
            return 'single';
        }
    });

    // Local state for modals
    const [tempLocation, setTempLocation] = useState("");
    const [tempLocationLink, setTempLocationLink] = useState("");
    const [tempTitle, setTempTitle] = useState("");
    const [tempVideoUrl, setTempVideoUrl] = useState("");
    const [customGenreInput, setCustomGenreInput] = useState("");
    const [showCustomGenreInput, setShowCustomGenreInput] = useState(false);

    // Repositioning State
    const [isRepositioning, setIsRepositioning] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
    const imageRef = React.useRef<HTMLImageElement>(null);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isRepositioning) return;
        e.preventDefault();
        e.stopPropagation();

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        setDragStart({ x: clientX, y: clientY });
        setStartPos({ ...imagePosition });
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isRepositioning || !dragStart || !startPos || !imageRef.current) return;

        // Prevent scrolling on touch to ensure image moves smoothly
        if (e.cancelable && 'touches' in e) {
            e.preventDefault();
        }

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        const deltaY = clientY - dragStart.y;

        // Calculate delta as percentage of the IMAGE size (not container)
        // because transform % is relative to the element itself.
        const imgHeight = imageRef.current.offsetHeight || 1;
        const containerHeight = imageRef.current.parentElement?.offsetHeight || imgHeight; // Fallback if parent not found

        const deltaYPercent = (deltaY / imgHeight) * 100;

        // Direct movement: Drag Down -> Move Down (+Delta)
        // Lock X axis (Vertical movement only)
        let newX = startPos.x;
        let newY = startPos.y + deltaYPercent;

        // Calculate limits to prevent image from detaching from edges
        // Limit is the max offset allowed from center (0).
        // It corresponds to half the difference between image and container height.
        const limitYPixels = Math.abs(imgHeight - containerHeight) / 2;
        const limitYPercent = (limitYPixels / imgHeight) * 100;

        // Clamp Y between -limit and +limit
        newY = Math.max(-limitYPercent, Math.min(limitYPercent, newY));

        onImagePositionChange?.({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setDragStart(null);
        setStartPos(null);
    };

    // Attach global listeners for drag when active
    React.useEffect(() => {
        if (isRepositioning) {
            const handleGlobalMove = (e: any) => handleMouseMove(e);
            const handleGlobalUp = () => handleMouseUp();

            window.addEventListener('mousemove', handleGlobalMove);
            window.addEventListener('mouseup', handleGlobalUp);
            // passive: false is required to preventDefault on touchmove (scrolling)
            window.addEventListener('touchmove', handleGlobalMove, { passive: false });
            window.addEventListener('touchend', handleGlobalUp);

            return () => {
                window.removeEventListener('mousemove', handleGlobalMove);
                window.removeEventListener('mouseup', handleGlobalUp);
                window.removeEventListener('touchmove', handleGlobalMove);
                window.removeEventListener('touchend', handleGlobalUp);
            };
        }
    }, [isRepositioning, dragStart, startPos]);


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

    // Title Font Scaling Logic
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [titleFontSize, setTitleFontSize] = useState(1.75); // Initial rem

    React.useLayoutEffect(() => {
        const adjustFontSize = () => {
            const element = titleRef.current;
            if (!element) return;

            // Reset to max size first to measure correctly
            element.style.fontSize = '1.75rem';

            // Max height for 2 lines: 1.75rem * 1.3 (line-height) * 2 lines ≈ 4.55rem
            // We can use scrollHeight vs clientHeight if we set a fixed max-height, 
            // but here we want to fit into "2 lines" visually.
            // Let's define max height in pixels roughly. 
            // 1.75rem * 16px * 1.3 * 2 = 72.8px. Let's say 73px.
            const MAX_HEIGHT = 74; // slightly more for tolerance

            let currentSize = 1.75;
            const MIN_SIZE = 1.0;
            const STEP = 0.1;

            // While content overflows max height and size is above min
            while (element.scrollHeight > MAX_HEIGHT && currentSize > MIN_SIZE) {
                currentSize -= STEP;
                element.style.fontSize = `${currentSize}rem`;
            }

            setTitleFontSize(currentSize);
        };

        adjustFontSize();
    }, [event.title]);

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
                    className={`event-image-area image-area ${hasImage ? "bg-black" : "bg-pattern"} group`}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Clicking background does nothing specific now, buttons handle actions
                    }}
                >
                    {/* Video Indicator (if video exists) */}



                    {hasImage ? (
                        <>
                            <div className="image-blur-bg" style={{ backgroundImage: `url(${detailImageUrl})` }} />
                            <img
                                ref={imageRef}
                                src={detailImageUrl}
                                alt={event.title}
                                className={`detail-image ${isRepositioning ? 'cursor-move' : ''}`}
                                style={{
                                    transform: `translate3d(${imagePosition.x}%, ${imagePosition.y}%, 0)`,
                                    transition: isRepositioning ? 'none' : 'transform 0.2s ease-out'
                                }}
                                onMouseDown={handleMouseDown}
                                onTouchStart={handleMouseDown}
                            />
                            <div className="image-gradient-overlay" />

                            {/* Reposition Controls */}
                            {isRepositioning ? (
                                <div className="reposition-overlay">
                                    <div className="pointer-events-auto flex gap-2 mt-auto mb-6">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsRepositioning(false);
                                            }}
                                            className="reposition-confirm-btn"
                                        >
                                            완료
                                        </button>
                                    </div>
                                    <div className="reposition-hint">
                                        드래그하여 위치 이동
                                    </div>
                                </div>
                            ) : (
                                /* Image Control Overlay - Always visible */
                                <div className="image-control-overlay">
                                    <div className="image-control-buttons">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onImageUpload();
                                            }}
                                            className="image-control-btn"
                                        >
                                            <i className="ri-image-edit-line"></i>
                                            이미지 변경
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsRepositioning(true);
                                            }}
                                            className="image-control-btn"
                                        >
                                            <i className="ri-drag-move-2-line"></i>
                                            위치 이동
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTempVideoUrl(videoUrl || "");
                                                setActiveModal('video');
                                            }}
                                            className={`image-control-btn ${videoUrl ? 'text-red-400' : ''}`}
                                        >
                                            <i className="ri-youtube-line"></i>
                                            {videoUrl ? '동영상 수정' : '동영상 등록'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className={`category-bg-overlay ${event.category === "class" ? "class" : "event"}`}></div>
                            {/* Explicit Upload Prompt */}
                            <div className="absolute inset-0 flex flex-row items-center justify-center text-white z-10 p-6 gap-8">
                                {/* Image Upload */}
                                <div
                                    className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onImageUpload();
                                    }}
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3 backdrop-blur-sm border border-white/20">
                                        <i className="ri-image-add-line text-3xl"></i>
                                    </div>
                                    <span className="font-bold text-lg opacity-90">대표 이미지</span>
                                    <span className="text-xs opacity-70 mt-1">클릭하여 업로드</span>
                                </div>

                                {/* Divider */}
                                <div className="w-px h-16 bg-white/20"></div>

                                {/* Video Upload */}
                                <div
                                    className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTempVideoUrl(videoUrl || "");
                                        setActiveModal('video');
                                    }}
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3 backdrop-blur-sm border border-white/20">
                                        <i className="ri-youtube-line text-3xl"></i>
                                    </div>
                                    <span className="font-bold text-lg opacity-90">{videoUrl ? '동영상 수정' : '동영상 등록'}</span>
                                    <div className="flex flex-col items-center mt-1">
                                        <span className="text-xs text-red-300 font-medium opacity-90">(유튜브만 가능)</span>
                                        <span className="text-[10px] opacity-60">빌보드 전용</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Video Modal Portal */}
                    {activeModal === 'video' && createPortal(
                        <div className="bottom-sheet-portal">
                            <div
                                className="bottom-sheet-backdrop"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveModal(null);
                                }}
                            />
                            <div
                                className="bottom-sheet-content"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="bottom-sheet-handle"></div>
                                <h3 className="bottom-sheet-header">
                                    <i className="ri-youtube-fill text-red-500"></i>
                                    동영상 등록 (유튜브)
                                </h3>
                                <div className="bottom-sheet-body">
                                    <p className="text-sm text-gray-500 mb-4 text-center">
                                        유튜브 영상 주소를 입력해주세요.<br />
                                        <span className="text-xs text-red-400 mt-1 block">
                                            * 주소를 지우고 등록하면 영상이 삭제됩니다.
                                        </span>
                                    </p>
                                    <div className="bottom-sheet-input-group">
                                        <input
                                            value={tempVideoUrl}
                                            onChange={(e) => setTempVideoUrl(e.target.value)}
                                            className="bottom-sheet-input"
                                            placeholder="https://youtu.be/..."
                                            autoFocus
                                        />
                                    </div>
                                    <div className="bottom-sheet-actions">
                                        <div className="flex gap-3 w-full">
                                            <button
                                                onClick={() => {
                                                    setActiveModal(null);
                                                }}
                                                className="bottom-sheet-button flex-1 bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 border-none"
                                                style={{ backgroundColor: '#f3f4f6', color: '#4b5563' }}
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (tempVideoUrl.trim() && !isValidVideoUrl(tempVideoUrl)) {
                                                        alert("YouTube URL만 입력 가능합니다.");
                                                        return;
                                                    }
                                                    onVideoChange?.(tempVideoUrl);
                                                    setActiveModal(null);
                                                }}
                                                className="bottom-sheet-button flex-1 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md border-none"
                                            >
                                                등록
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}


                </div>

                {/* Sticky Header */}
                <div
                    className="sticky-header"
                    style={{ padding: "16px" }}
                >
                    <div className="header-selectors-container">
                        {/* Category Badge - Moved here */}
                        <div
                            className={`category-selector category-badge ${event.category === "class" ? "class" : "event"} group`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate('category', event.category === 'class' ? 'event' : 'class');
                            }}
                            style={{ zIndex: 20 }}
                        >
                            {event.category === "class" ? "강습" : "행사"}
                            <EditBadge isStatic />
                        </div>

                        {/* Genre */}
                        <div
                            id="genre-selector-section"
                            className="genre-selector group"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowCustomGenreInput(false);
                                setCustomGenreInput("");
                                setActiveModal('genre');
                            }}
                        >
                            <div className={`genre-text ${getGenreColor(event.genre || '')}`}>
                                {event.genre || <span className="text-gray-500 text-sm">장르 선택</span>}
                            </div>
                            <EditBadge isStatic />

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
                </div>

                {/* Title */}
                <div
                    className="title-editor-container group"
                    onClick={(e) => {
                        e.stopPropagation();
                        setTempTitle(event.title);
                        setActiveModal('title');
                    }}
                >
                    <h2
                        ref={titleRef}
                        className="title-text"
                        style={{
                            fontSize: `${titleFontSize}rem`,
                            minHeight: '2.5rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: '1.3',
                            fontWeight: '700',
                            color: event.title ? 'white' : '#4b5563',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}
                    >
                        {event.title || "제목을 입력하세요"}
                    </h2>
                    <EditBadge isStatic />

                    {/* Title Bottom Sheet Portal */}
                    {activeModal === 'title' && createPortal(
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
                                    <i className="ri-text"></i>
                                    제목 입력
                                </h3>

                                <div className="bottom-sheet-body">
                                    <div className="bottom-sheet-input-group">
                                        <textarea
                                            value={tempTitle}
                                            onChange={(e) => setTempTitle(e.target.value)}
                                            className="bottom-sheet-input"
                                            placeholder="행사 제목을 입력하세요"
                                            autoFocus
                                            rows={3}
                                            style={{ resize: 'none', minHeight: '100px' }}
                                        />
                                    </div>
                                    <div className="bottom-sheet-actions">
                                        <button
                                            onClick={() => {
                                                onUpdate('title', tempTitle);
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

                {/* Info Section */}
                <div className="info-section">
                    {/* Date                    */}
                    <div
                        id="date-selector-section"
                        className="date-selector-row info-item group"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (eventDates && eventDates.length > 0) {
                                setDateMode('dates');
                            } else if (date && endDate && date.getTime() !== endDate.getTime()) {
                                setDateMode('range');
                            } else {
                                setDateMode('single');
                            }
                            setActiveModal('date');
                        }}
                    >
                        <i className="ri-calendar-line info-icon text-gray-400 group-hover:text-blue-400 transition-colors text-xl"></i>
                        <span className="group-hover:text-white transition-colors text-base flex-1">
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
                        <EditBadge isStatic />

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
                                                    setDateMode('single');
                                                    setEventDates && setEventDates([]);
                                                    setDate && setDate(null);
                                                    setEndDate && setEndDate(null);
                                                }}
                                                className={`date-mode-btn ${dateMode === 'single' ? 'active' : ''}`}
                                            >
                                                하루
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDateMode('range');
                                                    setEventDates && setEventDates([]);
                                                    setDate && setDate(null);
                                                    setEndDate && setEndDate(null);
                                                }}
                                                className={`date-mode-btn ${dateMode === 'range' ? 'active' : ''}`}
                                            >
                                                연속
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

                                    <div className="bottom-sheet-body flex flex-col items-center pb-8">
                                        {/* Selected Dates Display */}
                                        <div className="selected-dates-container">
                                            {dateMode === 'single' ? (
                                                <div className="date-display-box active">
                                                    <span className="label">선택일</span>
                                                    <span className="value">{date ? formatDateStr(date) : '-'}</span>
                                                </div>
                                            ) : dateMode === 'range' ? (
                                                <div className="date-range-display">
                                                    <div className={`date-display-box ${date ? 'active' : ''}`}>
                                                        <span className="label">시작</span>
                                                        <span className="value">{date ? formatDateStr(date) : '-'}</span>
                                                    </div>
                                                    <i className="ri-arrow-right-line separator"></i>
                                                    <div className={`date-display-box ${endDate ? 'active' : ''}`}>
                                                        <span className="label">종료</span>
                                                        <span className="value">{endDate ? formatDateStr(endDate) : '-'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="selected-dates-list">
                                                    {eventDates.length > 0 ? (
                                                        eventDates.map(d => (
                                                            <div key={d} className="selected-date-chip">
                                                                <span>{d.substring(5)}</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newDates = eventDates.filter(ed => ed !== d);
                                                                        setEventDates && setEventDates(newDates);
                                                                    }}
                                                                    className="remove-date-btn"
                                                                >
                                                                    <i className="ri-close-line"></i>
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <span className="no-dates-text">날짜를 선택해주세요</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="calendar-wrapper" style={{ minHeight: '340px' }}>
                                            {dateMode === 'single' ? (
                                                <DatePicker
                                                    selected={date}
                                                    onChange={(d: Date | null) => {
                                                        if (d) {
                                                            setDate && setDate(d);
                                                            setEndDate && setEndDate(d);
                                                            setEventDates && setEventDates([]);
                                                        }
                                                    }}
                                                    locale={ko}
                                                    inline
                                                />
                                            ) : dateMode === 'range' ? (
                                                <DatePicker
                                                    selected={date}
                                                    onChange={(dates) => {
                                                        const [start, end] = dates as [Date | null, Date | null];
                                                        setDate && setDate(start);
                                                        setEndDate && setEndDate(end);
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
                                    </div>
                                    <div className="bottom-sheet-actions">
                                        <button
                                            onClick={() => {
                                                if (dateMode === 'single' || dateMode === 'range') {
                                                    if (date && endDate) {
                                                        onUpdate('date', formatDateForInput(date));
                                                        onUpdate('end_date', formatDateForInput(endDate));
                                                        onUpdate('event_dates', []); // Clear multiple dates
                                                        setActiveModal(null);
                                                    }
                                                } else {
                                                    // Multiple dates mode
                                                    onUpdate('event_dates', eventDates);
                                                    onUpdate('date', null); // Clear range dates
                                                    onUpdate('end_date', null);
                                                    setActiveModal(null);
                                                }
                                            }}
                                            className="bottom-sheet-button"
                                            disabled={(dateMode === 'range' && (!date || !endDate)) || (dateMode === 'single' && !date)}
                                        >
                                            확인
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* Location                    */}
                    <div
                        className="location-selector-row info-item group"
                        onClick={(e) => {
                            e.stopPropagation();
                            setTempLocation(event.location);
                            setTempLocationLink(event.location_link || "");
                            setActiveModal('location');
                        }}
                    >
                        <i className="ri-map-pin-line info-icon text-gray-400 group-hover:text-blue-400 transition-colors text-xl"></i>
                        <div className="info-flex-gap-1 w-full flex-1">
                            <span className="group-hover:text-white transition-colors text-base">{event.location || <span className="text-gray-500">장소를 입력하세요</span>}</span>
                            {event.location_link && (
                                <span className="location-link text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full text-xs">
                                    <i className="ri-map-2-line mr-1"></i>
                                    지도
                                </span>
                            )}
                        </div>
                        <EditBadge isStatic />

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
                        <div className="description-editor-row info-item group">
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
                            <EditBadge isStatic />
                        </div>
                    </div>

                    {/* Password Input - Moved below content */}
                    <div className="info-divider">
                        <div id="password-input-section" className="password-input-row info-item group" style={{ justifyContent: 'flex-end' }}>
                            <div className="password-input-container">
                                <i className="ri-lock-line text-gray-500 text-sm mr-1.5"></i>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword?.(e.target.value)}
                                    placeholder="비밀번호"
                                    className="password-input-field"
                                    maxLength={4}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>
                </div >
            </div >

            {/* Footer Actions */}
            < div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
                <div className="footer-actions-container">
                    {/* Link Input Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal(activeModal === 'link' ? null : 'link');
                        }}
                        className="link-action-btn action-button group"
                        title={link ? "링크 수정" : "링크 추가"}
                    >
                        <i className={`ri-external-link-line action-icon ${link ? 'text-blue-400' : 'text-gray-400'}`} style={{ fontSize: '1.25rem' }}></i>
                        <span className={`text-sm font-medium ${link ? 'text-blue-100' : 'text-gray-400'} truncate`}>
                            링크
                        </span>
                        <EditBadge isStatic />

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



                    {/* Delete Button */}
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="close-action-btn close-button"
                            title="삭제하기"
                            style={{ marginRight: '0.5rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                        >
                            <i className="ri-delete-bin-line action-icon"></i>
                        </button>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose?.();
                        }}
                        className="close-action-btn close-button"
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
                        className={`register-action-btn close-button ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="등록하기"
                    >
                        {isSubmitting ? '등록 중...' : '등록'}
                    </button>
                </div>
            </div >
        </div >
    );
});

export default EditableEventDetail;
