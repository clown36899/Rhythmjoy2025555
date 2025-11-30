import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import SimpleHeader from '../../../components/SimpleHeader';
import './shopreg.css';

export default function ShoppingRegisterPage() {
  const navigate = useNavigate();
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

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'logo' | 'item'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'logo') {
        setShopLogoFile(file);
        setShopLogoPreview(reader.result as string);
      } else {
        setItemImageFile(file);
        setItemImagePreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !shopUrl || !itemName || !itemLink || !itemImageFile) {
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

      const itemImageUrl = await uploadImage(itemImageFile, 'featured-items');

      // 1. Insert into shops table
      const { data: shopData, error: shopError } = await supabase
        .from('shops')
        .insert({
          name: shopName,
          description: shopDescription,
          website_url: shopUrl,
          logo_url: logoUrl,
        })
        .select()
        .single();

      if (shopError) throw shopError;

      // 2. Insert into featured_items table
      const { error: itemError } = await supabase
        .from('featured_items')
        .insert({
          shop_id: shopData.id,
          item_name: itemName,
          item_price: itemPrice ? Number(itemPrice) : null,
          item_image_url: itemImageUrl,
          item_link: itemLink,
        });

      if (itemError) throw itemError;

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

      <form onSubmit={handleSubmit} className="shopreg-form space-y-6">
        {/* Shop Information */}
        <div className="shopreg-section space-y-4">
          <h3 className="shopreg-section-title">쇼핑몰 정보</h3>
          <input type="text" placeholder="쇼핑몰 이름 *" value={shopName} onChange={(e) => setShopName(e.target.value)} required className="shopreg-input" />
          <input type="url" placeholder="쇼핑몰 웹사이트 URL *" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} required className="shopreg-input" />
          <textarea placeholder="간단한 쇼핑몰 설명" value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} className="shopreg-textarea" rows={2}></textarea>
          <div>
            <label className="shopreg-file-label">쇼핑몰 로고 (선택)</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'logo')} className="shopreg-file-input" />
            {shopLogoPreview && <img src={shopLogoPreview} alt="로고 미리보기" className="shopreg-logo-preview" />}
          </div>
        </div>

        {/* Featured Item Information */}
        <div className="shopreg-section space-y-4">
          <h3 className="shopreg-section-title">대표 상품 정보</h3>
          <input type="text" placeholder="상품 이름 *" value={itemName} onChange={(e) => setItemName(e.target.value)} required className="shopreg-input" />
          <input type="url" placeholder="상품 직접 링크 *" value={itemLink} onChange={(e) => setItemLink(e.target.value)} required className="shopreg-input" />
          <input type="number" placeholder="상품 가격 (숫자만)" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="shopreg-input" />
          <div>
            <label className="shopreg-file-label">상품 이미지 *</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'item')} required className="shopreg-file-input" />
            {itemImagePreview && <img src={itemImagePreview} alt="상품 이미지 미리보기" className="shopreg-item-preview" />}
          </div>
        </div>

        {error && <p className="shopreg-error">{error}</p>}

        <button type="submit" disabled={loading} className="shopreg-submit-btn">
          {loading ? '등록 중...' : '등록 완료'}
        </button>
      </form>
    </div>
  );
}