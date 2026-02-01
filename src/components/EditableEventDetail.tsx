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
import "../styles/domains/events.css"; // 2026 Pure Semantic CSS: Events Domain
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
    <div className={isStatic ? "EED-editBadge is-static" : "EED-editBadge is-floating"}>
        <i className="ri-add-line"></i>
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
            className={`EED-container ${className} ${(!detailImageUrl && !videoUrl) ? 'is-uploadMode' : ''}`}
            onClick={() => setActiveModal(null)}
        >
            <div className="EED-modalWrapper" onClick={(e) => e.stopPropagation()}>
                <div className="EED-scrollArea">
                    {/* Image Area */}
                    <div
                        className="EED-imageArea"
                        onClick={(e) => { e.stopPropagation(); onImageUpload(); }}
                    >
                        {hasImage || videoUrl ? (
                            <>
                                <div className="EED-imageBlur" style={{ backgroundImage: `url(${detailImageUrl})` }} />
                                <img
                                    ref={imageRef}
                                    src={detailImageUrl}
                                    alt={event.title}
                                    className={`EED-image ${isRepositioning ? 'is-moving' : ''}`}
                                    style={{
                                        transform: `translate3d(${imagePosition.x}%, ${imagePosition.y}%, 0)`,
                                        transition: isRepositioning ? 'none' : 'transform 0.2s ease-out'
                                    }}
                                    onMouseDown={isRepositioning ? handleMouseDown : undefined}
                                    onTouchStart={isRepositioning ? handleMouseDown : undefined}
                                />
                                <div className="EED-imageGradient" />

                                {isRepositioning ? (
                                    <div className="EED-repositionOverlay">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsRepositioning(false);
                                            }}
                                            className="EED-repositionBtn"
                                        >
                                            완료
                                        </button>
                                        <div className="EED-repositionHint">드래그하여 위치 이동</div>
                                    </div>
                                ) : (
                                    <div className="EED-imageControls">
                                        <div className="EED-imageControlGroup">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onImageUpload(); }}
                                                className="EED-imageControlBtn"
                                            >
                                                <i className="ri-image-edit-line"></i> 이미지 변경
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setIsRepositioning(true); }}
                                                className="EED-imageControlBtn"
                                            >
                                                <i className="ri-drag-move-2-line"></i> 위치 이동
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setTempVideoUrl(videoUrl || ""); setActiveModal('video'); }}
                                                className={`EED-imageControlBtn ${videoUrl ? 'is-active' : ''}`}
                                            >
                                                <i className="ri-youtube-line"></i> {videoUrl ? '동영상 수정' : '동영상 등록'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="EED-uploadContainer">
                                <div className="EED-uploadOption" onClick={(e) => { e.stopPropagation(); onImageUpload(); }}>
                                    <div className="EED-uploadIcon">
                                        <i className="ri-image-add-line"></i>
                                    </div>
                                    <span className="EED-uploadTitle">대표 이미지</span>
                                    <span className="EED-uploadSubtitle">클릭하여 업로드</span>
                                </div>
                                <div className="EED-uploadDivider"></div>
                                <div className="EED-uploadOption" onClick={(e) => { e.stopPropagation(); setTempVideoUrl(videoUrl || ""); setActiveModal('video'); }}>
                                    <div className="EED-uploadIcon">
                                        <i className="ri-youtube-line"></i>
                                    </div>
                                    <span className="EED-uploadTitle">{videoUrl ? '동영상 수정' : '동영상 등록'}</span>
                                    <div className="EED-uploadVideoInfo">
                                        <span className="EED-uploadVideoRequired">(선택, 유튜브만 가능)</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Video Modal Portal */}
                        {activeModal === 'video' && createPortal(
                            <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                <div className="EED-sheet">
                                    <div className="EED-sheetHandle"></div>
                                    <h3 className="EED-sheetHeader">
                                        <i className="ri-youtube-line"></i> 동영상 등록 (유튜브)
                                    </h3>
                                    <div className="EED-sheetBody">
                                        <p className="EED-sheetHint">
                                            유튜브 영상 주소를 입력해주세요.<br />
                                            <span className="is-error">* 주소를 지우고 등록하면 영상이 삭제됩니다.</span>
                                        </p>
                                        <div className="EED-inputGroup">
                                            <input
                                                value={tempVideoUrl}
                                                onChange={(e) => setTempVideoUrl(e.target.value)}
                                                className="EED-input"
                                                placeholder="https://youtu.be/..."
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="EED-sheetActions">
                                        <button onClick={() => setActiveModal(null)} className="EED-sheetBtn">취소</button>
                                        <button
                                            onClick={() => {
                                                if (tempVideoUrl.trim() && !isValidVideoUrl(tempVideoUrl)) {
                                                    alert("YouTube URL만 입력 가능합니다.");
                                                    return;
                                                }
                                                onVideoChange?.(tempVideoUrl);
                                                setActiveModal(null);
                                            }}
                                            className="EED-sheetBtn is-primary"
                                        >
                                            등록
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>

                    <div className="EED-infoColumn">
                        <div className="EED-stickyHeader">
                            <div className="EED-headerContent">
                                <div
                                    className="EED-classification"
                                    onClick={(e) => { e.stopPropagation(); setActiveModal('classification'); }}
                                >
                                    <div className={`EED-category is-${event.category || 'default'}`}>
                                        {!event.category ? "분류" : (event.category === "class" ? "강습" : event.category === "club" ? "동호회" : "행사")}
                                    </div>
                                    <div className={`EED-genre ${getGenreColor(event.genre || '')}`}>
                                        {event.genre || <span className="EED-placeholder">장르 선택</span>}
                                    </div>
                                    <EditBadge isStatic />

                                    {activeModal === 'classification' && createPortal(
                                        <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                            <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                            <div className="EED-sheet">
                                                <div className="EED-sheetHandle"></div>
                                                <h3 className="EED-sheetHeader">
                                                    <i className="ri-music-2-line"></i> 분류 및 장르 선택
                                                </h3>
                                                <div className="EED-sheetBody">
                                                    <div className="EED-inputGroup">
                                                        <label className="EED-label">분류</label>
                                                        <div className="EED-sheetActions">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    if (event.category !== 'event') { onUpdate('category', 'event'); onUpdate('genre', ''); }
                                                                }}
                                                                className={`EED-sheetBtn ${event.category === 'event' ? 'is-active' : ''}`}
                                                            >
                                                                <span>행사</span>
                                                                {event.category === 'event' && <i className="ri-check-line"></i>}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    if (event.category !== 'class') { onUpdate('category', 'class'); onUpdate('genre', ''); }
                                                                }}
                                                                className={`EED-sheetBtn ${event.category === 'class' ? 'is-active' : ''}`}
                                                            >
                                                                <span>강습</span>
                                                                {event.category === 'class' && <i className="ri-check-line"></i>}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    if (event.category !== 'club') { onUpdate('category', 'club'); onUpdate('genre', ''); }
                                                                }}
                                                                className={`EED-sheetBtn ${event.category === 'club' ? 'is-active' : ''}`}
                                                            >
                                                                <span>동호회</span>
                                                                {event.category === 'club' && <i className="ri-check-line"></i>}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {event.category === 'event' && (
                                                        <div className="EED-inputGroup">
                                                            <label className="EED-label">지역</label>
                                                            <div className="EED-sheetActions">
                                                                <button
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScope?.('domestic'); }}
                                                                    className={`EED-sheetBtn ${scope === 'domestic' ? 'is-active' : ''}`}
                                                                >
                                                                    <span>🇰🇷 국내</span>
                                                                    {scope === 'domestic' && <i className="ri-check-line"></i>}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScope?.('overseas'); }}
                                                                    className={`EED-sheetBtn is-overseas ${scope === 'overseas' ? 'is-active' : ''}`}
                                                                >
                                                                    <span>🌏 국외 (Global)</span>
                                                                    {scope === 'overseas' && <i className="ri-check-line"></i>}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {event.category && (
                                                        <div className="EED-inputGroup">
                                                            <label className="EED-label">장르</label>
                                                            {event.category === 'event' ? (
                                                                <div className="EED-genreGrid">
                                                                    {['워크샵', '파티', '대회', '기타'].map((option) => {
                                                                        const currentGenres = event.genre ? event.genre.split(',').map(s => s.trim()).filter(Boolean) : [];
                                                                        const isActive = currentGenres.includes(option);
                                                                        return (
                                                                            <button
                                                                                key={option}
                                                                                onClick={(e) => {
                                                                                    e.preventDefault(); e.stopPropagation();
                                                                                    let newGenres = isActive ? currentGenres.filter(g => g !== option) : [...currentGenres.filter(g => !(option === '파티' && g === '대회' || option === '대회' && g === '파티')), option];
                                                                                    onUpdate('genre', newGenres.join(','));
                                                                                }}
                                                                                className={`EED-genreBtn ${isActive ? 'is-active' : ''}`}
                                                                            >
                                                                                {option}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="EED-genreGrid is-columns">
                                                                    {(event.category === 'club' ? ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'] : ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']).map(g => {
                                                                        const isActive = event.genre === g;
                                                                        return (
                                                                            <button key={g} onClick={() => onUpdate('genre', isActive ? '' : g)} className={`EED-genreBtn ${isActive ? 'is-active' : ''}`}>
                                                                                {g}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>,
                                        document.body
                                    )}
                                </div>
                            </div>

                            <div
                                className="EED-titleSection"
                                onClick={(e) => { e.stopPropagation(); setTempTitle(event.title); setActiveModal('title'); }}
                            >
                                <h2 ref={titleRef} className={`EED-title ${!event.title ? 'is-placeholder' : ''}`}>
                                    {event.title || "제목을 입력하세요"}
                                </h2>
                                <EditBadge isStatic />

                                {activeModal === 'title' && createPortal(
                                    <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                        <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                        <div className="EED-sheet">
                                            <div className="EED-sheetHandle"></div>
                                            <h3 className="EED-sheetHeader">
                                                <i className="ri-text"></i> 제목 입력
                                            </h3>
                                            <div className="EED-sheetBody">
                                                <div className="EED-inputGroup">
                                                    <textarea
                                                        value={tempTitle}
                                                        onChange={(e) => setTempTitle(e.target.value)}
                                                        className="EED-input is-textarea"
                                                        placeholder="행사 제목을 입력하세요"
                                                        autoFocus
                                                        rows={3}
                                                    />
                                                </div>
                                            </div>
                                            <div className="EED-sheetActions">
                                                <button onClick={() => { onUpdate('title', tempTitle); setActiveModal(null); }} className="EED-sheetBtn is-primary">
                                                    저장
                                                </button>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>

                        <div className="EED-infoSection">
                            {/* Date */}
                            <div
                                className="EED-infoItem group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (eventDates && eventDates.length > 0) setDateMode('dates');
                                    else if (date && endDate && date.getTime() !== endDate.getTime()) setDateMode('range');
                                    else setDateMode('single');
                                    setActiveModal('date');
                                }}
                            >
                                <i className="ri-calendar-line EED-infoIcon"></i>
                                <div className="EED-infoValue">
                                    {eventDates && eventDates.length > 0 ? (
                                        <div className="EED-tagGroup">
                                            {eventDates.map(d => (
                                                <div key={d} className="EED-tag">
                                                    <span>{d.substring(5)}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEventDates?.(eventDates.filter(ed => ed !== d));
                                                        }}
                                                        className="EED-tagRemove"
                                                    >
                                                        <i className="ri-close-line"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : event.start_date ? (
                                        (() => {
                                            const start = new Date(event.start_date);
                                            const end = event.end_date ? new Date(event.end_date) : null;
                                            const startStr = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일`;
                                            return (end && start.getTime() !== end.getTime()) ? `${startStr} ~ ${end.getMonth() + 1}월 ${end.getDate()}일` : startStr;
                                        })()
                                    ) : (
                                        <span className="EED-placeholder">날짜를 선택하세요</span>
                                    )}
                                </div>
                                <EditBadge isStatic />

                                {activeModal === 'date' && setDate && setEndDate && setEventDates && createPortal(
                                    <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                        <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                        <div className="EED-sheet">
                                            <div className="EED-sheetHandle"></div>
                                            <div className="EED-sheetHeader is-between">
                                                <h3><i className="ri-calendar-check-line"></i> 날짜 선택</h3>
                                                <div className="EED-tabToggle">
                                                    <button onClick={() => { setDateMode('single'); setEventDates([]); setDate(null); setEndDate(null); }} className={`EED-tabBtn ${dateMode === 'single' ? 'is-active' : ''}`}>하루</button>
                                                    <button onClick={() => { setDateMode('dates'); setDate(null); setEndDate(null); }} className={`EED-tabBtn ${dateMode === 'dates' ? 'is-active' : ''}`}>개별</button>
                                                </div>
                                            </div>
                                            <div className="EED-sheetBody">
                                                <div className="EED-dateDisplay">
                                                    {dateMode === 'single' ? (
                                                        <div className="EED-dateBox is-active">
                                                            <span className="EED-dateLabel">선택일</span>
                                                            <span className="EED-dateValue">{date ? formatDateStr(date) : '-'}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="EED-tagGroup is-large">
                                                            {eventDates.length > 0 ? eventDates.map(d => (
                                                                <div key={d} className="EED-tag">
                                                                    <span>{d.substring(5)}</span>
                                                                    <button onClick={(e) => { e.stopPropagation(); setEventDates(eventDates.filter(ed => ed !== d)); }} className="EED-tagRemove"><i className="ri-close-line"></i></button>
                                                                </div>
                                                            )) : <span className="EED-placeholder">날짜 선택</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="EED-calendar">
                                                    <DatePicker
                                                        selected={dateMode === 'single' ? date : null}
                                                        onChange={(d: Date | null) => {
                                                            if (!d) return;
                                                            if (dateMode === 'single') { setDate(d); setEndDate(d); setEventDates([]); }
                                                            else {
                                                                const dateStr = formatDateStr(d);
                                                                setEventDates(eventDates.includes(dateStr) ? eventDates.filter(ed => ed !== dateStr) : [...eventDates, dateStr].sort());
                                                            }
                                                        }}
                                                        highlightDates={dateMode === 'dates' ? eventDates.map(d => new Date(d)) : undefined}
                                                        locale={ko} inline shouldCloseOnSelect={false}
                                                    />
                                                </div>
                                            </div>
                                            <div className="EED-sheetActions">
                                                <button
                                                    onClick={() => {
                                                        if (dateMode === 'single') { if (date) { onUpdate('date', formatDateForInput(date)); onUpdate('end_date', formatDateForInput(date)); onUpdate('event_dates', []); setActiveModal(null); } }
                                                        else { onUpdate('event_dates', eventDates); onUpdate('date', null); onUpdate('end_date', null); setActiveModal(null); }
                                                    }}
                                                    className="EED-sheetBtn is-primary"
                                                    disabled={dateMode === 'single' && !date}
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
                                className="EED-infoItem group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onVenueSelectClick) onVenueSelectClick();
                                    else { setTempLocation(event.location); setTempLocationLink(event.location_link || ""); setActiveModal('location'); }
                                }}
                            >
                                <i className="ri-map-pin-line EED-infoIcon"></i>
                                <div className="EED-infoValue">
                                    <span>{event.location || <span className="EED-placeholder">장소를 입력하세요</span>}</span>
                                    {event.location_link && <span className="EED-badge">지도</span>}
                                </div>
                                <EditBadge isStatic />

                                {activeModal === 'location' && createPortal(
                                    <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                        <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                        <div className="EED-sheet">
                                            <div className="EED-sheetHandle"></div>
                                            <h3 className="EED-sheetHeader"><i className="ri-map-pin-user-line"></i> 장소 정보 입력</h3>
                                            <div className="EED-sheetBody">
                                                <div className="EED-inputGroup">
                                                    <label className="EED-label">장소명</label>
                                                    <input value={tempLocation} onChange={(e) => setTempLocation(e.target.value)} className="EED-input" placeholder="예: 강남역 1번출구" autoFocus />
                                                </div>
                                                <div className="EED-inputGroup">
                                                    <label className="EED-label">지도 링크 (선택)</label>
                                                    <div className="EED-inputWrapper">
                                                        <i className="ri-link EED-inputIcon"></i>
                                                        <input value={tempLocationLink} onChange={(e) => setTempLocationLink(e.target.value)} className="EED-input" placeholder="네이버/카카오맵 URL" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="EED-sheetActions">
                                                <button onClick={() => { onUpdate('location', tempLocation); onUpdate('location_link', tempLocationLink); setActiveModal(null); }} className="EED-sheetBtn is-primary">저장</button>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>

                            {/* Description */}
                            <div className="EED-infoItem is-description group" onClick={(e) => { e.stopPropagation(); setActiveModal('description'); }}>
                                <i className="ri-file-text-line EED-infoIcon"></i>
                                <div className="EED-descriptionPreview">
                                    {event.description || '내용을 입력해주세요...'}
                                </div>
                                <EditBadge isStatic />

                                {activeModal === 'description' && createPortal(
                                    <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                        <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                        <div className="EED-sheet">
                                            <div className="EED-sheetHandle"></div>
                                            <h3 className="EED-sheetHeader"><i className="ri-file-text-line"></i> 내용</h3>
                                            <div className="EED-sheetBody">
                                                <div className="EED-inputGroup">
                                                    <textarea
                                                        value={event.description || ''}
                                                        onChange={(e) => onUpdate('description', e.target.value)}
                                                        className="EED-input is-textarea"
                                                        style={{ minHeight: '300px' }}
                                                        placeholder="내용을 입력해주세요..."
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            <div className="EED-sheetActions">
                                                <button onClick={() => setActiveModal(null)} className="EED-sheetBtn is-primary">완료</button>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="EED-footer">
                    <div className="EED-footerActions">
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isDeleting) return;
                                    if (window.confirm("정말로 이 이벤트를 삭제하시겠습니까?")) onDelete();
                                }}
                                className={`EED-actionBtn is-delete ${isDeleting ? 'is-loading' : ''}`}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <i className="ri-loader-4-line EED-spin"></i> : <i className="ri-delete-bin-line"></i>}
                            </button>
                        )}

                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveModal(activeModal === 'link' ? null : 'link'); }}
                            className="EED-actionBtn is-link group"
                        >
                            <span className={link ? 'is-active' : ''}>링크입력</span>
                            <EditBadge isStatic />

                            {activeModal === 'link' && createPortal(
                                <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                    <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                    <div className="EED-sheet">
                                        <div className="EED-sheetHandle"></div>
                                        <h3 className="EED-sheetHeader"><i className="ri-link-m"></i> 외부 링크 연결</h3>
                                        <div className="EED-sheetBody">
                                            <div className="EED-inputGroup">
                                                <label className="EED-label">버튼 이름</label>
                                                <input value={linkName} onChange={(e) => setLinkName?.(e.target.value)} placeholder="예: 신청서 작성" className="EED-input" autoFocus />
                                            </div>
                                            <div className="EED-inputGroup">
                                                <label className="EED-label">URL 주소</label>
                                                <div className="EED-inputWrapper">
                                                    <i className="ri-global-line EED-inputIcon"></i>
                                                    <input value={link} onChange={(e) => setLink?.(e.target.value)} placeholder="https://..." className="EED-input" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="EED-sheetActions">
                                            <button onClick={() => setActiveModal(null)} className="EED-sheetBtn is-primary">완료</button>
                                        </div>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </button>

                        <button onClick={(e) => { e.stopPropagation(); onClose?.(); }} className="EED-actionBtn is-close">
                            <i className="ri-close-line"></i>
                        </button>

                        <button onClick={(e) => { e.stopPropagation(); onRegister?.(); }} disabled={isSubmitting} className="EED-actionBtn is-register">
                            {isSubmitting ? '등록 중...' : '등록'}
                        </button>
                    </div>
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
