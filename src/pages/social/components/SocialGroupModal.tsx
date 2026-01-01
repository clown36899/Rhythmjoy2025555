import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';
import './SocialGroupModal.css';

interface SocialGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (group: any) => void;
    editGroup?: any; // any로 두어 유연하게 처리
}

const SocialGroupModal: React.FC<SocialGroupModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    editGroup
}) => {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [type, setType] = useState<'club' | 'bar' | 'etc'>('club');
    const [description, setDescription] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [password, setPassword] = useState(''); // 관리 비밀번호
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const { isAdmin } = useAuth();

    // Image Crop State
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (editGroup) {
                setName(editGroup.name || '');
                setType(editGroup.type || 'club');
                setDescription(editGroup.description || '');
                setImagePreview(editGroup.image_url || null);
                setPassword(editGroup.password || ''); // 이미 인증된 비밀번호가 있으면 채움
            } else {
                setName('');
                setType('club');
                setDescription('');
                setImagePreview(null);
                setImageFile(null);
                setPassword('');
            }
        }
    }, [isOpen, editGroup]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log('[SocialGroupModal] handleImageSelect called');
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            console.log('[SocialGroupModal] File selected:', {
                name: file.name,
                type: file.type,
                size: file.size
            });

            if (!isImageFile(file)) {
                console.error('[SocialGroupModal] Invalid file type:', file.type);
                alert('이미지 파일만 업로드 가능합니다.');
                return;
            }

            console.log('[SocialGroupModal] Starting FileReader...');
            const reader = new FileReader();
            reader.onload = (event) => {
                console.log('[SocialGroupModal] FileReader onload - setting tempImageSrc and opening crop modal');
                setTempImageSrc(event.target?.result as string);
                setIsCropModalOpen(true);
            };
            reader.onerror = (error) => {
                console.error('[SocialGroupModal] FileReader error:', error);
            };
            reader.readAsDataURL(file);
        } else {
            console.log('[SocialGroupModal] No file selected');
        }
        e.target.value = '';
    };

    const handleCropComplete = (croppedFile: File, previewUrl: string, _isModified: boolean) => {
        console.log('[SocialGroupModal] handleCropComplete called:', {
            fileName: croppedFile.name,
            fileSize: croppedFile.size,
            fileType: croppedFile.type,
            previewUrlLength: previewUrl?.length,
            isModified: _isModified
        });
        setImageFile(croppedFile);
        setImagePreview(previewUrl);
        setIsCropModalOpen(false);
    };


    const handleDelete = async () => {
        if (!editGroup || !user) return;

        // 권한 체크: 생성자나 관리자가 아니면 비밀번호 확인
        const isCreator = editGroup.user_id === user.id;

        if (!isCreator) {
            alert('단체 삭제는 생성자(Owner)만 가능합니다.');
            return;
        }

        if (!window.confirm(`'${editGroup.name}' 단체를 삭제하시겠습니까?`)) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('권한 확인 및 삭제 처리 중...');

        try {
            // 생성자가 아니라면 이미 Auth Flow에서 검증되었으나, 
            // 안전을 위해 여기서 password state가 비어있지 않다면 한 번 더 검증하거나
            // 모달 진입 시 전달된 password를 신뢰할 수 있음.
            // 여기서는 중복 검증 생략하고 바로 삭제 시도.

            // 2단계 경고 (최종 확인)
            const finalWarningMsg = `[⚠️ 최종 경고]\n\n단체를 삭제하면 이 단체에 등록된 '모든 일정'이 함께 삭제됩니다.\n삭제된 데이터는 복구할 수 없습니다.\n\n진짜로 삭제하시겠습니까?`;
            if (!window.confirm(finalWarningMsg)) {
                setIsSubmitting(false);
                return;
            }

            // 1. 연동된 일정 삭제
            const { error: scheduleError } = await supabase
                .from('social_schedules')
                .delete()
                .eq('group_id', editGroup.id);

            if (scheduleError) console.error("일정 삭제 중 권한/에러:", scheduleError);

            // 2. 단체 삭제
            const { error: groupError } = await supabase
                .from('social_groups')
                .delete()
                .eq('id', editGroup.id);

            if (groupError) throw groupError;

            alert('삭제되었습니다.');
            onSuccess(null);
            onClose();
        } catch (error: any) {
            console.error('Error deleting group:', error);
            alert(`삭제 실패 (관리자 권한이 없거나 오류 발생): ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!name.trim()) {
            alert('단체 이름을 입력해주세요.');
            return;
        }

        const isCreator = editGroup ? editGroup.user_id === user.id : true;
        const canEditWithoutPassword = isAdmin || isCreator;

        // Validation
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
            // 상위 컴포넌트(SocialPage)에서 이미 verifyPassword를 거쳐서 진입했으므로
            // 여기서는 중복 검증을 생략하거나, password 필드가 비어있지 않은지만 체크.
            // 단, 모달 내에서 비밀번호를 바꾼 경우 등을 고려해 로직 단순화.

            let finalImageUrl = imagePreview;
            let imageMicro = editGroup?.image_micro || null;
            let imageThumbnail = editGroup?.image_thumbnail || null;
            let imageMedium = editGroup?.image_medium || null;
            let imageFull = editGroup?.image_full || null;

            if (imageFile) {
                setLoadingMessage('이미지 최적화 및 업로드 중...');
                const resized = await createResizedImages(imageFile);
                const timestamp = Date.now();
                const fileName = `${timestamp}_${Math.random().toString(36).substring(2, 7)}.webp`;
                const basePath = `social-groups/${user.id}`;

                // Upload all 4 sizes
                const uploadImage = async (size: string, blob: Blob) => {
                    const path = `${basePath}/${size}/${fileName}`;
                    const { error } = await supabase.storage.from('images').upload(path, blob);
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

            const groupData: any = {
                name,
                type,
                description,
            };

            // Only update image fields if new image was uploaded
            if (imageFile) {
                groupData.image_url = finalImageUrl;
                groupData.image_micro = imageMicro;
                groupData.image_thumbnail = imageThumbnail;
                groupData.image_medium = imageMedium;
                groupData.image_full = imageFull;
            }

            // 신규 등록이면 비번/소유자 설정
            if (!editGroup) {
                groupData.user_id = user.id;
                groupData.password = password;
            } else {
                // 수정 시: 생성자/관리자만 비밀번호 변경 가능
                if (canEditWithoutPassword && password.trim()) {
                    groupData.password = password;
                }
                // 공동 관리자는 비밀번호 수정 권한 없음 (기존 비밀번호 유지)
            }

            let result;
            if (editGroup) {
                const { error } = await supabase
                    .from('social_groups')
                    .update(groupData)
                    .eq('id', editGroup.id);

                if (error) throw error;
                result = { ...editGroup, ...groupData }; // Return merged data
            } else {
                const { data, error } = await supabase
                    .from('social_groups')
                    .insert([groupData])
                    .select()
                    .single();
                if (error) throw error;
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

    const isCreator = editGroup ? editGroup.user_id === user?.id : true; // 신규는 본인이 생성자

    const mainModal = createPortal(
        <div className="social-group-modal-overlay">
            <div className="social-group-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="social-group-modal-header">
                    <h2>{editGroup ? '단체 정보 수정' : '새 단체 등록'}</h2>
                    <button className="modal-close-x-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="social-group-modal-form">
                    <div className="info-box" style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '12px',
                        padding: '12px',
                        marginBottom: '20px',
                        fontSize: '0.85rem',
                        color: '#93c5fd',
                        lineHeight: '1.4'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 'bold' }}>
                            <i className="ri-lock-password-line"></i>
                            <span>공동 관리 기능</span>
                        </div>
                        설정한 비밀번호를 공유하면, 다른 사용자도 이 단체의 정보를 수정하거나 일정을 등록할 수 있습니다.
                    </div>

                    <div className="form-section image-section">
                        <div
                            className="image-preview-box"
                            onClick={() => {
                                console.log('[SocialGroupModal] Image preview box clicked:', {
                                    hasImagePreview: !!imagePreview,
                                    imagePreviewLength: imagePreview?.length
                                });
                                // Always open crop modal (with existing image or null)
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
                            관리 비밀번호 {editGroup ? (isCreator ? '(변경 시 입력)' : '(수정 권한 인증)') : '*'}
                        </label>
                        <input
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={editGroup ? (isCreator ? "기존 비밀번호 유지" : "인증된 비밀번호") : "비밀번호 설정 (필수)"}
                            className={`password-input ${editGroup && !isCreator ? 'readonly' : ''}`}
                            style={{
                                letterSpacing: '2px',
                                backgroundColor: editGroup && !isCreator ? '#2d2d2d' : '', // 배경색 약간 어둡게
                                color: editGroup && !isCreator ? '#9ca3af' : '', // 글자색 회색으로 (너무 흰색은 수정 가능해 보임)
                                cursor: editGroup && !isCreator ? 'not-allowed' : 'text'
                            }}
                            readOnly={!!editGroup && !isCreator}
                        />
                        <p className="field-hint" style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                            {editGroup && !isCreator
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
                                onClick={() => setType('club')}
                            >동호회</button>
                            <button
                                type="button"
                                className={type === 'bar' ? 'active' : ''}
                                onClick={() => setType('bar')}
                            >바(Bar)</button>
                            <button
                                type="button"
                                className={type === 'etc' ? 'active' : ''}
                                onClick={() => setType('etc')}
                            >기타</button>
                        </div>
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
                                onClick={handleDelete}
                                disabled={isSubmitting || !isCreator}
                                title={!isCreator ? "삭제는 생성자만 가능합니다" : ""}
                                style={!isCreator ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                            >
                                <i className="ri-delete-bin-line"></i> 삭제
                            </button>
                        )}
                        <button type="button" className="cancel-btn" onClick={onClose} disabled={isSubmitting}>취소</button>
                        <button type="submit" className="submit-btn" disabled={isSubmitting}>
                            {editGroup ? '수정 완료' : '등록하기'}
                        </button>
                    </div>
                </form>
            </div>

            <GlobalLoadingOverlay
                isLoading={isSubmitting}
                message={loadingMessage}
            />
        </div>,
        document.body
    );

    return (
        <>
            {mainModal}
            <ImageCropModal
                isOpen={isCropModalOpen}
                onClose={() => setIsCropModalOpen(false)}
                imageUrl={tempImageSrc}
                onCropComplete={handleCropComplete}
                onChangeImage={() => {
                    console.log('[SocialGroupModal] onChangeImage callback triggered - clicking file input');
                    fileInputRef.current?.click();
                }}
                onImageUpdate={(file: File) => {
                    console.log('[SocialGroupModal] onImageUpdate callback triggered:', {
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type
                    });
                    // Convert file to data URL for preview
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        console.log('[SocialGroupModal] FileReader completed - updating tempImageSrc');
                        setTempImageSrc(e.target?.result as string);
                    };
                    reader.onerror = (error) => {
                        console.error('[SocialGroupModal] FileReader error in onImageUpdate:', error);
                    };
                    reader.readAsDataURL(file);
                }}
            />
        </>
    );
};

export default SocialGroupModal;
