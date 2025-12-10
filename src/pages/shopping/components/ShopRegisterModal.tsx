import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import ImageCropModal from '../../../components/ImageCropModal';
import './ShopRegisterModal.css';

interface ShopRegisterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ShopRegisterModal({ isOpen, onClose, onSuccess }: ShopRegisterModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Shop Info
    const [shopName, setShopName] = useState('');
    const [shopDescription, setShopDescription] = useState('');
    const [shopUrl, setShopUrl] = useState('');
    const [shopLogoFile, setShopLogoFile] = useState<File | null>(null);
    const [shopLogoPreview, setShopLogoPreview] = useState('');

    // Featured Item Info
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [itemLink, setItemLink] = useState('');
    const [itemImageFile, setItemImageFile] = useState<File | null>(null);
    const [itemImagePreview, setItemImagePreview] = useState('');
    const [password, setPassword] = useState('');

    // Image Crop Modal States
    const [showLogoCropModal, setShowLogoCropModal] = useState(false);
    const [logoTempUrl, setLogoTempUrl] = useState<string | null>(null);
    const [showItemCropModal, setShowItemCropModal] = useState(false);
    const [itemTempUrl, setItemTempUrl] = useState<string | null>(null);

    // Original images for restore functionality
    const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null);
    const [originalItemUrl, setOriginalItemUrl] = useState<string | null>(null);

    const handleLogoFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const url = reader.result as string;
            setLogoTempUrl(url);
            // Save as original if this is the first upload
            if (!originalLogoUrl) {
                setOriginalLogoUrl(url);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleItemFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const url = reader.result as string;
            setItemTempUrl(url);
            // Save as original if this is the first upload
            if (!originalItemUrl) {
                setOriginalItemUrl(url);
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

    const handleItemRestore = () => {
        if (originalItemUrl) {
            setItemTempUrl(originalItemUrl);
            setItemImagePreview('');
            setItemImageFile(null);
        }
    };

    const handleLogoCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        setShopLogoFile(croppedFile);
        setShopLogoPreview(croppedPreviewUrl);
        setLogoTempUrl(croppedPreviewUrl); // Keep for re-editing
        setShowLogoCropModal(false);
    };

    const handleItemCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        setItemImageFile(croppedFile);
        setItemImagePreview(croppedPreviewUrl);
        setItemTempUrl(croppedPreviewUrl); // Keep for re-editing
        setShowItemCropModal(false);
    };

    const handleCropDiscard = (type: 'logo' | 'item') => {
        if (type === 'logo') {
            setShowLogoCropModal(false);
        } else {
            setShowItemCropModal(false);
        }
    };

    const handleOpenLogoCropModal = () => {
        // If there's a preview, show it in the editor
        if (shopLogoPreview && !logoTempUrl) {
            setLogoTempUrl(shopLogoPreview);
        }
        setShowLogoCropModal(true);
    };

    const handleOpenItemCropModal = () => {
        // If there's a preview, show it in the editor
        if (itemImagePreview && !itemTempUrl) {
            setItemTempUrl(itemImagePreview);
        }
        setShowItemCropModal(true);
    };

    const handleDeleteLogo = () => {
        setShopLogoFile(null);
        setShopLogoPreview('');
        setLogoTempUrl(null);
        setOriginalLogoUrl(null);
    };

    const handleDeleteItem = () => {
        setItemImageFile(null);
        setItemImagePreview('');
        setItemTempUrl(null);
        setOriginalItemUrl(null);
    };

    const uploadImage = async (file: File, folder: string): Promise<string> => {
        // Import createResizedImages utility
        const { createResizedImages } = await import('../../../utils/imageResize');

        // Create WebP optimized images
        const resizedImages = await createResizedImages(file);

        const fileName = `${Date.now()}.webp`;
        const filePath = `${folder}/${fileName}`;

        // Upload the medium-size WebP image (1080px, quality 0.9) for better compression
        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, resizedImages.medium);

        if (uploadError) {
            throw uploadError;
        }

        const { data } = supabase.storage.from('images').getPublicUrl(filePath);
        return data.publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!shopName || !shopUrl || !password) {
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

            let itemImageUrl = '';
            if (itemImageFile) {
                itemImageUrl = await uploadImage(itemImageFile, 'featured-items');
            }

            // 1. Insert into shops table
            const { data: shopData, error: shopError } = await supabase
                .from('shops')
                .insert({
                    name: shopName,
                    description: shopDescription,
                    website_url: shopUrl,
                    logo_url: logoUrl,
                    password: password,
                })
                .select()
                .single();

            if (shopError) throw shopError;

            // 2. Insert into featured_items table (only if product info provided)
            if (itemName && itemImageUrl) {
                const { error: itemError } = await supabase
                    .from('featured_items')
                    .insert({
                        shop_id: shopData.id,
                        item_name: itemName,
                        item_price: itemPrice ? Number(itemPrice) : null,
                        item_image_url: itemImageUrl,
                        item_link: itemLink || shopUrl, // Use shop URL as fallback
                    });

                if (itemError) throw itemError;
            }

            alert('쇼핑몰이 성공적으로 등록되었습니다.');

            // Reset form
            setShopName('');
            setShopDescription('');
            setShopUrl('');
            setShopLogoFile(null);
            setShopLogoPreview('');
            setItemName('');
            setItemPrice('');
            setItemLink('');
            setItemImageFile(null);
            setItemImagePreview('');
            setPassword('');
            setLogoTempUrl(null);
            setItemTempUrl(null);
            setOriginalLogoUrl(null);
            setOriginalItemUrl(null);

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

    return createPortal(
        <>
            <div className="shop-register-modal-overlay" onClick={handleClose}>
                <div className="shop-register-modal-content" onClick={(e) => e.stopPropagation()}>
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
                            <input
                                type="password"
                                placeholder="수정용 비밀번호 *"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="shop-register-input"
                                minLength={4}
                                disabled={loading}
                            />
                            <p className="shop-register-helper-text">* 쇼핑몰 정보 수정 시 필요한 비밀번호입니다 (최소 4자)</p>
                        </div>

                        {/* Featured Item Information */}
                        <div className="shop-register-section">
                            <h3 className="shop-register-section-title">대표 상품 정보 (선택사항)</h3>
                            <input
                                type="text"
                                placeholder="상품 이름"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                className="shop-register-input"
                                disabled={loading}
                            />
                            <input
                                type="url"
                                placeholder="상품 직접 링크"
                                value={itemLink}
                                onChange={(e) => setItemLink(e.target.value)}
                                className="shop-register-input"
                                disabled={loading}
                            />
                            <input
                                type="number"
                                placeholder="상품 가격 (숫자만)"
                                value={itemPrice}
                                onChange={(e) => setItemPrice(e.target.value)}
                                className="shop-register-input"
                                disabled={loading}
                            />
                            <div>
                                <label className="shop-register-file-label">상품 이미지</label>
                                <button
                                    type="button"
                                    onClick={handleOpenItemCropModal}
                                    className="shop-register-image-edit-btn"
                                    disabled={loading}
                                >
                                    <i className="ri-image-edit-line"></i>
                                    {itemImagePreview ? '상품 이미지 편집' : '상품 이미지 등록'}
                                </button>
                                {itemImagePreview && (
                                    <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem', width: '100%' }}>
                                        <img src={itemImagePreview} alt="상품 이미지 미리보기" className="shop-register-item-preview" />
                                        <button
                                            type="button"
                                            onClick={handleDeleteItem}
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
                onClose={() => handleCropDiscard('logo')}
                onCropComplete={handleLogoCropComplete}
                onDiscard={() => handleCropDiscard('logo')}
                onChangeImage={() => { }} // Triggers file input
                onImageUpdate={handleLogoFileSelect}
                onRestoreOriginal={handleLogoRestore}
                hasOriginal={!!originalLogoUrl}
                fileName="shop-logo.jpg"
            />

            {/* Product Image Crop Modal */}
            <ImageCropModal
                isOpen={showItemCropModal}
                imageUrl={itemTempUrl}
                onClose={() => handleCropDiscard('item')}
                onCropComplete={handleItemCropComplete}
                onDiscard={() => handleCropDiscard('item')}
                onChangeImage={() => { }} // Triggers file input
                onImageUpdate={handleItemFileSelect}
                onRestoreOriginal={handleItemRestore}
                hasOriginal={!!originalItemUrl}
                fileName="product-image.jpg"
            />
        </>,
        document.body
    );
}
