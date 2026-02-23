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
    onLogout?: () => void;
}

export default function ProfileEditModal({
    isOpen,
    onClose,
    currentUser,
    onProfileUpdated,
    userId,
    onLogout
}: ProfileEditModalProps) {
    const [nickname, setNickname] = useState(currentUser.nickname || '');
    const [previewImage, setPreviewImage] = useState<string | null>(currentUser.profile_image || null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false); // 탈퇴 처리 상태
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
            console.log('[프로필 수정 모달] 열림', {
                nickname: currentUser.nickname,
                profile_image: currentUser.profile_image,
                userId
            });
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
            console.log('[프로필 이미지] 파일 선택', {
                name: file.name,
                size: `${(file.size / 1024).toFixed(2)}KB`,
                type: file.type
            });
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('이미지 크기는 5MB 이하여야 합니다.');
                return;
            }
            setSelectedFile(file);
            setImageDeleted(false); // 새 이미지 선택 시 삭제 플래그 해제
            const reader = new FileReader();
            reader.onloadend = () => {
                console.log('[프로필 이미지] 미리보기 생성 완료');
                setPreviewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteImage = () => {
        console.log('[프로필 이미지] 삭제 요청', { oldImagePath });
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
            console.log('[프로필 저장] 시작', {
                nickname,
                imageDeleted,
                hasSelectedFile: !!selectedFile,
                oldImagePath,
                currentProfileImage: currentUser.profile_image
            });
            let profileImageUrl: string | null | undefined = currentUser.profile_image;

            // 1. 이미지 처리
            if (imageDeleted) {
                console.log('[프로필 이미지] 삭제 처리 시작');
                // 이미지 삭제가 요청된 경우
                if (oldImagePath) {
                    console.log('[프로필 이미지] 스토리지에서 삭제', { path: oldImagePath });
                    const { error: deleteError } = await supabase.storage
                        .from('images')
                        .remove([oldImagePath]);

                    if (deleteError) {
                        console.error('[프로필 이미지] 삭제 실패:', deleteError);
                    } else {
                        console.log('[프로필 이미지] 삭제 성공');
                    }
                }
                profileImageUrl = null; // DB에 null 저장
                console.log('[프로필 이미지] DB에 null 저장 예정');
            } else if (selectedFile) {
                console.log('[프로필 이미지] 새 이미지 업로드 시작');
                // 새 이미지 업로드
                // 기존 이미지 삭제
                if (oldImagePath) {
                    console.log('[프로필 이미지] 기존 이미지 삭제', { path: oldImagePath });
                    const { error: deleteError } = await supabase.storage
                        .from('images')
                        .remove([oldImagePath]);

                    if (deleteError) {
                        console.error('[프로필 이미지] 기존 이미지 삭제 실패:', deleteError);
                    } else {
                        console.log('[프로필 이미지] 기존 이미지 삭제 성공');
                    }
                }

                // WebP로 변환 및 압축
                console.log('[프로필 이미지] WebP 변환 시작');
                const webpBlob = await convertToWebP(selectedFile, 200, 200, 0.8);
                console.log('[프로필 이미지] WebP 변환 완료', { size: `${(webpBlob.size / 1024).toFixed(2)}KB` });
                const fileName = `${userId}-${Date.now()}.webp`;
                const filePath = `profiles/${fileName}`;

                console.log('[프로필 이미지] 업로드 시작', { filePath });
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, webpBlob, {
                        contentType: 'image/webp',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('[프로필 이미지] 업로드 실패:', uploadError);
                    throw uploadError;
                }
                console.log('[프로필 이미지] 업로드 성공');

                const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                console.log('[프로필 이미지] Public URL 생성', { publicUrl });
                profileImageUrl = publicUrl;
            } else {
                console.log('[프로필 이미지] 변경 없음, 기존 이미지 유지', { profileImageUrl });
            }

            // 2. DB 업데이트 (board_users 테이블)
            // 세션 확인
            const { data: { session } } = await supabase.auth.getSession();
            console.log('[프로필 저장] 현재 세션 확인', {
                hasSession: !!session,
                sessionUserId: session?.user?.id,
                targetUserId: userId,
                isMatch: session?.user?.id === userId
            });

            console.log('[프로필 저장] DB 업데이트 시작', {
                nickname,
                profile_image: profileImageUrl,
                userId
            });
            const { error, data, status, statusText } = await supabase
                .from('board_users')
                .update({
                    nickname: nickname,
                    profile_image: profileImageUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select(); // SELECT를 추가하여 업데이트된 행 반환

            console.log('[프로필 저장] DB 업데이트 결과', {
                error,
                data,
                status,
                statusText,
                affectedRows: data?.length || 0
            });

            if (error) {
                console.error('[프로필 저장] DB 업데이트 실패:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                console.error('[프로필 저장] ❌ 업데이트된 행이 없습니다! RLS 정책 문제일 수 있습니다.');
                throw new Error('프로필 업데이트에 실패했습니다. 권한을 확인해주세요.');
            }

            console.log('[프로필 저장] 성공');
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

    const handleWithdrawal = async () => {
        if (!confirm('정말로 서비스를 탈퇴(회원 등록 취소)하시겠습니까?\n작성하신 활동 기록은 익명으로 보관되며, 더 이상 이 계정으로 로그인할 수 없습니다.')) {
            return;
        }

        setIsWithdrawing(true);
        try {
            console.log('[회원 탈퇴] 시작', { userId });

            // 1. RPC 호출 (DB 정보 익명화)
            const { error: rpcError } = await supabase.rpc('handle_user_withdrawal', {
                p_user_id: userId
            });

            if (rpcError) throw rpcError;

            // 2. 로그아웃 및 세션 정리
            await supabase.auth.signOut();
            sessionStorage.clear();

            console.log('[회원 탈퇴] 성공');
            alert('회원 등록이 취소되었습니다. 그동안 이용해주셔서 감사합니다.');
            window.location.href = '/'; // 메인으로 리다이렉트
        } catch (error: any) {
            console.error('[회원 탈퇴] 실패:', error);
            alert(`탈퇴 처리 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsWithdrawing(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="userreg-overlay" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div className="userreg-modal" style={{
                maxWidth: '360px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(30, 30, 30, 0.9)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                borderRadius: '24px'
            }}>
                <div className="userreg-header" style={{ padding: '28px 24px 20px' }}>
                    <div className="userreg-header-top">
                        <h2 className="userreg-title" style={{ fontSize: '1.35rem', color: 'var(--color-white)', letterSpacing: '-0.5px' }}>내 정보 수정</h2>
                        <button onClick={onClose} className="userreg-close-btn" style={{
                            top: '24px',
                            right: '24px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <i className="ri-close-line text-xl"></i>
                        </button>
                    </div>
                </div>

                <div className="userreg-form">
                    {/* 프로필 이미지 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                        <div
                            style={{
                                width: '106px',
                                height: '106px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: 'var(--bg-surface-2)',
                                cursor: 'pointer',
                                position: 'relative',
                                border: '3px solid rgba(255,255,255,0.15)',
                                boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }}
                            className="profile-preview-container"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {previewImage ? (
                                <img src={previewImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-disabled)' }}>
                                    <i className="ri-user-line" style={{ fontSize: '44px' }}></i>
                                </div>
                            )}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                backgroundColor: 'rgba(0,0,0,0.6)', color: 'white',
                                fontSize: '11px', textAlign: 'center', padding: '6px',
                                fontWeight: '600',
                                backdropFilter: 'blur(4px)'
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
                                    color: 'var(--color-red-500)',
                                    backgroundColor: 'transparent',
                                    border: '1px solid var(--color-red-500)',
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

                    <div className="userreg-footer" style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                        {onLogout && (
                            <button
                                onClick={() => {
                                    if (confirm('로그아웃 하시겠습니까?')) {
                                        onLogout();
                                        onClose();
                                    }
                                }}
                                disabled={isSubmitting || isWithdrawing}
                                className="userreg-submit-btn"
                                style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                    color: 'var(--color-red-500)',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    flex: 1,
                                    fontSize: '0.92rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <i className="ri-logout-box-line"></i>
                                로그아웃
                            </button>
                        )}
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || isWithdrawing || !nicknameStatus?.isAvailable || nicknameStatus?.checking}
                            className="userreg-submit-btn"
                            style={{
                                backgroundColor: 'var(--primary-color, #FEE500)',
                                color: '#000',
                                opacity: (isSubmitting || isWithdrawing || !nicknameStatus?.isAvailable || nicknameStatus?.checking) ? 0.6 : 1,
                                cursor: (isSubmitting || isWithdrawing || !nicknameStatus?.isAvailable || nicknameStatus?.checking) ? 'not-allowed' : 'pointer',
                                flex: 2,
                                fontSize: '0.95rem',
                                fontWeight: '700',
                                boxShadow: '0 4px 15px rgba(254, 229, 0, 0.25)'
                            }}
                        >
                            {isSubmitting ? '저장 중...' : '저장하기'}
                        </button>
                    </div>

                    {/* 회원 등록 취소 (탈퇴) 버튼 추가 */}
                    <div style={{ marginTop: '30px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                        <button
                            onClick={handleWithdrawal}
                            disabled={isSubmitting || isWithdrawing}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgb(112, 112, 121)',
                                fontSize: '0.78rem',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                transition: 'all 0.2s',
                                opacity: 0.8
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.color = '#a1a1aa';
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.color = 'rgb(112, 112, 121)';
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            더 이상 서비스를 이용하지 않으시나요? (탈퇴)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
