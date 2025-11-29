import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SimpleHeader from '../../components/SimpleHeader';
import ShopCard from './components/ShopCard';
import { useAuth } from '../../contexts/AuthContext';

// 데이터 타입 정의
export interface FeaturedItem {
  id: number;
  shop_id: number;
  item_name: string;
  item_image_url: string;
  item_price?: number;
  item_link: string;
}

export interface Shop {
  id: number;
  name: string;
  description?: string;
  logo_url?: string;
  website_url: string;
  featured_items: FeaturedItem[]; // Join을 통해 가져올 대표 상품 정보
}

export default function ShoppingPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchShops = async () => {
      setLoading(true);
      try {
        // 'shops' 테이블과 'featured_items' 테이블을 join하여 한번에 데이터를 가져옵니다.
        const { data, error } = await supabase
          .from('shops')
          .select(`*, featured_items (*)`);

        if (error) throw error;
        setShops(data || []);
      } catch (error) {
        console.error('쇼핑몰 목록 로딩 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShops();
  }, []);

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 고정 헤더 */}
      <div
        className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: 'var(--header-bg-color)' }}
      >
        <SimpleHeader title="쇼핑" />
      </div>

      {/* 쇼핑몰 등록 버튼 (누구나 가능) */}
      <div className="fixed top-16 left-0 right-0 z-20 px-4 py-2 max-w-[650px] mx-auto">
        <button
          onClick={() => navigate('/shopping/register')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-lg transition-all"
        >
          <i className="ri-add-line mr-1"></i>
          내 쇼핑몰 등록하기
        </button>
      </div>

      {/* 쇼핑몰 목록 */}
      <div className="pt-32 px-4">
        {loading ? (
          <div className="text-center py-20 text-gray-400">로딩 중...</div>
        ) : shops.length === 0 ? (
          <div className="text-center py-20 text-gray-400">등록된 쇼핑몰이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shops.map(shop => (<ShopCard key={shop.id} shop={shop} />))}
          </div>
        )}
      </div>
    </div>
  );
}