import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import ImageCropModal from '../../../components/ImageCropModal';
import type { FeaturedItem } from '../page';
import './ShopEditModal.css';

interface ShopEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    shopId: number;
}

export default function ShopEditModal({ isOpen, onClose, onSuccess, shopId }: ShopEditModalProps) {
    const [loading, setLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [error, setError] = useState('');
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(true);
    const [enteredPassword, setEnteredPassword] = useState('');

    // Shop Info
    const [shopName, setShopName] = useState('');
    const [shopDescription, setShopDescription] = useState('');
    const [shopUrl, setShopUrl] = useState('');
    const [shopLogoFile, setShopLogoFile] = useState<File | null>(null);
    const [shopLogoPreview, setShopLogoPreview] = useState('');
    const [existingLogoUrl, setExistingLogoUrl] = useState('');

    // Featured Item Info
    const [itemId, setItemId] = useState<number | null>(null);
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [itemLink, setItemLink] = useState('');
    const [itemImageFile, setItemImageFile] = useState<File | null>(null);
    const [itemImagePreview, setItemImagePreview] = useState('');
    const [existingItemImageUrl, setExistingItemImageUrl] = useState('');

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
            if (!originalItemUrl) {
                setOriginalItemUrl(url);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleLogoRestore = () => {
        if (originalLogoUrl) {
            setLogoTempUrl(originalLogoUrl);
            setShopLogoPreview(existingLogoUrl);
            setShopLogoFile(null);
        }
    };

    const handleItemRestore = () => {
        if (originalItemUrl) {
            setItemTempUrl(originalItemUrl);
            setItemImagePreview(existingItemImageUrl);
            setItemImageFile(null);
        }
    };

    const handleLogoCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        setShopLogoFile(croppedFile);
        setShopLogoPreview(croppedPreviewUrl);
        setLogoTempUrl(croppedPreviewUrl);
        setShowLogoCropModal(false);
    };

    const handleItemCropComplete = (croppedFile: File, croppedPreviewUrl: string, _isModified: boolean) => {
        setItemImageFile(croppedFile);
        setItemImagePreview(croppedPreviewUrl);
        setItemTempUrl(croppedPreviewUrl);
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
        if (shopLogoPreview && !logoTempUrl) {
            setLogoTempUrl(shopLogoPreview);
        }
        setShowLogoCropModal(true);
    };

    const handleOpenItemCropModal = () => {
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
        setExistingLogoUrl('');
    };

    const handleDeleteItem = () => {
        setItemImageFile(null);
        setItemImagePreview('');
        setItemTempUrl(null);
        setOriginalItemUrl(null);
        setExistingItemImageUrl('');
    };

    // Fetch shop data when modal opens
    useEffect(() => {
        if (!isOpen || !shopId) {
            return;
        }

        const fetchShopData = async () => {
            setFetchLoading(true);
            try {
                const { data, error } = await supabase
                    .from('shops')
                    .select(`*, featured_items (*)`)
                    .eq('id', shopId)
                    .single();

                if (error) throw error;

                if (data) {
                    setShopName(data.name);
                    setShopDescription(data.description || '');
                    setShopUrl(data.website_url);
                    setExistingLogoUrl(data.logo_url || '');
                    setShopLogoPreview(data.logo_url || '');
                    setOriginalLogoUrl(data.logo_url || null);

                    const featuredItem = (data.featured_items as FeaturedItem[])?.[0];
                    if (featuredItem) {
                        setItemId(featuredItem.id);
                        setItemName(featuredItem.item_name);
                        setItemPrice(featuredItem.item_price?.toString() || '');
                        setItemLink(featuredItem.item_link);
                        setExistingItemImageUrl(featuredItem.item_image_url || '');
                        setItemImagePreview(featuredItem.item_image_url || '');
                        setOriginalItemUrl(featuredItem.item_image_url || null);
                    }
                }
            } catch (err: any) {
                console.error('쇼핑몰 정보 로딩 실패:', err);
                setError('쇼핑몰 정보를 불러올 수 없습니다.');
            } finally {
                setFetchLoading(false);
            }
        };

        fetchShopData();
    }, [isOpen, shopId]);

    const handlePasswordSubmit = async () => {
        if (!enteredPassword) {
            setError('비밀번호를 입력해주세요.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('shops')
                .select('password')
                .eq('id', shopId)
                .single();

            if (error) throw error;

            if (data.password === enteredPassword) {
                setShowPasswordPrompt(false);
                setError('');
            } else {
                setError('비밀번호가 일치하지 않습니다.');
            }
        } catch (err: any) {
            console.error('비밀번호 확인 실패:', err);
            setError('비밀번호 확인 중 오류가 발생했습니다.');
        }
    };

    const uploadImage = async (file: File, folder: string): Promise<string> => {
        const { createResizedImages } = await import('../../../utils/imageResize');
        const resizedImages = await createResizedImages(file);
        const fileName = `${Date.now()}.webp`;
        const filePath = `${folder}/${fileName}`;

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
        if (!shopName || !shopUrl) {
            setError('필수 항목을 모두 입력해주세요.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            let logoUrl = existingLogoUrl;
            if (shopLogoFile) {
                logoUrl = await uploadImage(shopLogoFile, 'shop-logos');
            }

            let itemImageUrl = existingItemImageUrl;
            if (itemImageFile) {
                itemImageUrl = await uploadImage(itemImageFile, 'featured-items');
            }

            // Update shops table
            const { error: shopError } = await supabase
                .from('shops')
                .update({
                    name: shopName,
                    description: shopDescription,
                    website_url: shopUrl,
                    logo_url: logoUrl,
                })
                .eq('id', shopId);

            if (shopError) throw shopError;

            // Update featured_items table
            if (itemId) {
                const { error: itemError } = await supabase
                    .from('featured_items')
                    .update({
                        item_name: itemName,
                        item_price: itemPrice ? Number(itemPrice) : null,
                        item_image_url: itemImageUrl,
                        item_link: itemLink,
                    })
                    .eq('id', itemId);

                if (itemError) throw itemError;
            }

            alert('쇼핑몰 정보가 성공적으로 수정되었습니다.');
            onSuccess();
            handleClose();
        } catch (err: any) {
            console.error('쇼핑몰 수정 실패:', err);
            setError(err.message || '수정 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('정말로 이 쇼핑몰을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { error: deleteError } = await supabase
                .from('shops')
                .delete()
                .eq('id', shopId);

            if (deleteError) throw deleteError;

            alert('쇼핑몰이 성공적으로 삭제되었습니다.');
            onSuccess();
            handleClose();
        } catch (err: any) {
            console.error('쇼핑몰 삭제 실패:', err);
            setError(err.message || '삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setShowPasswordPrompt(true);
            setEnteredPassword('');
            setError('');
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <>
            <div className="shop-edit-modal-overlay" onClick={handleClose}>
                <div className="shop-edit-modal-content" onClick={(e) => e.stopPropagation()}>
                    {fetchLoading ? (
                        <>
                            <div className="shop-edit-modal-header">
                                <h2 className="shop-edit-modal-title">쇼핑몰 수정</h2>
                                <button onClick={handleClose} className="shop-edit-modal-close">
                                    <i className="ri-close-line"></i>
                                </button>
                            </div>
                            <div className="shop-edit-modal-loading">로딩 중...</div>
                        </>
                    ) : showPasswordPrompt ? (
                        <>
                            <div className="shop-edit-modal-header">
                                <h2 className="shop-edit-modal-title">비밀번호 확인</h2>
                                <button onClick={handleClose} className="shop-edit-modal-close">
                                    <i className="ri-close-line"></i>
                                </button>
                            </div>
                            <div className="shop-edit-modal-password">
                                <p className="shop-edit-password-desc">
                                    쇼핑몰 정보를 수정하려면 등록 시 설정한 비밀번호를 입력해주세요.
                                </p>
                                <input
                                    type="password"
                                    placeholder="비밀번호"
                                    value={enteredPassword}
                                    onChange={(e) => setEnteredPassword(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                                    className="shop-edit-input"
                                />
                                {error && <p className="shop-edit-error">{error}</p>}
                                <button onClick={handlePasswordSubmit} className="shop-edit-submit-btn">
                                    확인
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="shop-edit-modal-header">
                                <h2 className="shop-edit-modal-title">쇼핑몰 수정</h2>
                                <button onClick={handleClose} className="shop-edit-modal-close" disabled={loading}>
                                    <i className="ri-close-line"></i>
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="shop-edit-modal-form">
                                {/* Shop Information */}
                                <div className="shop-edit-section">
                                    <h3 className="shop-edit-section-title">쇼핑몰 정보</h3>
                                    <input
                                        type="text"
                                        placeholder="쇼핑몰 이름 *"
                                        value={shopName}
                                        onChange={(e) => setShopName(e.target.value)}
                                        className="shop-edit-input"
                                        disabled={loading}
                                    />
                                    <input
                                        type="url"
                                        placeholder="쇼핑몰 웹사이트 URL *"
                                        value={shopUrl}
                                        onChange={(e) => setShopUrl(e.target.value)}
                                        className="shop-edit-input"
                                        disabled={loading}
                                    />
                                    <textarea
                                        placeholder="간단한 쇼핑몰 설명"
                                        value={shopDescription}
                                        onChange={(e) => setShopDescription(e.target.value)}
                                        className="shop-edit-textarea"
                                        rows={2}
                                        disabled={loading}
                                    ></textarea>
                                    <div>
                                        <label className="shop-edit-file-label">쇼핑몰 로고 (선택)</label>
                                        <button
                                            type="button"
                                            onClick={handleOpenLogoCropModal}
                                            className="shop-edit-image-edit-btn"
                                            disabled={loading}
                                        >
                                            <i className="ri-image-edit-line"></i>
                                            {shopLogoPreview ? '로고 이미지 편집' : '로고 이미지 등록'}
                                        </button>
                                        {shopLogoPreview && (
                                            <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem' }}>
                                                <img src={shopLogoPreview} alt="로고 미리보기" className="shop-edit-logo-preview" />
                                                <button
                                                    type="button"
                                                    onClick={handleDeleteLogo}
                                                    className="shop-edit-image-delete-btn"
                                                    title="이미지 삭제"
                                                    disabled={loading}
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Featured Item Information */}
                                <div className="shop-edit-section">
                                    <h3 className="shop-edit-section-title">대표 상품 정보 (선택사항)</h3>
                                    <input
                                        type="text"
                                        placeholder="상품 이름"
                                        value={itemName}
                                        onChange={(e) => setItemName(e.target.value)}
                                        className="shop-edit-input"
                                        disabled={loading}
                                    />
                                    <input
                                        type="url"
                                        placeholder="상품 직접 링크"
                                        value={itemLink}
                                        onChange={(e) => setItemLink(e.target.value)}
                                        className="shop-edit-input"
                                        disabled={loading}
                                    />
                                    <input
                                        type="number"
                                        placeholder="상품 가격 (숫자만)"
                                        value={itemPrice}
                                        onChange={(e) => setItemPrice(e.target.value)}
                                        className="shop-edit-input"
                                        disabled={loading}
                                    />
                                    <div>
                                        <label className="shop-edit-file-label">상품 이미지</label>
                                        <button
                                            type="button"
                                            onClick={handleOpenItemCropModal}
                                            className="shop-edit-image-edit-btn"
                                            disabled={loading}
                                        >
                                            <i className="ri-image-edit-line"></i>
                                            {itemImagePreview ? '상품 이미지 편집' : '상품 이미지 등록'}
                                        </button>
                                        {itemImagePreview && (
                                            <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem', width: '100%' }}>
                                                <img src={itemImagePreview} alt="상품 이미지 미리보기" className="shop-edit-item-preview" />
                                                <button
                                                    type="button"
                                                    onClick={handleDeleteItem}
                                                    className="shop-edit-image-delete-btn"
                                                    title="이미지 삭제"
                                                    disabled={loading}
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {error && <p className="shop-edit-error">{error}</p>}

                                <button type="submit" disabled={loading} className="shop-edit-submit-btn">
                                    {loading ? '수정 중...' : '수정 완료'}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className="shop-edit-delete-btn"
                                >
                                    쇼핑몰 삭제
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>

            {/* Logo Crop Modal */}
            <ImageCropModal
                isOpen={showLogoCropModal}
                imageUrl={logoTempUrl}
                onClose={() => handleCropDiscard('logo')}
                onCropComplete={handleLogoCropComplete}
                onDiscard={() => handleCropDiscard('logo')}
                onChangeImage={() => { }}
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
                onChangeImage={() => { }}
                onImageUpdate={handleItemFileSelect}
                onRestoreOriginal={handleItemRestore}
                hasOriginal={!!originalItemUrl}
                fileName="product-image.jpg"
            />
        </>,
        document.body
    );
}
