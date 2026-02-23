import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import { useLoading } from '../../../contexts/LoadingContext';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));
import './SocialGroupModal.css';

interface SocialGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (group: any) => void;
    editGroup?: any;
}

const SocialGroupModal: React.FC<SocialGroupModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    editGroup
}) => {
    const { user, isAdmin } = useAuth();
    const [name, setName] = useState('');
    const [type, setType] = useState<'club' | 'bar' | 'etc'>('club');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [link, setLink] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [showVenueModal, setShowVenueModal] = useState(false);

    // Image Crop State
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { showLoading, hideLoading } = useLoading();
    const hasLockedRef = useRef(false);

    // Body scroll lock
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            hasLockedRef.current = true;
        }
        return () => {
            if (hasLockedRef.current) {
                document.body.style.overflow = '';
                hasLockedRef.current = false;
            }
        };
    }, [isOpen]);

    // 전역 로딩 상태 연동
    useEffect(() => {
        if (isSubmitting) {
            showLoading('social-group-save', loadingMessage);
        } else {
            hideLoading('social-group-save');
        }
    }, [isSubmitting, loadingMessage, showLoading, hideLoading]);

    // Cleanup on unmount
    useEffect(() => {
        return () => hideLoading('social-group-save');
    }, [hideLoading]);

    useEffect(() => {
        if (isOpen) {
            if (editGroup) {
                setName(editGroup.name || '');
                setType(editGroup.type || 'club');
                setDescription(editGroup.description || '');
                setAddress(editGroup.address || '');
                setLink(editGroup.link || '');
                setImagePreview(editGroup.image_url || null);
                setPassword(editGroup.password || '');
            } else {
                setName('');
                setType('club');
                setDescription('');
                setAddress('');
                setLink('');
                setImagePreview(null);
                setImageFile(null);
                setPassword('');
            }
        }
    }, [isOpen, editGroup]);

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
        setAddress(venue.address);
        setShowVenueModal(false);
    };

    const handleDelete = async () => {
        if (!editGroup || !user) return;
        const isOwner = user.id === editGroup.user_id;
        const isAdminUser = isAdmin; // Using prop from useAuth

        let deletePassword = '';
        if (!isOwner && !isAdminUser) {
            const input = prompt('삭제하려면 비밀번호를 입력하세요:');
            if (input === null) return;
            deletePassword = input;
        }

        if (!window.confirm("삭제된 데이터는 복구할 수 없습니다.\n정말로 삭제하시겠습니까?")) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('삭제 중...');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/.netlify/functions/delete-social-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    type: 'group',
                    id: editGroup.id,
                    password: deletePassword
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || errData.message || '삭제 요청 실패');
            }

            alert('단체가 삭제되었습니다.');
            onSuccess(null);
            onClose();
        } catch (error: any) {
            console.error('[handleDelete] Error:', error);
            alert(`삭제 실패: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!user) {
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: { message: '단체 등록은 로그인 후 이용 가능합니다.' }
            }));
            return;
        }

        if (!name.trim()) {
            alert('단체 이름을 입력해주세요.');
            return;
        }

        const isCreator = editGroup ? editGroup.user_id === user.id : true;
        const canEditWithoutPassword = isAdmin || isCreator;

        if (!editGroup && !password.trim()) {
            alert('관리 비밀번호를 설정해주세요.\n(다른 사용자도 이 비밀번호로 그룹을 수정/관리할 수 있습니다)');
            return;
        }
        if (editGroup && !canEditWithoutPassword && !password.trim()) {
            alert('수정을 위해 관리 비밀번호를 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('저장 중...');

        try {
            let finalImageUrl = imagePreview;
            let imageMicro = editGroup?.image_micro || null;
            let imageThumbnail = editGroup?.image_thumbnail || null;
            let imageMedium = editGroup?.image_medium || null;
            let imageFull = editGroup?.image_full || null;
            let storagePath = editGroup?.storage_path || null;

            if (imageFile) {
                setLoadingMessage('이미지 최적화 및 업로드 중...');
                const resized = await createResizedImages(imageFile);
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 7);
                const folderName = `${timestamp}_${randomStr}`;
                const newStoragePath = `social-groups/${folderName}`;
                const basePath = `${newStoragePath}/profile`;

                const uploadImage = async (size: string, blob: Blob) => {
                    const path = `${basePath}/${size}.webp`;
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
                storagePath = newStoragePath;
            }

            const groupData: any = {
                name,
                type,
                description,
                address,
                link,
            };

            if (imageFile) {
                groupData.image_url = finalImageUrl;
                groupData.image_micro = imageMicro;
                groupData.image_thumbnail = imageThumbnail;
                groupData.image_medium = imageMedium;
                groupData.image_full = imageFull;
                groupData.storage_path = storagePath;
            }

            if (!editGroup) {
                groupData.user_id = user.id;
                groupData.password = password;
            } else {
                if (canEditWithoutPassword && password.trim()) {
                    groupData.password = password;
                }
            }

            let result;
            if (editGroup) {
                const { error } = await supabase
                    .from('social_groups')
                    .update(groupData)
                    .eq('id', editGroup.id);
                if (error) throw error;
                result = { ...editGroup, ...groupData };
            } else {
                const { data, error } = await supabase
                    .from('social_groups')
                    .insert([groupData])
                    .select()
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('그룹 생성에 실패했습니다.');
                result = data;
            }

            onSuccess(result);
            onClose();
        } catch (error: any) {
            console.error('Error saving:', error);
            alert(`저장 실패: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const isCreatorStatus = editGroup ? editGroup.user_id === user?.id : true;

    const mainModal = createPortal(
        <div className="social-group-modal-overlay" onClick={onClose}>
            <div className="social-group-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="social-group-modal-header">
                    <h2>{editGroup ? '단체 정보 수정' : '새 단체 등록'}</h2>
                    <button
                        type="button"
                        className="modal-close-x-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="social-group-modal-form">
                    <div className="info-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 'bold' }}>
                            <i className="ri-lock-password-line"></i>
                            <span>공동 관리 기능</span>
                        </div>
                        설정한 비밀번호를 공유하면, 다른 사용자도 이 단체의 정보를 수정하거나 일정을 등록할 수 있습니다.
                    </div>

                    <div className="form-section image-section">
                        <div
                            className="image-preview-box"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setTempImageSrc(imagePreview);
                                setIsCropModalOpen(true);
                            }}
                        >
                            {imagePreview ? (
                                <>
                                    <img src={imagePreview} alt="Preview" />
                                    <div className="image-edit-overlay">
                                        <i className="ri-image-edit-line"></i>
                                        <span>이미지 편집</span>
                                    </div>
                                </>
                            ) : (
                                <div className="image-placeholder">
                                    <i className="ri-image-add-line"></i>
                                    <span>대표 이미지</span>
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
                        <label>단체 이름 *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="예: 강남 스윙동호회"
                            required
                        />
                    </div>

                    <div className="form-section">
                        <label>
                            관리 비밀번호 {editGroup ? (isCreatorStatus ? '(변경 시 입력)' : '(수정 권한 인증)') : '*'}
                        </label>
                        <input
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={editGroup ? (isCreatorStatus ? "기존 비밀번호 유지" : "인증된 비밀번호") : "비밀번호 설정 (필수)"}
                            className={`password-input ${editGroup && !isCreatorStatus ? 'readonly' : ''}`}
                            readOnly={!!editGroup && !isCreatorStatus}
                        />
                        <p className="field-hint">
                            {editGroup && !isCreatorStatus
                                ? "🔒 공동 관리자는 비밀번호 및 단체 삭제 권한이 없습니다."
                                : "이 비밀번호를 아는 회원은 누구나 단체를 관리할 수 있습니다."}
                        </p>
                    </div>

                    <div className="form-section">
                        <label>분류</label>
                        <div className="type-selector">
                            <button
                                type="button"
                                className={type === 'club' ? 'active' : ''}
                                onClick={(e) => { e.stopPropagation(); setType('club'); }}
                            >동호회</button>
                            <button
                                type="button"
                                className={type === 'bar' ? 'active' : ''}
                                onClick={(e) => { e.stopPropagation(); setType('bar'); }}
                            >바(Bar)</button>
                            <button
                                type="button"
                                className={type === 'etc' ? 'active' : ''}
                                onClick={(e) => { e.stopPropagation(); setType('etc'); }}
                            >기타</button>
                        </div>
                    </div>

                    <div className="form-section">
                        <label>주소 (장소/모임 위치)</label>
                        <div className="location-input-group">
                            <input
                                type="text"
                                value={address}
                                onClick={() => setShowVenueModal(true)}
                                readOnly
                                placeholder="클릭하여 장소 검색..."
                            />
                            <button
                                type="button"
                                className="venue-search-btn"
                                onClick={(e) => { e.stopPropagation(); setShowVenueModal(true); }}
                            >
                                <i className="ri-map-pin-line"></i> 장소 검색
                            </button>
                        </div>
                    </div>

                    <div className="form-section">
                        <label>관련 링크 (오픈채팅/홈페이지)</label>
                        <input
                            type="text"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                            placeholder="https://open.kakao.com/..."
                        />
                    </div>

                    <div className="form-section">
                        <label>소개</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="단체 소개글"
                            rows={3}
                        />
                    </div>

                    <div className="form-actions">
                        {editGroup && (
                            <button
                                type="button"
                                className="delete-btn"
                                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                disabled={isSubmitting || !isCreatorStatus}
                                title={!isCreatorStatus ? "삭제는 생성자만 가능합니다" : ""}
                            >
                                <i className="ri-delete-bin-line"></i> 삭제
                            </button>
                        )}
                        <button type="button" className="cancel-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} disabled={isSubmitting}>취소</button>
                        <button type="submit" className="submit-btn" disabled={isSubmitting}>
                            {editGroup ? '수정 완료' : '등록하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );

    return (
        <>
            {mainModal}

            {/* Render Image Editor SIBLING to the main portal context to stay out of its event bubbling pool in React */}
            {isCropModalOpen && (
                <ImageCropModal
                    isOpen={isCropModalOpen}
                    onClose={() => setIsCropModalOpen(false)}
                    imageUrl={tempImageSrc}
                    onCropComplete={handleCropComplete}
                    onChangeImage={() => {
                        fileInputRef.current?.click();
                    }}
                    onImageUpdate={(file: File) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            setTempImageSrc(e.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                    }}
                />
            )}

            <React.Suspense fallback={null}>
                <VenueSelectModal
                    isOpen={showVenueModal}
                    onClose={() => setShowVenueModal(false)}
                    onSelect={handleVenueSelect}
                    onManualInput={(name, _link) => {
                        setAddress(name);
                        setShowVenueModal(false);
                    }}
                />
            </React.Suspense>
        </>
    );
};

export default SocialGroupModal;
