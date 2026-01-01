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

        // 비밀번호 확인 (생성자/관리자가 아닐 경우)
        const isOwner = user.id === editGroup.user_id;
        const isAdmin = user.app_metadata?.is_admin === true || (user.email === 'admin@rhythmjoy.com');

        let deletePassword = '';
        if (!isOwner && !isAdmin) {
            const input = prompt('삭제하려면 비밀번호를 입력하세요:');
            if (input === null) return; // Cancel
            deletePassword = input;
        }

        if (!window.confirm("삭제된 데이터는 복구할 수 없습니다.\n정말로 삭제하시겠습니까?")) {
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('삭제 중...');
        console.log('[SocialGroupModal] Starting deletion process for group:', editGroup.id);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            console.log('[SocialGroupModal] Auth token obtained:', !!token);

            console.log('[SocialGroupModal] Sending request to /.netlify/functions/delete-social-item');
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

            console.log('[SocialGroupModal] Server response status:', response.status, response.statusText);

            if (!response.ok) {
                const errData = await response.json();
                console.error('[handleDelete] ❌ Server error data:', errData);
                throw new Error(errData.error || errData.message || '삭제 요청 실패');
            }

            const result = await response.json();
            console.log('[SocialGroupModal] Success result:', result);

            alert('단체가 삭제되었습니다.');
            onSuccess(null);
            onClose();
        } catch (error: any) {
            console.error('[handleDelete] 💥 Error deleting group:', error);
            alert(`삭제 실패: ${error.message}`);
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
            let finalImageUrl = imagePreview;
            let imageMicro = editGroup?.image_micro || null;
            let imageThumbnail = editGroup?.image_thumbnail || null;
            let imageMedium = editGroup?.image_medium || null;
            let imageFull = editGroup?.image_full || null;
            let storagePath = editGroup?.storage_path || null;

            // 이미지가 새로 업로드된 경우
            if (imageFile) {
                setLoadingMessage('이미지 최적화 및 업로드 중...');
                const resized = await createResizedImages(imageFile);

                // v2 Style: Create folder first
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 7);
                // 기존 storage_path가 있으면 그것을 재사용할 수도 있으나, 
                // 새 이미지는 항상 새 폴더(타임스탬프)에 저장하는 것이 캐싱 등에서 안전함.
                // 하지만 여기선 v2 방식을 따라 '한 번 생성된 storage_path'를 계속 쓰는 게 아니라
                // '매 업로드 시' 새로운 경로를 따거나, 아니면 그룹 고유 경로를 유지하거나 결정해야 함.
                // v2는 이벤트 수정 시에도 이미지가 바뀌면 새 폴더를 팜. (delete-event 로직 참고 시)
                // 따라서 여기도 매번 새 폴더를 생성하고 DB 업데이트.

                const folderName = `${timestamp}_${randomStr}`;
                const newStoragePath = `social-groups/${folderName}`;

                // Upload to /profile subfolder
                const basePath = `${newStoragePath}/profile`;

                // Upload all 4 sizes
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
            };

            // Only update image fields if new image was uploaded
            if (imageFile) {
                groupData.image_url = finalImageUrl;
                groupData.image_micro = imageMicro;
                groupData.image_thumbnail = imageThumbnail;
                groupData.image_medium = imageMedium;
                groupData.image_full = imageFull;
                groupData.storage_path = storagePath;
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
                // 이전 이미지 폴더 청소는 Delete Function이 담당? 아니면 여기서?
                // 여기서는 복잡도를 낮추기 위해 생략. (v2도 수정 시 즉시 삭제는 선택적)
                // Delete Function이 나중에 최종 삭제 때 처리하거나, 별도 정리 로직 필요.
                // 일단은 새 경로로 업데이트됨.

                result = { ...editGroup, ...groupData };
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
                    console.log('[SocialGroupModal] onChangeImage callback triggered');
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
