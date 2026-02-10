import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import { useLoading } from '../../../contexts/LoadingContext';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));
import type { SocialSchedule } from '../types';
import './SocialScheduleModal.css';

interface SocialScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (schedule: any) => void;
    groupId: number | null;
    editSchedule?: SocialSchedule | null;
    copyFrom?: any;
    initialTab?: 'schedule' | 'recruit';
    hideTabs?: boolean;
}

/* Schedule Type Selector */
/* ... */

const SocialScheduleModal: React.FC<SocialScheduleModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    groupId,
    editSchedule,
    copyFrom,
    initialTab = 'schedule',
    hideTabs = false
}) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'schedule' | 'recruit'>(initialTab);

    // Schedule State
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
    const [v2DisplayType, setV2DisplayType] = useState<string>(
        editSchedule?.v2_genre === '동호회정규강습' ? 'club_regular' :
            editSchedule?.v2_genre === '동호회강습' ? 'club_lesson' :
                editSchedule?.v2_category === null && editSchedule?.id ? 'social' : ''
    );

    // Recruit State
    const [recruitContent, setRecruitContent] = useState('');
    const [recruitContact, setRecruitContact] = useState('');
    const [recruitLink, setRecruitLink] = useState('');
    const [recruitImageFile, setRecruitImageFile] = useState<File | null>(null);
    const [recruitImagePreview, setRecruitImagePreview] = useState<string | null>(null);

    // Initial Load for Recruit
    useEffect(() => {
        if (activeTab === 'recruit' && groupId) {
            const fetchGroupRecruitInfo = async () => {
                const { data } = await supabase
                    .from('social_groups')
                    .select('recruit_content, recruit_contact, recruit_link, recruit_image')
                    .eq('id', groupId)
                    .single();
                if (data) {
                    setRecruitContent(data.recruit_content || '');
                    setRecruitContact(data.recruit_contact || '');
                    setRecruitLink(data.recruit_link || '');
                    setRecruitImagePreview(data.recruit_image || null);
                }
            };
            fetchGroupRecruitInfo();
        }
    }, [activeTab, groupId]);


    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const [showVenueModal, setShowVenueModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { showLoading, hideLoading } = useLoading();

    // 전역 로딩 상태 연동
    useEffect(() => {
        if (isSubmitting) {
            showLoading('social-schedule-save', loadingMessage);
        } else {
            hideLoading('social-schedule-save');
        }
    }, [isSubmitting, loadingMessage, showLoading, hideLoading]);

    // Cleanup on unmount
    useEffect(() => {
        return () => hideLoading('social-schedule-save');
    }, [hideLoading]);

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
            setV2DisplayType(
                source.v2_genre === '동호회정규강습' ? 'club_regular' :
                    source.v2_genre === '동호회강습' ? 'club_lesson' :
                        'social'
            );
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
            setV2DisplayType('social');
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
        if (activeTab === 'schedule') {
            setImageFile(croppedFile);
            setImagePreview(previewUrl);
        } else {
            setRecruitImageFile(croppedFile);
            setRecruitImagePreview(previewUrl);
        }
        setIsCropModalOpen(false);
    };

    const handleRecruitSubmit = async () => {
        if (!user || !groupId) return;

        if (!recruitImagePreview && !recruitImageFile) {
            alert('모집 이미지를 등록해주세요.');
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('모집 공고 저장 중...');

        try {
            const imageUrl = recruitImagePreview;

            if (recruitImageFile) {
                setLoadingMessage('이미지 최적화 중...');
                const resized = await createResizedImages(recruitImageFile);

                setLoadingMessage('이미지 업로드 중...');
                const timestamp = Date.now();
                const rand = Math.random().toString(36).substring(2, 7);
                const path = `social-groups/${groupId}/recruit/${timestamp}_${rand}.webp`;

                const progressInterval = setInterval(() => {
                    // setUploadProgress removed
                }, 200);

                try {
                    // User requested Medium size WebP for recruitment
                    const { error } = await supabase.storage.from('images').upload(path, resized.medium, {
                        contentType: 'image/webp',
                        upsert: true
                    });
                    if (error) throw error;
                    // setUploadProgress removed
                } finally {
                    clearInterval(progressInterval);
                }
            }

            const { error } = await supabase
                .from('social_groups')
                .update({
                    recruit_content: recruitContent,
                    recruit_contact: recruitContact,
                    recruit_link: recruitLink,
                    recruit_image: imageUrl
                })
                .eq('id', groupId);

            if (error) throw error;

            alert('모집 공고가 저장되었습니다.');
            onSuccess(null); // Just to refresh if needed
            onClose();
        } catch (error: any) {
            console.error('Recruit save error:', error);
            alert('저장 실패: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVenueSelect = (venue: any) => {
        setVenueId(venue.id);
        setPlaceName(venue.name);
        setAddress(venue.address);
        setShowVenueModal(false);
    };

    const handleDelete = async () => {
        if (!editSchedule || !user) return;

        if (!window.confirm('정말로 이 일정을 삭제하시겠습니까? 관련 이미지도 모두 삭제됩니다.')) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('일정 삭제 중...');


        try {
            // Get session for token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;


            const requestBody = {
                type: 'schedule',
                id: editSchedule.id
            };


            const response = await fetch('/.netlify/functions/delete-social-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(requestBody)
            });



            if (!response.ok) {
                const errData = await response.json();
                console.error('[SocialScheduleModal] ❌ Delete failed with error:', errData);
                throw new Error(errData.error || '삭제 요청 실패');
            }

            await response.json();


            alert('일정이 삭제되었습니다.');
            onSuccess(null); // 삭제되었음을 알림
            onClose();
        } catch (error: any) {
            console.error('[SocialScheduleModal] 💥 Error deleting schedule:', error);
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

        if (!v2DisplayType && activeTab === 'schedule') {
            alert('v2 메인 노출 분류를 선택해주세요.');
            return;
        }


        if (!imagePreview && !imageFile) {
            alert('일정 포스터 이미지를 등록해주세요.');
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
                setLoadingMessage('이미지 최적화 중...');
                const resized = await createResizedImages(imageFile);

                setLoadingMessage('이미지 업로드 중...');
                const timestamp = Date.now();
                const rand = Math.random().toString(36).substring(2, 7);
                let basePath = '';

                // Determine storage path
                const targetGroupId = (groupId && groupId !== 0) ? groupId : (editSchedule?.group_id || null);
                if (targetGroupId) {
                    const { data: groupData } = await supabase
                        .from('social_groups')
                        .select('storage_path')
                        .eq('id', targetGroupId)
                        .maybeSingle();
                    if (groupData && groupData.storage_path) {
                        basePath = `${groupData.storage_path}/schedules/${timestamp}_${rand}`;
                    }
                }
                if (!basePath) {
                    basePath = `social-schedules/${targetGroupId || 'personal'}/${user.id}/${timestamp}_${rand}`;
                }

                const progressInterval = setInterval(() => {
                    // setUploadProgress removed
                }, 200);

                try {
                    const upload = async (name: string, blob: Blob) => {
                        const path = `${basePath}/${name}.webp`;
                        const { error } = await supabase.storage.from('images').upload(path, blob, {
                            contentType: 'image/webp',
                            upsert: true
                        });
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
                } finally {
                    clearInterval(progressInterval);
                }
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
                v2_genre: v2DisplayType === 'club_regular' ? '동호회정규강습' :
                    v2DisplayType === 'club_lesson' ? '동호회강습' : null,
                v2_category: v2DisplayType === 'social' ? null : 'club',
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
                    <h2>일정 및 모집 관리</h2>
                    <button className="ssm-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* Tab Menu */}
                {!hideTabs && (
                    <div className="ssm-tabs">
                        <button
                            className={`ssm-tab ${activeTab === 'schedule' ? 'active' : ''}`}
                            onClick={() => setActiveTab('schedule')}
                        >
                            소셜 일정 등록
                        </button>
                        <button
                            className={`ssm-tab ${activeTab === 'recruit' ? 'active' : ''}`}
                            onClick={() => setActiveTab('recruit')}
                        >
                            원데이 일반인모집
                        </button>
                    </div>
                )}

                {activeTab === 'schedule' ? (
                    <form onSubmit={handleSubmit} className="social-schedule-modal-form">
                        {/* Schedule Type Selection Hidden as per user request */}
                        {/*
                    <div className="form-section">
                        <label>일정 유형</label>
                        <div className="schedule-type-selector">
                            <button
                                type="button"
                                className={scheduleType === 'once' ? 'active' : ''}
                                onClick={() => { setScheduleType('once'); setDayOfWeek(null); }}
                            >단발성 (날짜)</button>
                            {(editSchedule && !editSchedule.date) && (
                                <button
                                    type="button"
                                    className={scheduleType === 'regular' ? 'active' : ''}
                                    onClick={() => { setScheduleType('regular'); setDate(''); }}
                                >정규 (요일)</button>
                            )}
                        </div>
                    </div>
                    */}

                        <div className="form-section">
                            <div className="info-box-helper">
                                <i className="ri-information-line"></i>
                                <span>등록된 일정은 <strong>오늘, 이번 주 일정</strong>에 노출됩니다.</span>
                            </div>
                        </div>

                        <div className="form-section multi-row">
                            <div className="form-item">
                                <label>일정 제목 *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="예: 금(?) DJ 누구"
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
                            <label>일정 포스터/이미지 *</label>
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
                            <div className="form-item is-narrow">
                                <label>관련 링크 이름</label>
                                <input
                                    type="text"
                                    value={linkName}
                                    onChange={(e) => setLinkName(e.target.value)}
                                    placeholder="예: 신청폼"
                                />
                            </div>
                            <div className="form-item is-grow">
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

                        <div className="form-section v2-display-section">
                            <label>v2 메인 노출 분류 (필수) *</label>
                            <select
                                value={v2DisplayType}
                                onChange={(e) => setV2DisplayType(e.target.value)}
                                className="v2-display-select"
                                required
                            >
                                <option value="" disabled>분류를 선택해주세요</option>
                                <option value="social">소셜일정 (오늘일정, 이번주일정 노출)</option>
                                <option value="club_lesson">동호회 강습 (메인 동호회섹션 노출)</option>
                                <option value="club_regular">동호회 정규강습 (메인 동호회섹션 노출)</option>
                            </select>
                            <div className="v2-display-description">
                                {v2DisplayType === 'social' && <p><i className="ri-information-line"></i> 메인 상단<strong>오늘/이번 주 일정</strong>에 노출됩니다.</p>}
                                {v2DisplayType === 'club_lesson' && <p><i className="ri-global-line"></i> 메인 하단 <strong>[강습 & 행사]</strong> 섹션의 동호회 탭에 노출됩니다.</p>}
                                {v2DisplayType === 'club_regular' && <p><i className="ri-calendar-check-line"></i>메인 하단 <strong>[강습 & 행사]</strong> 섹션의 동호회 정규강습 필터에 노출됩니다.</p>}
                                {!v2DisplayType && <p className="warning"><i className="ri-error-warning-line"></i> 어디에 노출할지 반드시 선택해야 합니다.</p>}
                            </div>
                        </div>

                        <div className="ssm-form-actions">
                            {editSchedule && (
                                <button type="button" className="ssm-delete-btn" onClick={handleDelete} disabled={isSubmitting}>
                                    <i className="ri-delete-bin-line"></i> 삭제
                                </button>
                            )}
                            <button type="button" className="ssm-cancel-btn" onClick={onClose} disabled={isSubmitting}>취소</button>
                            <button type="submit" className="ssm-submit-btn" disabled={isSubmitting}>
                                저장하기
                            </button>
                        </div>
                    </form>
                ) : (
                    /* RECRUIT FORM */
                    <form className="social-schedule-modal-form" onSubmit={handleRecruitSubmit}>
                        <div className="form-section">
                            <div className="info-box-helper">
                                <i className="ri-information-line"></i>
                                <span>신규 모집 내용을 등록하거나 수정하시면, <strong>최신 순서로 단체 리스트 최상단</strong>에 노출됩니다.</span>
                            </div>

                            <label>모집 내용</label>
                            <textarea
                                value={recruitContent}
                                onChange={(e) => setRecruitContent(e.target.value)}
                                placeholder="신입 회원 모집에 대한 상세 내용을 입력해주세요. (대상, 활동 내용 등)"
                                rows={5}
                            />
                        </div>

                        <div className="form-section">
                            <label>모집 포스터/이미지 *</label>
                            <div className="schedule-image-uploader" onClick={() => fileInputRef.current?.click()}>
                                {recruitImagePreview ? (
                                    <img src={recruitImagePreview} alt="Recruit Preview" />
                                ) : (
                                    <div className="upload-placeholder">
                                        <i className="ri-image-add-line"></i>
                                        <span>이미지 업로드</span>
                                    </div>
                                )}
                            </div>
                            {/* Re-use ref or make new one. Reusing is tricky if we switch tabs. Let's assume one uploader at a time visible */}
                            {/* But we need to handle change differently based on activeTab */}
                        </div>

                        <div className="form-section">
                            <label>연락처</label>
                            <input
                                type="text"
                                value={recruitContact}
                                onChange={(e) => setRecruitContact(e.target.value)}
                                placeholder="예: 010-1234-5678, 카톡 ID"
                            />
                        </div>

                        <div className="form-section">
                            <label>신청/문의 링크</label>
                            <input
                                type="text"
                                value={recruitLink}
                                onChange={(e) => setRecruitLink(e.target.value)}
                                placeholder="오픈채팅방, 구글폼 등 URL"
                            />
                        </div>

                        <div className="ssm-form-actions">
                            <button type="button" className="ssm-cancel-btn" onClick={onClose} disabled={isSubmitting}>취소</button>
                            <button
                                type="submit"
                                className="ssm-submit-btn"
                                disabled={isSubmitting}
                            >
                                모집 공고 저장
                            </button>
                        </div>
                    </form>
                )}
                {/* File Input for Both Tabs */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="ssm-hidden-input"
                />
            </div>


            <ImageCropModal
                isOpen={isCropModalOpen}
                onClose={() => setIsCropModalOpen(false)}
                imageUrl={tempImageSrc}
                onCropComplete={handleCropComplete}
                onChangeImage={() => {

                    fileInputRef.current?.click();
                }}
                onImageUpdate={(file: File) => {
                    if (!isImageFile(file)) {
                        alert('이미지 파일만 업로드 가능합니다.');
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {

                        setTempImageSrc(e.target?.result as string);
                    };
                    reader.onerror = (error) => {
                        console.error('[SocialScheduleModal] FileReader error in onImageUpdate:', error);
                    };
                    reader.readAsDataURL(file);
                }}
            />

            <React.Suspense fallback={null}>
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
            </React.Suspense>
        </div>,
        document.body
    );
};

export default SocialScheduleModal;
