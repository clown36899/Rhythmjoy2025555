import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import SimpleHeader from '../../components/SimpleHeader';
import ShopCard from './components/ShopCard';
import ShopRegisterModal from './components/ShopRegisterModal';
import CalendarSearchModal from '../v2/components/CalendarSearchModal';
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
  const [randomizedShops, setRandomizedShops] = useState<Shop[]>([]); // 랜덤 정렬된 목록 저장
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const fetchShops = async () => {
    setLoading(true);
    try {
      // 'shops' 테이블과 'featured_items' 테이블을 join하여 한번에 데이터를 가져옵니다.
      const { data, error } = await supabase
        .from('shops')
        .select(`*, featured_items (*)`);

      if (error) throw error;
      setShops(data || []);

      // sessionStorage에서 저장된 랜덤 순서 확인
      const savedRandomOrder = sessionStorage.getItem('shopsRandomOrder');
      if (savedRandomOrder) {
        try {
          const savedIds = JSON.parse(savedRandomOrder) as number[];
          const orderedShops = savedIds
            .map(id => (data || []).find(shop => shop.id === id))
            .filter(Boolean) as Shop[];
          const newShops = (data || []).filter(shop => !savedIds.includes(shop.id));
          setRandomizedShops([...orderedShops, ...newShops]);
        } catch {
          const shuffled = [...(data || [])].sort(() => Math.random() - 0.5);
          setRandomizedShops(shuffled);
          sessionStorage.setItem('shopsRandomOrder', JSON.stringify(shuffled.map(s => s.id)));
        }
      } else {
        const shuffled = [...(data || [])].sort(() => Math.random() - 0.5);
        setRandomizedShops(shuffled);
        sessionStorage.setItem('shopsRandomOrder', JSON.stringify(shuffled.map(s => s.id)));
      }
    } catch (error) {
      console.error('쇼핑몰 목록 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 페이지 로드 시 랜덤 순서 초기화
    sessionStorage.removeItem('shopsRandomOrder');
    fetchShops();
  }, []);

  // Event search from header
  useEffect(() => {
    const handleOpenEventSearch = () => setShowGlobalSearch(true);
    window.addEventListener('openEventSearch', handleOpenEventSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenEventSearch);
  }, []);

  // 커스텀 이벤트 리스너: 쇼핑몰 등록 모달 열기
  useEffect(() => {
    const handleOpenRegister = () => {
      setShowRegisterModal(true);
    };

    window.addEventListener('openShopRegistration', handleOpenRegister);

    return () => {
      window.removeEventListener('openShopRegistration', handleOpenRegister);
    };
  }, []);

  return (
    <div className="shop-page-container" >
      {/* 고정 헤더 */}


      {/* 쇼핑몰 목록 */}

      <div className="shop-list-section">
        {loading ? (
          <div className="shop-loading-container">로딩 중...</div>
        ) : shops.length === 0 ? (
          <div className="shop-empty-container">등록된 쇼핑몰이 없습니다.</div>
        ) : (
          <div className="shop-grid">
            {randomizedShops.map(shop => (<ShopCard key={shop.id} shop={shop} onUpdate={fetchShops} />))}
          </div>
        )}
      </div>

      {/* 쇼핑몰 등록 모달 */}
      <ShopRegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={fetchShops}
      />

      {/* Global Search Modal */}
      <CalendarSearchModal
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        onSelectEvent={(event) => {
          setSelectedEvent(event);
        }}
        searchMode="all"
      />
    </div>
  );
}