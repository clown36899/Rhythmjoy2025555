import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logEvent } from '../../lib/analytics';
import { useModal } from '../../hooks/useModal';
import { useSetPageAction } from '../../contexts/PageActionContext';
import ShopCard from './components/ShopCard';
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
  user_id?: string;
  featured_items: FeaturedItem[]; // Join을 통해 가져올 대표 상품 정보
}

export default function ShoppingPage() {
  const { user, signInWithKakao } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [randomizedShops, setRandomizedShops] = useState<Shop[]>([]); // 랜덤 정렬된 목록 저장
  const [loading, setLoading] = useState(true);
  const shopRegisterModal = useModal('shopRegister');
  const calendarSearchModal = useModal('calendarSearch');
  const [favoriteShopIds, setFavoriteShopIds] = useState<Set<number>>(new Set());

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

  // Fetch favorites when user logs in
  useEffect(() => {
    if (user) {
      fetchFavorites();
    } else {
      setFavoriteShopIds(new Set());
    }
  }, [user]);

  const fetchFavorites = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shop_favorites')
        .select('shop_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching shop favorites:', error);
      } else {
        setFavoriteShopIds(new Set(data.map(f => f.shop_id)));
      }
    } catch (err) {
      console.error('Unexpected error fetching favorites:', err);
    }
  };

  const handleShuffleShops = () => {
    const shuffled = [...shops].sort(() => Math.random() - 0.5);
    setRandomizedShops(shuffled);
    sessionStorage.setItem('shopsRandomOrder', JSON.stringify(shuffled.map(s => s.id)));
  };

  const featuredItemCount = shops.reduce((count, shop) => {
    return count + (shop.featured_items || []).filter(item => item.item_name).length;
  }, 0);

  const handleToggleFavorite = async (shopId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (!user) {
      if (confirm('로그인이 필요한 기능입니다. 카카오로 로그인하시겠습니까?')) {
        try {
          await signInWithKakao();
        } catch (err) {
          console.error(err);
        }
      }
      return;
    }

    const isFav = favoriteShopIds.has(shopId);

    // Analytics: 찜 추적 (관리자용)
    const targetShop = shops.find(s => s.id === shopId);
    if (targetShop) {
      const action = isFav ? 'Remove' : 'Add';
      const userLabel = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';
      logEvent('Favorite', `Shop ${action}`, `${targetShop.name} (by ${userLabel})`);
    }

    // Optimistic Update
    setFavoriteShopIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(shopId);
      else next.add(shopId);
      return next;
    });

    if (isFav) {
      // Remove
      const { error } = await supabase
        .from('shop_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('shop_id', shopId);

      if (error) {
        console.error('Error removing favorite:', error);
        // Rollback
        setFavoriteShopIds(prev => {
          const next = new Set(prev);
          next.add(shopId);
          return next;
        });
      }
    } else {
      // Add
      const { error } = await supabase
        .from('shop_favorites')
        .insert({ user_id: user.id, shop_id: shopId });

      if (error) {
        console.error('Error adding favorite:', error);
        // Rollback
        setFavoriteShopIds(prev => {
          const next = new Set(prev);
          next.delete(shopId);
          return next;
        });
      }
    }
  };

  // Event search from header
  useEffect(() => {
    const handleOpenEventSearch = () => calendarSearchModal.open({
      searchMode: 'all',
      onSelectEvent: () => { }
    });
    window.addEventListener('openEventSearch', handleOpenEventSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenEventSearch);
  }, []);

  // Register FAB Action
  useSetPageAction({
    icon: 'ri-add-line',
    label: '쇼핑몰 등록',
    requireAuth: true,
    onClick: () => {
      shopRegisterModal.open({
        onSuccess: fetchShops
      });
    }
  });

  return (
    <div className="shop-page-container" >
      <div className="shop-page-toolbar">
        <div className="shop-page-summary">
          <span className="shop-page-kicker">
            <i className="ri-shopping-bag-3-line" aria-hidden="true"></i>
            쇼핑
          </span>
          <strong>스윙 아이템 링크</strong>
          <em>
            {shops.length}곳
            {featuredItemCount > 0 && ` · 상품 ${featuredItemCount}개`}
            {user && favoriteShopIds.size > 0 && ` · 찜 ${favoriteShopIds.size}`}
          </em>
        </div>
        <button
          type="button"
          className="shop-page-shuffle-btn"
          onClick={handleShuffleShops}
          disabled={shops.length < 2}
        >
          <i className="ri-shuffle-line" aria-hidden="true"></i>
          랜덤
        </button>
      </div>

      <div className="shop-list-section">
        {loading ? (
          <div className="shop-loading-container">쇼핑몰을 불러오는 중...</div>
        ) : shops.length === 0 ? (
          <div className="shop-empty-container">등록된 쇼핑몰이 없습니다.</div>
        ) : (
          <div className="shop-grid">
            {randomizedShops.map(shop => (
              <ShopCard
                key={shop.id}
                shop={shop}
                onUpdate={fetchShops}
                isFavorite={favoriteShopIds.has(shop.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
