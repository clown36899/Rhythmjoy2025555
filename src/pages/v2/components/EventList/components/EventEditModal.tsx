import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale/ko";
import {
    formatDateForInput,
    parseVideoUrl,
    isValidVideoUrl
} from "../../../utils/eventListUtils";
import type { Event } from "../../../utils/eventListUtils";

interface EventEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: Event | null;
    onSave: (formData: any, imageFile: File | null) => void;
    onDelete: (id: number) => void;
    isAdmin: boolean;
    user: any;
    allGenres: string[];
    onOpenVenueModal: () => void;
}

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder }: any, ref: any) => (
    <button type="button" onClick={onClick} ref={ref} className="evt-form-input evt-text-left">
        {value || placeholder || "날짜 선택"}
    </button>
));

const CustomDatePickerHeader = ({
    date,
    decreaseMonth,
    increaseMonth,
    prevMonthButtonDisabled,
    nextMonthButtonDisabled,
    onTodayClick
}: any) => (
    <div className="evt-calendar-header">
        <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="evt-calendar-nav-btn">
            <i className="ri-arrow-left-s-line"></i>
        </button>
        <div className="evt-calendar-title">
            {date.getFullYear()}년 {date.getMonth() + 1}월
        </div>
        <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="evt-calendar-nav-btn">
            <i className="ri-arrow-right-s-line"></i>
        </button>
        {onTodayClick && (
            <button type="button" onClick={onTodayClick} className="evt-calendar-today-btn">오늘</button>
        )}
    </div>
);

export const EventEditModal: React.FC<EventEditModalProps> = ({
    isOpen,
    onClose,
    event,
    onSave,
    onDelete,
    allGenres,
    onOpenVenueModal
}) => {
    const [formData, setFormData] = useState<any>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>("");
    const [videoPreview, setVideoPreview] = useState<{ provider: string | null; embedUrl: string | null }>({
        provider: null,
        embedUrl: null
    });
    const [editPreviewMode, setEditPreviewMode] = useState<'normal' | 'billboard'>('normal');
    const [tempDateInput, setTempDateInput] = useState("");
    const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
    const [isGenreInputFocused, setIsGenreInputFocused] = useState(false);
    const [showDescriptionModal, setShowDescriptionModal] = useState(false);
    const [tempDescription, setTempDescription] = useState("");

    useEffect(() => {
        if (event) {
            setFormData({
                title: event.title || "",
                genre: event.genre || "",
                category: event.category || "event",
                location: event.location || "",
                locationLink: (event as any).location_link || "",
                start_date: event.start_date || event.date || "",
                end_date: event.end_date || event.date || "",
                dateMode: (event.event_dates && event.event_dates.length > 0) ? "specific" : "range",
                event_dates: event.event_dates || [],
                contact: event.organizer_phone || "",
                description: event.description || "",
                link1: event.link1 || "",
                linkName1: event.link_name1 || "",
                showTitleOnBillboard: event.show_title_on_billboard ?? true,
                organizerName: event.organizer || "",
                organizerPhone: event.organizer_phone || "",
                videoUrl: event.video_url || "",
                image: event.image || "",
                venueId: event.venue_id || null
            });
            setImagePreview(event.image || "");
            if (event.video_url) {
                const info = parseVideoUrl(event.video_url);
                setVideoPreview({ provider: info.provider, embedUrl: info.embedUrl });
            }
        }
    }, [event]);

    useEffect(() => {
        const handleVenueSelected = (e: any) => {
            const venue = e.detail;
            setFormData((prev: any) => ({
                ...prev,
                venueId: venue.id,
                venueName: venue.name,
                location: venue.name,
                locationLink: venue.map_url || "",
            }));
        };
        const handleVenueManual = (e: any) => {
            const { name, link } = e.detail;
            setFormData((prev: any) => ({
                ...prev,
                venueId: null,
                venueName: "",
                location: name,
                locationLink: link,
            }));
        };

        window.addEventListener('venue_selected', handleVenueSelected);
        window.addEventListener('venue_manual_input', handleVenueManual);
        return () => {
            window.removeEventListener('venue_selected', handleVenueSelected);
            window.removeEventListener('venue_manual_input', handleVenueManual);
        };
    }, []);

    if (!isOpen || !formData) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, imageFile);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenreFocus = () => {
        setIsGenreInputFocused(true);
        setGenreSuggestions(allGenres);
    };

    const handleGenreSuggestionClick = (genre: string) => {
        setFormData((prev: any) => ({ ...prev, genre }));
        setIsGenreInputFocused(false);
    };

    return createPortal(
        <div className={`evt-fixed-inset-edit-modal ${editPreviewMode === 'billboard' ? 'billboard-mode' : ''}`}>
            {editPreviewMode === 'billboard' ? (
                <div className="billboard-content-card">
                    <div className="billboard-media-area">
                        {formData.videoUrl && isValidVideoUrl(formData.videoUrl) ? (
                            <iframe
                                width="100%" height="100%"
                                src={`${videoPreview.embedUrl}?autoplay=1&mute=1&controls=0&loop=1`}
                                title="billboard" frameBorder="0" allowFullScreen
                                className="w-full h-full object-cover"
                            />
                        ) : imagePreview ? (
                            <img src={imagePreview} alt="preview" className="billboard-media-image" />
                        ) : (
                            <div className="billboard-media-placeholder"><i className="ri-image-line"></i></div>
                        )}
                    </div>
                    <div className="billboard-info-overlay">
                        <h3 className="billboard-info-title">{formData.title || "제목"}</h3>
                        <p className="billboard-info-date">{formData.start_date || "날짜"}</p>
                        <button onClick={() => setEditPreviewMode('normal')} className="evt-btn-normal-abs">수정으로 돌아가기</button>
                    </div>
                </div>
            ) : (
                <div className="evt-modal-container-lg">
                    <div className="evt-modal-header">
                        <div className="evt-modal-header-content">
                            <h2 className="evt-modal-title">이벤트 수정</h2>
                            <div className="evt-flex evt-gap-2">
                                <button type="button" onClick={() => setEditPreviewMode('billboard')} className="evt-btn-ghost-sm">빌보드 미리보기</button>
                                <button onClick={onClose} className="evt-modal-close-btn">
                                    <i className="ri-close-line evt-icon-xl"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="evt-modal-body-scroll">
                        <form id="edit-event-form" onSubmit={handleSubmit} className="evt-space-y-3">
                            <div>
                                <label className="evt-form-label">이벤트 제목</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                                    className="evt-form-input"
                                    required
                                />
                            </div>

                            <div className="evt-relative">
                                <label className="evt-form-label">장르 (7자 이내)</label>
                                <input
                                    type="text"
                                    value={formData.genre}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, genre: e.target.value }))}
                                    onFocus={handleGenreFocus}
                                    onBlur={() => setTimeout(() => setIsGenreInputFocused(false), 150)}
                                    className="evt-form-input"
                                    maxLength={7}
                                />
                                {isGenreInputFocused && genreSuggestions.length > 0 && (
                                    <div className="evt-autocomplete-dropdown">
                                        {genreSuggestions.map(g => (
                                            <div key={g} onMouseDown={() => handleGenreSuggestionClick(g)} className="evt-autocomplete-genre-item">{g}</div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="evt-form-label">카테고리</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, category: e.target.value }))}
                                    className="evt-form-select"
                                >
                                    <option value="class">강습</option>
                                    <option value="event">행사</option>
                                </select>
                            </div>

                            <div className="evt-grid-cols-2 evt-gap-3">
                                <div>
                                    <label className="evt-form-label evt-flex evt-justify-between evt-items-center">
                                        <span>장소 이름</span>
                                        <button type="button" onClick={onOpenVenueModal} className="evt-text-xs evt-text-blue-400 evt-underline">
                                            <i className="ri-search-line"></i> 장소 검색
                                        </button>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, location: e.target.value }))}
                                        className="evt-form-input"
                                    />
                                </div>
                                <div>
                                    <label className="evt-form-label">주소 링크 (지도)</label>
                                    <input
                                        type="text"
                                        value={formData.locationLink}
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, locationLink: e.target.value }))}
                                        className="evt-form-input"
                                        placeholder="https://map.naver.com/..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="evt-form-label">신청/상세 페이지 링크</label>
                                <input
                                    type="text"
                                    value={formData.link1}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, link1: e.target.value }))}
                                    className="evt-form-input"
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="evt-billboard-option-box evt-space-y-3">
                                <div className="event-list-form-flex-gap">
                                    <label><input type="radio" checked={formData.dateMode === 'range'} onChange={() => setFormData((prev: any) => ({ ...prev, dateMode: 'range' }))} /> 연속 기간</label>
                                    <label><input type="radio" checked={formData.dateMode === 'specific'} onChange={() => setFormData((prev: any) => ({ ...prev, dateMode: 'specific' }))} /> 특정 날짜</label>
                                </div>

                                {formData.dateMode === 'range' ? (
                                    <div className="evt-grid-cols-2 evt-gap-3">
                                        <DatePicker
                                            selected={formData.start_date ? new Date(formData.start_date) : null}
                                            onChange={(d) => setFormData((prev: any) => ({ ...prev, start_date: d ? formatDateForInput(d) : "" }))}
                                            locale={ko}
                                            customInput={<CustomDateInput placeholder="시작일" />}
                                            renderCustomHeader={(props) => <CustomDatePickerHeader {...props} />}
                                        />
                                        <DatePicker
                                            selected={formData.end_date ? new Date(formData.end_date) : null}
                                            onChange={(d) => setFormData((prev: any) => ({ ...prev, end_date: d ? formatDateForInput(d) : "" }))}
                                            locale={ko}
                                            customInput={<CustomDateInput placeholder="종료일" />}
                                            renderCustomHeader={(props) => <CustomDatePickerHeader {...props} />}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <div className="evt-flex-wrap evt-gap-1">
                                            {formData.event_dates.map((d: string, i: number) => (
                                                <div key={i} className="evt-date-badge">
                                                    {d} <button type="button" onClick={() => setFormData((prev: any) => ({ ...prev, event_dates: prev.event_dates.filter((_: any, idx: number) => idx !== i) }))}>x</button>
                                                </div>
                                            ))}
                                        </div>
                                        <input type="date" value={tempDateInput} onChange={(e) => setTempDateInput(e.target.value)} className="evt-form-input evt-mt-2" />
                                        <button type="button" onClick={() => { if (tempDateInput) { setFormData((prev: any) => ({ ...prev, event_dates: [...new Set([...prev.event_dates, tempDateInput])] })); setTempDateInput(""); } }} className="evt-btn-ghost-sm evt-mt-1">추가</button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="evt-form-label">문의</label>
                                <input type="text" value={formData.contact} onChange={(e) => setFormData((prev: any) => ({ ...prev, contact: e.target.value }))} className="evt-form-input" />
                            </div>

                            <div>
                                <label className="evt-form-label">내용</label>
                                <div
                                    onClick={() => {
                                        setTempDescription(formData.description);
                                        setShowDescriptionModal(true);
                                    }}
                                    className="evt-form-input"
                                    style={{
                                        minHeight: '80px',
                                        cursor: 'pointer',
                                        whiteSpace: 'pre-wrap',
                                        color: formData.description ? '#fff' : '#888'
                                    }}
                                >
                                    {formData.description || '내용을 입력해주세요...'}
                                </div>
                            </div>

                            <div>
                                <label className="evt-form-label">이벤트 이미지</label>
                                {imagePreview && <img src={imagePreview} className="evt-img-full-h48 evt-mb-2" />}
                                <input type="file" onChange={handleImageChange} className="evt-file-input" />
                            </div>

                            <div>
                                <label className="evt-form-label">영상 URL (유튜브)</label>
                                <input
                                    type="url"
                                    value={formData.videoUrl}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData((prev: any) => ({ ...prev, videoUrl: val }));
                                        const info = parseVideoUrl(val);
                                        setVideoPreview({ provider: info.provider, embedUrl: info.embedUrl });
                                    }}
                                    className="evt-form-input"
                                />
                            </div>

                            <div className="evt-registrant-box">
                                <label className="evt-registrant-label">등록자 이름 *</label>
                                <input type="text" value={formData.organizerName} onChange={(e) => setFormData((prev: any) => ({ ...prev, organizerName: e.target.value }))} className="evt-form-input" required />
                                <label className="evt-registrant-label">등록자 번호 *</label>
                                <input type="tel" value={formData.organizerPhone} onChange={(e) => setFormData((prev: any) => ({ ...prev, organizerPhone: e.target.value }))} className="evt-form-input" required />
                            </div>
                        </form>
                    </div>

                    <div className="evt-footer-sticky">
                        <div className="event-list-button-group">
                            <button type="submit" form="edit-event-form" className="evt-btn-primary evt-flex-1">수정 완료</button>
                            <button type="button" onClick={() => onDelete(event!.id)} className="evt-btn-red">삭제</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Description Editor Modal */}
            {showDescriptionModal && (
                <div
                    className="evt-fixed-inset-edit-modal"
                    style={{ zIndex: 10001 }}
                    onClick={() => setShowDescriptionModal(false)}
                >
                    <div
                        className="evt-modal-container-lg"
                        style={{
                            position: 'fixed',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            top: '10%',
                            borderRadius: '20px 20px 0 0',
                            animation: 'slideUp 0.3s ease-out'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="evt-modal-header">
                            <div className="evt-modal-header-content">
                                <h2 className="evt-modal-title">내용</h2>
                                <button onClick={() => setShowDescriptionModal(false)} className="evt-modal-close-btn">
                                    <i className="ri-close-line evt-icon-xl"></i>
                                </button>
                            </div>
                        </div>

                        <div className="evt-modal-body-scroll" style={{ padding: '20px' }}>
                            <textarea
                                value={tempDescription}
                                onChange={(e) => setTempDescription(e.target.value)}
                                className="evt-form-input"
                                style={{
                                    minHeight: '400px',
                                    resize: 'vertical'
                                }}
                                placeholder="내용을 입력해주세요..."
                                autoFocus
                            />
                        </div>

                        <div className="evt-footer-sticky">
                            <button
                                onClick={() => {
                                    setFormData((prev: any) => ({ ...prev, description: tempDescription }));
                                    setShowDescriptionModal(false);
                                }}
                                className="evt-btn-primary"
                                style={{ width: '100%' }}
                            >
                                완료
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};
