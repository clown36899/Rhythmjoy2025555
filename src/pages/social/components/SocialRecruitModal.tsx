import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages, isImageFile } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import { useLoading } from '../../../contexts/LoadingContext';
import './SocialRecruitModal.css';

interface SocialRecruitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    groupId: number | null;
}

const SocialRecruitModal: React.FC<SocialRecruitModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    groupId
}) => {
    const { user } = useAuth();
    const { showLoading, hideLoading } = useLoading();

    // Recruit State
    const [recruitContent, setRecruitContent] = useState('');
    const [recruitContact, setRecruitContact] = useState('');
    const [recruitLink, setRecruitLink] = useState('');
    const [recruitImageFile, setRecruitImageFile] = useState<File | null>(null);
    const [recruitImagePreview, setRecruitImagePreview] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load for Recruit Info
    useEffect(() => {
        if (isOpen && groupId) {
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
    }, [isOpen, groupId]);

    // Global loading sync
    useEffect(() => {
        if (isSubmitting) {
            showLoading('social-recruit-save', loadingMessage);
        } else {
            hideLoading('social-recruit-save');
        }
    }, [isSubmitting, loadingMessage, showLoading, hideLoading]);

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

    const handleCropComplete = (croppedFile: File, previewUrl: string) => {
        setRecruitImageFile(croppedFile);
        setRecruitImagePreview(previewUrl);
        setIsCropModalOpen(false);
    };

    const handleRecruitSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !groupId) return;

        if (!recruitImagePreview && !recruitImageFile) {
            alert('모집 이미지를 등록해주세요.');
            return;
        }

        setIsSubmitting(true);
        setLoadingMessage('모집 공고 저장 중...');

        try {
            let imageUrl = recruitImagePreview;

            if (recruitImageFile) {
                setLoadingMessage('이미지 최적화 중...');
                const resized = await createResizedImages(recruitImageFile);

                setLoadingMessage('이미지 업로드 중...');
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
            alert('저장 실패: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="social-schedule-modal-overlay">
            <div className="social-schedule-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="social-schedule-modal-header">
                    <h2>원데이 일반인 모집 관리</h2>
                    <button className="ssm-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form className="social-schedule-modal-form" onSubmit={handleRecruitSubmit}>
                    <div className="form-section">
                        <div className="info-box-helper">
                            <i className="ri-information-line"></i>
                            <span>모집 내용을 등록하시면 <strong>최신 순서로 리스트 상단</strong>에 노출됩니다.</span>
                        </div>

                        <label>모집 내용</label>
                        <textarea
                            value={recruitContent}
                            onChange={(e) => setRecruitContent(e.target.value)}
                            placeholder="신입 회원 모집에 대한 상세 내용을 입력해주세요. (대상, 활동 내용 등)"
                            rows={5}
                            required
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
                        <button type="button" className="ssm-cancel-btn" onClick={onClose} disabled={isSubmitting}>취_소</button>
                        <button
                            type="submit"
                            className="ssm-submit-btn"
                            disabled={isSubmitting}
                        >
                            저장하기
                        </button>
                    </div>
                </form>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    style={{ display: 'none' }}
                />

                <ImageCropModal
                    isOpen={isCropModalOpen}
                    onClose={() => setIsCropModalOpen(false)}
                    imageUrl={tempImageSrc}
                    onCropComplete={handleCropComplete}
                    onImageUpdate={(file: File) => {
                        if (!isImageFile(file)) return;
                        const reader = new FileReader();
                        reader.onload = (e) => setTempImageSrc(e.target?.result as string);
                        reader.readAsDataURL(file);
                    }}
                />
            </div>
        </div>,
        document.body
    );
};

export default SocialRecruitModal;
