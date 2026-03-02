import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { type SiteLink } from '../Page';
import ImageCropModal from '../../../components/ImageCropModal';

interface LinkRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    categories: string[];
    editLink?: SiteLink | null;
}

export const LinkRegistrationModal: React.FC<LinkRegistrationModalProps> = ({ isOpen, onClose, onSuccess, categories, editLink }) => {
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [isSubmitting, setSubmitting] = useState(false);
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);
    const [ogImageUrl, setOgImageUrl] = useState(''); // Fallback 로고/썸네일 저장용
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (isOpen && editLink) {
            setTitle(editLink.title);
            setUrl(editLink.url);
            setImageUrl(editLink.image_url || '');
            setDescription(editLink.description || '');
            setCategory(editLink.category);
            setOgImageUrl(editLink.image_url || '');
            setSelectedFile(null);
        } else if (isOpen && !editLink) {
            setTitle('');
            setUrl('');
            setImageUrl('');
            setDescription('');
            setCategory('');
            setOgImageUrl('');
            setSelectedFile(null);
        }
    }, [isOpen, editLink]);

    if (!isOpen) return null;

    const handleAutoFetch = async () => {
        if (!url.trim()) return;

        let formattedUrl = url.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = `https://${formattedUrl}`;
            setUrl(formattedUrl);
        }

        setIsFetchingInfo(true);
        try {
            // 사이트 이름과 설정을 가져오기 위해 엣지 함수 호출 (thum.io 차단 문제로 바로 OG 이미지 활용)
            const res = await fetch(`/.netlify/functions/fetch-og-image?url=${encodeURIComponent(formattedUrl)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.title && !title) setTitle(data.title);
                if (data.description && !description) setDescription(data.description);

                if (data.image_url) {
                    setImageUrl(data.image_url);
                    setOgImageUrl(data.image_url); // Fallback용 파싱된 로고/OG 이미지 저장
                } else {
                    // 서버에서 못 찾았을 경우 에러 UI를 띄우기 위해 빈값 처리
                    setImageUrl('');
                    setOgImageUrl('');
                }
            }
            setSelectedFile(null); // URL 자동 추출 시 사용자가 선택한 로컬 파일은 취소
        } catch (error) {
            console.error('Fetch error:', error);
            // 메타데이터 가져오기 실패는 스크린샷 실패와 무관하므로 로깅만 수행
        } finally {
            setTimeout(() => setIsFetchingInfo(false), 500); // UI 피드백을 위해 살짝 대기
        }
    };

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

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        let formattedUrl = url.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = `https://${formattedUrl}`;
        }

        setSubmitting(true);
        try {
            const payload = {
                title,
                url: formattedUrl,
                image_url: imageUrl.trim() || null,
                description,
                category: category.trim(),
                is_approved: editLink ? editLink.is_approved : false // 수정 시 승인 상태 유지
            };

            // 새 항목인 경우 created_by 추가
            if (!editLink) {
                (payload as any).created_by = user.id;
            }

            let linkId = editLink?.id;

            if (editLink) {
                // 수정
                const { error } = await supabase.from('site_links').update(payload).eq('id', editLink.id);
                if (error) throw error;
            } else {
                // 신규 등록 로직
                const { data: newLink, error } = await supabase.from('site_links').insert(payload).select().single();
                if (error) throw error;
                linkId = newLink.id;
            }

            // 직접 업로드한 로컬 이미지가 있을 경우 스토리지 폴더(site-links/[id])에 업로드
            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop() || 'png';
                const folderPath = `site-links/${linkId}`;
                const filePath = `${folderPath}/image.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, selectedFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                // URL 업데이트
                await supabase.from('site_links').update({ image_url: publicUrl }).eq('id', linkId);
            }

            alert(editLink ? '사이트 정보가 수정되었습니다.' : '등록 요청이 완료되었습니다.\n관리자 승인 후 전체 목록에 표시됩니다.');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error inserting link:', error);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="links-modal-overlay glass-overlay" onClick={onClose}>
            <div className="links-modal-panel glass-panel" onClick={e => e.stopPropagation()}>
                <div className="links-modal-header">
                    <h2 className="links-modal-title">{editLink ? '사이트 정보 수정' : '새 사이트 등록'}</h2>
                    <button className="links-modal-close" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="links-modal-body">
                    <form id="link-registration-form" onSubmit={handleSubmit} className="links-form">
                        <div className="form-group">
                            <label>사이트 주소 (URL) <span className="required-star">*</span></label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onBlur={handleAutoFetch}
                                placeholder="예: swingenjoy.com (입력 후 바깥을 클릭하면 썸네일을 자동 검색합니다)"
                                required
                                className="glass-input"
                            />
                            {isFetchingInfo && <div className="input-hint" style={{ color: '#a855f7' }}>썸네일 자동 검색 중... <i className="ri-loader-4-line ri-spin"></i></div>}
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
                                onClick={() => fileInputRef.current?.click()}
                                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                            >
                                {imageUrl ? (
                                    <>
                                        <img
                                            src={imageUrl}
                                            alt="썸네일 미리보기"
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
                            <label>사이트 이름 <span className="required-star">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="사이트 이름을 입력하세요"
                                required
                                className="glass-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>카테고리 <span className="required-star">*</span></label>
                            <input
                                type="text"
                                list="link-categories"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder="새 카테고리를 입력하거나 선택하세요"
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
                                placeholder="어떤 사이트인지 설명해주세요 (선택)"
                                className="glass-input form-textarea"
                            />
                        </div>
                    </form>
                </div>

                <div className="links-modal-actions">
                    <button type="button" onClick={onClose} className="glass-btn secondary">취소</button>
                    <button type="submit" form="link-registration-form" disabled={isSubmitting} className="glass-btn primary">
                        {isSubmitting ? (editLink ? '수정 중...' : '등록 중...') : (editLink ? '수정하기' : '등록하기')}
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
