import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import ImageCropModal from '../../../components/ImageCropModal';
import type { FeaturedItem as DBFeaturedItem } from '../page';
import './ShopEditModal.css';

interface ShopEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    shopId: number;
}

interface FeaturedItem {
    id: string;
    dbId: number | null; // DB ID (for existing items)
    name: string;
    price: string;
    link: string;
    imageFile: File | null;
    imagePreview: string;
    tempUrl: string | null;
    originalUrl: string | null;
}

export default function ShopEditModal({ isOpen, onClose, onSuccess, shopId }: ShopEditModalProps) {
    const [loading, setLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [error, setError] = useState('');

    // Shop Info
    const [shopName, setShopName] = useState('');
    const [shopDescription, setShopDescription] = useState('');
    const [shopUrl, setShopUrl] = useState('');
    const [shopLogoFile, setShopLogoFile] = useState<File | null>(null);
    const [shopLogoPreview, setShopLogoPreview] = useState('');
    const [existingLogoUrl, setExistingLogoUrl] = useState('');

    // Logo Image Crop Modal States
    const [showLogoCropModal, setShowLogoCropModal] = useState(false);
    const [logoTempUrl, setLogoTempUrl] = useState<string | null>(null);
    const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null);

    // Featured Items (Array)
    const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
    const [activeCropItemIndex, setActiveCropItemIndex] = useState<number | null>(null);

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
            setShopLogoPreview(existingLogoUrl);
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
        setExistingLogoUrl('');
    };

    // Featured Items handlers
    const addFeaturedItem = () => {
        const newItem: FeaturedItem = {
            id: `${Date.now()}-${featuredItems.length}`,
            dbId: null,
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
                imagePreview: item.originalUrl,
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

                    // Load existing featured items
                    const dbItems = (data.featured_items as DBFeaturedItem[]) || [];
                    console.log('[ShopEditModal] Loaded featured items from DB:', dbItems);
                    const loadedItems: FeaturedItem[] = dbItems.map((dbItem, _index) => ({
                        id: `existing-${dbItem.id}`,
                        dbId: dbItem.id,
                        name: dbItem.item_name || '',
                        price: dbItem.item_price?.toString() || '',
                        link: dbItem.item_link || '',
                        imageFile: null,
                        imagePreview: dbItem.item_image_url || '',
                        tempUrl: dbItem.item_image_url || null,
                        originalUrl: dbItem.item_image_url || null,
                    }));
                    console.log('[ShopEditModal] Setting featuredItems state:', loadedItems);
                    setFeaturedItems(loadedItems);
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


    const uploadImage = async (file: File, folder: string): Promise<string> => {
        const { resizeImage } = await import('../../../utils/imageResize');

        // 폴더에 따라 리사이징 옵션 다르게 적용
        let resizedImageBlob;
        if (folder === 'shop-logos') {
            // 로고: 높이 170px 기준 (연습실 썸네일과 통일)
            resizedImageBlob = await resizeImage(file, 170, 0.75, 'logo.webp', 'height');
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
        console.log('[ShopEditModal] handleSubmit called, featuredItems:', featuredItems);

        if (!shopName || !shopUrl) {
            setError('필수 항목을 모두 입력해주세요.');
            return;
        }

        // Validate featured items - check if any item has a name but no image
        for (let i = 0; i < featuredItems.length; i++) {
            const item = featuredItems[i];
            if (item.name && !item.imagePreview && !item.imageFile) {
                setError(`상품 #${i + 1} "${item.name}"에 이미지가 없습니다. 상품 이미지를 등록해주세요.`);
                return;
            }
        }

        setLoading(true);
        setError('');

        try {
            let logoUrl = existingLogoUrl;
            if (shopLogoFile) {
                logoUrl = await uploadImage(shopLogoFile, 'shop-logos');
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

            // Handle featured items with proper CRUD operations
            // 1. Get existing item IDs from DB
            const { data: existingItems } = await supabase
                .from('featured_items')
                .select('id')
                .eq('shop_id', shopId);

            const existingItemIds = new Set((existingItems || []).map(item => item.id));
            const processedItemIds = new Set<number>();

            // 2. Update existing items or insert new items
            for (const item of featuredItems) {
                // Skip empty items
                if (!item.name && !item.imageFile && !item.imagePreview) {
                    continue;
                }

                // Skip items without images (should not happen due to validation above)
                let itemImageUrl = item.imagePreview;
                if (item.imageFile) {
                    itemImageUrl = await uploadImage(item.imageFile, 'featured-items');
                }

                if (!itemImageUrl) {
                    continue;
                }

                if (item.dbId && existingItemIds.has(item.dbId)) {
                    // Update existing item
                    const { error: updateError } = await supabase
                        .from('featured_items')
                        .update({
                            item_name: item.name || null,
                            item_price: item.price ? Number(item.price) : null,
                            item_image_url: itemImageUrl,
                            item_link: item.link || shopUrl,
                        })
                        .eq('id', item.dbId);

                    if (updateError) throw updateError;
                    processedItemIds.add(item.dbId);
                } else {
                    // Insert new item
                    const { error: insertError } = await supabase
                        .from('featured_items')
                        .insert({
                            shop_id: shopId,
                            item_name: item.name || null,
                            item_price: item.price ? Number(item.price) : null,
                            item_image_url: itemImageUrl,
                            item_link: item.link || shopUrl,
                        });

                    if (insertError) throw insertError;
                }
            }

            // 3. Delete items that were removed (exist in DB but not in current featuredItems)
            const itemsToDelete = Array.from(existingItemIds).filter(id => !processedItemIds.has(id));
            if (itemsToDelete.length > 0) {
                const { error: deleteError } = await supabase
                    .from('featured_items')
                    .delete()
                    .in('id', itemsToDelete);

                if (deleteError) throw deleteError;
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
        console.log('[ShopEditModal] handleClose called, loading:', loading);
        if (!loading) {
            setError('');
            onClose();
        }
    };

    if (!isOpen) return null;

    const activeCropItem = activeCropItemIndex !== null ? featuredItems[activeCropItemIndex] : null;

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

                                {/* Featured Items Section */}
                                <div className="shop-edit-section">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3 className="shop-edit-section-title" style={{ margin: 0 }}>상품 정보 (선택사항)</h3>
                                        <button
                                            type="button"
                                            onClick={addFeaturedItem}
                                            className="shop-edit-add-item-btn"
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
                                        <div key={item.id} className="shop-edit-item-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <h4 style={{ color: 'white', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                                                    상품 #{index + 1}
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFeaturedItem(item.id)}
                                                    className="shop-edit-remove-item-btn"
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
                                                className="shop-edit-input"
                                                disabled={loading}
                                            />
                                            <input
                                                type="url"
                                                placeholder="상품 직접 링크"
                                                value={item.link}
                                                onChange={(e) => updateFeaturedItem(item.id, { link: e.target.value })}
                                                className="shop-edit-input"
                                                disabled={loading}
                                            />
                                            <input
                                                type="number"
                                                placeholder="상품 가격 (숫자만)"
                                                value={item.price}
                                                onChange={(e) => updateFeaturedItem(item.id, { price: e.target.value })}
                                                className="shop-edit-input"
                                                disabled={loading}
                                            />
                                            <div>
                                                <label className="shop-edit-file-label">상품 이미지</label>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenItemCropModal(index)}
                                                    className="shop-edit-image-edit-btn"
                                                    disabled={loading}
                                                >
                                                    <i className="ri-image-edit-line"></i>
                                                    {item.imagePreview ? '상품 이미지 편집' : '상품 이미지 등록'}
                                                </button>
                                                {item.imagePreview && (
                                                    <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem', width: '100%' }}>
                                                        <img src={item.imagePreview} alt="상품 이미지 미리보기" className="shop-edit-item-preview" />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteItemImage(index)}
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
                                    ))}
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
