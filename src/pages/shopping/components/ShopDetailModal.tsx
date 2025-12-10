import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { Shop } from '../page';
import ShopEditModal from './ShopEditModal';
import './shopdetailmodal.css';

interface ShopDetailModalProps {
    shop: Shop;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export default function ShopDetailModal({ shop, isOpen, onClose, onUpdate }: ShopDetailModalProps) {
    const [showEditModal, setShowEditModal] = useState(false);

    if (!isOpen) return null;

    const featuredItems = shop.featured_items || [];
    const hasProducts = featuredItems.length > 0 && featuredItems.some(item => item.item_name);

    const handleEdit = () => {
        setShowEditModal(true);
    };

    const handleEditSuccess = () => {
        setShowEditModal(false);
        onUpdate();
        onClose();
    };

    return createPortal(
        <>
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

                    {/* Featured Products Section */}
                    {hasProducts && (
                        <div className="shop-modal-product-section">
                            <div className={`shop-modal-products-grid ${featuredItems.length === 1 ? 'single' : 'multi'}`}>
                                {featuredItems.map((item, index) => {
                                    if (!item.item_name) return null;

                                    return (
                                        <a
                                            key={item.id || index}
                                            href={item.item_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="shop-modal-product-card"
                                        >
                                            {item.item_image_url && (
                                                <img
                                                    src={item.item_image_url}
                                                    alt={item.item_name}
                                                    className="shop-modal-product-image"
                                                />
                                            )}
                                            <div className="shop-modal-product-info">
                                                <h4 className="shop-modal-product-name">{item.item_name}</h4>
                                                {item.item_price && (
                                                    <p className="shop-modal-product-price">
                                                        {item.item_price.toLocaleString()}원
                                                    </p>
                                                )}
                                                <span className="shop-modal-product-link-text">
                                                    상품 보러가기 <i className="ri-arrow-right-line"></i>
                                                </span>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            <ShopEditModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                onSuccess={handleEditSuccess}
                shopId={shop.id}
            />
        </>,
        document.body
    );
}
