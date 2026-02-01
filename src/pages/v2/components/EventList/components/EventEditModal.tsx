import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale/ko";
import "../../../../../styles/domains/events.css";
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
    onDelete: (id: number | string) => void;
    isAdmin: boolean;
    user: any;
    allGenres: string[];
    onOpenVenueModal: () => void;
}

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder }: any, ref: any) => (
    <button type="button" onClick={onClick} ref={ref} className="ERM-input" style={{ textAlign: 'left' }}>
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
    <div className="evt-calendar-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', alignItems: 'center', background: '#374151', borderRadius: '8px', marginBottom: '8px' }}>
        <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="ERM-footerBtn ERM-footerBtn-cancel" style={{ padding: '4px 8px', flex: 'none' }}>
            <i className="ri-arrow-left-s-line"></i>
        </button>
        <div style={{ color: 'white', fontWeight: 'bold' }}>
            {date.getFullYear()}년 {date.getMonth() + 1}월
        </div>
        <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="ERM-footerBtn ERM-footerBtn-cancel" style={{ padding: '4px 8px', flex: 'none' }}>
            <i className="ri-arrow-right-s-line"></i>
        </button>
        {onTodayClick && (
            <button type="button" onClick={onTodayClick} className="ERM-footerBtn ERM-footerBtn-submit" style={{ padding: '4px 8px', fontSize: '12px', flex: 'none' }}>오늘</button>
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
        <div className={`EventEditModal ERM-overlay ${editPreviewMode === 'billboard' ? 'is-billboard' : ''}`}>
            {editPreviewMode === 'billboard' ? (
                <div className="ERM-billboardCard">
                    <div className="ERM-billboardMedia">
                        {formData.videoUrl && isValidVideoUrl(formData.videoUrl) ? (
                            <iframe
                                width="100%" height="100%"
                                src={`${videoPreview.embedUrl}?autoplay=1&mute=1&controls=0&loop=1`}
                                title="billboard" frameBorder="0" allowFullScreen
                                className="ERM-billboardVideo"
                            />
                        ) : imagePreview ? (
                            <img src={imagePreview} alt="preview" className="ERM-billboardImage" />
                        ) : (
                            <div className="ERM-billboardPlaceholder"><i className="ri-image-line"></i></div>
                        )}
                    </div>
                    <div className="ERM-billboardInfo">
                        <h3 className="ERM-billboardTitle">{formData.title || "제목"}</h3>
                        <p className="ERM-billboardDate">{formData.start_date || "날짜"}</p>
                        <button onClick={() => setEditPreviewMode('normal')} className="ERM-footerBtn ERM-footerBtn-cancel" style={{ marginTop: '12px' }}>수정으로 돌아가기</button>
                    </div>
                </div>
            ) : (
                <div className="ERM-container">
                    <div className="ERM-header">
                        <div className="ERM-headerContent">
                            <h2 className="ERM-title">이벤트 수정</h2>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => setEditPreviewMode('billboard')} className="ERM-switcherBtn" style={{ color: '#fff', border: '1px solid #555' }}>미리보기</button>
                                <button onClick={onClose} className="ERM-closeBtn">
                                    <i className="ri-close-line" style={{ fontSize: '24px' }}></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="ERM-body">
                        <form id="edit-event-form" onSubmit={handleSubmit} className="ERM-formGroup" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="ERM-formGroup">
                                <label className="ERM-label">이벤트 제목</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                                    className="ERM-input"
                                    required
                                />
                            </div>

                            <div className="ERM-formGroup" style={{ position: 'relative' }}>
                                <label className="ERM-label">장르 (7자 이내)</label>
                                <input
                                    type="text"
                                    value={formData.genre}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, genre: e.target.value }))}
                                    onFocus={handleGenreFocus}
                                    onBlur={() => setTimeout(() => setIsGenreInputFocused(false), 150)}
                                    className="ERM-input"
                                    maxLength={7}
                                />
                                {isGenreInputFocused && genreSuggestions.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#374151', border: '1px solid #4b5563', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', zIndex: 10 }}>
                                        {genreSuggestions.map(g => (
                                            <div key={g} onMouseDown={() => handleGenreSuggestionClick(g)} style={{ padding: '8px 12px', cursor: 'pointer', color: '#d1d5db' }} className="hover:bg-gray-600">{g}</div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="ERM-formGroup">
                                <label className="ERM-label">카테고리</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, category: e.target.value }))}
                                    className="ERM-select"
                                >
                                    <option value="class">강습</option>
                                    <option value="event">행사</option>
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="ERM-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>장소 이름</span>
                                        <button type="button" onClick={onOpenVenueModal} style={{ color: '#60a5fa', fontSize: '0.75rem', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <i className="ri-search-line"></i> 장소 검색
                                        </button>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, location: e.target.value }))}
                                        className="ERM-input"
                                    />
                                </div>
                                <div>
                                    <label className="ERM-label">주소 링크 (지도)</label>
                                    <input
                                        type="text"
                                        value={formData.locationLink}
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, locationLink: e.target.value }))}
                                        className="ERM-input"
                                        placeholder="https://map.naver.com/..."
                                    />
                                </div>
                            </div>

                            <div className="ERM-formGroup">
                                <label className="ERM-label">신청/상세 페이지 링크</label>
                                <input
                                    type="text"
                                    value={formData.link1}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, link1: e.target.value }))}
                                    className="ERM-input"
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="ERM-formGroup">
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', color: '#d1d5db', fontSize: '0.9rem' }}>
                                    <label><input type="radio" checked={formData.dateMode === 'range'} onChange={() => setFormData((prev: any) => ({ ...prev, dateMode: 'range' }))} /> 연속 기간</label>
                                    <label><input type="radio" checked={formData.dateMode === 'specific'} onChange={() => setFormData((prev: any) => ({ ...prev, dateMode: 'specific' }))} /> 특정 날짜</label>
                                </div>

                                {formData.dateMode === 'range' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                                            {formData.event_dates.map((d: string, i: number) => (
                                                <div key={i} style={{ background: '#374151', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {d} <button type="button" onClick={() => setFormData((prev: any) => ({ ...prev, event_dates: prev.event_dates.filter((_: any, idx: number) => idx !== i) }))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>x</button>
                                                </div>
                                            ))}
                                        </div>
                                        <input type="date" value={tempDateInput} onChange={(e) => setTempDateInput(e.target.value)} className="ERM-input" style={{ marginBottom: '4px' }} />
                                        <button type="button" onClick={() => { if (tempDateInput) { setFormData((prev: any) => ({ ...prev, event_dates: [...new Set([...prev.event_dates, tempDateInput])] })); setTempDateInput(""); } }} className="ERM-switcherBtn" style={{ border: '1px solid #555', padding: '4px 8px' }}>추가</button>
                                    </div>
                                )}
                            </div>

                            <div className="ERM-formGroup">
                                <label className="ERM-label">문의</label>
                                <input type="text" value={formData.contact} onChange={(e) => setFormData((prev: any) => ({ ...prev, contact: e.target.value }))} className="ERM-input" />
                            </div>

                            <div className="ERM-formGroup">
                                <label className="ERM-label">내용</label>
                                <div
                                    onClick={() => {
                                        setTempDescription(formData.description);
                                        setShowDescriptionModal(true);
                                    }}
                                    className="ERM-textarea"
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

                            <div className="ERM-formGroup">
                                <label className="ERM-label">이벤트 이미지</label>
                                {imagePreview && <img src={imagePreview} style={{ width: '100%', height: '192px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />}
                                <input type="file" onChange={handleImageChange} className="ERM-input" style={{ padding: '8px' }} />
                            </div>

                            <div className="ERM-formGroup">
                                <label className="ERM-label">영상 URL (유튜브)</label>
                                <input
                                    type="url"
                                    value={formData.videoUrl}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData((prev: any) => ({ ...prev, videoUrl: val }));
                                        const info = parseVideoUrl(val);
                                        setVideoPreview({ provider: info.provider, embedUrl: info.embedUrl });
                                    }}
                                    className="ERM-input"
                                />
                            </div>

                            <div style={{ background: '#1f2937', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <label className="ERM-label">등록자 이름 *</label>
                                <input type="text" value={formData.organizerName} onChange={(e) => setFormData((prev: any) => ({ ...prev, organizerName: e.target.value }))} className="ERM-input" required style={{ marginBottom: '12px' }} />
                                <label className="ERM-label">등록자 번호 *</label>
                                <input type="tel" value={formData.organizerPhone} onChange={(e) => setFormData((prev: any) => ({ ...prev, organizerPhone: e.target.value }))} className="ERM-input" required />
                            </div>
                        </form>
                    </div>

                    <div className="ERM-footer">
                        <button type="submit" form="edit-event-form" className="ERM-footerBtn ERM-footerBtn-submit">수정 완료</button>
                        <button type="button" onClick={() => onDelete(event!.id)} className="ERM-footerBtn" style={{ background: '#ef4444', color: 'white' }}>삭제</button>
                    </div>
                </div>
            )}

            {/* Description Editor Modal */}
            {showDescriptionModal && (
                <div
                    className="ERM-overlay"
                    style={{ zIndex: 10001 }}
                    onClick={() => setShowDescriptionModal(false)}
                >
                    <div
                        className="ERM-container"
                        style={{
                            position: 'fixed',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            top: '10%',
                            borderRadius: '20px 20px 0 0',
                            animation: 'slideUp 0.3s ease-out',
                            maxWidth: 'none',
                            width: '100%',
                            height: 'auto'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="ERM-header">
                            <div className="ERM-headerContent">
                                <h2 className="ERM-title">내용</h2>
                                <button onClick={() => setShowDescriptionModal(false)} className="ERM-closeBtn">
                                    <i className="ri-close-line" style={{ fontSize: '24px' }}></i>
                                </button>
                            </div>
                        </div>

                        <div className="ERM-body">
                            <textarea
                                value={tempDescription}
                                onChange={(e) => setTempDescription(e.target.value)}
                                className="ERM-textarea"
                                style={{
                                    height: '100%',
                                    minHeight: '400px',
                                    resize: 'none'
                                }}
                                placeholder="내용을 입력해주세요..."
                                autoFocus
                            />
                        </div>

                        <div className="ERM-footer">
                            <button
                                onClick={() => {
                                    setFormData((prev: any) => ({ ...prev, description: tempDescription }));
                                    setShowDescriptionModal(false);
                                }}
                                className="ERM-footerBtn ERM-footerBtn-submit"
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
