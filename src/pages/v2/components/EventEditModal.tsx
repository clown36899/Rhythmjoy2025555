import { useState, useEffect, forwardRef, memo } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import { createResizedImages } from "../../../utils/imageResize";
import { parseVideoUrl } from "../../../utils/videoEmbed";
import {
    getVideoThumbnailOptions,
    downloadThumbnailAsBlob,
    type VideoThumbnailOption,
} from "../../../utils/videoThumbnail";
import { formatDateForInput } from "../../../utils/fileUtils";
import CustomDatePickerHeader from "../../../components/CustomDatePickerHeader";

// ForwardRef 커스텀 입력 컴포넌트
interface CustomInputProps {
    value?: string;
    onClick?: () => void;
}

const CustomDateInput = forwardRef<HTMLButtonElement, CustomInputProps>(
    ({ value, onClick }, ref) => (
        <button
            type="button"
            ref={ref}
            onClick={onClick}
            className="evt-date-input-btn"
        >
            {value || "날짜 선택"}
        </button>
    )
);
CustomDateInput.displayName = "CustomDateInput";

interface ExtendedEvent extends Event {
    genre?: string;
    storage_path?: string | null;
}

interface EventEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: ExtendedEvent;
    isAdminMode: boolean;
    onEventUpdated: () => void;
    onDelete: (event: ExtendedEvent) => void;
    allGenres: string[];
}

import "../styles/EventEditModal.css";
// import "../../../styles/components/EventEditModal.css"; // Removed as we want to fully rely on new styles, but double check if any are missing.
// Based on my analysis, I moved most used styles. If something is missing, I can add it to the new file.
import { EventCard } from "./EventCard";

// ... existing imports ...

export default memo(function EventEditModal({
    isOpen,
    onClose,
    event,
    onEventUpdated,
    onDelete,
    allGenres,
}: EventEditModalProps) {
    const [editFormData, setEditFormData] = useState({
        title: "",
        description: "",
        genre: "",
        time: "",
        location: "",
        locationLink: "",
        category: "",
        organizer: "",
        organizerName: "",
        organizerPhone: "",
        contact: "",
        link1: "",
        link2: "",
        link3: "",
        linkName1: "",
        linkName2: "",
        linkName3: "",
        image: "",
        start_date: "",
        end_date: "",
        event_dates: [] as string[],
        dateMode: "range" as "range" | "specific",
        videoUrl: "",
        showTitleOnBillboard: true,
    });

    const [editImageFile, setEditImageFile] = useState<File | null>(null);
    const [editImagePreview, setEditImagePreview] = useState<string>("");
    const [editVideoPreview, setEditVideoPreview] = useState<{
        provider: string | null;
        embedUrl: string | null;
    }>({ provider: null, embedUrl: null });
    const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
    const [thumbnailOptions, setThumbnailOptions] = useState<
        VideoThumbnailOption[]
    >([]);


    // Preview Mode State
    const [previewMode, setPreviewMode] = useState<'card' | 'billboard'>('card');

    const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
    const [isGenreInputFocused, setIsGenreInputFocused] = useState(false);

    // 모달 열릴 때 데이터 초기화
    useEffect(() => {
        if (isOpen && event) {
            // 날짜 모드 결정
            let dateMode: "range" | "specific" = "range";
            if (event.event_dates && event.event_dates.length > 0) {
                dateMode = "specific";
            }

            setEditFormData({
                title: event.title || "",
                description: event.description || "",
                genre: event.genre || "",
                time: event.time || "",
                location: event.location || "",
                locationLink: event.location_link || "",
                category: event.category || "event",
                organizer: event.organizer || "",
                organizerName: event.organizer_name || "",
                organizerPhone: event.organizer_phone || "",
                contact: event.contact || "",
                link1: event.link1 || "",
                link2: event.link2 || "",
                link3: event.link3 || "",
                linkName1: event.link_name1 || "",
                linkName2: event.link_name2 || "",
                linkName3: event.link_name3 || "",
                image: event.image || "",
                start_date: event.start_date || event.date || "",
                end_date: event.end_date || event.date || "",
                event_dates: event.event_dates || [],
                dateMode: dateMode,
                videoUrl: event.video_url || "",
                showTitleOnBillboard: event.show_title_on_billboard !== false,
            });

            setEditImagePreview(event.image || "");
            setEditImageFile(null);

            // 비디오 URL 파싱 및 미리보기 설정
            if (event.video_url) {
                const videoInfo = parseVideoUrl(event.video_url);
                if (videoInfo.provider && videoInfo.embedUrl) {
                    setEditVideoPreview({
                        provider: videoInfo.provider,
                        embedUrl: videoInfo.embedUrl,
                    });
                } else {
                    setEditVideoPreview({ provider: null, embedUrl: null });
                }
            } else {
                setEditVideoPreview({ provider: null, embedUrl: null });
            }
        }
    }, [isOpen, event]);

    const handleEditImageChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                // 이미지 리사이징 (미리보기용)
                const resizedImages = await createResizedImages(file);
                setEditImageFile(file);

                // Use Data URL for preview to avoid ERR_UPLOAD_FILE_CHANGED
                const reader = new FileReader();
                reader.onload = (e) => {
                    setEditImagePreview(e.target?.result as string);
                };
                reader.readAsDataURL(resizedImages.medium);
            } catch (error) {
                console.error("Image resize error:", error);
                alert("이미지 처리 중 오류가 발생했습니다.");
            }
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;

        try {
            // 필수값 검증
            if (!editFormData.title.trim()) {
                alert("이벤트 제목을 입력해주세요.");
                return;
            }

            // 날짜 검증
            if (editFormData.dateMode === "range") {
                if (!editFormData.start_date) {
                    alert("시작일을 선택해주세요.");
                    return;
                }
                if (!editFormData.end_date) {
                    alert("종료일을 선택해주세요.");
                    return;
                }
            } else {
                if (editFormData.event_dates.length === 0) {
                    alert("최소 하나의 날짜를 선택해주세요.");
                    return;
                }
            }

            const updateData: any = {
                title: editFormData.title,
                description: editFormData.description,
                genre: editFormData.genre,
                time: editFormData.time,
                location: editFormData.location,
                location_link: editFormData.locationLink,
                category: editFormData.category,
                organizer: editFormData.organizer,
                organizer_name: editFormData.organizerName,
                organizer_phone: editFormData.organizerPhone,
                contact: editFormData.contact,
                link1: editFormData.link1,
                link2: editFormData.link2,
                link3: editFormData.link3,
                link_name1: editFormData.linkName1,
                link_name2: editFormData.linkName2,
                link_name3: editFormData.linkName3,
                video_url: editFormData.videoUrl,
                show_title_on_billboard: editFormData.showTitleOnBillboard,
            };

            // 날짜 데이터 처리
            if (editFormData.dateMode === "range") {
                updateData.start_date = editFormData.start_date;
                updateData.end_date = editFormData.end_date;
                updateData.date = editFormData.start_date; // 호환성 유지
                updateData.event_dates = null; // 범위 모드일 때는 개별 날짜 배열 초기화
            } else {
                // 특정 날짜 모드
                // 날짜 배열 정렬
                const sortedDates = [...editFormData.event_dates].sort();
                updateData.event_dates = sortedDates;
                updateData.start_date = sortedDates[0];
                updateData.end_date = sortedDates[sortedDates.length - 1];
                updateData.date = sortedDates[0]; // 호환성 유지
            }

            // 기존 이미지 삭제 로직 (함수로 분리)
            const deleteOldImages = async () => {
                // [새 방식] 폴더 단위 삭제
                if (event.storage_path) {
                    console.log(`[수정] 기존 폴더 삭제: ${event.storage_path}`);
                    const { data: files } = await supabase.storage
                        .from("images")
                        .list(event.storage_path);
                    if (files && files.length > 0) {
                        const paths = files.map((f) => `${event.storage_path}/${f.name}`);
                        await supabase.storage.from("images").remove(paths);
                    }
                }
                // [레거시 방식] 기존 이미지가 URL 방식이면 개별 파일 삭제
                else if (event.image || event.image_full) {
                    console.log("[수정] 기존 개별 파일 삭제");
                    const extractStoragePath = (
                        url: string | null | undefined,
                    ): string | null => {
                        if (!url) return null;
                        try {
                            const match = url.match(
                                /\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/,
                            );
                            return match ? decodeURIComponent(match[1]) : null;
                        } catch (e) {
                            return null;
                        }
                    };
                    const paths = [
                        ...new Set(
                            [
                                event.image,
                                event.image_thumbnail,
                                event.image_medium,
                                event.image_full,
                            ]
                                .map(extractStoragePath)
                                .filter((p): p is string => !!p),
                        ),
                    ];
                    if (paths.length > 0) {
                        await supabase.storage.from("images").remove(paths);
                    }
                }
            };

            // Case 1: 새 이미지가 업로드된 경우 (교체)
            if (editImageFile) {
                console.log(
                    "[수정] 새 이미지 감지. 기존 파일 정리 및 새 파일 업로드.",
                );
                await deleteOldImages();

                // 새 이미지 업로드 (WebP 변환)
                const resizedImages = await createResizedImages(editImageFile);
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 15);
                const basePath = `event-posters`;

                // WebP 확장자 강제 사용
                const fileName = `${timestamp}_${randomString}.webp`;

                const uploadPromises = [
                    { key: "micro", folder: "micro" },
                    { key: "thumbnail", folder: "thumbnails" },
                    { key: "medium", folder: "medium" },
                    { key: "full", folder: "full" },
                ].map(async ({ key, folder }) => {
                    const file = resizedImages[key as keyof typeof resizedImages];
                    const path = `${basePath}/${folder}/${fileName}`;
                    const { error } = await supabase.storage
                        .from("images")
                        .upload(path, file, { cacheControl: "31536000" });
                    if (error)
                        throw new Error(`${key} upload failed: ${error.message}`);
                    return {
                        key,
                        url: supabase.storage.from("images").getPublicUrl(path).data
                            .publicUrl,
                    };
                });

                const results = await Promise.all(uploadPromises);
                const urls = Object.fromEntries(results.map((r) => [r.key, r.url]));

                updateData.image = urls.full;
                updateData.image_micro = urls.micro;
                updateData.image_thumbnail = urls.thumbnail;
                updateData.image_medium = urls.medium;
                updateData.image_full = urls.full;
                updateData.storage_path = null; // 폴더 구조 변경으로 사용 안 함
            }
            // Case 2: 기존 이미지가 삭제된 경우 (새 이미지 없음)
            else if (!editImagePreview && (event.image || event.image_full)) {
                console.log("[수정] 이미지 삭제 감지. 기존 파일 정리.");
                await deleteOldImages();

                // DB 필드 초기화
                updateData.image = "";
                updateData.image_micro = null;
                updateData.image_thumbnail = null;
                updateData.image_medium = null;
                updateData.image_full = null;
                updateData.storage_path = null;
            }

            const { error } = await supabase
                .from("events")
                .update(updateData)
                .eq("id", event.id);

            if (error) {
                console.error("Error updating event:", error);
                alert("이벤트 수정 중 오류가 발생했습니다.");
            } else {
                alert("이벤트가 수정되었습니다.");
                onEventUpdated();
                onClose();
            }
        } catch (error) {
            console.error("Error:", error);
            alert("이벤트 수정 중 오류가 발생했습니다.");
        }
    };

    const handleGenreSuggestionClick = (genre: string) => {
        setEditFormData((prev) => ({ ...prev, genre }));
        setGenreSuggestions([]);
    };

    const handleGenreFocus = () => {
        setIsGenreInputFocused(true);
        setGenreSuggestions(allGenres);
    };

    // 썸네일 선택 핸들러
    const handleThumbnailSelect = async (option: VideoThumbnailOption) => {
        try {
            const blob = await downloadThumbnailAsBlob(option.url);
            if (!blob) throw new Error("썸네일 다운로드 실패");
            const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });

            // 이미지 변경 핸들러와 동일한 로직 수행
            const resizedImages = await createResizedImages(file);
            setEditImageFile(file);
            setEditImagePreview(URL.createObjectURL(resizedImages.medium));
            setShowThumbnailSelector(false);
        } catch (error) {
            console.error("썸네일 선택 오류:", error);
            alert("썸네일을 적용하는 중 오류가 발생했습니다.");
        }
    };

    // Preview Event Object Construction
    const previewEvent: ExtendedEvent = {
        ...event,
        id: event?.id || 0, // Temporary ID for preview
        title: editFormData.title || "제목을 입력하세요",
        genre: editFormData.genre,
        category: editFormData.category,
        image: editImagePreview || editFormData.image, // Use preview image if available
        start_date: editFormData.dateMode === 'range' ? editFormData.start_date : (editFormData.event_dates[0] || ''),
        end_date: editFormData.dateMode === 'range' ? editFormData.end_date : (editFormData.event_dates[editFormData.event_dates.length - 1] || ''),
        event_dates: editFormData.dateMode === 'specific' ? editFormData.event_dates : undefined,
        // Add other necessary fields with defaults if needed
        created_at: new Date().toISOString(),
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="edit-modal-overlay"
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
            <div className="edit-modal-container">
                {/* 헤더 */}
                <div className="edit-modal-header">
                    <div className="edit-modal-header-content">
                        <h2 className="edit-modal-title">이벤트 수정</h2>
                        <button
                            onClick={() => {
                                onClose();
                                setEditVideoPreview({ provider: null, embedUrl: null });
                            }}
                            className="edit-modal-close-btn"
                        >
                            <i className="ri-close-line edit-modal-icon-lg"></i>
                        </button>
                    </div>
                </div>

                {/* 스크롤 가능한 폼 영역 */}
                <div className="edit-modal-body">
                    {/* Live Preview Section */}
                    <div className="edit-modal-preview-section">
                        <div className="edit-modal-preview-header">
                            <label className="edit-modal-group-label">미리보기</label>
                            <div className="preview-toggle-container">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('card')}
                                    className={`preview-toggle-btn ${previewMode === 'card' ? 'active' : 'inactive'}`}
                                >
                                    카드
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('billboard')}
                                    className={`preview-toggle-btn ${previewMode === 'billboard' ? 'active' : 'inactive'}`}
                                >
                                    빌보드
                                </button>
                            </div>
                        </div>

                        <div className="preview-container">
                            {previewMode === 'card' ? (
                                <div className="card-preview-wrapper group">
                                    {(!previewEvent.image || previewEvent.image === "") ? (
                                        <div
                                            onClick={() => {
                                                const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
                                                fileInput?.click();
                                            }}
                                            className="empty-image-placeholder"
                                        >
                                            <i className="ri-image-add-line empty-image-icon"></i>
                                            <span className="empty-image-text">클릭하여 이미지 등록</span>
                                        </div>
                                    ) : (
                                        <>
                                            <EventCard
                                                event={previewEvent}
                                                onClick={() => { }}
                                                defaultThumbnailClass="default-thumbnail-class"
                                                defaultThumbnailEvent="default-thumbnail-event"
                                            />
                                            {/* Edit Thumbnail Overlay Button */}
                                            {editImageFile && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
                                                        fileInput?.click();
                                                    }}
                                                    className="edit-thumbnail-btn"
                                                    title="썸네일 편집"
                                                >
                                                    <i className="ri-crop-line"></i>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                /* Mini Billboard Preview */
                                <div className="mini-billboard-preview">
                                    {/* Background Image */}
                                    {previewEvent.image ? (
                                        <img
                                            src={previewEvent.image}
                                            alt="Billboard Preview"
                                            className="mini-billboard-image"
                                        />
                                    ) : (
                                        <div
                                            onClick={() => {
                                                const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
                                                fileInput?.click();
                                            }}
                                            className="mini-billboard-empty"
                                        >
                                            <i className="ri-image-add-line evt-text-5xl evt-mb-3"></i>
                                            <span className="evt-text-lg evt-font-medium">이미지 등록</span>
                                        </div>
                                    )}

                                    {/* Bottom Info Overlay */}
                                    <div className="mini-billboard-info">
                                        <h3 className="mini-billboard-title">
                                            {previewEvent.title}
                                        </h3>

                                        <div className="mini-billboard-badge">
                                            <span className="mini-billboard-badge-text">상세보기</span>
                                            <div className="mini-billboard-indicator">
                                                <div className="mini-billboard-indicator-dot"></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top Info Overlay */}
                                    <div className="mini-billboard-counter">
                                        <div className="mini-billboard-counter-box">
                                            <span className="mini-billboard-counter-text">1/1</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <form
                        id="edit-event-form"
                        onSubmit={handleEditSubmit}
                        className="edit-modal-form"
                    >
                        <div>
                            <label className="edit-modal-label">이벤트 제목</label>
                            <input
                                type="text"
                                value={editFormData.title}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        title: e.target.value,
                                    }))
                                }
                                className="edit-modal-input"
                            />
                        </div>

                        <div className="edit-modal-input-group">
                            <label className="edit-modal-label">
                                장르 (7자 이내, 선택사항)
                            </label>
                            <input
                                type="text"
                                value={editFormData.genre}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setEditFormData((prev) => ({ ...prev, genre: value }));
                                    const suggestions = value
                                        ? allGenres.filter(
                                            (genre) =>
                                                genre.toLowerCase().includes(value.toLowerCase()) &&
                                                genre.toLowerCase() !== value.toLowerCase(),
                                        )
                                        : allGenres;
                                    setGenreSuggestions(suggestions);
                                }}
                                onFocus={handleGenreFocus}
                                onBlur={() =>
                                    setTimeout(() => setIsGenreInputFocused(false), 150)
                                }
                                maxLength={7}
                                className="edit-modal-input"
                                placeholder="예: 린디합, 발보아"
                                autoComplete="off"
                            />
                            {isGenreInputFocused && genreSuggestions.length > 0 && (
                                <div className="edit-modal-autocomplete-dropdown">
                                    {genreSuggestions.map((genre) => (
                                        <div
                                            key={genre}
                                            onMouseDown={() => handleGenreSuggestionClick(genre)}
                                            className="edit-modal-autocomplete-item"
                                        >
                                            {genre}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="edit-modal-label">카테고리</label>
                            <select
                                value={editFormData.category}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        category: e.target.value,
                                    }))
                                }
                                className="edit-modal-select"
                            >
                                <option value="class">강습</option>
                                <option value="event">행사</option>
                            </select>
                        </div>

                        {/* 빌보드 표시 옵션 */}
                        <div className="edit-modal-option-box">
                            <label className="edit-modal-label-sub">
                                빌보드 표시 옵션
                            </label>
                            <div className="edit-modal-checkbox-wrapper">
                                <input
                                    type="checkbox"
                                    id="editShowTitleOnBillboard"
                                    name="showTitleOnBillboard"
                                    checked={editFormData.showTitleOnBillboard}
                                    onChange={(e) => {
                                        const { checked } = e.target;
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            showTitleOnBillboard: checked,
                                        }));
                                    }}
                                    className="edit-modal-checkbox"
                                />
                                <label
                                    htmlFor="editShowTitleOnBillboard"
                                    className="edit-modal-checkbox-label"
                                >
                                    빌보드에 제목, 날짜, 장소 정보 표시
                                </label>
                            </div>
                        </div>

                        {/* 장소 이름 & 주소 링크 (한 줄) */}
                        <div className="edit-modal-grid-row">
                            <div>
                                <label className="edit-modal-label">장소 이름</label>
                                <input
                                    type="text"
                                    value={editFormData.location}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            location: e.target.value,
                                        }))
                                    }
                                    className="edit-modal-input"
                                    placeholder="예: 홍대 연습실"
                                />
                            </div>
                            <div>
                                <label className="edit-modal-label">주소 링크 (선택)</label>
                                <input
                                    type="text"
                                    value={editFormData.locationLink}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            locationLink: e.target.value,
                                        }))
                                    }
                                    className="edit-modal-input"
                                    placeholder="지도 링크"
                                />
                            </div>
                        </div>

                        {/* 날짜 선택 섹션 (통합 박스) */}
                        <div className="edit-modal-date-box">
                            <label className="edit-modal-label-sub">
                                날짜 선택 방식
                            </label>
                            <div className="edit-modal-radio-group">
                                <label className="edit-modal-radio-label">
                                    <input
                                        type="radio"
                                        name="edit-dateMode"
                                        value="range"
                                        checked={editFormData.dateMode === "range"}
                                        onChange={() => {
                                            setEditFormData((prev) => ({
                                                ...prev,
                                                dateMode: "range",
                                                event_dates: [],
                                            }));
                                        }}
                                        className="edit-modal-radio"
                                    />
                                    <span className="edit-modal-radio-text">
                                        연속 기간
                                    </span>
                                </label>
                                <label className="edit-modal-radio-label">
                                    <input
                                        type="radio"
                                        name="edit-dateMode"
                                        value="specific"
                                        checked={editFormData.dateMode === "specific"}
                                        onChange={() => {
                                            setEditFormData((prev) => ({
                                                ...prev,
                                                dateMode: "specific",
                                            }));
                                        }}
                                        className="edit-modal-radio"
                                    />
                                    <span className="edit-modal-radio-text">
                                        특정 날짜 선택
                                    </span>
                                </label>
                            </div>

                            {editFormData.dateMode === "range" ? (
                                <div className="edit-modal-grid-row">
                                    <div>
                                        <label className="edit-modal-label">시작일</label>
                                        <DatePicker
                                            selected={
                                                editFormData.start_date
                                                    ? new Date(editFormData.start_date + "T00:00:00")
                                                    : null
                                            }
                                            onChange={(date) => {
                                                if (date) {
                                                    const dateStr = formatDateForInput(date);
                                                    setEditFormData((prev) => ({
                                                        ...prev,
                                                        start_date: dateStr,
                                                        end_date:
                                                            !prev.end_date || prev.end_date < dateStr
                                                                ? dateStr
                                                                : prev.end_date,
                                                    }));
                                                }
                                            }}
                                            locale="ko"
                                            shouldCloseOnSelect={false}
                                            customInput={
                                                <CustomDateInput
                                                    value={
                                                        editFormData.start_date
                                                            ? `${new Date(editFormData.start_date + "T00:00:00").getMonth() + 1}.${new Date(editFormData.start_date + "T00:00:00").getDate()}`
                                                            : undefined
                                                    }
                                                />
                                            }
                                            calendarClassName="evt-calendar-bg"
                                            withPortal
                                            portalId="root-portal"
                                            renderCustomHeader={(props) => (
                                                <CustomDatePickerHeader
                                                    {...props}
                                                    selectedDate={
                                                        editFormData.start_date
                                                            ? new Date(editFormData.start_date + "T00:00:00")
                                                            : null
                                                    }
                                                    onTodayClick={() => {
                                                        const today = new Date();
                                                        props.changeMonth(today.getMonth());
                                                        props.changeYear(today.getFullYear());
                                                        const todayStr = formatDateForInput(today);
                                                        setEditFormData((prev) => ({
                                                            ...prev,
                                                            start_date: todayStr,
                                                            end_date:
                                                                !prev.end_date || prev.end_date < todayStr
                                                                    ? todayStr
                                                                    : prev.end_date,
                                                        }));
                                                    }}
                                                />
                                            )}
                                        />
                                    </div>
                                    <div>
                                        <label className="edit-modal-label">종료일</label>
                                        <DatePicker
                                            selected={
                                                editFormData.end_date
                                                    ? new Date(editFormData.end_date + "T00:00:00")
                                                    : null
                                            }
                                            onChange={(date) => {
                                                if (date) {
                                                    const dateStr = formatDateForInput(date);
                                                    setEditFormData((prev) => ({
                                                        ...prev,
                                                        end_date: dateStr,
                                                    }));
                                                }
                                            }}
                                            minDate={
                                                editFormData.start_date
                                                    ? new Date(editFormData.start_date + "T00:00:00")
                                                    : undefined
                                            }
                                            locale="ko"
                                            shouldCloseOnSelect={false}
                                            customInput={
                                                <CustomDateInput
                                                    value={
                                                        editFormData.end_date
                                                            ? `${new Date(editFormData.end_date + "T00:00:00").getMonth() + 1}.${new Date(editFormData.end_date + "T00:00:00").getDate()}`
                                                            : undefined
                                                    }
                                                />
                                            }
                                            calendarClassName="evt-calendar-bg"
                                            withPortal
                                            portalId="root-portal"
                                            renderCustomHeader={(props) => (
                                                <CustomDatePickerHeader
                                                    {...props}
                                                    selectedDate={
                                                        editFormData.end_date
                                                            ? new Date(editFormData.end_date + "T00:00:00")
                                                            : null
                                                    }
                                                    onTodayClick={() => {
                                                        const today = new Date();
                                                        props.changeMonth(today.getMonth());
                                                        props.changeYear(today.getFullYear());
                                                    }}
                                                />
                                            )}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="edit-modal-label">
                                        날짜 추가 (여러 번 선택 가능)
                                    </label>
                                    <DatePicker
                                        selected={null}
                                        onChange={(date) => {
                                            if (date) {
                                                const dateStr = formatDateForInput(date);
                                                setEditFormData((prev) => {
                                                    if (prev.event_dates.includes(dateStr)) return prev;
                                                    const newDates = [...prev.event_dates, dateStr].sort();
                                                    return { ...prev, event_dates: newDates };
                                                });
                                                // Date added successfully
                                            }
                                        }}
                                        locale="ko"
                                        shouldCloseOnSelect={false}
                                        customInput={
                                            <CustomDateInput
                                                value="날짜 추가하기"
                                                onClick={() => { }}
                                            />
                                        }
                                        calendarClassName="evt-calendar-bg"
                                        withPortal
                                        portalId="root-portal"
                                        renderCustomHeader={(props) => (
                                            <CustomDatePickerHeader
                                                {...props}
                                                selectedDate={new Date()}
                                                onTodayClick={() => {
                                                    const today = new Date();
                                                    props.changeMonth(today.getMonth());
                                                    props.changeYear(today.getFullYear());
                                                }}
                                            />
                                        )}
                                    />

                                    {/* 선택된 날짜 목록 */}
                                    <div className="specific-date-list" style={{ marginTop: '0.75rem' }}>
                                        {editFormData.event_dates.map((dateStr, index) => (
                                            <div key={index} className="edit-modal-date-badge">
                                                <span>
                                                    {new Date(dateStr).getMonth() + 1}.
                                                    {new Date(dateStr).getDate()}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditFormData((prev) => ({
                                                            ...prev,
                                                            event_dates: prev.event_dates.filter(
                                                                (d) => d !== dateStr,
                                                            ),
                                                        }));
                                                    }}
                                                    className="edit-modal-badge-remove"
                                                >
                                                    <i className="ri-close-circle-fill"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="edit-modal-label">시간</label>
                            <input
                                type="text"
                                value={editFormData.time}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({ ...prev, time: e.target.value }))
                                }
                                maxLength={20}
                                className="edit-modal-input"
                                placeholder="예: 19:30 - 23:00"
                            />
                        </div>

                        {/* 비디오 URL 입력 및 검색 */}
                        <div className="video-section-container">
                            <label className="edit-modal-label">비디오 URL</label>
                            <div className="edit-modal-checkbox-wrapper" style={{ gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    value={editFormData.videoUrl}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            videoUrl: e.target.value,
                                        }))
                                    }
                                    className="edit-modal-input"
                                    style={{ flex: 1 }}
                                    placeholder="YouTube 또는 Instagram URL"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!editFormData.videoUrl) return;

                                        const videoInfo = parseVideoUrl(editFormData.videoUrl);
                                        if (videoInfo.provider && videoInfo.embedUrl) {
                                            setEditVideoPreview({
                                                provider: videoInfo.provider,
                                                embedUrl: videoInfo.embedUrl,
                                            });

                                            // 썸네일 옵션 가져오기
                                            const options = await getVideoThumbnailOptions(
                                                editFormData.videoUrl,
                                            );
                                            setThumbnailOptions(options);
                                            if (options.length > 0) {
                                                setShowThumbnailSelector(true);
                                            }
                                        } else {
                                            alert("지원하지 않는 URL 형식이거나 잘못된 URL입니다.");
                                        }
                                    }}
                                    className="edit-modal-btn-video"
                                >
                                    썸네일 검색
                                </button>
                            </div>
                            <p className="edit-modal-helper-text">
                                * URL 입력 후 '썸네일 검색'을 누르면 썸네일을 자동 추출하여 등록할
                                수 있습니다.
                            </p>

                            {/* 비디오 미리보기 */}
                            {editVideoPreview.embedUrl && (
                                <div className="video-preview-wrapper">
                                    <iframe
                                        src={editVideoPreview.embedUrl}
                                        className="video-preview-iframe"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            )}
                        </div>

                        {/* 이미지 업로드 섹션 */}
                        <div className="image-section-container">
                            <label className="edit-modal-label">이미지 (포스터)</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleEditImageChange}
                                className="edit-modal-input"
                            />

                            {editImagePreview && (
                                <div className="image-preview-container">
                                    <img
                                        src={editImagePreview}
                                        alt="미리보기"
                                        className="image-preview-img"
                                    />
                                    <div className="image-action-buttons">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (editImagePreview.startsWith("blob:")) {
                                                    // Blob URL인 경우 다운로드 처리
                                                    const a = document.createElement("a");
                                                    a.href = editImagePreview;
                                                    a.download = "thumbnail.jpg";
                                                    a.click();
                                                } else {
                                                    // 원격 URL인 경우
                                                    window.open(editImagePreview, "_blank");
                                                }
                                            }}
                                            className="thumbnail-download-btn"
                                            title="이미지 다운로드"
                                        >
                                            <i className="ri-download-line" style={{ marginRight: '4px' }}></i>
                                            다운로드
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditImageFile(null);
                                                setEditImagePreview("");
                                                // 폼 데이터에서도 이미지 제거
                                                setEditFormData((prev) => ({ ...prev, image: "" }));
                                            }}
                                            className="thumbnail-remove-btn"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="edit-modal-grid-row">
                            <div>
                                <label className="edit-modal-label">주최자 (선택)</label>
                                <input
                                    type="text"
                                    value={editFormData.organizerName}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            organizerName: e.target.value,
                                        }))
                                    }
                                    className="edit-modal-input"
                                    placeholder="주최자/단체명"
                                />
                            </div>
                            <div>
                                <label className="edit-modal-label">문의 (선택)</label>
                                <input
                                    type="text"
                                    value={editFormData.organizerPhone}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            organizerPhone: e.target.value,
                                        }))
                                    }
                                    className="edit-modal-input"
                                    placeholder="연락처/카톡ID"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="edit-modal-label">내용 (선택사항)</label>
                            <textarea
                                value={editFormData.description}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                                rows={4}
                                className="edit-modal-input"
                                placeholder="이벤트 상세 내용을 입력하세요"
                            ></textarea>
                        </div>

                        {/* 링크 입력 섹션 */}
                        <div className="edit-modal-option-box">
                            <label className="edit-modal-label-sub">
                                추가 링크 (선택)
                            </label>

                            {[1, 2, 3].map((num) => (
                                <div key={num} className="edit-modal-grid-row">
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="text"
                                            value={editFormData[`linkName${num}` as keyof typeof editFormData] as string}
                                            onChange={(e) =>
                                                setEditFormData((prev) => ({
                                                    ...prev,
                                                    [`linkName${num}`]: e.target.value,
                                                }))
                                            }
                                            className="edit-modal-input"
                                            placeholder={`링크명 ${num}`}
                                        />
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <input
                                            type="text"
                                            value={editFormData[`link${num}` as keyof typeof editFormData] as string}
                                            onChange={(e) =>
                                                setEditFormData((prev) => ({
                                                    ...prev,
                                                    [`link${num}`]: e.target.value,
                                                }))
                                            }
                                            className="edit-modal-input"
                                            placeholder="URL"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            type="submit"
                            className="edit-modal-btn-primary"
                        >
                            수정하기
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (
                                    window.confirm(
                                        "정말 삭제하시겠습니까? (삭제 후 복구 불가)",
                                    )
                                ) {
                                    onDelete(event);
                                }
                            }}
                            className="edit-modal-btn-danger"
                        >
                            이벤트 삭제
                        </button>
                    </form>
                </div>
            </div>

            {/* 썸네일 선택 모달 */}
            {showThumbnailSelector && (
                <div className="edit-modal-overlay" style={{ zIndex: 60 }}>
                    <div className="edit-modal-container">
                        <div className="edit-modal-header">
                            <div className="edit-modal-header-content">
                                <h3 className="edit-modal-title">썸네일 선택</h3>
                                <button
                                    onClick={() => setShowThumbnailSelector(false)}
                                    className="edit-modal-close-btn"
                                >
                                    <i className="ri-close-line edit-modal-icon-lg"></i>
                                </button>
                            </div>
                        </div>
                        <div className="edit-modal-body">
                            <div className="edit-modal-grid-row">
                                {thumbnailOptions.map((option, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleThumbnailSelect(option)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div style={{
                                            position: 'relative',
                                            paddingBottom: '56.25%',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden',
                                            border: '2px solid transparent',
                                        }}>
                                            <img
                                                src={option.url}
                                                alt={`Thumbnail ${index + 1}`}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            <div className="thumbnail-quality-badge" style={{
                                                position: 'absolute',
                                                bottom: '0.25rem',
                                                right: '0.25rem',
                                                backgroundColor: 'rgba(0,0,0,0.7)',
                                                color: 'white',
                                                fontSize: '0.75rem',
                                                padding: '0.125rem 0.375rem',
                                                borderRadius: '0.25rem',
                                            }}>
                                                {option.quality}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
});
