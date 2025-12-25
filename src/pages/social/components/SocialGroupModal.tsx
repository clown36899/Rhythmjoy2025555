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
    editGroup?: any;
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

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
            } else {
                setName('');
                setType('club');
                setDescription('');
                setImagePreview(null);
                setImageFile(null);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!name.trim()) {
            alert('집단 이름을 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('집단 정보 저장 중...');

        try {
            let finalImageUrl = imagePreview;

            // 이미지 업로드 로직 (수정되었을 경우)
            if (imageFile) {
                setLoadingMessage('이미지 리사이징 및 업로드 중...');
                const resized = await createResizedImages(imageFile);
                const timestamp = Date.now();
                const fileName = `${timestamp}_${Math.random().toString(36).substring(2, 7)}.webp`;
                const basePath = `social-groups/${user.id}`;

                // 리사이즈된 이미지들 중 대표(medium 또는 full) 업로드
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(`${basePath}/${fileName}`, resized.medium);

                if (uploadError) throw uploadError;

                finalImageUrl = supabase.storage.from('images').getPublicUrl(`${basePath}/${fileName}`).data.publicUrl;
            }

            const groupData = {
                name,
                type,
                description,
                image_url: finalImageUrl,
                user_id: user.id,
            };

            let result;
            if (editGroup) {
                const { data, error } = await supabase
                    .from('social_groups')
                    .update(groupData)
                    .eq('id', editGroup.id)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
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
            console.error('Error saving group:', error);
            alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="social-group-modal-overlay" onClick={onClose}>
            <div className="social-group-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="social-group-modal-header">
                    <h2>{editGroup ? '집단 정보 수정' : '새 집단 등록'}</h2>
                    <button className="close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="social-group-modal-form">
                    <div className="form-section image-section">
                        <div
                            className="image-preview-box"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" />
                            ) : (
                                <div className="image-placeholder">
                                    <i className="ri-image-add-line"></i>
                                    <span>대표 이미지 추가</span>
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
                        <label>집단 이름 *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="예: 강남 스윙동호회"
                            required
                        />
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
                            placeholder="집단에 대한 간단한 설명을 입력해주세요."
                            rows={4}
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>취소</button>
                        <button type="submit" className="submit-btn" disabled={isSubmitting}>
                            {editGroup ? '수정 완료' : '등록하기'}
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

            <GlobalLoadingOverlay
                isLoading={isSubmitting}
                message={loadingMessage}
            />
        </div>,
        document.body
    );
};

export default SocialGroupModal;
