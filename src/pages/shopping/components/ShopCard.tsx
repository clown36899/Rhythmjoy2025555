import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Shop } from '../page';
import ShopDetailModal from './ShopDetailModal';
import './shopcard.css';

interface ShopCardProps {
  shop: Shop;
}

export default function ShopCard({ shop }: ShopCardProps) {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="shopcard-container" onClick={() => setShowModal(true)}>
        {/* Edit Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/shopping/edit/${shop.id}`);
          }}
          className="shopcard-edit-btn"
          title="쇼핑몰 정보 수정"
        >
          <i className="ri-edit-line"></i>
        </button>

        {/* Shop Logo */}
        <div className="shopcard-logo-container">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={`${shop.name} 로고`} className="shopcard-logo-large" />
          ) : (
            <div className="shopcard-logo-placeholder">
              <i className="ri-store-2-line"></i>
            </div>
          )}
        </div>

        {/* Shop Info */}
        <div className="shopcard-info">
          <h3 className="shopcard-shop-name">{shop.name}</h3>
          {shop.description && (
            <p className="shopcard-shop-description">{shop.description}</p>
          )}
          <div className="shopcard-click-hint">
            <span>자세히 보기</span>
            <i className="ri-arrow-right-line"></i>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <ShopDetailModal
        shop={shop}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}