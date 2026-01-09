import React, { useState, useRef, useEffect } from 'react';
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
import "../pages/v2/styles/EditableEventDetail.css";
import "../styles/components/InteractivePreview.css";
import GlobalLoadingOverlay from './GlobalLoadingOverlay';

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
    // password props removed - using RLS

    link?: string;
    setLink?: (link: string) => void;
    linkName?: string;
    setLinkName?: (linkName: string) => void;
    onRegister?: () => void;
    onClose?: () => void;
    isSubmitting?: boolean;
    onDelete?: () => void;
    isDeleting?: boolean;
    progress?: number;
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
    // Venue Selection
    onVenueSelectClick?: () => void;
    // Scope Selection
    scope?: "domestic" | "overseas";
    setScope?: (scope: "domestic" | "overseas") => void;
}

const genreColorPalette = [
    'genre-color-red', 'genre-color-orange', 'genre-color-amber', 'genre-color-yellow',
    'genre-color-lime', 'genre-color-green', 'genre-color-emerald', 'genre-color-teal',
    'genre-color-cyan', 'genre-color-sky', 'genre-color-blue', 'genre-color-indigo',
    'genre-color-violet', 'genre-color-purple', 'genre-color-fuchsia', 'genre-color-pink', 'genre-color-rose',
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

// Edit Badge Component
const EditBadge = ({ isStatic = false }: { isStatic?: boolean }) => (
    <div className={isStatic ? "editable-badge-wrapper" : "absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 editable-badge-wrapper"}>
        <i className="ri-add-line editable-badge-icon"></i>
    </div>
);

export interface EditableEventDetailRef {
    openModal: (modalType: 'genre' | 'location' | 'link' | 'date' | 'title' | 'video' | 'classification') => void;
}

const EditableEventDetail = React.forwardRef<EditableEventDetailRef, EditableEventDetailProps>(({
    event,
    onUpdate,
    onImageUpload,
    // genreSuggestions, // Unused
    className = "",
    // password props removed

    link,
    setLink,
    linkName,
    setLinkName,
    onRegister,
    onClose,
    isSubmitting,
    onDelete,
    isDeleting = false,
    progress,
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
    onVenueSelectClick,
    scope,
    setScope,
}, ref) => {
    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea logic
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [event.description]);

    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();
    const [activeModal, setActiveModal] = useState<'genre' | 'location' | 'link' | 'date' | 'title' | 'video' | 'imageSource' | 'classification' | 'description' | null>(null);

    React.useImperativeHandle(ref, () => ({
        openModal: (modalType) => {
            setActiveModal(modalType as any); // Cast to any to allow string but still type safe internal
        }
    }));
    // const titleRef = React.useRef<HTMLTextAreaElement>(null); // No longer needed

    // Date Picker Mode
    const [dateMode, setDateMode] = useState<'single' | 'range' | 'dates'>(() => {
        // Prevent 'dates' mode for class and club categories -> Removed restriction

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
    // const [customGenreInput, setCustomGenreInput] = useState(""); // Removed
    // const [showCustomGenreInput, setShowCustomGenreInput] = useState(false); // Removed

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


    // Use refs to store current values for event handlers to avoid stale closures
    const dragStartRef = React.useRef(dragStart);
    const startPosRef = React.useRef(startPos);
    const imagePositionRef = React.useRef(imagePosition);
    const onImagePositionChangeRef = React.useRef(onImagePositionChange);

    React.useEffect(() => {
        dragStartRef.current = dragStart;
        startPosRef.current = startPos;
        imagePositionRef.current = imagePosition;
        onImagePositionChangeRef.current = onImagePositionChange;
    }, [dragStart, startPos, imagePosition, onImagePositionChange]);

    // Attach global listeners for drag when active
    React.useEffect(() => {
        if (!isRepositioning) return;

        const handleGlobalMove = (e: MouseEvent) => {
            const currentDragStart = dragStartRef.current;
            const currentStartPos = startPosRef.current;

            if (!currentDragStart || !currentStartPos || !imageRef.current) return;

            const clientY = (e as MouseEvent).clientY;
            const deltaY = clientY - currentDragStart.y;
            const imgHeight = imageRef.current.offsetHeight || 1;
            const containerHeight = imageRef.current.parentElement?.offsetHeight || imgHeight;
            const deltaYPercent = (deltaY / imgHeight) * 100;
            let newX = currentStartPos.x;
            let newY = currentStartPos.y + deltaYPercent;
            const limitYPixels = Math.abs(imgHeight - containerHeight) / 2;
            const limitYPercent = (limitYPixels / imgHeight) * 100;
            newY = Math.max(-limitYPercent, Math.min(limitYPercent, newY));
            onImagePositionChangeRef.current?.({ x: newX, y: newY });
        };

        const handleGlobalUp = () => {
            setDragStart(null);
            setStartPos(null);
        };

        // Only add mouse listeners globally - touch is handled on image element
        window.addEventListener('mousemove', handleGlobalMove);
        window.addEventListener('mouseup', handleGlobalUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [isRepositioning]);


    const detailImageUrl = event.image || getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const hasImage = !!event.image;

    // handleSave removed // Unused

    // Helper to format date string YYYY-MM-DD
    const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Title Font Scaling Logic
    const titleRef = useRef<HTMLHeadingElement>(null);

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
        };

        adjustFontSize();
    }, [event.title]);

    return (
        <div
            className={`event-detail-modal-container ${className}`}
            style={{
                borderColor: "rgb(89, 89, 89)",
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden'
            }}
            onClick={() => setActiveModal(null)} // Close modals on background click
        >
            {/* Backdrop for Modals (Only if not using portal for some reason, but we are) */}
            {/* Keeping this as a fallback or for non-portal modals if any */}

            <div
                className="modal-scroll-container"
                style={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',

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
                                    transition: isRepositioning ? 'none' : 'transform 0.2s ease-out',
                                    touchAction: isRepositioning ? 'none' : 'auto' // Explicitly allow/disallow touch actions
                                }}
                                onMouseDown={isRepositioning ? handleMouseDown : undefined}
                                onTouchStart={isRepositioning ? handleMouseDown : undefined}
                            />
                            <div className="image-gradient-overlay" />

                            {/* Reposition Controls */}
                            {isRepositioning ? (
                                <div className="reposition-overlay">
                                    <div className="pointer-events-auto editable-flex-row editable-margin-top-auto editable-margin-bottom-lg">
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
                            <div className="image-upload-container">
                                {/* Image Upload */}
                                <div
                                    className="upload-option"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onImageUpload();
                                    }}
                                >
                                    <div className="upload-icon-circle">
                                        <i className="ri-image-add-line"></i>
                                    </div>
                                    <span className="upload-title">대표 이미지</span>
                                    <span className="upload-subtitle">클릭하여 업로드</span>
                                </div>

                                {/* Divider */}
                                <div className="upload-divider"></div>

                                {/* Video Upload */}
                                <div
                                    className="upload-option"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTempVideoUrl(videoUrl || "");
                                        setActiveModal('video');
                                    }}
                                >
                                    <div className="upload-icon-circle">
                                        <i className="ri-youtube-line"></i>
                                    </div>
                                    <span className="upload-title">{videoUrl ? '동영상 수정' : '동영상 등록'}</span>
                                    <div className="upload-video-info">
                                        <span className="upload-video-required">(선택, 유튜브만 가능)</span>
                                        <span className="upload-video-note">빌보드 전용</span>
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
                                    <p className="editable-video-desc">
                                        유튜브 영상 주소를 입력해주세요.<br />
                                        <span className="editable-error-text">
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
                                        <div className="editable-flex-row editable-width-full">
                                            <button
                                                onClick={() => {
                                                    setActiveModal(null);
                                                }}
                                                className="bottom-sheet-button editable-flex-1 editable-video-cancel-btn"
                                                style={{ backgroundColor: '', color: '' }}
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
                                                className="bottom-sheet-button editable-flex-1 editable-video-register-btn"
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
                {/* Info Column - Wraps sticky header + info section */}
                <div className="info-column">
                    {/* Sticky Header */}
                    <div
                        className="sticky-header"
                    >
                        <div className="header-selectors-container">
                            {/* Unified Classification (Category + Genre) Selector */}
                            <div
                                className="classification-selector group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.stopPropagation();
                                    // setShowCustomGenreInput(false); // Removed
                                    // setCustomGenreInput(""); // Removed
                                    setActiveModal('classification');
                                }}
                            >
                                {/* Category Badge part */}
                                <div className={`category-selector category-badge ${!event.category ? "default" : event.category}`}>
                                    {!event.category ? "분류" : (event.category === "class" ? "강습" : event.category === "club" ? "동호회" : "행사")}
                                </div>

                                {/* Genre Text part */}
                                <div className={`genre-text ${getGenreColor(event.genre || '')}`}>
                                    {event.genre || <span className="editable-genre-placeholder">장르 선택</span>}
                                </div>

                                <EditBadge isStatic />

                                {/* Classification (Category + Genre) Bottom Sheet Portal */}
                                {activeModal === 'classification' && createPortal(
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
                                                분류 및 장르 선택
                                            </h3>

                                            <div className="bottom-sheet-body">
                                                {/* Category Section */}
                                                <div className="editable-margin-bottom-lg">
                                                    <label className="bottom-sheet-label">분류</label>
                                                    <div className="editable-flex-row editable-width-full">
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('[EditableEventDetail] Clicked Category: Event');
                                                                if (event.category !== 'event') {
                                                                    onUpdate('category', 'event');
                                                                    onUpdate('genre', '');
                                                                }
                                                            }}
                                                            className={`editable-category-btn ${event.category === 'event' ? 'event-active' : ''}`}
                                                        >
                                                            <span className="editable-category-btn-text">행사</span>
                                                            {event.category === 'event' && <i className="ri-check-line"></i>}
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('[EditableEventDetail] Clicked Category: Class');
                                                                if (event.category !== 'class') {
                                                                    onUpdate('category', 'class');
                                                                    onUpdate('genre', '');
                                                                }
                                                            }}
                                                            className={`editable-category-btn ${event.category === 'class' ? 'class-active' : ''}`}
                                                        >
                                                            <span className="editable-category-btn-text">강습</span>
                                                            {event.category === 'class' && <i className="ri-check-line"></i>}
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('[EditableEventDetail] Clicked Category: Club');
                                                                if (event.category !== 'club') {
                                                                    onUpdate('category', 'club');
                                                                    onUpdate('genre', '');
                                                                }
                                                            }}
                                                            className={`editable-category-btn ${event.category === 'club' ? 'club-active' : ''}`}
                                                        >
                                                            <span className="editable-category-btn-text">동호회</span>
                                                            {event.category === 'club' && <i className="ri-check-line"></i>}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Scope Selection (Domestic vs Overseas) - Only for Events */}
                                                {event.category === 'event' && (
                                                    <div className="editable-margin-bottom-lg">
                                                        <label className="bottom-sheet-label">지역</label>
                                                        <div className="editable-flex-row editable-width-full">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setScope?.('domestic');
                                                                }}
                                                                className={`editable-category-btn ${scope === 'domestic' ? 'event-active' : ''}`}
                                                                style={scope !== 'domestic' ? { flex: 1, opacity: 0.5 } : { flex: 1 }}
                                                            >
                                                                <span className="editable-category-btn-text">🇰🇷 국내</span>
                                                                {scope === 'domestic' && <i className="ri-check-line"></i>}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setScope?.('overseas');
                                                                }}
                                                                className={`editable-category-btn ${scope === 'overseas' ? 'event-active' : ''}`}
                                                                style={scope === 'overseas'
                                                                    ? { flex: 1, background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)', borderColor: 'transparent', color: 'white' }
                                                                    : { flex: 1, opacity: 0.5 }
                                                                }
                                                            >
                                                                <span className="editable-category-btn-text">🌏 국외 (Global)</span>
                                                                {scope === 'overseas' && <i className="ri-check-line"></i>}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Genre Section - Only visible if category is selected */}
                                                {event.category && (
                                                    <>
                                                        <label className="bottom-sheet-label">장르</label>

                                                        {event.category === 'event' ? (
                                                            <div className="editable-flex-wrap">
                                                                {['워크샵', '파티', '대회', '기타'].map((option) => {
                                                                    const currentGenres = event.genre ? event.genre.split(',').map(s => s.trim()).filter(Boolean) : [];
                                                                    const isActive = currentGenres.includes(option);

                                                                    return (
                                                                        <button
                                                                            key={option}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();

                                                                                let newGenres = [];
                                                                                if (isActive) {
                                                                                    newGenres = currentGenres.filter(g => g !== option);
                                                                                } else {
                                                                                    let temp = [...currentGenres];
                                                                                    // Mutual Exclusivity: '파티' vs '대회'
                                                                                    if (option === '파티') {
                                                                                        temp = temp.filter(g => g !== '대회');
                                                                                    } else if (option === '대회') {
                                                                                        temp = temp.filter(g => g !== '파티');
                                                                                    }
                                                                                    newGenres = [...temp, option];
                                                                                }
                                                                                onUpdate('genre', newGenres.join(','));
                                                                            }}
                                                                            className={`editable-genre-btn ${isActive ? 'active' : ''}`}
                                                                        >
                                                                            {option}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className="genre-grid">
                                                                {(() => {
                                                                    // 정규강습은 '동호회(club)' 카테고리일 때만 노출
                                                                    const baseGenres = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                                                                    const genreList = event.category === 'club'
                                                                        ? ['정규강습', ...baseGenres]
                                                                        : baseGenres;

                                                                    return genreList.map(g => {
                                                                        const currentGenres = event.genre ? event.genre.split(',').map(s => s.trim()).filter(Boolean) : [];
                                                                        const isActive = currentGenres.includes(g);
                                                                        return (
                                                                            <button
                                                                                key={g}
                                                                                onClick={() => {
                                                                                    // Class: Single Select Logic
                                                                                    if (isActive) {
                                                                                        onUpdate('genre', '');
                                                                                    } else {
                                                                                        onUpdate('genre', g);
                                                                                    }
                                                                                }}
                                                                                className={`genre-grid-btn ${isActive ? 'active' : ''}`}
                                                                            >
                                                                                {g}
                                                                            </button>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>

                        <div
                            className="title-editor-container group"
                            onClick={(e) => {
                                e.stopPropagation();
                                setTempTitle(event.title);
                                setActiveModal('title');
                            }}
                        >
                            <h2 className={`title-text editable-title-text ${!event.title ? 'placeholder' : ''}`}>
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
                    </div>

                    {/* Info Section */}
                    <div className="info-section">
                        {/* Date                    */}
                        <div
                            id="date-selector-section"
                            className="date-selector-row editable-info-item"
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('[EditableEventDetail] 날짜 클릭!');
                                console.log('[EditableEventDetail] eventDates:', eventDates);
                                console.log('[EditableEventDetail] date:', date);
                                console.log('[EditableEventDetail] endDate:', endDate);
                                if (eventDates && eventDates.length > 0) {
                                    console.log('[EditableEventDetail] dateMode -> dates');
                                    setDateMode('dates');
                                } else if (date && endDate && date.getTime() !== endDate.getTime()) {
                                    console.log('[EditableEventDetail] dateMode -> range');
                                    setDateMode('range');
                                } else {
                                    console.log('[EditableEventDetail] dateMode -> single');
                                    setDateMode('single');
                                }
                                setActiveModal('date');
                            }}
                        >
                            <i className="ri-calendar-line editable-info-icon"></i>
                            <span className="editable-info-text-default">
                                {eventDates && eventDates.length > 0 ? (
                                    /* Multiple Dates Display: Chips in Main View */
                                    <div className="editable-flex-wrap editable-margin-top-auto editable-margin-bottom-lg">
                                        {eventDates.map(d => (
                                            <div
                                                key={d}
                                                className="selected-date-chip"
                                                style={{ margin: 0 }} /* Override margin for main view context */
                                            >
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
                                        ))}
                                    </div>
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
                                    <span className="editable-date-placeholder">날짜를 선택하세요</span>
                                )}
                            </span>
                            <EditBadge isStatic />

                            {/* Date Picker Bottom Sheet Portal */}
                            {(() => {
                                const shouldRender = activeModal === 'date' && setDate && setEndDate && setEventDates;
                                console.log('[EditableEventDetail] 날짜 모달 렌더링 조건:', shouldRender);
                                console.log('[EditableEventDetail] activeModal:', activeModal);
                                console.log('[EditableEventDetail] setDate:', !!setDate);
                                console.log('[EditableEventDetail] setEndDate:', !!setEndDate);
                                console.log('[EditableEventDetail] setEventDates:', !!setEventDates);
                                return shouldRender;
                            })() && createPortal(
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
                                        <div className="editable-flex-between bottom-sheet-header">
                                            <h3 className="editable-flex-row">
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
                                                        console.log('[EditableEventDetail] 개별 버튼 클릭!');
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

                                        <div className="bottom-sheet-body editable-flex-col-center editable-padding-bottom-xl">
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
                                                            console.log('[EditableEventDetail] Date clicked:', dateStr);
                                                            console.log('[EditableEventDetail] Current eventDates:', eventDates);
                                                            const newDates = eventDates.includes(dateStr)
                                                                ? eventDates.filter(ed => ed !== dateStr)
                                                                : [...eventDates, dateStr].sort();
                                                            console.log('[EditableEventDetail] New eventDates:', newDates);
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
                            className="location-selector-row editable-info-item"
                            onClick={(e) => {
                                e.stopPropagation();
                                // If onVenueSelectClick is provided, use venue selection instead of manual input
                                if (onVenueSelectClick) {
                                    console.log('🔘 Location clicked - opening venue selection');
                                    onVenueSelectClick();
                                } else {
                                    // Fallback to manual input
                                    setTempLocation(event.location);
                                    setTempLocationLink(event.location_link || "");
                                    setActiveModal('location');
                                }
                            }}
                        >
                            <i className="ri-map-pin-line editable-info-icon"></i>
                            <div className="editable-info-content">
                                <span className="editable-info-text-default">{event.location || <span className="editable-info-placeholder">장소를 입력하세요</span>}</span>
                                {event.location_link && (
                                    <span className="editable-location-link-badge">
                                        <i className="ri-map-2-line editable-location-link-icon"></i>
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
                            <div
                                className="description-editor-row editable-info-item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveModal('description');
                                }}
                            >
                                <i className="ri-file-text-line editable-info-icon"></i>
                                <div className="editable-info-content-wrapper">
                                    <div
                                        className="editable-description-textarea"
                                        style={{
                                            minHeight: '80px',
                                            cursor: 'pointer',
                                            whiteSpace: 'pre-wrap',
                                            color: event.description ? '#fff' : '#888',
                                            padding: '12px'
                                        }}
                                    >
                                        {event.description || '내용을 입력해주세요...'}
                                    </div>
                                </div>
                                <EditBadge isStatic />

                                {/* Description Bottom Sheet Portal */}
                                {activeModal === 'description' && createPortal(
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
                                                <i className="ri-file-text-line"></i>
                                                내용
                                            </h3>

                                            <div className="bottom-sheet-body">
                                                <div className="bottom-sheet-input-group">
                                                    <textarea
                                                        value={event.description || ''}
                                                        onChange={(e) => onUpdate('description', e.target.value)}
                                                        className="bottom-sheet-input"
                                                        style={{
                                                            minHeight: '400px',
                                                            resize: 'vertical'
                                                        }}
                                                        placeholder="내용을 입력해주세요..."
                                                        autoFocus
                                                    />
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
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="editable-footer">
                <div className="editable-footer-actions">
                    {/* Delete Button (Left Aligned) */}
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isDeleting) return;
                                if (window.confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
                                    onDelete();
                                }
                            }}
                            className={`editable-action-btn icon-only delete-btn ${isDeleting ? 'loading' : ''}`}
                            title="삭제"
                            style={{ marginRight: 'auto', color: '#ff6b6b', opacity: isDeleting ? 0.7 : 1, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <i className="ri-loader-4-line editable-action-icon spin-animation"></i> : <i className="ri-delete-bin-line editable-action-icon"></i>}
                        </button>
                    )}
                    {/* Link Input Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal(activeModal === 'link' ? null : 'link');
                        }}
                        className="editable-action-btn group"
                        title={link ? "링크 수정" : "링크 추가"}
                    >
                        <span className={`editable-link-btn-text ${link ? 'active' : ''}`}>
                            링크입력
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





                    {/* Close Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose?.();
                        }}
                        className="editable-action-btn icon-only"
                        title="닫기"
                    >
                        <i className="ri-close-line editable-action-icon"></i>
                    </button>

                    {/* Register Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegister?.();
                        }}
                        disabled={isSubmitting}
                        className="editable-action-btn editable-register-btn"
                        title="등록하기"
                    >
                        {isSubmitting ? '등록 중...' : '등록'}
                    </button>
                </div>
            </div>
            {createPortal(
                <GlobalLoadingOverlay
                    isLoading={isDeleting || (isSubmitting ?? false)}
                    message={isDeleting ? "삭제 중입니다..." : "저장 중입니다..."}
                    progress={isDeleting ? progress : undefined}
                />,
                document.body
            )}
        </div>
    );
});

export default EditableEventDetail;
