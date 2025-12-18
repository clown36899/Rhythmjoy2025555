import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { convertToWebP, extractStoragePath } from '../../../utils/imageUtils';
import './userreg.css'; // Reusing similar styles

interface ProfileEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: {
        nickname: string;
        profile_image?: string | null;
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
    const [oldImagePath, setOldImagePath] = useState<string | null>(null);
    const [imageDeleted, setImageDeleted] = useState(false); // 이미지 삭제 플래그
    const [nicknameStatus, setNicknameStatus] = useState<{
        isAvailable: boolean;
        message: string;
        checking: boolean;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Debounced check
    useEffect(() => {
        if (!isOpen) return;

        const timer = setTimeout(() => {
            if (nickname.trim() && nickname !== currentUser.nickname) {
                checkNicknameAvailability(nickname.trim());
            } else if (nickname === currentUser.nickname) {
                setNicknameStatus({ isAvailable: true, message: '현재 사용 중인 닉네임입니다', checking: false });
            } else {
                setNicknameStatus(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [nickname, isOpen, currentUser.nickname]);

    const checkNicknameAvailability = async (name: string) => {
        if (!name || name.length < 2) {
            setNicknameStatus({ isAvailable: false, message: '2자 이상 입력해주세요', checking: false });
            return;
        }

        setNicknameStatus(prev => ({ ...prev, isAvailable: false, message: '확인 중...', checking: true }));

        try {
            const { data, error } = await supabase
                .from('board_users')
                .select('user_id')
                .eq('nickname', name)
                .neq('user_id', userId)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setNicknameStatus({ isAvailable: false, message: '이미 사용 중인 닉네임입니다', checking: false });
            } else {
                setNicknameStatus({ isAvailable: true, message: '사용 가능한 닉네임입니다', checking: false });
            }
        } catch (err) {
            console.error('닉네임 중복 체크 실패:', err);
            setNicknameStatus(null);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setNickname(currentUser.nickname || '');
            setPreviewImage(currentUser.profile_image || null);
            setSelectedFile(null);
            setImageDeleted(false); // 모달 열 때 초기화
            // 기존 이미지 경로 저장 (삭제용)
            if (currentUser.profile_image) {
                const path = extractStoragePath(currentUser.profile_image);
                setOldImagePath(path);
            } else {
                setOldImagePath(null);
            }
        }
    }, [isOpen, currentUser]);

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('이미지 크기는 5MB 이하여야 합니다.');
                return;
            }
            setSelectedFile(file);
            setImageDeleted(false); // 새 이미지 선택 시 삭제 플래그 해제
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteImage = () => {
        // 화면에서만 제거, 실제 삭제는 저장 시
        setPreviewImage(null);
        setSelectedFile(null);
        setImageDeleted(true); // 삭제 플래그 설정
    };

    const handleSubmit = async () => {
        if (!nickname.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        if (nickname !== currentUser.nickname) {
            // 최종 중복 체크
            const { data: nameTakenByOther } = await supabase
                .from('board_users')
                .select('user_id')
                .eq('nickname', nickname.trim())
                .neq('user_id', userId)
                .maybeSingle();

            if (nameTakenByOther) {
                alert(`'${nickname}'은(는) 이미 다른 사용자가 사용 중인 닉네임입니다. 다른 닉네임을 선택해주세요.`);
                return;
            }
        }

        setIsSubmitting(true);

        try {
            let profileImageUrl: string | null | undefined = currentUser.profile_image;

            // 1. 이미지 처리
            if (imageDeleted) {
                // 이미지 삭제가 요청된 경우
                if (oldImagePath) {
                    const { error: deleteError } = await supabase.storage
                        .from('images')
                        .remove([oldImagePath]);

                    if (deleteError) {
                        console.error('이미지 삭제 실패:', deleteError);
                    }
                }
                profileImageUrl = null; // DB에 null 저장
            } else if (selectedFile) {
                // 새 이미지 업로드
                // 기존 이미지 삭제
                if (oldImagePath) {
                    const { error: deleteError } = await supabase.storage
                        .from('images')
                        .remove([oldImagePath]);

                    if (deleteError) {
                        console.error('기존 이미지 삭제 실패:', deleteError);
                    }
                }

                // WebP로 변환 및 압축
                const webpBlob = await convertToWebP(selectedFile, 200, 200, 0.8);
                const fileName = `${userId}-${Date.now()}.webp`;
                const filePath = `profiles/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, webpBlob, {
                        contentType: 'image/webp',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                profileImageUrl = publicUrl;
            }
            // else: 이미지 변경 없음, 기존 이미지 유지

            // 2. DB 업데이트 (board_users 테이블)
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
                                // marginBottom: '10px',
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
                        {previewImage && (
                            <button
                                onClick={handleDeleteImage}
                                disabled={isSubmitting}
                                style={{
                                    marginTop: '8px',
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    color: '#ef4444',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="ri-delete-bin-line" style={{ marginRight: '4px' }}></i>
                                이미지 삭제
                            </button>
                        )}
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
                        <p style={{
                            fontSize: '12px',
                            color: nicknameStatus ? (nicknameStatus.isAvailable ? '#4ade80' : '#f87171') : '#666',
                            marginTop: '4px'
                        }}>
                            {nicknameStatus ? nicknameStatus.message : '* 멋진 닉네임을 지어주세요.'}
                        </p>
                    </div>

                    <div className="userreg-footer" style={{ marginTop: '20px' }}>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !nicknameStatus?.isAvailable || nicknameStatus?.checking}
                            className="userreg-submit-btn"
                            style={{
                                backgroundColor: 'var(--primary-color)',
                                color: 'white',
                                opacity: (isSubmitting || !nicknameStatus?.isAvailable || nicknameStatus?.checking) ? 0.6 : 1,
                                cursor: (isSubmitting || !nicknameStatus?.isAvailable || nicknameStatus?.checking) ? 'not-allowed' : 'pointer'
                            }}
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
