import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SimpleHeader from '../../components/SimpleHeader';
import ShopCard from './components/ShopCard';
import { useAuth } from '../../contexts/AuthContext';
import './shopping.css';

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
    <div className="shop-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 고정 헤더 */}
      <div
        className="shop-header global-header"

      >
        <SimpleHeader title="쇼핑" />
      </div>

      {/* 쇼핑몰 목록 */}

      <div className="shop-list-section">
        {loading ? (
          <div className="shop-loading-container">로딩 중...</div>
        ) : shops.length === 0 ? (
          <div className="shop-empty-container">등록된 쇼핑몰이 없습니다.</div>
        ) : (
          <div className="shop-grid">
            {shops.map(shop => (<ShopCard key={shop.id} shop={shop} />))}
          </div>
        )}
      </div>
    </div>
  );
}