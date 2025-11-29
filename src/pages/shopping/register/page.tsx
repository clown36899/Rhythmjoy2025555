import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import SimpleHeader from '../../../components/SimpleHeader';

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
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]" style={{ backgroundColor: 'var(--header-bg-color)' }}>
        <SimpleHeader title="새 쇼핑몰 등록" />
      </div>

      <form onSubmit={handleSubmit} className="pt-20 px-4 space-y-6">
        {/* Shop Information */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
          <h3 className="text-lg font-bold text-white">쇼핑몰 정보</h3>
          <input type="text" placeholder="쇼핑몰 이름 *" value={shopName} onChange={(e) => setShopName(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="url" placeholder="쇼핑몰 웹사이트 URL *" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea placeholder="간단한 쇼핑몰 설명" value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2}></textarea>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">쇼핑몰 로고 (선택)</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'logo')} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            {shopLogoPreview && <img src={shopLogoPreview} alt="로고 미리보기" className="mt-2 w-24 h-24 object-contain rounded-full bg-white p-1" />}
          </div>
        </div>

        {/* Featured Item Information */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
          <h3 className="text-lg font-bold text-white">대표 상품 정보</h3>
          <input type="text" placeholder="상품 이름 *" value={itemName} onChange={(e) => setItemName(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="url" placeholder="상품 직접 링크 *" value={itemLink} onChange={(e) => setItemLink(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="number" placeholder="상품 가격 (숫자만)" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">상품 이미지 *</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'item')} required className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            {itemImagePreview && <img src={itemImagePreview} alt="상품 이미지 미리보기" className="mt-2 w-full aspect-video object-cover rounded-lg" />}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? '등록 중...' : '등록 완료'}
        </button>
      </form>
    </div>
  );
}