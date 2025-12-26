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

  return (
    <>
      <div className="shopcard-banner" onClick={() => setShowModal(true)}>
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
            <h3 className="shopcard-banner-title">{shop.name}</h3>
            {shop.description && (
              <p className="shopcard-banner-desc">{shop.description}</p>
            )}
            <button className="shopcard-banner-btn">
              {/* <span>자세히 보기</span> */}
              <i className="ri-arrow-right-line"></i>
            </button>
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