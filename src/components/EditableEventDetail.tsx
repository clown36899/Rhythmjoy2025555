import React, { useState, useEffect } from 'react';
import type { Event as BaseEvent } from '../lib/supabase';
import { useDefaultThumbnail } from '../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../utils/getEventThumbnail';
import "../styles/components/EventDetailModal.css";
import "../styles/components/InteractivePreview.css";

interface Event extends BaseEvent {
    storage_path?: string | null;
    genre?: string | null;
}

interface EditableEventDetailProps {
    event: Event;
    onUpdate: (field: string, value: any) => void;
    onImageUpload: () => void;
    onDateClick: () => void;
    genreSuggestions: string[];
    className?: string;
    style?: React.CSSProperties;
    // Footer Props
    password?: string;
    setPassword?: (value: string) => void;
    link?: string;
    setLink?: (value: string) => void;
    linkName?: string;
    setLinkName?: (value: string) => void;
    onRegister?: () => void;
    onClose?: () => void;
    isSubmitting?: boolean;
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
const EditBadge = () => (
    <div className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10 border border-white/20">
        <i className="ri-add-line text-xs font-bold"></i>
    </div>
);

export default function EditableEventDetail({
    event,
    onUpdate,
    onImageUpload,
    onDateClick,
    genreSuggestions,
    className = "",
    style = {},
    password = "",
    setPassword,
    link = "",
    setLink,
    linkName = "",
    setLinkName,
    onRegister,
    onClose,
    isSubmitting = false
}: EditableEventDetailProps) {
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();
    const [activeModal, setActiveModal] = useState<string | null>(null);

    // Local state for modals
    const [tempTitle, setTempTitle] = useState("");
    const [tempLocation, setTempLocation] = useState("");
    const [tempLocationLink, setTempLocationLink] = useState("");
    const [tempDescription, setTempDescription] = useState("");
    const [customGenreInput, setCustomGenreInput] = useState("");
    const [showCustomGenreInput, setShowCustomGenreInput] = useState(false);

    // Initialize local state when modal opens
    useEffect(() => {
        if (activeModal === 'title') setTempTitle(event.title);
        if (activeModal === 'location') {
            setTempLocation(event.location);
            setTempLocationLink(event.location_link || "");
        }
        if (activeModal === 'description') setTempDescription(event.description);
        if (activeModal === 'genre') {
            setShowCustomGenreInput(false);
            setCustomGenreInput("");
        }
    }, [activeModal, event]);

    const detailImageUrl = event.image || getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const hasImage = !!event.image;

    const handleSave = (field: string, value: any) => {
        onUpdate(field, value);
        setActiveModal(null);
    };

    return (
        <div
            className={`event-detail-modal-container ${className}`}
            style={{ borderColor: "rgb(89, 89, 89)", ...style }}
            onClick={() => setActiveModal(null)} // Close modals on background click
        >
            <div
                className="modal-scroll-container"
                style={{
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch'
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

                        {/* Genre Modal */}
                        {activeModal === 'genre' && (
                            <div
                                className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl z-50 w-64"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-white font-bold mb-2 text-xs">장르 선택</h3>
                                {showCustomGenreInput ? (
                                    <div className="flex gap-2">
                                        <input
                                            value={customGenreInput}
                                            onChange={(e) => setCustomGenreInput(e.target.value)}
                                            className="flex-1 bg-gray-900 text-white px-2 py-1 rounded text-sm border border-gray-700 outline-none"
                                            placeholder="직접 입력"
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => handleSave('genre', customGenreInput)}
                                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                                        >
                                            확인
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                                        <button
                                            onClick={() => setShowCustomGenreInput(true)}
                                            className="text-left px-2 py-1.5 text-blue-400 hover:bg-gray-700 rounded text-sm font-bold"
                                        >
                                            + 직접 입력
                                        </button>
                                        {genreSuggestions.map(g => (
                                            <button
                                                key={g}
                                                onClick={() => handleSave('genre', g)}
                                                className="text-left px-2 py-1.5 text-gray-300 hover:bg-gray-700 rounded text-sm"
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <div
                        className="relative group cursor-pointer mt-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal('title');
                        }}
                    >
                        <EditBadge />
                        <h2 className="modal-title">
                            {event.title || <span className="text-gray-500">제목을 입력하세요</span>}
                        </h2>

                        {/* Title Modal */}
                        {activeModal === 'title' && (
                            <div
                                className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl z-50 w-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-white font-bold mb-2 text-xs">제목 입력</h3>
                                <input
                                    value={tempTitle}
                                    onChange={(e) => setTempTitle(e.target.value)}
                                    className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 outline-none mb-2"
                                    placeholder="제목"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave('title', tempTitle)}
                                />
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => handleSave('title', tempTitle)}
                                        className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium"
                                    >
                                        확인
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Section */}
                <div className="info-section">
                    {/* Date */}
                    <div
                        className="info-item cursor-pointer relative group"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDateClick();
                        }}
                    >
                        <EditBadge />
                        <i className="ri-calendar-line info-icon"></i>
                        <span>
                            {event.start_date ? (
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
                    </div>

                    {/* Location */}
                    <div
                        className="info-item relative group cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal('location');
                        }}
                    >
                        <EditBadge />
                        <i className="ri-map-pin-line info-icon"></i>
                        <div className="info-flex-gap-1 w-full">
                            <span>{event.location || <span className="text-gray-500">장소를 입력하세요</span>}</span>
                            {event.location_link && (
                                <span className="location-link text-blue-400">
                                    <i className="ri-external-link-line location-link-icon"></i>
                                </span>
                            )}
                        </div>

                        {/* Location Modal */}
                        {activeModal === 'location' && (
                            <div
                                className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl z-50 w-72"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-white font-bold mb-2 text-xs">장소 입력</h3>
                                <div className="flex flex-col gap-2">
                                    <input
                                        value={tempLocation}
                                        onChange={(e) => setTempLocation(e.target.value)}
                                        className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 outline-none"
                                        placeholder="장소명 (예: 강남역 1번출구)"
                                        autoFocus
                                    />
                                    <input
                                        value={tempLocationLink}
                                        onChange={(e) => setTempLocationLink(e.target.value)}
                                        className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 outline-none"
                                        placeholder="지도 링크 (선택)"
                                    />
                                    <div className="flex justify-end mt-1">
                                        <button
                                            onClick={() => {
                                                onUpdate('location', tempLocation);
                                                onUpdate('location_link', tempLocationLink);
                                                setActiveModal(null);
                                            }}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium"
                                        >
                                            확인
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="info-divider">
                        <div
                            className="info-item items-start relative group cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveModal('description');
                            }}
                        >
                            <EditBadge />
                            <i className="ri-file-text-line info-icon mt-1"></i>
                            <div className="info-item-content w-full">
                                <p className="whitespace-pre-wrap text-gray-300 min-h-[3rem]">
                                    {event.description || <span className="text-gray-500">내용을 입력하세요...</span>}
                                </p>
                            </div>

                            {/* Description Modal */}
                            {activeModal === 'description' && (
                                <div
                                    className="absolute top-8 left-0 right-0 bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl z-50"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3 className="text-white font-bold mb-2 text-xs">내용 입력</h3>
                                    <textarea
                                        value={tempDescription}
                                        onChange={(e) => setTempDescription(e.target.value)}
                                        className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 outline-none min-h-[150px]"
                                        placeholder="내용을 입력하세요..."
                                        autoFocus
                                    />
                                    <div className="flex justify-end mt-2">
                                        <button
                                            onClick={() => handleSave('description', tempDescription)}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium"
                                        >
                                            확인
                                        </button>
                                    </div>
                                </div>
                            )}
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
                        className="footer-link relative"
                        title={link ? "링크 수정" : "링크 추가"}
                    >
                        <i className="ri-external-link-line footer-link-icon"></i>
                        <span className="footer-link-text">
                            {linkName || (link ? "링크" : "링크 추가")}
                        </span>

                        {/* Link Input Popover */}
                        {activeModal === 'link' && (
                            <div
                                className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-xl z-50 w-72"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-white font-bold mb-3 text-sm">링크 입력</h3>
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">링크 명 (예: 신청서, 인스타)</label>
                                        <input
                                            value={linkName}
                                            onChange={(e) => setLinkName?.(e.target.value)}
                                            placeholder="링크 이름"
                                            className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 focus:border-blue-500 outline-none"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">URL (https://...)</label>
                                        <input
                                            value={link}
                                            onChange={(e) => setLink?.(e.target.value)}
                                            placeholder="URL을 입력하세요"
                                            className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 mt-1">
                                        <button
                                            onClick={() => setActiveModal(null)}
                                            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                                        >
                                            완료
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </button>
                </div>

                <div className="footer-actions-container">
                    {/* Password Input */}
                    <div className="flex items-center gap-2">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword?.(e.target.value)}
                            placeholder="비밀번호"
                            className="bg-gray-800 text-white px-2 py-1.5 rounded text-xs border border-gray-700 focus:border-blue-500 outline-none w-20 text-center h-12"
                            maxLength={4}
                            onClick={(e) => e.stopPropagation()}
                        />
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
