import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import './userreg.css'; // Reusing similar styles

interface ProfileEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: {
        nickname: string;
        profile_image?: string;
    };
    onProfileUpdated: () => void;
    userId: string;
}

export default function ProfileEditModal({
    isOpen,
    onClose,
    currentUser,
    onProfileUpdated,
    userId
}: ProfileEditModalProps) {
    const [nickname, setNickname] = useState(currentUser.nickname || '');
    const [previewImage, setPreviewImage] = useState<string | null>(currentUser.profile_image || null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setNickname(currentUser.nickname || '');
            setPreviewImage(currentUser.profile_image || null);
            setSelectedFile(null);
        }
    }, [isOpen, currentUser]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('이미지 크기는 5MB 이하여야 합니다.');
                return;
            }
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        if (!nickname.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        setIsSubmitting(true);

        try {
            let profileImageUrl = currentUser.profile_image;

            // 1. 이미지 업로드 (새 이미지가 있다면)
            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${userId}-${Date.now()}.${fileExt}`;
                const filePath = `profiles/${fileName}`; // Assuming 'profiles' folder in storage bucket

                // Use standard storage upload (make sure bucket 'images' or 'profiles' exists)
                // Here assuming 'images' bucket and 'profiles' folder based on typical setup
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, selectedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                profileImageUrl = publicUrl;
            }

            // 2. DB 업데이트
            const { error } = await supabase
                .from('board_users')
                .update({
                    nickname: nickname,
                    profile_image: profileImageUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

            alert('프로필이 수정되었습니다.');
            onProfileUpdated();
            onClose();

        } catch (error: any) {
            console.error('프로필 수정 실패:', error);
            alert(`수정 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="userreg-overlay">
            <div className="userreg-modal" style={{ maxWidth: '360px' }}>
                <div className="userreg-header">
                    <div className="userreg-header-top">
                        <h2 className="userreg-title">내 정보 수정</h2>
                        <button onClick={onClose} className="userreg-close-btn">
                            <i className="ri-close-line text-2xl"></i>
                        </button>
                    </div>
                </div>

                <div className="userreg-form">
                    {/* 프로필 이미지 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                        <div
                            style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: '#333',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                position: 'relative'
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {previewImage ? (
                                <img src={previewImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                                    <i className="ri-user-line" style={{ fontSize: '40px' }}></i>
                                </div>
                            )}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                                fontSize: '10px', textAlign: 'center', padding: '4px'
                            }}>
                                편집
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                            accept="image/*"
                        />
                    </div>

                    {/* 닉네임 */}
                    <div className="userreg-field">
                        <label className="userreg-label">닉네임</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            className="userreg-input"
                        />
                    </div>

                    <div className="userreg-footer" style={{ marginTop: '20px' }}>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="userreg-submit-btn"
                            style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}
                        >
                            {isSubmitting ? '저장 중...' : '저장하기'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
