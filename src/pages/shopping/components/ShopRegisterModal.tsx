import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import ImageCropModal from '../../../components/ImageCropModal';
import { useModalHistory } from '../../../hooks/useModalHistory';

import { useAuth } from '../../../contexts/AuthContext';
import './ShopRegisterModal.css';

interface ShopRegisterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface FeaturedItem {
    id: string;
    name: string;
    price: string;
    link: string;
    imageFile: File | null;
    imagePreview: string;
    tempUrl: string | null;
    originalUrl: string | null;
}

export default function ShopRegisterModal({ isOpen, onClose, onSuccess }: ShopRegisterModalProps) {

    const { user, signInWithKakao } = useAuth();
    // const navigate = useNavigate(); // Unused
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = () => signInWithKakao();

    // Login Overlay Component
    const LoginOverlay = () => (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            borderRadius: 'inherit'
        }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>로그인 필요</h2>
            <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                쇼핑몰 등록을 위해 로그인이 필요합니다.<br />
                간편하게 로그인하고 계속하세요!
            </p>
            <button
                onClick={handleLogin}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '1rem',
                    background: '#FEE500',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}
            >
                <i className="ri-kakao-talk-fill" style={{ fontSize: '1.5rem' }}></i>
                카카오로 로그인
            </button>
            <button
                onClick={onClose}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '0.75rem',
                    background: 'transparent',
                    color: '#9ca3af',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                }}
            >
                취소
            </button>
        </div>
    );

    // Shop Info
    const [shopName, setShopName] = useState('');
    const [shopDescription, setShopDescription] = useState('');
    const [shopUrl, setShopUrl] = useState('');
    const [shopLogoFile, setShopLogoFile] = useState<File | null>(null);
    const [shopLogoPreview, setShopLogoPreview] = useState('');

    // Logo Image Crop Modal States
    const [showLogoCropModal, setShowLogoCropModal] = useState(false);
    const [logoTempUrl, setLogoTempUrl] = useState<string | null>(null);
    const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null);

    // Featured Items (Array)
    const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
    const [activeCropItemIndex, setActiveCropItemIndex] = useState<number | null>(null);

    // Enable mobile back gesture to close modal
    useModalHistory(isOpen, onClose);

    // Logo handlers
    const handleLogoFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const url = reader.result as string;
            setLogoTempUrl(url);
            if (!originalLogoUrl) {
                setOriginalLogoUrl(url);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleLogoRestore = () => {
        if (originalLogoUrl) {
            setLogoTempUrl(originalLogoUrl);
            setShopLogoPreview('');
            setShopLogoFile(null);
        }
    };

    const handleLogoCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        setShopLogoFile(croppedFile);
        setShopLogoPreview(croppedPreviewUrl);
        setLogoTempUrl(croppedPreviewUrl);
        setShowLogoCropModal(false);
    };

    const handleOpenLogoCropModal = () => {
        if (shopLogoPreview && !logoTempUrl) {
            setLogoTempUrl(shopLogoPreview);
        }
        setShowLogoCropModal(true);
    };

    const handleDeleteLogo = () => {
        setShopLogoFile(null);
        setShopLogoPreview('');
        setLogoTempUrl(null);
        setOriginalLogoUrl(null);
    };

    // Featured Items handlers
    const addFeaturedItem = () => {
        const newItem: FeaturedItem = {
            id: `${Date.now()}-${featuredItems.length}`,
            name: '',
            price: '',
            link: '',
            imageFile: null,
            imagePreview: '',
            tempUrl: null,
            originalUrl: null,
        };
        setFeaturedItems([...featuredItems, newItem]);
    };

    const removeFeaturedItem = (id: string) => {
        setFeaturedItems(featuredItems.filter(item => item.id !== id));
    };

    const updateFeaturedItem = (id: string, updates: Partial<FeaturedItem>) => {
        setFeaturedItems(featuredItems.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    };

    const handleItemFileSelect = (file: File, index: number) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const url = reader.result as string;
            const item = featuredItems[index];
            updateFeaturedItem(item.id, {
                tempUrl: url,
                originalUrl: item.originalUrl || url,
            });
        };
        reader.readAsDataURL(file);
    };

    const handleItemRestore = (index: number) => {
        const item = featuredItems[index];
        if (item.originalUrl) {
            updateFeaturedItem(item.id, {
                tempUrl: item.originalUrl,
                imagePreview: '',
                imageFile: null,
            });
        }
    };

    const handleItemCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        if (activeCropItemIndex !== null) {
            const item = featuredItems[activeCropItemIndex];
            updateFeaturedItem(item.id, {
                imageFile: croppedFile,
                imagePreview: croppedPreviewUrl,
                tempUrl: croppedPreviewUrl,
            });
            setActiveCropItemIndex(null);
        }
    };

    const handleOpenItemCropModal = (index: number) => {
        const item = featuredItems[index];
        if (item.imagePreview && !item.tempUrl) {
            updateFeaturedItem(item.id, { tempUrl: item.imagePreview });
        }
        setActiveCropItemIndex(index);
    };

    const handleDeleteItemImage = (index: number) => {
        const item = featuredItems[index];
        updateFeaturedItem(item.id, {
            imageFile: null,
            imagePreview: '',
            tempUrl: null,
            originalUrl: null,
        });
    };

    const uploadImage = async (file: File, folder: string): Promise<string> => {
        const { resizeImage } = await import('../../../utils/imageResize');

        // 폴더에 따라 리사이징 옵션 다르게 적용
        let resizedImageBlob;
        if (folder === 'shop-logos') {
            // 로고: 높이 140px 기준 (120px 카드 높이 + 여유분 / 용량 최적화)
            resizedImageBlob = await resizeImage(file, 140, 0.75, 'logo.webp', 'height');
        } else {
            // 상품 이미지: 가로 500px 기준 (사용자 요청)
            resizedImageBlob = await resizeImage(file, 500, 0.8, 'item.webp', 'width');
        }

        const fileName = `${Date.now()}.webp`;
        const filePath = `${folder}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, resizedImageBlob, {
                contentType: 'image/webp',
                cacheControl: '31536000',
                upsert: true
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data } = supabase.storage.from('images').getPublicUrl(filePath);
        return data.publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 0. Auth Check Removed (Handled by Overlay)
        if (!user) return;

        if (!shopName || !shopUrl) {
            setError('필수 항목을 모두 입력해주세요.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            let logoUrl = '';
            if (shopLogoFile) {
                logoUrl = await uploadImage(shopLogoFile, 'shop-logos');
            }

            // 1. Insert into shops table
            const { data: shopData, error: shopError } = await supabase
                .from('shops')
                .insert({
                    name: shopName,
                    description: shopDescription,
                    website_url: shopUrl,
                    logo_url: logoUrl,
                    user_id: user.id, // Assign ownership
                })
                .select()
                .maybeSingle();

            if (shopError) throw shopError;
            if (!shopData) throw new Error('쇼핑몰 등록에 실패했습니다.');

            // 2. Insert featured items (if any)
            for (const item of featuredItems) {
                // Only insert if at least name or image is provided
                if (item.name || item.imageFile) {
                    let itemImageUrl = '';
                    if (item.imageFile) {
                        itemImageUrl = await uploadImage(item.imageFile, 'featured-items');
                    }

                    const { error: itemError } = await supabase
                        .from('featured_items')
                        .insert({
                            shop_id: shopData.id,
                            item_name: item.name || null,
                            item_price: item.price ? Number(item.price) : null,
                            item_image_url: itemImageUrl || null,
                            item_link: item.link || shopUrl,
                        });

                    if (itemError) throw itemError;
                }
            }

            alert('쇼핑몰이 성공적으로 등록되었습니다.');

            // Reset form
            setShopName('');
            setShopDescription('');
            setShopUrl('');
            setShopLogoFile(null);
            setShopLogoPreview('');
            setShopLogoPreview('');
            setLogoTempUrl(null);
            setOriginalLogoUrl(null);
            setFeaturedItems([]);

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('쇼핑몰 등록 실패:', err);
            setError(err.message || '등록 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            onClose();
        }
    };

    if (!isOpen) return null;

    const activeCropItem = activeCropItemIndex !== null ? featuredItems[activeCropItemIndex] : null;

    return createPortal(
        <>
            <div className="shop-register-modal-overlay" onClick={handleClose}>
                <div className="shop-register-modal-content" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                    {/* Login Requirement Overlay */}
                    {!user && <LoginOverlay />}

                    {/* Header with Close Button */}
                    <div className="shop-register-modal-header">
                        <h2 className="shop-register-modal-title">새 쇼핑몰 등록</h2>
                        <button onClick={handleClose} className="shop-register-modal-close" disabled={loading}>
                            <i className="ri-close-line"></i>
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="shop-register-modal-form">
                        {/* Shop Information */}
                        <div className="shop-register-section">
                            <h3 className="shop-register-section-title">쇼핑몰 정보</h3>
                            <input
                                type="text"
                                placeholder="쇼핑몰 이름 *"
                                value={shopName}
                                onChange={(e) => setShopName(e.target.value)}
                                className="shop-register-input"
                                disabled={loading}
                            />
                            <input
                                type="url"
                                placeholder="쇼핑몰 웹사이트 URL *"
                                value={shopUrl}
                                onChange={(e) => setShopUrl(e.target.value)}
                                className="shop-register-input"
                                disabled={loading}
                            />
                            <textarea
                                placeholder="간단한 쇼핑몰 설명"
                                value={shopDescription}
                                onChange={(e) => setShopDescription(e.target.value)}
                                className="shop-register-textarea"
                                rows={2}
                                disabled={loading}
                            ></textarea>
                            <div>
                                <label className="shop-register-file-label">쇼핑몰 로고 (선택)</label>
                                <button
                                    type="button"
                                    onClick={handleOpenLogoCropModal}
                                    className="shop-register-image-edit-btn"
                                    disabled={loading}
                                >
                                    <i className="ri-image-edit-line"></i>
                                    {shopLogoPreview ? '로고 이미지 편집' : '로고 이미지 등록'}
                                </button>
                                {shopLogoPreview && (
                                    <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem' }}>
                                        <img src={shopLogoPreview} alt="로고 미리보기" className="shop-register-logo-preview" />
                                        <button
                                            type="button"
                                            onClick={handleDeleteLogo}
                                            className="shop-register-image-delete-btn"
                                            title="이미지 삭제"
                                            disabled={loading}
                                        >
                                            <i className="ri-close-line"></i>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Featured Items Section */}
                        <div className="shop-register-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 className="shop-register-section-title" style={{ margin: 0 }}>상품 정보 (선택사항)</h3>
                                <button
                                    type="button"
                                    onClick={addFeaturedItem}
                                    className="shop-register-add-item-btn"
                                    disabled={loading}
                                >
                                    <i className="ri-add-line"></i>
                                    상품 추가
                                </button>
                            </div>

                            {featuredItems.length === 0 && (
                                <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                                    상품 정보를 추가하려면 "상품 추가" 버튼을 클릭하세요.
                                </p>
                            )}

                            {featuredItems.map((item, index) => (
                                <div key={item.id} className="shop-register-item-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <h4 style={{ color: 'white', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                                            상품 #{index + 1}
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => removeFeaturedItem(item.id)}
                                            className="shop-register-remove-item-btn"
                                            disabled={loading}
                                            title="상품 삭제"
                                        >
                                            <i className="ri-delete-bin-line"></i>
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="상품 이름"
                                        value={item.name}
                                        onChange={(e) => updateFeaturedItem(item.id, { name: e.target.value })}
                                        className="shop-register-input"
                                        disabled={loading}
                                    />
                                    <input
                                        type="url"
                                        placeholder="상품 직접 링크"
                                        value={item.link}
                                        onChange={(e) => updateFeaturedItem(item.id, { link: e.target.value })}
                                        className="shop-register-input"
                                        disabled={loading}
                                    />
                                    <input
                                        type="number"
                                        placeholder="상품 가격 (숫자만)"
                                        value={item.price}
                                        onChange={(e) => updateFeaturedItem(item.id, { price: e.target.value })}
                                        className="shop-register-input"
                                        disabled={loading}
                                    />
                                    <div>
                                        <label className="shop-register-file-label">상품 이미지</label>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenItemCropModal(index)}
                                            className="shop-register-image-edit-btn"
                                            disabled={loading}
                                        >
                                            <i className="ri-image-edit-line"></i>
                                            {item.imagePreview ? '상품 이미지 편집' : '상품 이미지 등록'}
                                        </button>
                                        {item.imagePreview && (
                                            <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem', width: '100%' }}>
                                                <img src={item.imagePreview} alt="상품 이미지 미리보기" className="shop-register-item-preview" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteItemImage(index)}
                                                    className="shop-register-image-delete-btn"
                                                    title="이미지 삭제"
                                                    disabled={loading}
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && <p className="shop-register-error">{error}</p>}

                        <button type="submit" disabled={loading} className="shop-register-submit-btn">
                            {loading ? '등록 중...' : '등록 완료'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Logo Crop Modal */}
            <ImageCropModal
                isOpen={showLogoCropModal}
                imageUrl={logoTempUrl}
                onClose={() => setShowLogoCropModal(false)}
                onCropComplete={handleLogoCropComplete}
                onDiscard={() => setShowLogoCropModal(false)}
                onChangeImage={() => { }}
                onImageUpdate={handleLogoFileSelect}
                onRestoreOriginal={handleLogoRestore}
                hasOriginal={!!originalLogoUrl}
                fileName="shop-logo.jpg"
            />

            {/* Product Image Crop Modal */}
            {activeCropItem && (
                <ImageCropModal
                    isOpen={activeCropItemIndex !== null}
                    imageUrl={activeCropItem.tempUrl}
                    onClose={() => setActiveCropItemIndex(null)}
                    onCropComplete={handleItemCropComplete}
                    onDiscard={() => setActiveCropItemIndex(null)}
                    onChangeImage={() => { }}
                    onImageUpdate={(file) => handleItemFileSelect(file, activeCropItemIndex!)}
                    onRestoreOriginal={() => handleItemRestore(activeCropItemIndex!)}
                    hasOriginal={!!activeCropItem.originalUrl}
                    fileName="product-image.jpg"
                />
            )}
        </>,
        document.body
    );
}
