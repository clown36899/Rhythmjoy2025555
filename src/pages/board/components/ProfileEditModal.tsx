import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { convertToWebP, extractStoragePath } from '../../../utils/imageUtils';
import './userreg.css'; // Reusing similar styles

interface ProfileLink {
    id: string;
    label: string;
    url: string;
}

interface ProfileSocialLinks {
    instagram?: string;
    youtube?: string;
    website?: string;
    kakao_openchat?: string;
    extra?: ProfileLink[];
}

interface EditableProfile {
    nickname: string;
    profile_image?: string | null;
    headline?: string | null;
    profile_badge?: string | null;
    profile_theme?: string | null;
    bio?: string | null;
    region?: string | null;
    dance_genres?: string | null;
    social_links?: ProfileSocialLinks | string | null;
    primary_social?: string | null;
}

interface ProfileEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: EditableProfile;
    onProfileUpdated: () => void | Promise<void>;
    userId: string;
    onLogout?: () => void;
}

const SOCIAL_LINK_FIELDS = [
    { key: 'instagram', label: 'Instagram', icon: 'ri-instagram-line', placeholder: 'https://instagram.com/username' },
    { key: 'youtube', label: 'YouTube', icon: 'ri-youtube-line', placeholder: 'https://youtube.com/@channel' },
    { key: 'website', label: '웹사이트', icon: 'ri-global-line', placeholder: 'https://example.com' },
    { key: 'kakao_openchat', label: '오픈채팅', icon: 'ri-chat-3-line', placeholder: 'https://open.kakao.com/o/...' },
] as const;

type SocialLinkKey = typeof SOCIAL_LINK_FIELDS[number]['key'];

const PROFILE_THEME_OPTIONS = [
    { value: 'electric', label: 'Electric', swatch: ['#60a5fa', '#a78bfa'] },
    { value: 'sunset', label: 'Sunset', swatch: ['#fb7185', '#fbbf24'] },
    { value: 'mint', label: 'Mint', swatch: ['#34d399', '#22d3ee'] },
    { value: 'mono', label: 'Mono', swatch: ['#d4d4d8', '#71717a'] },
] as const;

const PROFILE_BADGE_OPTIONS = ['Dancer', 'Organizer', 'Teacher', 'DJ', 'Learner'] as const;

const profileThemeValues = PROFILE_THEME_OPTIONS.map((option) => option.value);

const makeEmptyExtraLink = (): ProfileLink => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    url: '',
});

const parseSocialLinks = (value: EditableProfile['social_links']): ProfileSocialLinks => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed ? parsed : {};
        } catch {
            return {};
        }
    }
    return value;
};

const normalizeUrlInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
    if (trimmed.startsWith('www.') || /^[^\s@]+\.[^\s@]{2,}/.test(trimmed)) return `https://${trimmed}`;
    return '';
};

const hasInvalidUrlInput = (value = '') => Boolean(value.trim()) && !normalizeUrlInput(value);

const normalizeSocialLinks = (value: EditableProfile['social_links']): ProfileSocialLinks => {
    const parsed = parseSocialLinks(value);
    const extra = Array.isArray(parsed.extra)
        ? parsed.extra
            .map((link) => ({
                id: link.id || makeEmptyExtraLink().id,
                label: String(link.label || ''),
                url: String(link.url || ''),
            }))
            .filter((link) => link.label.trim() || link.url.trim())
        : [];

    return {
        instagram: String(parsed.instagram || ''),
        youtube: String(parsed.youtube || ''),
        website: String(parsed.website || ''),
        kakao_openchat: String(parsed.kakao_openchat || ''),
        extra,
    };
};

const compactSocialLinks = (links: ProfileSocialLinks): ProfileSocialLinks | null => {
    const next: ProfileSocialLinks = {};

    SOCIAL_LINK_FIELDS.forEach(({ key }) => {
        const url = normalizeUrlInput(String(links[key] || ''));
        if (url) next[key] = url;
    });

    const extra = (links.extra || [])
        .map((link) => ({
            id: link.id || makeEmptyExtraLink().id,
            label: link.label.trim(),
            url: normalizeUrlInput(link.url),
        }))
        .filter((link) => link.label || link.url);

    if (extra.length) next.extra = extra;

    return Object.keys(next).length ? next : null;
};

export default function ProfileEditModal({
    isOpen,
    onClose,
    currentUser,
    onProfileUpdated,
    userId,
    onLogout
}: ProfileEditModalProps) {
    const [nickname, setNickname] = useState(currentUser.nickname || '');
    const [headline, setHeadline] = useState(currentUser.headline || '');
    const [profileBadge, setProfileBadge] = useState(currentUser.profile_badge || '');
    const [profileTheme, setProfileTheme] = useState(currentUser.profile_theme || 'electric');
    const [bio, setBio] = useState(currentUser.bio || '');
    const [region, setRegion] = useState(currentUser.region || '');
    const [danceGenres, setDanceGenres] = useState(currentUser.dance_genres || '');
    const [socialLinks, setSocialLinks] = useState<ProfileSocialLinks>(() => normalizeSocialLinks(currentUser.social_links));
    const [primarySocial, setPrimarySocial] = useState(currentUser.primary_social || '');
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
            const { data, error } = await cafe24
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
                headline: currentUser.headline,
                profile_badge: currentUser.profile_badge,
                profile_theme: currentUser.profile_theme,
                bio: currentUser.bio,
                region: currentUser.region,
                dance_genres: currentUser.dance_genres,
                social_links: currentUser.social_links,
                primary_social: currentUser.primary_social,
                userId
            });
            setNickname(currentUser.nickname || '');
            setHeadline(currentUser.headline || '');
            setProfileBadge(currentUser.profile_badge || '');
            setProfileTheme(currentUser.profile_theme || 'electric');
            setBio(currentUser.bio || '');
            setRegion(currentUser.region || '');
            setDanceGenres(currentUser.dance_genres || '');
            setSocialLinks(normalizeSocialLinks(currentUser.social_links));
            setPrimarySocial(currentUser.primary_social || '');
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

    const primarySocialOptions = useMemo(() => {
        const options = SOCIAL_LINK_FIELDS
            .filter(({ key }) => String(socialLinks[key] || '').trim())
            .map(({ key, label, icon }) => ({ key, label, icon }));

        (socialLinks.extra || []).forEach((link) => {
            if (link.label.trim() && link.url.trim()) {
                options.push({
                    key: `extra:${link.id}`,
                    label: link.label.trim(),
                    icon: 'ri-links-line',
                });
            }
        });

        return options;
    }, [socialLinks]);

    useEffect(() => {
        if (primarySocial && !primarySocialOptions.some((option) => option.key === primarySocial)) {
            setPrimarySocial('');
        }
    }, [primarySocial, primarySocialOptions]);

    const handleSubmit = async () => {
        if (!nickname.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        if (headline.trim().length > 56) {
            alert('한 줄 타이틀은 56자 이내로 입력해주세요.');
            return;
        }

        if (profileBadge.trim().length > 18) {
            alert('프로필 배지는 18자 이내로 입력해주세요.');
            return;
        }

        if (bio.trim().length > 160) {
            alert('소개는 160자 이내로 입력해주세요.');
            return;
        }

        if (region.trim().length > 40) {
            alert('활동 지역은 40자 이내로 입력해주세요.');
            return;
        }

        if (danceGenres.trim().length > 80) {
            alert('관심 장르는 80자 이내로 입력해주세요.');
            return;
        }

        const hasIncompleteExtraLink = (socialLinks.extra || []).some((link) => (
            (link.label.trim() && !link.url.trim()) ||
            (!link.label.trim() && link.url.trim())
        ));
        if (hasIncompleteExtraLink) {
            alert('추가 링크는 이름과 URL을 함께 입력해주세요.');
            return;
        }

        const hasInvalidSocialUrl = SOCIAL_LINK_FIELDS.some(({ key }) => hasInvalidUrlInput(String(socialLinks[key] || '')));
        const hasInvalidExtraUrl = (socialLinks.extra || []).some((link) => hasInvalidUrlInput(link.url));
        if (hasInvalidSocialUrl || hasInvalidExtraUrl) {
            alert('링크는 http:// 또는 https:// 주소로 입력해주세요. example.com처럼 입력하면 자동으로 https://가 붙습니다.');
            return;
        }

        if (nickname !== currentUser.nickname) {
            // 최종 중복 체크
            const { data: nameTakenByOther } = await cafe24
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
                headline,
                profileBadge,
                profileTheme,
                bio,
                region,
                danceGenres,
                socialLinks,
                primarySocial,
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
                    const { error: deleteError } = await cafe24.storage
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
                    const { error: deleteError } = await cafe24.storage
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
                const { error: uploadError } = await cafe24.storage
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

                const { data: { publicUrl } } = cafe24.storage
                    .from('images')
                    .getPublicUrl(filePath);

                console.log('[프로필 이미지] Public URL 생성', { publicUrl });
                profileImageUrl = publicUrl;
            } else {
                console.log('[프로필 이미지] 변경 없음, 기존 이미지 유지', { profileImageUrl });
            }

            // 2. DB 업데이트 (board_users 테이블)
            // 세션 확인
            const { data: { session } } = await cafe24.auth.getSession();
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
            const cleanedSocialLinks = compactSocialLinks(socialLinks);
            const safeTheme = profileThemeValues.includes(profileTheme as typeof profileThemeValues[number]) ? profileTheme : 'electric';
            const safePrimarySocial = primarySocialOptions.some((option) => option.key === primarySocial) ? primarySocial : '';
            const profilePayload = {
                nickname: nickname.trim(),
                profile_image: profileImageUrl,
                headline: headline.trim() || null,
                profile_badge: profileBadge.trim() || null,
                profile_theme: safeTheme,
                bio: bio.trim() || null,
                region: region.trim() || null,
                dance_genres: danceGenres.trim() || null,
                social_links: cleanedSocialLinks,
                primary_social: safePrimarySocial || null,
            };

            const { error, data, status, statusText } = await cafe24
                .from('board_users')
                .upsert({
                    user_id: userId,
                    ...profilePayload,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
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
            await Promise.resolve(onProfileUpdated());
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
            const { error: rpcError } = await cafe24.rpc('handle_user_withdrawal', {
                p_user_id: userId
            });

            if (rpcError) throw rpcError;

            // 2. 로그아웃 및 세션 정리
            await cafe24.auth.signOut();
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

    const updateSocialLink = (key: SocialLinkKey, value: string) => {
        setSocialLinks((prev) => ({ ...prev, [key]: value }));
    };

    const updateExtraLink = (id: string, patch: Partial<ProfileLink>) => {
        setSocialLinks((prev) => ({
            ...prev,
            extra: (prev.extra || []).map((link) => (
                link.id === id ? { ...link, ...patch } : link
            )),
        }));
    };

    const addExtraLink = () => {
        setSocialLinks((prev) => ({
            ...prev,
            extra: [...(prev.extra || []), makeEmptyExtraLink()],
        }));
    };

    const removeExtraLink = (id: string) => {
        setSocialLinks((prev) => ({
            ...prev,
            extra: (prev.extra || []).filter((link) => link.id !== id),
        }));
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="userreg-overlay" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div className="userreg-modal profile-edit-modal" style={{
                maxWidth: '430px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(30, 30, 30, 0.9)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                borderRadius: '24px',
                maxHeight: '92vh'
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

                <div className="userreg-form profile-edit-form">
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
                            data-testid="profile-image-input"
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
                            maxLength={30}
                            data-testid="profile-nickname-input"
                        />
                        <p style={{
                            fontSize: '12px',
                            color: nicknameStatus ? (nicknameStatus.isAvailable ? '#4ade80' : '#f87171') : '#666',
                            marginTop: '4px'
                        }}>
                            {nicknameStatus ? nicknameStatus.message : '* 멋진 닉네임을 지어주세요.'}
                        </p>
                    </div>

                    <div className="userreg-section userreg-profile-style-section">
                        <div className="userreg-section-title">
                            <i className="ri-magic-line"></i>
                            프로필 꾸미기
                        </div>

                        <div className="userreg-field">
                            <label className="userreg-label">한 줄 타이틀</label>
                            <input
                                type="text"
                                value={headline}
                                onChange={(e) => setHeadline(e.target.value)}
                                className="userreg-input"
                                maxLength={56}
                                placeholder="예: 홍대 소셜에서 자주 만나는 린디합 러버"
                                data-testid="profile-headline-input"
                            />
                            <span className="userreg-help-text">{headline.length}/56</span>
                        </div>

                        <div className="userreg-field">
                            <label className="userreg-label">프로필 배지</label>
                            <div className="userreg-choice-row">
                                {PROFILE_BADGE_OPTIONS.map((badge) => (
                                    <button
                                        key={badge}
                                        type="button"
                                        className={`userreg-choice-chip ${profileBadge === badge ? 'is-active' : ''}`}
                                        onClick={() => setProfileBadge(profileBadge === badge ? '' : badge)}
                                        aria-pressed={profileBadge === badge}
                                        data-testid={`profile-badge-${badge.toLowerCase()}`}
                                    >
                                        {badge}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={profileBadge}
                                onChange={(e) => setProfileBadge(e.target.value)}
                                className="userreg-input"
                                maxLength={18}
                                placeholder="직접 입력"
                                data-testid="profile-badge-input"
                            />
                            <span className="userreg-help-text">{profileBadge.length}/18</span>
                        </div>

                        <div className="userreg-field">
                            <label className="userreg-label">대표 컬러</label>
                            <div className="userreg-theme-options">
                                {PROFILE_THEME_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`userreg-theme-option is-${option.value} ${profileTheme === option.value ? 'is-active' : ''}`}
                                        onClick={() => setProfileTheme(option.value)}
                                        aria-pressed={profileTheme === option.value}
                                        data-testid={`profile-theme-${option.value}`}
                                    >
                                        <span className="userreg-theme-swatch" aria-hidden="true"></span>
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="userreg-section">
                        <div className="userreg-section-title">
                            <i className="ri-profile-line"></i>
                            기본 정보
                        </div>

                        <div className="userreg-field">
                            <label className="userreg-label">소개</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                className="userreg-input userreg-textarea"
                                maxLength={160}
                                rows={3}
                                placeholder="예: 린디합을 좋아하고 주말 소셜에 자주 가요."
                                data-testid="profile-bio-input"
                            />
                            <span className="userreg-help-text">{bio.length}/160</span>
                        </div>

                        <div className="userreg-inline-fields">
                            <div className="userreg-field">
                                <label className="userreg-label">활동 지역</label>
                                <input
                                    type="text"
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="userreg-input"
                                    maxLength={40}
                                    placeholder="서울, 부산 등"
                                    data-testid="profile-region-input"
                                />
                            </div>
                            <div className="userreg-field">
                                <label className="userreg-label">관심 장르</label>
                                <input
                                    type="text"
                                    value={danceGenres}
                                    onChange={(e) => setDanceGenres(e.target.value)}
                                    className="userreg-input"
                                    maxLength={80}
                                    placeholder="린디합, 발보아, 살사"
                                    data-testid="profile-genres-input"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="userreg-section">
                        <div className="userreg-section-title">
                            <i className="ri-links-line"></i>
                            SNS / 링크
                        </div>

                        <div className="userreg-social-grid">
                            {SOCIAL_LINK_FIELDS.map((field) => (
                                <div className="userreg-field" key={field.key}>
                                    <label className="userreg-label">
                                        <i className={field.icon}></i>
                                        {field.label}
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="url"
                                        value={String(socialLinks[field.key] || '')}
                                        onChange={(e) => updateSocialLink(field.key, e.target.value)}
                                        className="userreg-input"
                                        placeholder={field.placeholder}
                                        data-testid={`profile-social-${field.key}`}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="userreg-extra-links">
                            <div className="userreg-extra-links-header">
                                <span>추가 링크</span>
                                <button
                                    type="button"
                                    onClick={addExtraLink}
                                    className="userreg-icon-btn"
                                    aria-label="추가 링크 입력칸 추가"
                                    title="추가 링크 입력칸 추가"
                                >
                                    <i className="ri-add-line"></i>
                                </button>
                            </div>

                            {(socialLinks.extra || []).length === 0 && (
                                <button
                                    type="button"
                                    onClick={addExtraLink}
                                    className="userreg-add-link-btn"
                                >
                                    <i className="ri-link-m"></i>
                                    링크 추가
                                </button>
                            )}

                            {(socialLinks.extra || []).map((link) => (
                                <div className="userreg-extra-link-row" key={link.id}>
                                    <input
                                        type="text"
                                        value={link.label}
                                        onChange={(e) => updateExtraLink(link.id, { label: e.target.value })}
                                        className="userreg-input"
                                        maxLength={32}
                                        placeholder="이름"
                                        data-testid="profile-extra-label-input"
                                    />
                                    <input
                                        type="text"
                                        inputMode="url"
                                        value={link.url}
                                        onChange={(e) => updateExtraLink(link.id, { url: e.target.value })}
                                        className="userreg-input"
                                        placeholder="https://..."
                                        data-testid="profile-extra-url-input"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeExtraLink(link.id)}
                                        className="userreg-icon-btn is-danger"
                                        aria-label="추가 링크 삭제"
                                        title="추가 링크 삭제"
                                    >
                                        <i className="ri-close-line"></i>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="userreg-primary-link-box">
                            <div className="userreg-primary-link-header">
                                <span>대표 SNS</span>
                                <small>햄버거 메뉴 프로필에서 가장 크게 보입니다.</small>
                            </div>
                            {primarySocialOptions.length > 0 ? (
                                <div className="userreg-primary-link-options">
                                    <button
                                        type="button"
                                        className={`userreg-primary-link-option ${!primarySocial ? 'is-active' : ''}`}
                                        onClick={() => setPrimarySocial('')}
                                        aria-pressed={!primarySocial}
                                        data-testid="profile-primary-auto"
                                    >
                                        <i className="ri-sparkling-line"></i>
                                        <span>자동</span>
                                    </button>
                                    {primarySocialOptions.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            className={`userreg-primary-link-option ${primarySocial === option.key ? 'is-active' : ''}`}
                                            onClick={() => setPrimarySocial(option.key)}
                                            aria-pressed={primarySocial === option.key}
                                            data-testid={`profile-primary-${option.key.replace(/[^a-z0-9_-]/gi, '-')}`}
                                        >
                                            <i className={option.icon}></i>
                                            <span>{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="userreg-empty-hint">
                                    SNS 주소를 하나 이상 입력하면 대표 링크를 고를 수 있어요.
                                </div>
                            )}
                        </div>
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
                            data-testid="profile-save-button"
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
