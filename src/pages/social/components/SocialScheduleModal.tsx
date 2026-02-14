import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import { useLoading } from '../../../contexts/LoadingContext';
import ImageCropModal from '../../../components/ImageCropModal';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));

import type { SocialScheduleModalProps } from '../types';
import '../styles/SocialScheduleModal.css';

const SocialScheduleModal: React.FC<SocialScheduleModalProps> = ({
    isOpen,
    onClose,
    groupId,
    initialDate,
    editSchedule,
    initialData,
    initialTab,
    onSuccess
}) => {
    const { user, isAdmin } = useAuth();
    const { showLoading, hideLoading } = useLoading();

    // UI State
    const [activeTab, setActiveTab] = useState<'social' | 'oneday'>('social');

    // Social Schedule Form States
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');
    const [address, setAddress] = useState('');
    const [venueId, setVenueId] = useState<string | number | null>(null);
    const [linkName, setLinkName] = useState('');
    const [link, setLink] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('social');

    // Social Schedule Image States
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Recruit Form States
    const [recruitContent, setRecruitContent] = useState('');
    const [recruitContact, setRecruitContact] = useState('');
    const [recruitLink, setRecruitLink] = useState('');
    const [recruitImageFile, setRecruitImageFile] = useState<File | null>(null);
    const [recruitImagePreview, setRecruitImagePreview] = useState<string | null>(null);

    // Common States
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recruitFileInputRef = useRef<HTMLInputElement>(null);

    // Modal States
    const [showVenueModal, setShowVenueModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    // Initialize Form (Social Schedule)
    useEffect(() => {
        if (isOpen) {
            // Tab Reset logic: if editSchedule exists, force social tab.
            // else use initialTab if provided.
            if (editSchedule) {
                setActiveTab('social');
            } else if (initialTab) {
                setActiveTab(initialTab);
            } else {
                setActiveTab('social');
            }

            const source = editSchedule || initialData;
            if (source) {
                // 수정 또는 복사
                setTitle(source.title || '');
                const d = source.date || source.start_date || '';
                setDate(d);
                setTime(source.time || source.start_time || '');
                setLocation(source.location || source.place_name || '');
                setAddress(source.address || '');
                setVenueId(source.venue_id || null);

                setLink(source.link1 || source.link_url || '');
                setLinkName(source.link_name1 || source.link_name || '');
                setDescription(source.description || '');

                // Category mapping
                setCategory(source.category || source.v2_category || 'social');

                // Image
                const imgUrl = source.image || source.image_url || source.image_medium || source.image_full || '';
                setImagePreview(imgUrl || null);
                setImageFile(null);
            } else {
                // 신규 등록
                // Don't reset everything if tab changes, only on open? 
                // InitialDate logic
                setTitle('');
                setDate(initialDate ? initialDate.toISOString().split('T')[0] : '');
                setTime('');
                setLocation('');
                setAddress('');
                setVenueId(null);
                setLink('');
                setLinkName('');
                setDescription('');
                setCategory('social');
                setImagePreview(null);
                setImageFile(null);
            }
        }
    }, [isOpen, editSchedule, initialData, initialDate, initialTab]);

    // Initialize Form (Recruit) - Fetch on Open
    useEffect(() => {
        const targetGroupId = groupId || editSchedule?.group_id;
        if (isOpen && targetGroupId) {
            const fetchRecruitInfo = async () => {
                const { data } = await supabase
                    .from('social_groups')
                    .select('recruit_content, recruit_contact, recruit_link, recruit_image')
                    .eq('id', targetGroupId)
                    .single();

                if (data) {
                    setRecruitContent(data.recruit_content || '');
                    setRecruitContact(data.recruit_contact || '');
                    setRecruitLink(data.recruit_link || '');
                    setRecruitImagePreview(data.recruit_image || null);
                    setRecruitImageFile(null);
                }
            };
            fetchRecruitInfo();
        }
    }, [isOpen, groupId, editSchedule]);

    // Loading State Sync
    useEffect(() => {
        if (isSubmitting) {
            showLoading('social-save', loadingMessage);
        } else {
            hideLoading('social-save');
        }
    }, [isSubmitting, loadingMessage, showLoading, hideLoading]);

    useEffect(() => {
        return () => hideLoading('social-save');
    }, [hideLoading]);


    // Helper Functions
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, isRecruit: boolean = false) => {
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
                // Tag which image we are editing
                // We'll use a ref or simple logic in crop complete based on activeTab
                // logic: activeTab determines target? Yes.
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const handleCropComplete = (croppedFile: File, previewUrl: string, _isModified: boolean) => {
        if (activeTab === 'social') {
            setImageFile(croppedFile);
            setImagePreview(previewUrl);
        } else {
            setRecruitImageFile(croppedFile);
            setRecruitImagePreview(previewUrl);
        }
        setIsCropModalOpen(false);
    };

    const handleVenueSelect = (venue: any) => {
        setLocation(venue.name);
        setAddress(venue.address);
        setVenueId(venue.id);
        setShowVenueModal(false);
    };


    const handleDelete = async () => {
        if (!editSchedule || !user) return;

        if (!window.confirm("정말로 일정을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.")) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('삭제 중...');

        try {
            const targetId = String(editSchedule.id).replace('social-', '');

            const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', targetId);

            if (error) throw error;

            alert('일정이 삭제되었습니다.');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error deleting schedule:', error);
            alert(`삭제 실패: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (activeTab === 'social') {
            // === Social Schedule Submit ===
            if (!title.trim()) { alert('일정 제목을 입력해주세요.'); return; }
            if (!date) { alert('날짜를 선택해주세요.'); return; }
            if (!location.trim()) { alert('장소를 입력해주세요.'); return; }
            if (!category) { alert('분류를 선택해주세요.'); return; }

            if (!imagePreview && !imageFile) {
                alert('일정 이미지를 등록해주세요.');
                return;
            }

            setIsSubmitting(true);
            setLoadingMessage('일정 저장 중...');

            try {
                // 1. Upload Image
                let finalImageUrl = imagePreview;
                let imageMicro = editSchedule?.image_micro || null;
                let imageThumbnail = editSchedule?.image_thumbnail || null;
                let imageMedium = editSchedule?.image_medium || null;
                let imageFull = editSchedule?.image_full || null;

                if (imageFile) {
                    setLoadingMessage('이미지 최적화 및 업로드 중...');
                    const resized = await createResizedImages(imageFile);

                    const timestamp = Date.now();
                    const randomStr = Math.random().toString(36).substring(2, 7);
                    const folderName = `${timestamp}_${randomStr}`;
                    const storagePath = `social-events/${folderName}`;

                    const uploadImage = async (size: string, blob: Blob) => {
                        const path = `${storagePath}/${size}.webp`;
                        const { error } = await supabase.storage.from('images').upload(path, blob, {
                            contentType: 'image/webp',
                            upsert: true
                        });
                        if (error) throw error;
                        return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
                    };

                    const [microUrl, thumbUrl, medUrl, fullUrl] = await Promise.all([
                        uploadImage('micro', resized.micro),
                        uploadImage('thumbnail', resized.thumbnail),
                        uploadImage('medium', resized.medium),
                        uploadImage('full', resized.full)
                    ]);

                    finalImageUrl = fullUrl;
                    imageMicro = microUrl;
                    imageThumbnail = thumbUrl;
                    imageMedium = medUrl;
                    imageFull = fullUrl;
                }

                // 2. Prepare Data
                let genre = 'Social';
                if (category === 'club_lesson' || category === 'club_regular') {
                    genre = 'Lindy';
                }

                const eventData: any = {
                    title,
                    date,
                    time,
                    location,
                    address,
                    venue_id: venueId,
                    link1: link,
                    link_name1: linkName,
                    description,
                    image: finalImageUrl,
                    image_micro: imageMicro,
                    image_thumbnail: imageThumbnail,
                    image_medium: imageMedium,
                    image_full: imageFull,
                    group_id: groupId || editSchedule?.group_id,
                    user_id: user.id,
                    category: category,
                    genre: genre,
                    day_of_week: new Date(date).getDay()
                };

                // 3. Save
                if (editSchedule) {
                    const targetId = String(editSchedule.id).replace('social-', '');
                    const { error } = await supabase
                        .from('events')
                        .update(eventData)
                        .eq('id', targetId);
                    if (error) throw error;
                } else {
                    const { error } = await supabase
                        .from('events')
                        .insert([eventData]);
                    if (error) throw error;
                }

                onSuccess();
                onClose();

            } catch (error: any) {
                console.error('Error saving schedule:', error);
                alert(`저장 실패: ${error.message}`);
            } finally {
                setIsSubmitting(false);
            }

        } else {
            // === Recruit Submit ===
            if (!recruitContent.trim()) { alert('모집 내용을 입력해주세요.'); return; }
            if (!recruitImagePreview && !recruitImageFile) {
                alert('모집 이미지를 등록해주세요.');
                return;
            }

            setIsSubmitting(true);
            setLoadingMessage('모집 공고 저장 중...');

            try {
                let imageUrl = recruitImagePreview;

                if (recruitImageFile) {
                    setLoadingMessage('이미지 업로드 중...');
                    const resized = await createResizedImages(recruitImageFile);

                    // Recruit uses simpler image path structure usually, similar to social groups
                    const timestamp = Date.now();
                    const rand = Math.random().toString(36).substring(2, 7);
                    const path = `social-groups/${groupId}/recruit/${timestamp}_${rand}.webp`;

                    const { error: uploadError } = await supabase.storage.from('images').upload(path, resized.medium, {
                        contentType: 'image/webp',
                        upsert: true
                    });
                    if (uploadError) throw uploadError;

                    imageUrl = supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
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
                onSuccess();
                onClose();
            } catch (error: any) {
                console.error('Recruit save error:', error);
                alert(`저장 실패: ${error.message}`);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="social-schedule-modal-overlay">
            <div className="social-schedule-modal-container" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="social-schedule-modal-header">
                    <h2>일정 및 모집 관리</h2>
                    <button className="ssm-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div className="ssm-tabs">
                    <button
                        className={`ssm-tab ${activeTab === 'social' ? 'active' : ''}`}
                        onClick={() => setActiveTab('social')}
                    >
                        소셜 일정 등록
                    </button>
                    {!editSchedule && ( // 수정 모드일때는 탭 전환을 막거나 숨김 (단순화)
                        <button
                            className={`ssm-tab ${activeTab === 'oneday' ? 'active' : ''}`}
                            onClick={() => setActiveTab('oneday')}
                        >
                            원데이 일반인모집
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="social-schedule-modal-form">

                    {activeTab === 'social' ? (
                        <>
                            {/* === SOCIAL FORM === */}
                            <div className="form-section">
                                <div className="info-box-helper">
                                    <i className="ri-information-line"></i>
                                    <span>등록된 일정은 <strong>오늘, 이번 주 일정</strong>에 노출됩니다.</span>
                                </div>
                            </div>

                            <div className="form-section multi-row">
                                <div className="form-item is-grow">
                                    <label>일정 제목 *</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="예: 금(?) DJ 누구"
                                        required
                                    />
                                </div>
                                <div className="form-item">
                                    <label>날짜 *</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-item">
                                    <label>시작 시간</label>
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={(e) => setTime(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-section">
                                <label>장소 및 위치</label>
                                <div className="location-box">
                                    <div className="location-input-group">
                                        <input
                                            type="text"
                                            value={location}
                                            onClick={() => setShowVenueModal(true)}
                                            readOnly={true}
                                            placeholder="장소명 (직접 입력)"
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <button type="button" className="venue-search-btn" onClick={() => setShowVenueModal(true)}>
                                            <i className="ri-map-pin-line"></i> 장소 검색
                                        </button>
                                    </div>
                                    <input
                                        className="address-input"
                                        type="text"
                                        value={address}
                                        readOnly
                                        placeholder="상세 주소 (선택)"
                                    />
                                </div>
                            </div>

                            <div className="form-section">
                                <label>일정 포스터/이미지 *</label>
                                <div
                                    className="schedule-image-uploader"
                                    style={imagePreview ? { backgroundImage: `url(${imagePreview})` } : {}}
                                    onClick={() => {
                                        setTempImageSrc(imagePreview);
                                        fileInputRef.current?.click();
                                    }}
                                >
                                    {!imagePreview && (
                                        <div className="upload-placeholder">
                                            <i className="ri-image-add-line"></i>
                                            <span>이미지 업로드</span>
                                        </div>
                                    )}
                                    {imagePreview && (
                                        <div className="image-edit-overlay">
                                            <i className="ri-image-edit-line"></i>
                                            <span>이미지 편집</span>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    className="ssm-hidden-input"
                                    ref={fileInputRef}
                                    onChange={(e) => handleImageSelect(e, false)}
                                    accept="image/*"
                                />
                            </div>

                            <div className="form-section">
                                <label>일정 상세 설명</label>
                                <textarea
                                    rows={3}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="일정에 대한 상세 내용을 입력해주세요."
                                ></textarea>
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
                                        type="text"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="form-section v2-display-section">
                                <label>v2 메인 노출 분류 (필수) *</label>
                                <select
                                    className="v2-display-select"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>분류를 선택해주세요</option>
                                    <option value="social">소셜일정 (오늘일정, 이번주일정 노출)</option>
                                    <option value="club_lesson">동호회 강습 (메인 동호회섹션 노출)</option>
                                    <option value="club_regular">동호회 정규강습 (메인 동호회섹션 노출)</option>
                                </select>
                                <div className="v2-display-description">
                                    <p>
                                        <i className="ri-information-line"></i>
                                        메인 상단 <strong>오늘/이번 주 일정</strong>에 노출됩니다.
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* === RECRUIT FORM === */}
                            <div className="form-section">
                                <div className="info-box-helper">
                                    <i className="ri-information-line"></i>
                                    <span>신규 모집 내용을 등록하거나 수정하시면, <strong>최신 순서로 단체 리스트 최상단</strong>에 노출됩니다.</span>
                                </div>
                                <label>모집 내용</label>
                                <textarea
                                    placeholder="신입 회원 모집에 대한 상세 내용을 입력해주세요. (대상, 활동 내용 등)"
                                    rows={5}
                                    value={recruitContent}
                                    onChange={(e) => setRecruitContent(e.target.value)}
                                    required
                                ></textarea>
                            </div>

                            <div className="form-section">
                                <label>모집 포스터/이미지 *</label>
                                <div
                                    className="schedule-image-uploader"
                                    style={recruitImagePreview ? { backgroundImage: `url(${recruitImagePreview})` } : {}}
                                    onClick={() => {
                                        setTempImageSrc(recruitImagePreview);
                                        recruitFileInputRef.current?.click();
                                    }}
                                >
                                    {!recruitImagePreview && (
                                        <div className="upload-placeholder">
                                            <i className="ri-image-add-line"></i>
                                            <span>이미지 업로드</span>
                                        </div>
                                    )}
                                    {recruitImagePreview && (
                                        <div className="image-edit-overlay">
                                            <i className="ri-image-edit-line"></i>
                                            <span>이미지 편집</span>
                                        </div>
                                    )}
                                </div>
                                <input
                                    accept="image/*"
                                    className="ssm-hidden-input"
                                    type="file"
                                    ref={recruitFileInputRef}
                                    onChange={(e) => handleImageSelect(e, true)}
                                />
                            </div>

                            <div className="form-section">
                                <label>연락처</label>
                                <input
                                    placeholder="예: 010-1234-5678, 카톡 ID"
                                    type="text"
                                    value={recruitContact}
                                    onChange={(e) => setRecruitContact(e.target.value)}
                                />
                            </div>

                            <div className="form-section">
                                <label>신청/문의 링크</label>
                                <input
                                    placeholder="오픈채팅방, 구글폼 등 URL"
                                    type="text"
                                    value={recruitLink}
                                    onChange={(e) => setRecruitLink(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Actions */}
                    <div className="ssm-form-actions">
                        {activeTab === 'social' && editSchedule && (
                            <button
                                type="button"
                                className="ssm-delete-btn"
                                onClick={handleDelete}
                            >
                                <i className="ri-delete-bin-line"></i> 삭제
                            </button>
                        )}
                        <button type="button" className="ssm-cancel-btn" onClick={onClose}>취소</button>
                        <button type="submit" className="ssm-submit-btn">
                            {activeTab === 'social' ? '일정 저장하기' : '모집 공고 저장'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );

    return (
        <>
            {createPortal(modalContent, document.body)}

            <React.Suspense fallback={null}>
                <VenueSelectModal
                    isOpen={showVenueModal}
                    onClose={() => setShowVenueModal(false)}
                    onSelect={handleVenueSelect}
                    onManualInput={(name, _link) => {
                        setLocation(name);
                        setShowVenueModal(false);
                    }}
                />
            </React.Suspense>

            <ImageCropModal
                isOpen={isCropModalOpen}
                imageUrl={tempImageSrc}
                onClose={() => setIsCropModalOpen(false)}
                onCropComplete={handleCropComplete}
                onChangeImage={() => {
                    const ref = activeTab === 'social' ? fileInputRef : recruitFileInputRef;
                    ref.current?.click();
                }}
                onImageUpdate={(file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => setTempImageSrc(e.target?.result as string);
                    reader.readAsDataURL(file);
                }}
            />
        </>
    );
};

export default SocialScheduleModal;
