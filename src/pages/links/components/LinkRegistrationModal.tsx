import React, { useState } from 'react';
import { cafe24 } from '../../../lib/cafe24Client';
import { type SiteLink } from '../Page';
import ImageCropModal from '../../../components/ImageCropModal';
import {
    getFallbackTitle,
    getPlatformIcon,
    getPlatformLabel,
    isWeakAccountDescription,
    normalizeLinkUrl,
    parseLinkTarget,
    type AccountPlatform,
    type LinkType,
} from '../linkUtils';

interface LinkRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    categories: string[];
    editLink?: SiteLink | null;
    initialDraft?: LinkRegistrationDraft | null;
}

export interface LinkRegistrationDraft {
    url?: string;
    title?: string;
    imageUrl?: string;
    description?: string;
    category?: string;
    linkType?: LinkType;
    accountPlatform?: AccountPlatform;
    accountHandle?: string;
    source?: string;
}

interface ThumbnailOption {
    url: string;
    label?: string;
    source?: string;
}

const thumbnailSourceLabels: Record<string, string> = {
    'og-image': '대표 이미지',
    'meta-image': '페이지 대표 이미지',
    'json-ld': '등록 이미지',
    'image-src': '링크 이미지',
    'preload-image': '페이지 이미지',
    'page-image': '페이지 이미지',
    'apple-touch-icon': '사이트 아이콘',
    'favicon': '사이트 아이콘',
    'favicon-fallback': '사이트 아이콘',
    'direct-image': '원본 이미지',
    'account-avatar': '프로필 이미지',
    'screenshot': '사이트 스크린샷'
};

const accountThumbnailSources = new Set([
    'account-avatar',
    'clipper',
    'saved',
    'direct-image',
    'og-image',
    'meta-image'
]);

const normalizeThumbnailOptions = (data: any): ThumbnailOption[] => {
    const rawOptions = data?.thumbnail_options || data?.thumbnailOptions || [];
    const options = Array.isArray(rawOptions) ? rawOptions : [];
    const fallbackImage = typeof data?.image_url === 'string' ? data.image_url : '';
    const seen = new Set<string>();

    return [
        ...options,
        ...(fallbackImage ? [{ url: fallbackImage, label: '대표 이미지', source: 'fallback' }] : [])
    ].reduce<ThumbnailOption[]>((acc, option) => {
        const url = typeof option?.url === 'string' ? option.url.trim() : '';
        if (!url || seen.has(url)) return acc;
        seen.add(url);
        acc.push({
            url,
            label: option.label || thumbnailSourceLabels[option.source] || '썸네일 후보',
            source: option.source || 'candidate'
        });
        return acc;
    }, []);
};

const mergeThumbnailOptions = (options: ThumbnailOption[]): ThumbnailOption[] => {
    const seen = new Set<string>();
    return options.reduce<ThumbnailOption[]>((acc, option) => {
        const url = option.url.trim();
        if (!url || seen.has(url)) return acc;
        seen.add(url);
        acc.push(option);
        return acc;
    }, []);
};

const isFetchableUrlInput = (value: string): boolean => {
    const trimmed = value.trim();
    if (trimmed.length < 4 || /\s/.test(trimmed)) return false;

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const hostname = new URL(trimmed).hostname;
            return hostname === 'localhost' || hostname.includes('.');
        } catch (_error) {
            return false;
        }
    }

    return /^[^\s/]+\.[^\s]{2,}/.test(trimmed);
};

const DEFAULT_ACCOUNT_CATEGORY = '인물';

const getResolvedLinkType = (link?: SiteLink | null): LinkType => (
    link?.link_type === 'person_account' ? 'person_account' : 'site'
);

const isWeakFetchedTitle = (value?: string | null) => {
    const title = String(value || '').trim().toLowerCase();
    return !title || [
        'instagram',
        'youtube',
        'instagram photos and videos',
        'reels',
        'instagram reels',
        '인스타그램',
        '게시물',
        'posts',
        'profile',
        '프로필',
        '릴스',
    ].includes(title);
};

const isFallbackAccountTitle = (value: string, target: ReturnType<typeof parseLinkTarget>) => {
    if (!target || target.linkType !== 'person_account') return false;
    const title = value.trim();
    const handle = target.accountHandle.trim();
    if (!title || !handle) return false;
    const normalizedTitle = title.replace(/^@+/, '').toLowerCase();
    const normalizedHandle = handle.replace(/^@+/, '').toLowerCase();
    return normalizedTitle === normalizedHandle || title === getFallbackTitle(target);
};

export const LinkRegistrationModal: React.FC<LinkRegistrationModalProps> = ({ isOpen, onClose, onSuccess, categories, editLink, initialDraft }) => {
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [linkType, setLinkType] = useState<LinkType>('site');
    const [accountPlatform, setAccountPlatform] = useState<AccountPlatform>('other');
    const [accountHandle, setAccountHandle] = useState('');
    const [isSubmitting, setSubmitting] = useState(false);
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);
    const [ogImageUrl, setOgImageUrl] = useState(''); // Fallback 로고/썸네일 저장용
    const [thumbnailOptions, setThumbnailOptions] = useState<ThumbnailOption[]>([]);
    const [thumbnailFetchError, setThumbnailFetchError] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const lastFetchedUrlRef = React.useRef('');
    const metadataOwnerUrlRef = React.useRef('');
    const shouldRefreshInitialAccountDraftRef = React.useRef(false);
    const fetchRequestIdRef = React.useRef(0);
    const activeFetchControllerRef = React.useRef<AbortController | null>(null);
    const fetchDoneTimerRef = React.useRef<number | null>(null);

    const cancelPendingInfoFetch = React.useCallback(() => {
        fetchRequestIdRef.current += 1;
        activeFetchControllerRef.current?.abort();
        activeFetchControllerRef.current = null;
        if (fetchDoneTimerRef.current) {
            window.clearTimeout(fetchDoneTimerRef.current);
            fetchDoneTimerRef.current = null;
        }
        setIsFetchingInfo(false);
    }, []);

    const applyDetectedTarget = React.useCallback((value: string, fillTitle = false) => {
        const target = parseLinkTarget(value);
        if (!target) return;

        setLinkType(target.linkType);
        setAccountPlatform(target.accountPlatform);
        setAccountHandle(target.accountHandle);

        if (target.linkType === 'person_account') {
            setCategory((prev) => prev.trim() ? prev : DEFAULT_ACCOUNT_CATEGORY);
            if (fillTitle) {
                setTitle((prev) => prev.trim() ? prev : getFallbackTitle(target));
            }
        }
    }, []);

    React.useEffect(() => {
        cancelPendingInfoFetch();

        if (isOpen && editLink) {
            setTitle(editLink.title);
            setUrl(editLink.normalized_url || editLink.url);
            setImageUrl(editLink.image_url || '');
            setDescription(editLink.description || '');
            setCategory(editLink.category);
            const parsed = parseLinkTarget(editLink.normalized_url || editLink.url);
            const resolvedType = getResolvedLinkType(editLink);
            setLinkType(resolvedType === 'person_account' || parsed?.linkType === 'person_account' ? 'person_account' : 'site');
            setAccountPlatform(editLink.account_platform || parsed?.accountPlatform || 'other');
            setAccountHandle(editLink.account_handle || parsed?.accountHandle || '');
            setOgImageUrl(editLink.image_url || '');
            setThumbnailOptions(editLink.image_url ? [{
                url: editLink.image_url,
                label: '현재 이미지',
                source: 'saved'
            }] : []);
            setThumbnailFetchError('');
            setSelectedFile(null);
            lastFetchedUrlRef.current = '';
            metadataOwnerUrlRef.current = editLink.normalized_url || editLink.url;
            shouldRefreshInitialAccountDraftRef.current = false;
        } else if (isOpen && !editLink) {
            const draftUrl = initialDraft?.url || '';
            const parsed = parseLinkTarget(draftUrl);
            const resolvedType = initialDraft?.linkType === 'person_account' || parsed?.linkType === 'person_account'
                ? 'person_account'
                : 'site';
            const resolvedPlatform = resolvedType === 'person_account'
                ? (initialDraft?.accountPlatform || parsed?.accountPlatform || 'other')
                : 'other';
            const resolvedHandle = resolvedType === 'person_account'
                ? (initialDraft?.accountHandle || parsed?.accountHandle || '')
                : '';
            const resolvedImageUrl = initialDraft?.imageUrl || '';

            setTitle(initialDraft?.title || getFallbackTitle(parsed) || '');
            setUrl(parsed?.normalizedUrl || draftUrl);
            setImageUrl(resolvedImageUrl);
            const draftDescription = initialDraft?.description || '';
            setDescription(resolvedType === 'person_account' && isWeakAccountDescription(draftDescription, parsed)
                ? ''
                : draftDescription);
            setCategory(initialDraft?.category || (resolvedType === 'person_account' ? DEFAULT_ACCOUNT_CATEGORY : ''));
            setLinkType(resolvedType);
            setAccountPlatform(resolvedPlatform);
            setAccountHandle(resolvedHandle);
            setOgImageUrl(resolvedImageUrl);
            setThumbnailOptions(resolvedImageUrl ? [{
                url: resolvedImageUrl,
                label: '가져온 이미지',
                source: 'clipper'
            }] : []);
            setThumbnailFetchError('');
            setSelectedFile(null);
            lastFetchedUrlRef.current = '';
            metadataOwnerUrlRef.current = parsed?.normalizedUrl || draftUrl;
            shouldRefreshInitialAccountDraftRef.current = Boolean(
                resolvedType === 'person_account' &&
                initialDraft &&
                (initialDraft.source || initialDraft.description || initialDraft.imageUrl || initialDraft.title)
            );
        }
    }, [cancelPendingInfoFetch, isOpen, editLink, initialDraft]);

    const handleAutoFetch = React.useCallback(async (force = false) => {
        if (!url.trim()) return;

        const formattedUrl = normalizeLinkUrl(url);
        const target = parseLinkTarget(formattedUrl);
        const fetchUrl = target?.normalizedUrl || formattedUrl;
        setUrl(fetchUrl);
        if (target) applyDetectedTarget(fetchUrl, true);

        const metadataOwnerUrl = metadataOwnerUrlRef.current;
        const isDifferentMetadataTarget = Boolean(metadataOwnerUrl && metadataOwnerUrl !== fetchUrl);
        if (!force && lastFetchedUrlRef.current === fetchUrl) return;
        lastFetchedUrlRef.current = fetchUrl;

        fetchRequestIdRef.current += 1;
        const requestId = fetchRequestIdRef.current;
        activeFetchControllerRef.current?.abort();
        const controller = new AbortController();
        activeFetchControllerRef.current = controller;
        if (fetchDoneTimerRef.current) {
            window.clearTimeout(fetchDoneTimerRef.current);
            fetchDoneTimerRef.current = null;
        }

        const isCurrentRequest = () => fetchRequestIdRef.current === requestId && !controller.signal.aborted;

        setIsFetchingInfo(true);
        setThumbnailFetchError('');
        try {
            const res = await fetch('/api/fetch-og-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: fetchUrl }),
                signal: controller.signal
            });
            if (!isCurrentRequest()) return;
            if (res.ok) {
                const data = await res.json();
                if (!isCurrentRequest()) return;
                const currentTitle = title.trim();
                const fallbackTitle = getFallbackTitle(target);
                const isAccountFetch = target?.linkType === 'person_account';
                const shouldReplaceAccountMetadata = Boolean(isAccountFetch && (
                    force ||
                    isDifferentMetadataTarget ||
                    shouldRefreshInitialAccountDraftRef.current
                ));
                const shouldReplaceTitle = !currentTitle || (
                    isAccountFetch &&
                    (currentTitle === fallbackTitle || isWeakFetchedTitle(currentTitle) || isFallbackAccountTitle(currentTitle, target))
                );

                if (data.title && (shouldReplaceTitle || shouldReplaceAccountMetadata)) {
                    setTitle(isAccountFetch && isWeakFetchedTitle(data.title)
                        ? getFallbackTitle(target)
                        : data.title);
                }
                const fetchedDescription = typeof data.description === 'string' ? data.description.trim() : '';
                const currentDescription = description.trim();
                const currentDescriptionIsWeak = isAccountFetch && isWeakAccountDescription(currentDescription, target);
                const fetchedDescriptionIsWeak = isAccountFetch && isWeakAccountDescription(fetchedDescription, target);
                if (shouldReplaceAccountMetadata) {
                    setDescription(fetchedDescription && !fetchedDescriptionIsWeak ? fetchedDescription : '');
                } else if (fetchedDescription && (!currentDescription || currentDescriptionIsWeak) && !fetchedDescriptionIsWeak) {
                    setDescription(fetchedDescription);
                } else if (currentDescriptionIsWeak) {
                    setDescription('');
                }

                const currentImageUrl = imageUrl.trim();
                const fetchedOptions = normalizeThumbnailOptions(data);
                const accountSafeOptions = isAccountFetch
                    ? fetchedOptions.filter((option) => accountThumbnailSources.has(option.source || ''))
                    : fetchedOptions;
                const hasFetchedAccountAvatar = accountSafeOptions.some((option) => option.source === 'account-avatar');
                const options = isAccountFetch && currentImageUrl && !hasFetchedAccountAvatar && !shouldReplaceAccountMetadata
                    ? mergeThumbnailOptions([
                        { url: currentImageUrl, label: '현재 프로필 이미지', source: 'clipper' },
                        ...accountSafeOptions
                    ])
                    : accountSafeOptions;
                setThumbnailOptions(options);

                if (options.length > 0) {
                    const preferredOption = isAccountFetch
                        ? options.find((option) => option.source === 'account-avatar')
                            || options.find((option) => option.url === currentImageUrl)
                            || options[0]
                        : options[0];
                    setImageUrl(preferredOption.url);
                    setOgImageUrl(preferredOption.url);
                } else {
                    if (isAccountFetch && currentImageUrl && !shouldReplaceAccountMetadata) {
                        setThumbnailOptions([{ url: currentImageUrl, label: '현재 프로필 이미지', source: 'clipper' }]);
                        setThumbnailFetchError('새 프로필 이미지를 찾지 못해 기존 이미지를 유지했습니다.');
                    } else {
                        setImageUrl('');
                        setOgImageUrl('');
                        setThumbnailFetchError('선택 가능한 썸네일을 찾지 못했습니다.');
                    }
                }
                metadataOwnerUrlRef.current = fetchUrl;
                shouldRefreshInitialAccountDraftRef.current = false;
            } else {
                throw new Error(`metadata fetch failed: ${res.status}`);
            }
            setSelectedFile(null); // URL 자동 추출 시 사용자가 선택한 로컬 파일은 취소
        } catch (error) {
            if (!isCurrentRequest() || (error instanceof Error && error.name === 'AbortError')) {
                return;
            }
            console.error('Fetch error:', error);
            if (target?.linkType === 'person_account' && shouldRefreshInitialAccountDraftRef.current) {
                setDescription('');
                shouldRefreshInitialAccountDraftRef.current = false;
            }
            setThumbnailFetchError('썸네일 후보를 불러오지 못했습니다.');
        } finally {
            if (isCurrentRequest()) {
                fetchDoneTimerRef.current = window.setTimeout(() => {
                    if (fetchRequestIdRef.current === requestId) {
                        setIsFetchingInfo(false);
                        activeFetchControllerRef.current = null;
                        fetchDoneTimerRef.current = null;
                    }
                }, 500); // UI 피드백을 위해 살짝 대기
            }
        }
    }, [applyDetectedTarget, description, imageUrl, title, url]);

    React.useEffect(() => {
        if (!isOpen || !isFetchableUrlInput(url)) return;

        const timer = window.setTimeout(() => {
            void handleAutoFetch(false);
        }, 800);

        return () => window.clearTimeout(timer);
    }, [handleAutoFetch, isOpen, url]);

    const selectThumbnailOption = (option: ThumbnailOption) => {
        setImageUrl(option.url);
        setOgImageUrl(option.url);
        setSelectedFile(null);
    };

    if (!isOpen) return null;

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
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
        setSelectedFile(croppedFile);
        setImageUrl(previewUrl);
        setIsCropModalOpen(false);
    };

    const handleCropModalClose = () => {
        setIsCropModalOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isFetchingInfo) {
            alert('정보를 가져오는 중입니다. 완료된 뒤 등록해주세요.');
            return;
        }

        if (isSubmitting) return;

        const { data: { user } } = await cafe24.auth.getUser();
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        const parsedTarget = parseLinkTarget(url);
        const resolvedType: LinkType = linkType === 'person_account' || parsedTarget?.linkType === 'person_account'
            ? 'person_account'
            : 'site';

        if (resolvedType === 'person_account' && parsedTarget?.linkType !== 'person_account') {
            alert('인물 계정은 Instagram 프로필 또는 YouTube 채널 URL만 등록할 수 있습니다.');
            return;
        }

        const formattedUrl = parsedTarget?.normalizedUrl || normalizeLinkUrl(url);
        const nextPlatform = resolvedType === 'person_account'
            ? (parsedTarget?.accountPlatform || accountPlatform)
            : 'other';
        const nextHandle = resolvedType === 'person_account'
            ? (parsedTarget?.accountHandle || accountHandle).trim()
            : '';
        const nextTitle = title.trim() || getFallbackTitle(parsedTarget) || formattedUrl;

        setSubmitting(true);
        try {
            const payload = {
                title: nextTitle,
                url: formattedUrl,
                normalized_url: formattedUrl,
                image_url: imageUrl.trim() || null,
                description,
                category: category.trim() || (resolvedType === 'person_account' ? DEFAULT_ACCOUNT_CATEGORY : '사이트'),
                link_type: resolvedType,
                account_platform: nextPlatform,
                account_handle: nextHandle || null
            };

            // 새 항목인 경우 created_by 추가
            if (!editLink) {
                (payload as any).created_by = user.id;
            }

            let linkId = editLink?.id;

            if (editLink) {
                // 수정
                const { error } = await cafe24.from('site_links').update(payload).eq('id', editLink.id);
                if (error) throw error;
            } else {
                // 신규 등록 로직
                const { data: newLink, error } = await cafe24.from('site_links').insert(payload).select().single();
                if (error) throw error;
                linkId = newLink.id;
            }

            // 직접 업로드한 로컬 이미지가 있을 경우 스토리지 폴더(site-links/[id])에 업로드
            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop() || 'png';
                const folderPath = `site-links/${linkId}`;
                const filePath = `${folderPath}/image.${fileExt}`;

                const { error: uploadError } = await cafe24.storage
                    .from('images')
                    .upload(filePath, selectedFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = cafe24.storage
                    .from('images')
                    .getPublicUrl(filePath);

                // URL 업데이트
                await cafe24.from('site_links').update({ image_url: publicUrl }).eq('id', linkId);
            }

            alert(editLink ? '링크 정보가 수정되었습니다.' : '등록 요청이 완료되었습니다.\n관리자 승인 후 전체 목록에 표시됩니다.');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error inserting link:', error);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const isInteractionLocked = isSubmitting || isFetchingInfo;

    return (
        <div className="links-modal-overlay glass-overlay">
            <div className="links-modal-panel glass-panel" onClick={e => e.stopPropagation()}>
                <div className="links-modal-header">
                    <h2 className="links-modal-title">
                        {editLink
                            ? (linkType === 'person_account' ? '인물 계정 수정' : '링크 정보 수정')
                            : (linkType === 'person_account' ? '새 인물 계정 등록' : '새 링크 등록')}
                    </h2>
                    <button className="links-modal-close" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="links-modal-body">
                    <form id="link-registration-form" onSubmit={handleSubmit} className="links-form">
                        <fieldset className="link-registration-fieldset" disabled={isInteractionLocked}>
                        <div className="form-group">
                            <label>유형 <span className="required-star">*</span></label>
                            <div className="link-kind-select" role="group" aria-label="링크 유형">
                                <button
                                    type="button"
                                    className={`link-kind-option ${linkType === 'site' ? 'active' : ''}`}
                                    onClick={() => {
                                        setLinkType('site');
                                        setAccountPlatform('other');
                                        setAccountHandle('');
                                    }}
                                >
                                    <i className="ri-global-line"></i>
                                    <span>사이트</span>
                                </button>
                                <button
                                    type="button"
                                    className={`link-kind-option ${linkType === 'person_account' ? 'active' : ''}`}
                                    onClick={() => {
                                        setLinkType('person_account');
                                        setCategory((prev) => prev.trim() ? prev : DEFAULT_ACCOUNT_CATEGORY);
                                        applyDetectedTarget(url, true);
                                    }}
                                >
                                    <i className="ri-user-follow-line"></i>
                                    <span>인물 계정</span>
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>주소 (URL) <span className="required-star">*</span></label>
                            <div className="link-url-fetch-row">
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => {
                                        const nextUrl = e.target.value;
                                        setUrl(nextUrl);
                                        setThumbnailFetchError('');
                                        applyDetectedTarget(nextUrl, false);
                                    }}
                                    onBlur={() => handleAutoFetch()}
                                    placeholder="예: instagram.com/name 또는 youtube.com/@name"
                                    required
                                    className="glass-input"
                                />
                                <button
                                    type="button"
                                    className="link-fetch-btn"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleAutoFetch(true)}
                                    disabled={isFetchingInfo || !url.trim()}
                                    title="썸네일 후보 검색"
                                >
                                    <i className={isFetchingInfo ? 'ri-loader-4-line ri-spin' : 'ri-search-eye-line'}></i>
                                </button>
                            </div>
                            {isFetchingInfo && <div className="input-hint" style={{ color: '#a855f7' }}>썸네일 자동 검색 중... <i className="ri-loader-4-line ri-spin"></i></div>}
                            {!isFetchingInfo && thumbnailFetchError && <div className="input-hint input-hint-error">{thumbnailFetchError}</div>}
                            {linkType === 'person_account' && accountPlatform !== 'other' && (
                                <div className="account-detected-pill">
                                    <i className={getPlatformIcon(accountPlatform)}></i>
                                    <span>{getPlatformLabel(accountPlatform)}</span>
                                    {accountHandle && <b>@{accountHandle}</b>}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label>대표 이미지 (미리보기)</label>

                            {/* 썸네일 미리보기 & 업로드 통합 영역 */}
                            <div
                                style={{
                                    marginBottom: '12px',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '2px dashed rgba(255,255,255,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '160px',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => {
                                    if (!isInteractionLocked) fileInputRef.current?.click();
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                            >
                                {imageUrl ? (
                                    <>
                                        <img
                                            src={imageUrl}
                                            alt="썸네일 미리보기"
                                            referrerPolicy="no-referrer"
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', zIndex: 1 }}
                                            onError={(e) => {
                                                // OG Image 로드 실패 시 안내 텍스트 표시
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.parentElement?.querySelector('.fallback-text')?.removeAttribute('style');
                                            }}
                                            onLoad={(e) => {
                                                e.currentTarget.style.display = 'block';
                                                e.currentTarget.parentElement?.querySelector('.fallback-text')?.setAttribute('style', 'display: none; position: absolute; color: rgba(255,255,255,0.5); text-align: center; zIndex: 0;');
                                            }}
                                        />
                                        {/* 이미지 로드 실패/없음 시 나타날 폴백 텍스트 */}
                                        <div className="fallback-text" style={{ display: 'none', position: 'absolute', color: 'rgba(255,255,255,0.5)', textAlign: 'center', zIndex: 0 }}>
                                            <i className="ri-image-line" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block' }}></i>
                                            <span style={{ fontSize: '0.9rem' }}>미리보기 이미지가 없습니다</span>
                                        </div>

                                        {/* 호버 시 덮어씌워지는 변경 안내 UI */}
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', zIndex: 2 }}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = '0'}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                className="glass-btn primary"
                                                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <i className="ri-image-edit-line"></i> 파일 변경
                                            </button>
                                            <button
                                                type="button"
                                                className="glass-btn secondary"
                                                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                                                onClick={() => {
                                                    setTempImageSrc(imageUrl);
                                                    setIsCropModalOpen(true);
                                                }}
                                            >
                                                <i className="ri-crop-2-line"></i> 현재 이미지 편집
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                        <i className="ri-image-add-line" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block' }}></i>
                                        <span style={{ fontSize: '0.9rem' }}>클릭하여 PC에서 썸네일 업로드</span>
                                    </div>
                                )}

                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    onChange={handleImageSelect}
                                    style={{ display: 'none' }}
                                    onClick={(e) => e.stopPropagation()} // 라벨 클릭 이벤트 중복 방지
                                />
                            </div>

                            {thumbnailOptions.length > 0 && (
                                <div className="thumbnail-options">
                                    {thumbnailOptions.map((option, idx) => {
                                        const label = option.label || thumbnailSourceLabels[option.source || ''] || '썸네일 후보';
                                        const selected = imageUrl === option.url && !selectedFile;
                                        return (
                                            <button
                                                type="button"
                                                key={`${option.url}-${idx}`}
                                                className={`thumbnail-option ${selected ? 'active' : ''}`}
                                                onClick={() => selectThumbnailOption(option)}
                                                title={label}
                                            >
                                                <span className="thumbnail-option-frame">
                                                    <img
                                                        src={option.url}
                                                        alt={label}
                                                        loading="lazy"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                            e.currentTarget.parentElement?.classList.add('is-broken');
                                                        }}
                                                    />
                                                </span>
                                                <span className="thumbnail-option-label">{label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={imageUrl}
                                    onChange={(e) => {
                                        setImageUrl(e.target.value);
                                        setSelectedFile(null);
                                    }}
                                    placeholder="또는 이미지 주소를 직접 입력"
                                    className="glass-input"
                                    style={{ flex: 1 }}
                                />
                                {selectedFile && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFile(null);
                                            setImageUrl(ogImageUrl || '');
                                        }}
                                        className="glass-btn secondary"
                                        style={{ padding: '0 14px', color: '#ef4444', whiteSpace: 'nowrap' }}
                                        title="첨부 취소"
                                    >
                                        첨부 취소
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{linkType === 'person_account' ? '인물 이름' : '사이트 이름'} <span className="required-star">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={linkType === 'person_account' ? '이름 또는 계정명을 입력하세요' : '사이트 이름을 입력하세요'}
                                required
                                className="glass-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>{linkType === 'person_account' ? '분류' : '카테고리'} <span className="required-star">*</span></label>
                            <input
                                type="text"
                                list="link-categories"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder={linkType === 'person_account' ? '예: 인물, 강사, 댄서' : '새 카테고리를 입력하거나 선택하세요'}
                                required
                                className="glass-input"
                            />
                            <datalist id="link-categories">
                                {categories.map((cat, idx) => (
                                    <option key={idx} value={cat} />
                                ))}
                            </datalist>
                        </div>

                        <div className="form-group">
                            <label>간단한 설명</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={linkType === 'person_account' ? '활동 장르나 소개를 적어주세요 (선택)' : '어떤 사이트인지 설명해주세요 (선택)'}
                                className="glass-input form-textarea"
                            />
                        </div>
                        </fieldset>
                    </form>
                </div>

                <div className="links-modal-actions">
                    <button type="button" onClick={onClose} className="glass-btn secondary">취소</button>
                    <button type="submit" form="link-registration-form" disabled={isInteractionLocked} className="glass-btn primary">
                        {isFetchingInfo
                            ? '정보 가져오는 중...'
                            : isSubmitting
                                ? (editLink ? '수정 중...' : '등록 중...')
                                : (editLink ? '수정하기' : '등록하기')}
                    </button>
                </div>
            </div>

            {isCropModalOpen && (
                <ImageCropModal
                    isOpen={isCropModalOpen}
                    imageUrl={tempImageSrc}
                    onClose={handleCropModalClose}
                    onCropComplete={handleCropComplete}
                    fileName={title ? `${title}.jpg` : 'site-link.jpg'}
                    onChangeImage={() => fileInputRef.current?.click()}
                    onImageUpdate={(file) => {
                        const reader = new FileReader();
                        reader.onload = (event) => setTempImageSrc(event.target?.result as string);
                        reader.readAsDataURL(file);
                    }}
                />
            )}
        </div>
    );
};

export default LinkRegistrationModal;
