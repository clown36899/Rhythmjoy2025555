import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Event as BaseEvent } from '../pages/v2/utils/eventListUtils';
import { getGenreColorClass } from '../constants/genreColors';
import { useDefaultThumbnail } from '../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../utils/getEventThumbnail';
import { formatDateForInput } from '../utils/fileUtils';
import { isValidVideoUrl } from '../utils/videoEmbed';
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/domains/events.css"; // 2026 Pure Semantic CSS: Events Domain
import "../styles/components/EditableEventDetail.css";
import { parseDateSafe } from '../pages/v2/utils/eventListUtils';
import GlobalLoadingOverlay from './GlobalLoadingOverlay';
import LocalLoading from './LocalLoading';
import {
    buildDanceGenreOptions,
    getVisibleDanceScopeOptions,
    normalizeVisibleDanceScope,
    presetDanceGenreOptions,
    resolveDanceGenreInput,
    type DanceScope,
} from '../utils/danceTaxonomy';
import BenefitKindSelector, { type ManualBenefitKind } from './BenefitKindSelector';

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
    danceScope?: DanceScope;
    onDanceScopeChange?: (scope: DanceScope) => void;
    canUseExpandedDanceScopes?: boolean;
    benefitKind?: ManualBenefitKind;
    onBenefitKindChange?: (kind: ManualBenefitKind) => void;

}

// getGenreColor was removed in favor of getGenreColorClass from constants


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
    // onImagePositionChange, // 위치 이동 기능 제거로 인해 사용되지 않음
    videoUrl,
    onVideoChange,
    onVenueSelectClick,
    danceScope = 'swing',
    onDanceScopeChange,
    canUseExpandedDanceScopes = false,
    benefitKind = null,
    onBenefitKindChange,

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
    const [draftCategory, setDraftCategory] = useState<'event' | 'class' | 'club' | ''>('');
    const [draftDanceScope, setDraftDanceScope] = useState<DanceScope>('swing');
    const [draftGenre, setDraftGenre] = useState('');

    // Repositioning State - 기능을 제거하되 코드는 유지
    /*
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
    */


    const detailImageUrl = event.image || getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const hasImage = !!event.image;
    const currentLegacyGenreOption = React.useMemo(() => {
        const currentGenre = event.genre?.trim();
        if (!currentGenre || presetDanceGenreOptions.some((option) => option.label === currentGenre)) return null;
        return buildDanceGenreOptions([currentGenre]).find((option) => option.label === currentGenre) || null;
    }, [event.genre]);
    const genreOptions = React.useMemo(
        () => currentLegacyGenreOption
            ? [...presetDanceGenreOptions, currentLegacyGenreOption]
            : presetDanceGenreOptions,
        [currentLegacyGenreOption]
    );
    const scopeOptions = React.useMemo(
        () => getVisibleDanceScopeOptions(canUseExpandedDanceScopes),
        [canUseExpandedDanceScopes]
    );
    const allowedGenreOptions = React.useMemo(() => {
        if (canUseExpandedDanceScopes) return genreOptions;
        return genreOptions.filter((option) => option.scope === 'swing' || option.scope === 'unknown');
    }, [canUseExpandedDanceScopes, genreOptions]);
    const visibleGenreOptions = React.useMemo(() => {
        return allowedGenreOptions.filter((option) => (
            option.scope === draftDanceScope
            || (option.scope === 'unknown' && option.label === draftGenre)
        ));
    }, [allowedGenreOptions, draftDanceScope, draftGenre]);

    const openClassificationModal = React.useCallback(() => {
        const category = event.category === 'event' || event.category === 'class' || event.category === 'club'
            ? event.category
            : '';
        const fallbackScope = normalizeVisibleDanceScope(danceScope, canUseExpandedDanceScopes);
        const resolvedGenre = resolveDanceGenreInput(event.genre || '', {
            options: genreOptions,
            fallbackScope,
        });
        setDraftCategory(category);
        setDraftDanceScope(normalizeVisibleDanceScope(
            resolvedGenre.scope === 'unknown' ? fallbackScope : resolvedGenre.scope,
            canUseExpandedDanceScopes,
        ));
        setDraftGenre(resolvedGenre.label || event.genre?.trim() || '');
        setActiveModal('classification');
    }, [canUseExpandedDanceScopes, danceScope, event.category, event.genre, genreOptions]);

    const saveClassification = React.useCallback(() => {
        if (!draftCategory || !draftGenre) return;
        onUpdate('category', draftCategory);
        onUpdate('genre', draftGenre);
        onDanceScopeChange?.(draftDanceScope);
        setActiveModal(null);
    }, [draftCategory, draftDanceScope, draftGenre, onDanceScopeChange, onUpdate]);

    React.useImperativeHandle(ref, () => ({
        openModal: (modalType) => {
            if (modalType === 'classification' || modalType === 'genre') {
                openClassificationModal();
                return;
            }
            setActiveModal(modalType as typeof activeModal);
        }
    }), [openClassificationModal]);

    // formatDateStr was removed in favor of formatDateForInput from eventListUtils

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
                    <div className="EED-imageArea">
                        {hasImage || videoUrl ? (
                            <>
                                <div className="EED-imageBlur" style={{ backgroundImage: `url(${detailImageUrl})` }} />
                                <img
                                    src={detailImageUrl}
                                    alt={event.title}
                                    className="EED-image"
                                    style={{
                                        transform: `translate3d(${imagePosition.x}%, ${imagePosition.y}%, 0)`,
                                        transition: 'transform 0.2s ease-out'
                                    }}
                                />
                                <div className="EED-imageGradient" />

                                <div className="EED-imageControls">
                                    <div className="EED-imageControlGroup">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onImageUpload(); }}
                                            className="EED-imageControlBtn"
                                        >
                                            <i className="ri-image-edit-line"></i> 이미지 변경
                                        </button>
                                        {/* 위치 이동 기능 제거됨 */}
                                        {/* 
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setIsRepositioning(true); }}
                                                className="EED-imageControlBtn"
                                            >
                                                <i className="ri-drag-move-2-line"></i> 위치 이동
                                            </button>
                                            */}
                                        {/* 동영상 기능 일시 숨김 */}
                                        {/* 
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setTempVideoUrl(videoUrl || ""); setActiveModal('video'); }}
                                                className={`EED-imageControlBtn ${videoUrl ? 'is-active' : ''}`}
                                            >
                                                <i className="ri-youtube-line"></i> {videoUrl ? '동영상 수정' : '동영상 등록'}
                                            </button>
                                            */}
                                    </div>
                                </div>
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
                                {/* 동영상 등록 숨김 처리 */}
                                {/* 
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
                                */}
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
                                    role="button"
                                    tabIndex={0}
                                    aria-haspopup="dialog"
                                    aria-label="분류 및 장르 선택"
                                    onClick={(e) => { e.stopPropagation(); openClassificationModal(); }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openClassificationModal();
                                    }}
                                >
                                    <div className={`EED-category is-${event.category || 'default'}`}>
                                        {!event.category ? "분류" : (event.category === "class" ? "강습" : event.category === "club" ? "동호회" : "행사")}
                                    </div>
                                    <div className={`EED-genre ${getGenreColorClass(event.genre || '', 'genre-color')}`} style={{ borderColor: 'transparent' }}>
                                        {event.genre || <span className="EED-placeholder">장르 선택</span>}
                                    </div>
                                    <EditBadge isStatic />

                                    {activeModal === 'classification' && createPortal(
                                        <div className="EED-portal" onClick={(e) => e.stopPropagation()}>
                                            <div className="EED-backdrop" onClick={() => setActiveModal(null)} />
                                            <div
                                                className="EED-sheet EED-classificationSheet"
                                                role="dialog"
                                                aria-modal="true"
                                                aria-labelledby="EED-classificationTitle"
                                            >
                                                <div className="EED-sheetHandle"></div>
                                                <h3 id="EED-classificationTitle" className="EED-sheetHeader">
                                                    <i className="ri-music-2-line"></i> 분류 및 장르 선택
                                                </h3>
                                                <div className="EED-sheetBody">
                                                    <div className="EED-inputGroup">
                                                        <label className="EED-label">분류</label>
                                                        <div className="EED-classificationChoices">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    setDraftCategory('event');
                                                                }}
                                                                className={`EED-sheetBtn ${draftCategory === 'event' ? 'is-active' : ''}`}
                                                                aria-pressed={draftCategory === 'event'}
                                                            >
                                                                <span>행사</span>
                                                                {draftCategory === 'event' && <i className="ri-check-line"></i>}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    setDraftCategory('class');
                                                                }}
                                                                className={`EED-sheetBtn ${draftCategory === 'class' ? 'is-active' : ''}`}
                                                                aria-pressed={draftCategory === 'class'}
                                                            >
                                                                <span>외강</span>
                                                                {draftCategory === 'class' && <i className="ri-check-line"></i>}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    setDraftCategory('club');
                                                                }}
                                                                className={`EED-sheetBtn ${draftCategory === 'club' ? 'is-active' : ''}`}
                                                                aria-pressed={draftCategory === 'club'}
                                                            >
                                                                <span>동호회</span>
                                                                {draftCategory === 'club' && <i className="ri-check-line"></i>}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {draftCategory && (
                                                        <div className="EED-inputGroup">
                                                            <label className="EED-label">장르 범위</label>
                                                            <div className="EED-scopeRail">
                                                                {scopeOptions.map((scopeOption) => (
                                                                    <button
                                                                        key={scopeOption.key}
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.preventDefault(); e.stopPropagation();
                                                                            setDraftDanceScope(scopeOption.key);
                                                                            const selectedGenreOption = allowedGenreOptions.find((option) => option.label === draftGenre);
                                                                            if (selectedGenreOption
                                                                                && selectedGenreOption.scope !== scopeOption.key
                                                                                && selectedGenreOption.scope !== 'unknown') {
                                                                                setDraftGenre('');
                                                                            }
                                                                        }}
                                                                        className={`EED-scopeBtn ${draftDanceScope === scopeOption.key ? 'is-active' : ''}`}
                                                                        aria-pressed={draftDanceScope === scopeOption.key}
                                                                    >
                                                                        <strong>{scopeOption.label}</strong>
                                                                        <span>{scopeOption.desc}</span>
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            <label className="EED-label">세부 장르</label>
                                                            <div className="EED-genreGrid is-compact">
                                                                {visibleGenreOptions.map((option) => {
                                                                    const isActive = draftGenre === option.label;
                                                                    return (
                                                                        <button
                                                                            key={`${option.source || 'preset'}-${option.key}`}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.preventDefault(); e.stopPropagation();
                                                                                setDraftGenre(option.label);
                                                                                if (option.scope !== 'unknown') setDraftDanceScope(option.scope);
                                                                            }}
                                                                            className={`EED-genreBtn ${isActive ? 'is-active' : ''}`}
                                                                            aria-pressed={isActive}
                                                                        >
                                                                            <span>{option.label}</span>
                                                                            {option.source === 'event' && <small>기존</small>}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="EED-sheetActions EED-classificationFooter">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveModal(null)}
                                                        className="EED-sheetBtn"
                                                    >
                                                        취소
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={saveClassification}
                                                        className="EED-sheetBtn is-primary"
                                                        disabled={!draftCategory || !draftGenre}
                                                    >
                                                        <i className="ri-check-line"></i>
                                                        저장
                                                    </button>
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
                                            {(() => { console.log('[DEBUG] Rendering eventDates:', eventDates); return null; })()}
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
                                            const start = parseDateSafe(event.start_date);
                                            const end = event.end_date ? parseDateSafe(event.end_date) : null;
                                            const startStr = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()} 일`;
                                            return (end && start.getTime() !== end.getTime()) ? `${startStr} ~${end.getMonth() + 1}월 ${end.getDate()} 일` : startStr;
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
                                                            <span className="EED-dateValue">{date ? formatDateForInput(date) : '-'}</span>
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
                                                            console.log('[DEBUG] Selected Date Object (d):', d);
                                                            console.log('[DEBUG] d.toString():', d.toString());
                                                            console.log('[DEBUG] d.toISOString():', d.toISOString());

                                                            // DatePicker가 주는 Date 객체를 YYYY-MM-DD 문자열로 안전하게 변환
                                                            const dateStr = formatDateForInput(d);
                                                            console.log('[DEBUG] Formatted dateStr:', dateStr);

                                                            if (dateMode === 'single') {
                                                                const safeDate = parseDateSafe(dateStr);
                                                                console.log('[DEBUG] single mode safeDate:', safeDate);
                                                                setDate(safeDate);
                                                                setEndDate(safeDate);
                                                                setEventDates([]);
                                                            }
                                                            else {
                                                                console.log('[DEBUG] multi mode prev eventDates:', eventDates);
                                                                const newDates = eventDates.includes(dateStr)
                                                                    ? eventDates.filter(ed => ed !== dateStr)
                                                                    : [...eventDates, dateStr].sort();
                                                                console.log('[DEBUG] multi mode new eventDates:', newDates);
                                                                setEventDates(newDates);
                                                            }
                                                        }}
                                                        highlightDates={dateMode === 'dates' ? eventDates.map(d => parseDateSafe(d)) : undefined}
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
                    <BenefitKindSelector
                        className="EED-benefitField"
                        value={benefitKind}
                        onChange={(value) => onBenefitKindChange?.(value)}
                    />
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
                                {isDeleting ? <LocalLoading inline size="sm" color="white" /> : <i className="ri-delete-bin-line"></i>}
                            </button>
                        )}

                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveModal(activeModal === 'link' ? null : 'link'); }}
                            className="EED-actionBtn is-link group"
                        >
                            <span className={link ? 'is-active' : ''}>링크</span>
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
