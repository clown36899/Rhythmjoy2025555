import { useState, useEffect, forwardRef } from "react";
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
import { formatDateForInput, sanitizeFileName } from "../../../utils/fileUtils";
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

export default function EventEditModal({
    isOpen,
    onClose,
    event,
    isAdminMode,
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
    const [tempDateInput, setTempDateInput] = useState<string>("");
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
                setEditImagePreview(URL.createObjectURL(resizedImages.medium));
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

                // 새 이미지 업로드 (폴더 생성)
                const resizedImages = await createResizedImages(editImageFile);
                const timestamp = Date.now();
                const baseFileName = sanitizeFileName(editImageFile.name);
                const newFolderPath = `event-posters/${timestamp}_${baseFileName}`;
                const getExtension = (fileName: string) =>
                    fileName.split(".").pop()?.toLowerCase() || "jpg";

                const uploadPromises = ["thumbnail", "medium", "full"].map(
                    async (key) => {
                        const file = resizedImages[key as keyof typeof resizedImages];
                        const path = `${newFolderPath}/${key}.${getExtension(file.name)}`;
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
                    },
                );

                const results = await Promise.all(uploadPromises);
                const urls = Object.fromEntries(results.map((r) => [r.key, r.url]));

                updateData.image = urls.full;
                updateData.image_thumbnail = urls.thumbnail;
                updateData.image_medium = urls.medium;
                updateData.image_full = urls.full;
                updateData.storage_path = newFolderPath;
            }
            // Case 2: 기존 이미지가 삭제된 경우 (새 이미지 없음)
            else if (!editImagePreview && (event.image || event.image_full)) {
                console.log("[수정] 이미지 삭제 감지. 기존 파일 정리.");
                await deleteOldImages();

                // DB 필드 초기화
                updateData.image = "";
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

    if (!isOpen) return null;

    return createPortal(
        <div
            className="evt-fixed-inset-edit-modal"
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
            <div className="evt-modal-container-lg">
                {/* 헤더 */}
                <div className="evt-modal-header">
                    <div className="evt-modal-header-content">
                        <h2 className="evt-modal-title">이벤트 수정</h2>
                        <button
                            onClick={() => {
                                onClose();
                                setEditVideoPreview({ provider: null, embedUrl: null });
                            }}
                            className="evt-modal-close-btn"
                        >
                            <i className="ri-close-line evt-icon-xl"></i>
                        </button>
                    </div>
                </div>

                {/* 스크롤 가능한 폼 영역 */}
                <div className="evt-modal-body-scroll">
                    <form
                        id="edit-event-form"
                        onSubmit={handleEditSubmit}
                        className="evt-space-y-3"
                    >
                        <div>
                            <label className="evt-form-label">이벤트 제목</label>
                            <input
                                type="text"
                                value={editFormData.title}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        title: e.target.value,
                                    }))
                                }
                                className="evt-form-input"
                            />
                        </div>

                        <div className="evt-relative">
                            <label className="evt-form-label">
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
                                className="evt-form-input"
                                placeholder="예: 린디합, 발보아"
                                autoComplete="off"
                            />
                            {isGenreInputFocused && genreSuggestions.length > 0 && (
                                <div className="evt-autocomplete-dropdown">
                                    {genreSuggestions.map((genre) => (
                                        <div
                                            key={genre}
                                            onMouseDown={() => handleGenreSuggestionClick(genre)}
                                            className="evt-autocomplete-genre-item"
                                        >
                                            {genre}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="evt-form-label">카테고리</label>
                            <select
                                value={editFormData.category}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        category: e.target.value,
                                    }))
                                }
                                className="evt-form-select"
                            >
                                <option value="class">강습</option>
                                <option value="event">행사</option>
                            </select>
                        </div>

                        {/* 빌보드 표시 옵션 */}
                        <div className="evt-billboard-option-box evt-space-y-2">
                            <label className="evt-block evt-text-gray-400 evt-text-xs evt-font-medium">
                                빌보드 표시 옵션
                            </label>
                            <div className="evt-flex evt-items-center">
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
                                    className="evt-form-checkbox"
                                />
                                <label
                                    htmlFor="editShowTitleOnBillboard"
                                    className="evt-ml-2 evt-block evt-text-sm evt-text-gray-400"
                                >
                                    빌보드에 제목, 날짜, 장소 정보 표시
                                </label>
                            </div>
                        </div>

                        {/* 장소 이름 & 주소 링크 (한 줄) */}
                        <div className="evt-grid-cols-2 evt-gap-3">
                            <div>
                                <label className="evt-form-label">장소 이름</label>
                                <input
                                    type="text"
                                    value={editFormData.location}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            location: e.target.value,
                                        }))
                                    }
                                    className="evt-form-input"
                                    placeholder="예: 홍대 연습실"
                                />
                            </div>
                            <div>
                                <label className="evt-form-label">주소 링크 (선택)</label>
                                <input
                                    type="text"
                                    value={editFormData.locationLink}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            locationLink: e.target.value,
                                        }))
                                    }
                                    className="evt-form-input"
                                    placeholder="지도 링크"
                                />
                            </div>
                        </div>

                        {/* 날짜 선택 섹션 (통합 박스) */}
                        <div className="evt-billboard-option-box evt-space-y-3">
                            <label className="evt-block evt-text-gray-400 evt-text-xs evt-font-medium">
                                날짜 선택 방식
                            </label>
                            <div className="evt-flex evt-gap-4">
                                <label className="evt-flex evt-items-center evt-cursor-pointer">
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
                                        className="evt-mr-2"
                                    />
                                    <span className="evt-text-gray-400 evt-text-sm">
                                        연속 기간
                                    </span>
                                </label>
                                <label className="evt-flex evt-items-center evt-cursor-pointer">
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
                                        className="evt-mr-2"
                                    />
                                    <span className="evt-text-gray-400 evt-text-sm">
                                        특정 날짜 선택
                                    </span>
                                </label>
                            </div>

                            {editFormData.dateMode === "range" ? (
                                <div className="evt-grid-cols-2 evt-gap-3">
                                    <div>
                                        <label className="evt-form-label">시작일</label>
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
                                        <label className="evt-form-label">종료일</label>
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
                                            startDate={
                                                editFormData.start_date
                                                    ? new Date(editFormData.start_date + "T00:00:00")
                                                    : null
                                            }
                                            endDate={
                                                editFormData.end_date
                                                    ? new Date(editFormData.end_date + "T00:00:00")
                                                    : null
                                            }
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
                                                <CustomDatePickerHeader {...props} />
                                            )}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="evt-block evt-text-gray-400 evt-text-sm evt-font-medium evt-mb-2">
                                        선택된 날짜 ({editFormData.event_dates.length}개)
                                    </label>
                                    <div className="evt-flex evt-flex-wrap evt-gap-2 evt-mb-3">
                                        {editFormData.event_dates
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((dateStr, index) => {
                                                const date = new Date(dateStr);
                                                return (
                                                    <div key={index} className="evt-date-badge">
                                                        <span>
                                                            {date.getMonth() + 1}/{date.getDate()}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (editFormData.event_dates.length > 1) {
                                                                    setEditFormData((prev) => ({
                                                                        ...prev,
                                                                        event_dates: prev.event_dates.filter(
                                                                            (_, i) => i !== index,
                                                                        ),
                                                                    }));
                                                                }
                                                            }}
                                                            className="evt-ml-2 evt-btn-close-red"
                                                        >
                                                            <i className="ri-close-line"></i>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <div className="evt-flex evt-gap-2 evt-mb-2">
                                        <input
                                            type="date"
                                            value={tempDateInput}
                                            className="evt-flex-1 evt-form-input"
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key !== "Tab" &&
                                                    e.key !== "ArrowLeft" &&
                                                    e.key !== "ArrowRight"
                                                ) {
                                                    e.preventDefault();
                                                }
                                            }}
                                            onChange={(e) => {
                                                setTempDateInput(e.target.value);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (tempDateInput) {
                                                    const newDate = tempDateInput;
                                                    const isDuplicate =
                                                        editFormData.event_dates.includes(newDate);
                                                    if (!isDuplicate) {
                                                        setEditFormData((prev) => ({
                                                            ...prev,
                                                            event_dates: [...prev.event_dates, newDate],
                                                        }));
                                                    }
                                                    setTempDateInput("");
                                                }
                                            }}
                                            className="evt-video-btn"
                                        >
                                            추가
                                        </button>
                                    </div>
                                    <p className="evt-text-xs evt-text-gray-400">
                                        예: 11일, 25일, 31일처럼 특정 날짜들만 선택할 수 있습니다
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 문의 정보 (공개) */}
                        <div>
                            <label className="evt-form-label">문의</label>
                            <input
                                type="text"
                                value={editFormData.contact}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        contact: e.target.value,
                                    }))
                                }
                                className="evt-form-input"
                                placeholder="카카오톡ID, 전화번호, SNS 등 (예: 카카오톡09502958)"
                            />
                            <p className="evt-text-xs evt-text-gray-400 evt-mt-1">
                                <i className="ri-information-line evt-mr-1"></i>
                                참가자가 문의할 수 있는 연락처를 입력해주세요 (선택사항)
                            </p>
                        </div>

                        {/* 내용 */}
                        <div>
                            <label className="evt-form-label">내용 (선택사항)</label>
                            <textarea
                                value={editFormData.description}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                                rows={4}
                                className="evt-form-input"
                                placeholder="이벤트에 대한 자세한 설명을 입력해주세요"
                            />
                        </div>

                        <div>
                            <label className="evt-form-label">바로가기 링크</label>
                            <div className="evt-grid-cols-2 evt-gap-2">
                                <input
                                    type="url"
                                    value={editFormData.link1}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            link1: e.target.value,
                                        }))
                                    }
                                    className="evt-form-input"
                                    placeholder="링크 URL"
                                />
                                <input
                                    type="text"
                                    value={editFormData.linkName1}
                                    onChange={(e) =>
                                        setEditFormData((prev) => ({
                                            ...prev,
                                            linkName1: e.target.value,
                                        }))
                                    }
                                    className="evt-form-input"
                                    placeholder="링크 이름"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="evt-form-label">
                                이벤트 이미지 (선택사항)
                            </label>
                            <div className="evt-space-y-2">
                                {editImagePreview && (
                                    <div className="evt-relative">
                                        <img
                                            src={editImagePreview}
                                            alt="이벤트 이미지"
                                            className="evt-img-full-h48"
                                        />
                                        <div className="evt-absolute evt-top-2 evt-right-2 evt-flex evt-gap-2">
                                            {/* <button
                        type="button"
                        onClick={handleEditOpenCropForFile}
                        className="evt-btn-purple"
                      >
                        <i className="ri-crop-line evt-mr-1"></i>
                        편집
                      </button> */}
                                            {isAdminMode && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const link = document.createElement("a");
                                                        link.href = editImagePreview;
                                                        link.download = `thumbnail-${Date.now()}.jpg`;
                                                        document.body.appendChild(link);
                                                        link.click();
                                                        document.body.removeChild(link);
                                                    }}
                                                    className="evt-thumbnail-btn"
                                                >
                                                    <i className="ri-download-line evt-mr-1"></i>
                                                    다운로드
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditImagePreview("");
                                                    setEditImageFile(null);
                                                    setEditFormData((prev) => ({
                                                        ...prev,
                                                        image: "",
                                                    }));
                                                }}
                                                className="evt-thumbnail-remove-btn"
                                            >
                                                이미지 삭제
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleEditImageChange}
                                    className="evt-file-input"
                                />

                                {/* 썸네일 추출 버튼 (영상 URL이 있을 때만) */}
                                {editFormData.videoUrl && editVideoPreview.provider && (
                                    <>
                                        {editVideoPreview.provider === "youtube" ||
                                            editVideoPreview.provider === "vimeo" ? (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        const options = await getVideoThumbnailOptions(
                                                            editFormData.videoUrl,
                                                        );
                                                        if (options.length > 0) {
                                                            setThumbnailOptions(options);
                                                            setShowThumbnailSelector(true);
                                                        } else {
                                                            alert("이 영상에서 썸네일을 추출할 수 없습니다.");
                                                        }
                                                    } catch (error) {
                                                        console.error("썸네일 추출 오류:", error);
                                                        alert("썸네일 추출 중 오류가 발생했습니다.");
                                                    }
                                                }}
                                                className="evt-btn-green-full"
                                            >
                                                <i className="ri-image-add-line evt-mr-1"></i>
                                                썸네일 추출하기{" "}
                                                {editVideoPreview.provider === "youtube" &&
                                                    "(여러 장면 선택 가능)"}
                                            </button>
                                        ) : (
                                            <div className="evt-mt-2">
                                                <button
                                                    type="button"
                                                    disabled
                                                    className="evt-btn-disabled"
                                                >
                                                    <i className="ri-image-add-line evt-mr-1"></i>
                                                    썸네일 추출 불가능
                                                </button>
                                                <p className="evt-text-xs evt-text-orange-400 evt-mt-2">
                                                    <i className="ri-alert-line evt-mr-1"></i>
                                                    Instagram/Facebook은 썸네일 자동 추출이 지원되지
                                                    않습니다. 위 이미지로 썸네일을 직접 등록해주세요.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}

                                <p className="evt-text-xs evt-text-gray-400">
                                    <i className="ri-information-line evt-mr-1"></i>
                                    포스터 이미지는 이벤트 배너와 상세보기에 표시됩니다.
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="evt-form-label">영상 URL (선택사항)</label>
                            <div className="evt-space-y-2">
                                {/* 영상 프리뷰 */}
                                {editVideoPreview.provider && editVideoPreview.embedUrl && (
                                    <div className="evt-relative">
                                        <div className="evt-flex evt-items-center evt-gap-2 evt-text-sm evt-text-green-400 evt-mb-2">
                                            <i className="ri-check-line"></i>
                                            <span>영상 인식됨 - 빌보드에서 재생됩니다</span>
                                        </div>
                                        <div className="evt-video-preview-wrapper">
                                            <iframe
                                                src={editVideoPreview.embedUrl}
                                                className="evt-video-preview-iframe"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            ></iframe>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditVideoPreview({
                                                    provider: null,
                                                    embedUrl: null,
                                                });
                                                setEditFormData((prev) => ({
                                                    ...prev,
                                                    videoUrl: "",
                                                }));
                                                setEditImageFile(null);
                                                setEditImagePreview("");
                                            }}
                                            className="evt-btn-red-abs"
                                        >
                                            영상 삭제
                                        </button>
                                    </div>
                                )}

                                {/* 영상 URL 입력창 - 항상 표시 */}
                                <div>
                                    <label className="evt-block evt-text-gray-400 evt-text-xs evt-mb-1">
                                        {editVideoPreview.provider
                                            ? "영상 주소 (복사/수정 가능)"
                                            : "영상 주소 입력"}
                                    </label>
                                    <input
                                        type="url"
                                        value={editFormData.videoUrl}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setEditFormData((prev) => ({
                                                ...prev,
                                                videoUrl: value,
                                            }));

                                            if (value.trim() === "") {
                                                setEditVideoPreview({
                                                    provider: null,
                                                    embedUrl: null,
                                                });
                                            } else {
                                                const videoInfo = parseVideoUrl(value);

                                                // 유튜브만 허용
                                                if (
                                                    videoInfo.provider &&
                                                    videoInfo.provider !== "youtube"
                                                ) {
                                                    setEditVideoPreview({
                                                        provider: null,
                                                        embedUrl: null,
                                                    });
                                                } else {
                                                    setEditVideoPreview({
                                                        provider: videoInfo.provider,
                                                        embedUrl: videoInfo.embedUrl,
                                                    });
                                                }
                                            }
                                        }}
                                        className="evt-form-input"
                                        placeholder="YouTube 링크만 가능"
                                    />
                                </div>
                                <div className="evt-mt-2 evt-space-y-1">
                                    <p className="evt-text-xs evt-text-gray-400">
                                        <i className="ri-information-line evt-mr-1"></i>
                                        영상은 전면 빌보드에서 자동재생됩니다.
                                    </p>
                                    <p className="evt-text-xs evt-text-green-400">
                                        <i className="ri-check-line evt-mr-1"></i>
                                        <strong>YouTube만 지원:</strong> 썸네일 자동 추출 + 영상
                                        재생 가능
                                    </p>
                                    <p className="evt-text-xs evt-text-red-400">
                                        <i className="ri-close-line evt-mr-1"></i>
                                        <strong>Instagram, Vimeo는 지원하지 않습니다</strong>
                                    </p>
                                </div>
                                {editFormData.videoUrl && !editVideoPreview.provider && (
                                    <p className="evt-text-xs evt-text-red-400 evt-mt-1">
                                        <i className="ri-alert-line evt-mr-1"></i>
                                        YouTube URL만 지원합니다. 인스타그램, 비메오는 사용할 수
                                        없습니다.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 등록자 정보 (관리자 전용, 비공개) - 최하단 */}
                        <div className="evt-registrant-box">
                            <div className="evt-registrant-header">
                                <i className="ri-lock-line evt-text-orange-400 evt-text-sm"></i>
                                <h3 className="evt-registrant-title">
                                    등록자 정보 (비공개 - 관리자만 확인 가능)
                                </h3>
                            </div>
                            <div className="evt-grid-cols-2 evt-gap-3">
                                <div>
                                    <label className="evt-registrant-label">
                                        등록자 이름 <span className="evt-text-red-400">*필수</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.organizerName}
                                        onChange={(e) =>
                                            setEditFormData((prev) => ({
                                                ...prev,
                                                organizerName: e.target.value,
                                            }))
                                        }
                                        required
                                        className="evt-form-input-orange"
                                        placeholder="등록자 이름"
                                    />
                                </div>
                                <div>
                                    <label className="evt-registrant-label">
                                        등록자 전화번호{" "}
                                        <span className="evt-text-red-400">*필수</span>
                                    </label>
                                    <input
                                        type="tel"
                                        value={editFormData.organizerPhone}
                                        onChange={(e) =>
                                            setEditFormData((prev) => ({
                                                ...prev,
                                                organizerPhone: e.target.value,
                                            }))
                                        }
                                        required
                                        className="evt-form-input-orange"
                                        placeholder="010-0000-0000"
                                    />
                                </div>
                            </div>
                            <p className="evt-registrant-info">
                                <i className="ri-information-line evt-mr-1"></i>
                                수정 등 문제가 있을 경우 연락받으실 번호입니다
                            </p>
                        </div>
                    </form>
                </div>

                {/* 하단 고정 버튼 */}
                <div className="evt-footer-sticky">
                    <div className="evt-flex evt-space-x-3">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                if (event) {
                                    onDelete(event);
                                }
                            }}
                            className="evt-btn-red"
                        >
                            삭제
                        </button>
                        <button
                            type="submit"
                            form="edit-event-form"
                            className="evt-btn-blue-full"
                        >
                            수정 완료
                        </button>
                    </div>
                </div>
            </div>

            {/* 썸네일 선택 모달 */}
            {showThumbnailSelector && (
                <div className="evt-modal-overlay-z60">
                    <div className="evt-modal-container">
                        <div className="evt-modal-header">
                            <h3 className="evt-modal-title">썸네일 선택</h3>
                            <button
                                onClick={() => setShowThumbnailSelector(false)}
                                className="evt-modal-close-btn"
                            >
                                <i className="ri-close-line evt-icon-xl"></i>
                            </button>
                        </div>
                        <div className="evt-modal-body">
                            <div className="evt-grid-cols-2 evt-gap-2">
                                {thumbnailOptions.map((option, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleThumbnailSelect(option)}
                                        className="evt-thumbnail-option"
                                    >
                                        <img
                                            src={option.url}
                                            alt={`Thumbnail ${index + 1}`}
                                            className="evt-thumbnail-img"
                                        />
                                        <div className="evt-thumbnail-quality-badge">
                                            {option.quality}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}
