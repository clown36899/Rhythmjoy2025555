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
      <div className="shopcard-banner" onClick={() => setShowModal(true)}>
        {/* Left: Image Section */}
        <div className="shopcard-image-section">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={`${shop.name} 로고`} className="shopcard-banner-image" />
          ) : (
            <div className="shopcard-banner-placeholder">
              <i className="ri-store-2-fill"></i>
            </div>
          )}
        </div>

        {/* Right: Content Section with Gradient */}
        <div className="shopcard-content-section">
          {/* Edit Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/shopping/edit/${shop.id}`);
            }}
            className="shopcard-banner-edit"
            title="수정"
          >
            <i className="ri-edit-line"></i>
          </button>

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
      />
    </>
  );
}