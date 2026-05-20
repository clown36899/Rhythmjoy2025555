import { useState } from 'react';
import type { Shop } from '../page';
import ShopDetailModal from './ShopDetailModal';
import './shopcard.css';

interface ShopCardProps {
  shop: Shop;
  onUpdate: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (shopId: number, e?: React.MouseEvent) => void;
}

export default function ShopCard({ shop, onUpdate, isFavorite = false, onToggleFavorite }: ShopCardProps) {
  const [showModal, setShowModal] = useState(false);
  const featuredItemCount = (shop.featured_items || []).filter(item => item.item_name).length;
  const shopHost = (() => {
    try {
      return new URL(shop.website_url).hostname.replace(/^www\./, '');
    } catch {
      return '외부 링크';
    }
  })();

  const openModal = () => setShowModal(true);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openModal();
    }
  };

  return (
    <>
      <div
        className="shopcard-banner"
        onClick={openModal}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        data-analytics-id={shop.id}
        data-analytics-type="shop"
        data-analytics-title={shop.name}
        data-analytics-section="shopping_list"
      >
        {/* Favorite Button */}
        {onToggleFavorite && (
          <button
            className="shopcard-favorite-btn"
            onClick={(e) => onToggleFavorite(shop.id, e)}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <i className={isFavorite ? "ri-star-fill" : "ri-star-line"}></i>
          </button>
        )}

        {/* Left: Image Section */}
        <div className="shopcard-image-section">
          {shop.logo_url ? (
            <img
              src={shop.logo_url}
              alt={`${shop.name} 로고`}
              className="shopcard-banner-image"
              loading="lazy"
            />
          ) : (
            <div className="shopcard-banner-placeholder">
              <i className="ri-store-2-fill"></i>
            </div>
          )}
        </div>

        {/* Right: Content Section with Gradient */}
        <div className="shopcard-content-section">
          {/* Content */}
          <div className="shopcard-banner-content">
            <div className="shopcard-title-row">
              <h3 className="shopcard-banner-title">{shop.name}</h3>
              <span className="shopcard-host">{shopHost}</span>
            </div>
            {shop.description && (
              <p className="shopcard-banner-desc">{shop.description}</p>
            )}
            <div className="shopcard-footer">
              <span className="shopcard-product-count">
                <i className="ri-price-tag-3-line" aria-hidden="true"></i>
                {featuredItemCount > 0 ? `상품 ${featuredItemCount}` : '상세'}
              </span>
              <a
                className="shopcard-visit-link"
                href={shop.website_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                방문
                <i className="ri-external-link-line" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <ShopDetailModal
        shop={shop}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpdate={onUpdate}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    </>
  );
}
