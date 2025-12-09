import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Shop } from '../page';
import './shopdetailmodal.css';

interface ShopDetailModalProps {
    shop: Shop;
    isOpen: boolean;
    onClose: () => void;
}

export default function ShopDetailModal({ shop, isOpen, onClose }: ShopDetailModalProps) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const featuredItem = shop.featured_items?.[0];

    const handleEdit = () => {
        navigate(`/shopping/edit/${shop.id}`);
    };

    return createPortal(
        <div className="shop-modal-overlay" onClick={onClose}>
            <div className="shop-modal-content" onClick={(e) => e.stopPropagation()}>
                {/* Edit Button */}
                <button onClick={handleEdit} className="shop-modal-edit" title="수정하기">
                    <i className="ri-pencil-line"></i>
                </button>

                {/* Close Button */}
                <button onClick={onClose} className="shop-modal-close">
                    <i className="ri-close-line"></i>
                </button>

                {/* Shop Header */}
                <div className="shop-modal-header">
                    {shop.logo_url && (
                        <img src={shop.logo_url} alt={`${shop.name} 로고`} className="shop-modal-logo" />
                    )}
                    <div className="shop-modal-header-text">
                        <h2 className="shop-modal-title">{shop.name}</h2>
                        {shop.description && (
                            <p className="shop-modal-description">{shop.description}</p>
                        )}
                    </div>
                </div>

                {/* Website Link */}
                <a
                    href={shop.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shop-modal-website-btn"
                >
                    <i className="ri-external-link-line"></i>
                    쇼핑몰 방문하기
                </a>

                {/* Featured Product Section */}
                {featuredItem && featuredItem.item_name ? (
                    <div className="shop-modal-product-section">
                        <h3 className="shop-modal-section-title">대표 상품</h3>
                        <div className="shop-modal-product">
                            <a
                                href={featuredItem.item_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shop-modal-product-link"
                            >
                                {featuredItem.item_image_url && (
                                    <img
                                        src={featuredItem.item_image_url}
                                        alt={featuredItem.item_name}
                                        className="shop-modal-product-image"
                                    />
                                )}
                                <div className="shop-modal-product-info">
                                    <h4 className="shop-modal-product-name">{featuredItem.item_name}</h4>
                                    {featuredItem.item_price && (
                                        <p className="shop-modal-product-price">
                                            {featuredItem.item_price.toLocaleString()}원
                                        </p>
                                    )}
                                    <span className="shop-modal-product-link-text">
                                        상품 보러가기 <i className="ri-arrow-right-line"></i>
                                    </span>
                                </div>
                            </a>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>,
        document.body
    );
}
