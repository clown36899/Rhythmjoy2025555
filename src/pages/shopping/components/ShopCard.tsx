import type { Shop } from '../page';

interface ShopCardProps {
  shop: Shop;
}

export default function ShopCard({ shop }: ShopCardProps) {
  const featuredItem = shop.featured_items?.[0];

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-lg transition-transform hover:scale-[1.02]">
      {/* 대표 상품 이미지 */}
      {featuredItem && (
        <a href={featuredItem.item_link} target="_blank" rel="noopener noreferrer" className="block">
          <div className="relative aspect-video bg-gray-700">
            <img 
              src={featuredItem.item_image_url} 
              alt={featuredItem.item_name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div className="absolute bottom-2 left-3">
              <h4 className="text-white font-bold text-lg drop-shadow-md">{featuredItem.item_name}</h4>
              {featuredItem.item_price && (
                <p className="text-yellow-400 font-semibold text-md drop-shadow-md">
                  {featuredItem.item_price.toLocaleString()}원
                </p>
              )}
            </div>
          </div>
        </a>
      )}

      {/* 쇼핑몰 정보 */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {shop.logo_url && (
              <img src={shop.logo_url} alt={`${shop.name} 로고`} className="w-10 h-10 rounded-full object-contain bg-white p-1" />
            )}
            <div>
              <h3 className="text-white font-semibold">{shop.name}</h3>
              {shop.description && (<p className="text-gray-400 text-sm">{shop.description}</p>)}
            </div>
          </div>
          <a href={shop.website_url} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
            방문하기
          </a>
        </div>
      </div>
    </div>
  );
}