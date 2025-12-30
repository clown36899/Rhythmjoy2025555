import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import VenueSelectModal from '../../v2/components/VenueSelectModal';
import type { SocialSchedule } from '../types';
import './SocialScheduleModal.css';

interface SocialScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (schedule: any) => void;
    groupId: number | null;
    editSchedule?: SocialSchedule | null;
    copyFrom?: any;
}

/* Schedule Type Selector */
/*
.schedule-type-selector {
  display: flex;
  background: #2d2d2d;
  padding: 4px;
  border-radius: 12px;
  gap: 4px;
}

.schedule-type-selector button {
  flex: 1;
  background: none;
  border: none;
  color: #9ca3af;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-type-selector button.active {
  background: #fbbf24;
  color: #1a1a1a;
}
*/

const SocialScheduleModal: React.FC<SocialScheduleModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    groupId,
    editSchedule,
    copyFrom
}) => {
    const { user } = useAuth();
    const [title, setTitle] = useState(editSchedule?.title || copyFrom?.title || '');
    const [scheduleType, setScheduleType] = useState<'once' | 'regular'>(
        (editSchedule?.date || copyFrom?.date) ? 'once' : 'regular'
    );
    const [date, setDate] = useState(editSchedule?.date || copyFrom?.date || '');
    const [dayOfWeek, setDayOfWeek] = useState<number | null>(
        editSchedule?.day_of_week ?? copyFrom?.day_of_week ?? null
    );
    const [startTime, setStartTime] = useState(editSchedule?.start_time || copyFrom?.start_time || '');
    const [description, setDescription] = useState(editSchedule?.description || copyFrom?.description || '');
    const [placeName, setPlaceName] = useState(editSchedule?.place_name || copyFrom?.place_name || '');
    const [address, setAddress] = useState(editSchedule?.address || copyFrom?.address || '');
    const [venueId, setVenueId] = useState<string | null>(editSchedule?.venue_id || copyFrom?.venue_id || null);
    const [linkUrl, setLinkUrl] = useState(editSchedule?.link_url || copyFrom?.link_url || '');
    const [linkName, setLinkName] = useState(editSchedule?.link_name || copyFrom?.link_name || '');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(
        editSchedule?.image_url || copyFrom?.image_url || null
    );

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const [showVenueModal, setShowVenueModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync state if props change while open
    useEffect(() => {
        if (!isOpen) return;
        const source = editSchedule || copyFrom;
        if (source) {
            setTitle(source.title || '');
            const type = source.date ? 'once' : 'regular';
            setScheduleType(type);
            setDate(source.date || '');
            setDayOfWeek(source.day_of_week ?? null);
            setStartTime(source.start_time || '');
            setDescription(source.description || '');
            setPlaceName(source.place_name || '');
            setAddress(source.address || '');
            setVenueId(source.venue_id || null);
            setLinkUrl(source.link_url || '');
            setLinkName(source.link_name || '');
            setImagePreview(source.image_url || null);
        } else {
            // Reset states if no edit/copy source is provided (e.g., for new schedule)
            setTitle('');
            setScheduleType('once');
            setDate('');
            setDayOfWeek(null);
            setStartTime('');
            setDescription('');
            setPlaceName('');
            setAddress('');
            setVenueId(null);
            setLinkUrl('');
            setLinkName('');
            setImagePreview(null);
            setImageFile(null);
        }
    }, [editSchedule?.id, copyFrom?.id, isOpen]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!isImageFile(file)) {
                alert('이미지 파일만 업로드 가능합니다.');
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                setTempImageSrc(event.target?.result as string);
                setIsCropModalOpen(true);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const handleCropComplete = (croppedFile: File, previewUrl: string, _isModified: boolean) => {
        setImageFile(croppedFile);
        setImagePreview(previewUrl);
        setIsCropModalOpen(false);
    };

    const handleVenueSelect = (venue: any) => {
        setVenueId(venue.id);
        setPlaceName(venue.name);
        setAddress(venue.address);
        setShowVenueModal(false);
    };

    const handleDelete = async () => {
        if (!editSchedule || !user) return;

        if (!window.confirm('정말로 이 일정을 삭제하시겠습니까?')) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('일정 삭제 중...');

        try {
            const { error } = await supabase
                .from('social_schedules')
                .delete()
                .eq('id', editSchedule.id);

            if (error) throw error;

            alert('일정이 삭제되었습니다.');
            onSuccess(null); // 삭제되었음을 알림
            onClose();
        } catch (error: any) {
            console.error('Error deleting schedule:', error);
            alert(`삭제 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!title.trim()) {
            alert('일정 제목을 입력해주세요.');
            return;
        }
        // 날짜 또는 요일 중 하나는 있어야 함
        if (!date && dayOfWeek === null) {
            alert('날짜 또는 반복 요일을 선택해주세요.');
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('일정 저장 중...');

        try {
            const source = editSchedule || copyFrom;
            let imageObj: any = {
                image_url: imagePreview,
                image_micro: source?.image_micro || null,
                image_thumbnail: source?.image_thumbnail || null,
                image_medium: source?.image_medium || null,
                image_full: source?.image_full || null,
            };

            if (imageFile) {
                setLoadingMessage('이미지 최적화 및 업로드 중...');
                const resized = await createResizedImages(imageFile);
                const timestamp = Date.now();
                const rand = Math.random().toString(36).substring(2, 7);
                const basePath = `social-schedules/${groupId}/${user.id}`;

                const upload = async (name: string, blob: Blob) => {
                    const path = `${basePath}/${name}/${timestamp}_${rand}.webp`;
                    const { error } = await supabase.storage.from('images').upload(path, blob);
                    if (error) throw error;
                    return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
                };

                const [micro, thumb, med, full] = await Promise.all([
                    upload('micro', resized.micro),
                    upload('thumbnails', resized.thumbnail),
                    upload('medium', resized.medium),
                    upload('full', resized.full)
                ]);

                imageObj = {
                    image_url: full,
                    image_micro: micro,
                    image_thumbnail: thumb,
                    image_medium: med,
                    image_full: full
                };
            }

            const scheduleData = {
                group_id: (groupId && groupId !== 0) ? groupId : (editSchedule?.group_id || null),
                title,
                date: scheduleType === 'once' ? (date || null) : null,
                day_of_week: scheduleType === 'regular' ? dayOfWeek : null,
                start_time: startTime || null,
                description,
                ...imageObj,
                venue_id: venueId,
                place_name: placeName,
                address: address,
                link_url: linkUrl || null,
                link_name: linkName || null,
                // user_id는 update 시 변경하지 않음 (권한 문제 방지)
                ...(editSchedule ? {} : { user_id: user.id }),
            };

            let resultData;

            if (editSchedule) {
                const { data, error } = await supabase
                    .from('social_schedules')
                    .update(scheduleData)
                    .eq('id', editSchedule.id)
                    .select(); // 업데이트 결과 확인을 위해 select() 추가

                if (error) throw error;
                if (!data || data.length === 0) {
                    throw new Error('수정 권한이 없거나 해당 일정을 찾을 수 없습니다.');
                }
                resultData = data[0];
            } else {
                const { data, error } = await supabase
                    .from('social_schedules')
                    .insert([scheduleData])
                    .select();

                if (error) throw error;
                if (data && data.length > 0) {
                    resultData = data[0];
                }
            }

            onSuccess(resultData || scheduleData);
            onClose();
        } catch (error: any) {
            console.error('Error saving schedule:', error);
            alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="social-schedule-modal-overlay">
            <div className="social-schedule-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="social-schedule-modal-header">
                    <h2>{editSchedule ? '일정 수정' : (copyFrom ? '일정 복사 등록' : '새 일정 등록')}</h2>
                    <button className="close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="social-schedule-modal-form">
                    <div className="form-section">
                        <label>일정 유형</label>
                        <div className="schedule-type-selector">
                            <button
                                type="button"
                                className={scheduleType === 'once' ? 'active' : ''}
                                onClick={() => { setScheduleType('once'); setDayOfWeek(null); }}
                            >단발성 (날짜)</button>
                            <button
                                type="button"
                                className={scheduleType === 'regular' ? 'active' : ''}
                                onClick={() => { setScheduleType('regular'); setDate(''); }}
                            >정규 (요일)</button>
                        </div>
                    </div>

                    <div className="form-section multi-row">
                        <div className="form-item">
                            <label>일정 제목 *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="예: 금요 정기 모임"
                                required
                            />
                        </div>

                        {scheduleType === 'once' ? (
                            <div className="form-item">
                                <label>날짜 *</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    required={scheduleType === 'once'}
                                />
                            </div>
                        ) : (
                            <div className="form-item">
                                <label>반복 요일 *</label>
                                <div className="weekday-selector">
                                    {['일', '월', '화', '수', '목', '금', '토'].map((name, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            className={dayOfWeek === i ? 'active' : ''}
                                            onClick={() => setDayOfWeek(i)}
                                        >{name}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="form-item">
                            <label>시작 시간</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-section">
                        <label>장소 및 위치</label>
                        <div className="location-box">
                            <div className="location-input-group">
                                <input
                                    type="text"
                                    value={placeName}
                                    onChange={(e) => {
                                        setPlaceName(e.target.value);
                                        if (venueId) setVenueId(null);
                                    }}
                                    placeholder="장소명 (직접 입력)"
                                />
                                <button
                                    type="button"
                                    className="venue-search-btn"
                                    onClick={() => setShowVenueModal(true)}
                                >
                                    <i className="ri-map-pin-line"></i> 장소 검색
                                </button>
                            </div>
                            <input
                                type="text"
                                className="address-input"
                                value={address}
                                onChange={(e) => {
                                    setAddress(e.target.value);
                                    if (venueId) setVenueId(null);
                                }}
                                placeholder="상세 주소 (선택)"
                            />
                        </div>
                    </div>

                    <div className="form-section">
                        <label>일정 포스터/이미지</label>
                        <div className="schedule-image-uploader" onClick={() => fileInputRef.current?.click()}>
                            {imagePreview ? (
                                <img src={imagePreview} alt="Schedule Preview" />
                            ) : (
                                <div className="upload-placeholder">
                                    <i className="ri-image-add-line"></i>
                                    <span>이미지 업로드</span>
                                </div>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageSelect}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className="form-section">
                        <label>일정 상세 설명</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="일정에 대한 상세 내용을 입력해주세요."
                            rows={3}
                        />
                    </div>

                    <div className="form-section multi-row link-row">
                        <div className="form-item" style={{ flex: '0 0 140px' }}>
                            <label>관련 링크 이름</label>
                            <input
                                type="text"
                                value={linkName}
                                onChange={(e) => setLinkName(e.target.value)}
                                placeholder="예: 신청폼"
                            />
                        </div>
                        <div className="form-item" style={{ flex: 1 }}>
                            <label>관련 링크 URL</label>
                            <input
                                type="url"
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                onBlur={() => {
                                    // 기본 UX: http/https 없으면 자동으로 붙여주기
                                    if (linkUrl && !linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
                                        setLinkUrl('https://' + linkUrl);
                                    }
                                }}
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className="form-actions">
                        {editSchedule && (
                            <button type="button" className="delete-btn" onClick={handleDelete} disabled={isSubmitting}>
                                <i className="ri-delete-bin-line"></i> 삭제
                            </button>
                        )}
                        <button type="button" className="cancel-btn" onClick={onClose} disabled={isSubmitting}>취소</button>
                        <button type="submit" className="submit-btn" disabled={isSubmitting}>
                            저장하기
                        </button>
                    </div>
                </form>
            </div>

            <ImageCropModal
                isOpen={isCropModalOpen}
                onClose={() => setIsCropModalOpen(false)}
                imageUrl={tempImageSrc}
                onCropComplete={handleCropComplete}
            />

            <VenueSelectModal
                isOpen={showVenueModal}
                onClose={() => setShowVenueModal(false)}
                onSelect={handleVenueSelect}
                onManualInput={(name, link) => {
                    setPlaceName(name);
                    setAddress(link);
                    setVenueId(null);
                    setShowVenueModal(false);
                }}
            />

            <GlobalLoadingOverlay
                isLoading={isSubmitting}
                message={loadingMessage}
            />
        </div>,
        document.body
    );
};

export default SocialScheduleModal;
