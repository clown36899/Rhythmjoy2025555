import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import SimpleHeader from '../../../components/SimpleHeader';
import ImageCropModal from '../../../components/ImageCropModal';
import { useAuth } from '../../../contexts/AuthContext';
import './shopreg.css';

export default function ShoppingRegisterPage() {
  const navigate = useNavigate();
  const { user, signInWithKakao } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check login
  useEffect(() => {
    if (!user) {
      if (confirm('쇼핑몰을 등록하려면 로그인이 필요합니다.\n로그인 페이지로 이동하시겠습니까?')) {
        // Since we don't have a dedicated login page, trigger modal via header if possible or use signInWithKakao directly?
        // Actually, just alert and maybe redirect home or trigger auth.
        // But for now, let's redirect to home if not logged in, or show a blocker.
        // Better: trigger Kakao login or show alert.
        signInWithKakao();
      } else {
        navigate('/shopping');
      }
    }
  }, [user, navigate, signInWithKakao]);

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


  const handleLogoCropComplete = (croppedFile: File, croppedPreviewUrl: string) => {
    setShopLogoFile(croppedFile);
    setShopLogoPreview(croppedPreviewUrl);
    setLogoTempUrl(croppedPreviewUrl); // Keep for re-editing
    setShowLogoCropModal(false);
  };

  const handleItemCropComplete = (croppedFile: File, croppedPreviewUrl: string) => {
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

    // Upload the medium-size WebP image (650px, quality 0.8) for better compression
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
    if (!user) {
      setError('로그인이 필요합니다.');
      return;
    }
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
          user_id: user.id, // Store owner ID
        })
        .select()
        .maybeSingle();

      if (shopError) throw shopError;
      if (!shopData) throw new Error('Shop creation failed');

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
      navigate('/shopping');
    } catch (err: any) {
      console.error('쇼핑몰 등록 실패:', err);
      setError(err.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shopreg-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div className="shopreg-header" style={{ backgroundColor: 'var(--header-bg-color)' }}>
        <SimpleHeader title="새 쇼핑몰 등록" />
      </div>

      <form onSubmit={handleSubmit} className="shopreg-form">
        {/* Shop Information */}
        <div className="shopreg-section">
          <h3 className="shopreg-section-title">쇼핑몰 정보</h3>
          <input type="text" placeholder="쇼핑몰 이름 *" value={shopName} onChange={(e) => setShopName(e.target.value)} className="shopreg-input" />
          <input type="url" placeholder="쇼핑몰 웹사이트 URL *" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} className="shopreg-input" />
          <textarea placeholder="간단한 쇼핑몰 설명" value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} className="shopreg-textarea" rows={2}></textarea>
          <div>
            <label className="shopreg-file-label">쇼핑몰 로고 (선택)</label>
            <button
              type="button"
              onClick={handleOpenLogoCropModal}
              className="shopreg-image-edit-btn"
            >
              <i className="ri-image-edit-line"></i>
              {shopLogoPreview ? '로고 이미지 편집' : '로고 이미지 등록'}
            </button>
            {shopLogoPreview && (
              <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem' }}>
                <img src={shopLogoPreview} alt="로고 미리보기" className="shopreg-logo-preview" />
                <button
                  type="button"
                  onClick={handleDeleteLogo}
                  className="shopreg-image-delete-btn"
                  title="이미지 삭제"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Featured Item Information */}
        <div className="shopreg-section">
          <h3 className="shopreg-section-title">상품 정보 (선택사항)</h3>
          <input type="text" placeholder="상품 이름" value={itemName} onChange={(e) => setItemName(e.target.value)} className="shopreg-input" />
          <input type="url" placeholder="상품 직접 링크" value={itemLink} onChange={(e) => setItemLink(e.target.value)} className="shopreg-input" />
          <input type="number" placeholder="상품 가격 (숫자만)" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="shopreg-input" />
          <div>
            <label className="shopreg-file-label">상품 이미지</label>
            <button
              type="button"
              onClick={handleOpenItemCropModal}
              className="shopreg-image-edit-btn"
            >
              <i className="ri-image-edit-line"></i>
              {itemImagePreview ? '상품 이미지 편집' : '상품 이미지 등록'}
            </button>
            {itemImagePreview && (
              <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem', width: '100%' }}>
                <img src={itemImagePreview} alt="상품 이미지 미리보기" className="shopreg-item-preview" />
                <button
                  type="button"
                  onClick={handleDeleteItem}
                  className="shopreg-image-delete-btn"
                  title="이미지 삭제"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <p className="shopreg-error">{error}</p>}

        <button type="submit" disabled={loading} className="shopreg-submit-btn">
          {loading ? '등록 중...' : '등록 완료'}
        </button>
      </form>

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
    </div>
  );
}