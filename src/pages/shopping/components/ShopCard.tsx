import type { Shop } from '../page';
import './shopcard.css';

interface ShopCardProps {
  shop: Shop;
}

export default function ShopCard({ shop }: ShopCardProps) {
  const featuredItem = shop.featured_items?.[0];

  return (
    <div className="shopcard-container">
      {/* 대표 상품 이미지 */}
      {featuredItem && (
        <a href={featuredItem.item_link} target="_blank" rel="noopener noreferrer" className="shopcard-image-link">
          <div className="shopcard-image-wrapper">
            <img 
              src={featuredItem.item_image_url} 
              alt={featuredItem.item_name}
              className="shopcard-image"
            />
            <div className="shopcard-image-gradient"></div>
            <div className="shopcard-image-info">
              <h4 className="shopcard-item-name">{featuredItem.item_name}</h4>
              {featuredItem.item_price && (
                <p className="shopcard-item-price">
                  {featuredItem.item_price.toLocaleString()}원
                </p>
              )}
            </div>
          </div>
        </a>
      )}

      {/* 쇼핑몰 정보 */}
      <div className="shopcard-content">
        <div className="shopcard-info-wrapper">
          <div className="shopcard-shop-info">
            {shop.logo_url && (
              <img src={shop.logo_url} alt={`${shop.name} 로고`} className="shopcard-logo" />
            )}
            <div>
              <h3 className="shopcard-shop-name">{shop.name}</h3>
              {shop.description && (<p className="shopcard-shop-description">{shop.description}</p>)}
            </div>
          </div>
          <a href={shop.website_url} target="_blank" rel="noopener noreferrer" className="shopcard-visit-btn">
            방문하기
          </a>
        </div>
      </div>
    </div>
  );
}