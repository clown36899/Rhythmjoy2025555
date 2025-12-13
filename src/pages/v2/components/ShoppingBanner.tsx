import { useState, useEffect, memo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Shop } from '../../shopping/page';
import ShopDetailModal from '../../shopping/components/ShopDetailModal';
import './ShoppingBanner.css';

function ShoppingBanner() {
    const [shops, setShops] = useState<Shop[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Fetch shops from Supabase
    const fetchShops = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('shops')
            .select('*, featured_items (*)')
            .order('created_at', { ascending: false });

        if (data && !error) {
            setShops(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchShops();
    }, []);

    // Auto-slide timer
    useEffect(() => {
        if (shops.length === 0 || isHovered) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % shops.length);
        }, 4000); // 4 seconds

        return () => clearInterval(timer);
    }, [shops.length, isHovered]);

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + shops.length) % shops.length);
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % shops.length);
    };

    const handleShopClick = (shop: Shop) => {
        setSelectedShop(shop);
        setShowModal(true);
    };

    const handleUpdate = () => {
        fetchShops();
    };

    // Show skeleton while loading or if no shops available
    if (loading || shops.length === 0) {
        return (
            <div className="shopping-banner shopping-banner-skeleton">
                <div className="shopping-banner-content">
                    <div className="shopping-banner-logo">
                        <div className="shopping-banner-logo-placeholder">
                            <i className="ri-store-2-fill"></i>
                        </div>
                    </div>
                    <div className="shopping-banner-info">
                        <div className="shopping-banner-skeleton-line shopping-banner-skeleton-title"></div>
                        <div className="shopping-banner-skeleton-line shopping-banner-skeleton-desc"></div>
                    </div>
                </div>
            </div>
        );
    }

    const currentShop = shops[currentIndex];

    return (
        <>
            <div
                className="shopping-banner"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => handleShopClick(currentShop)}
            >
                {/* Navigation Arrows */}
                {shops.length > 1 && (
                    <>
                        <button
                            className="shopping-banner-nav shopping-banner-nav-prev"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePrev();
                            }}
                        >
                            <i className="ri-arrow-left-s-line"></i>
                        </button>
                        <button
                            className="shopping-banner-nav shopping-banner-nav-next"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNext();
                            }}
                        >
                            <i className="ri-arrow-right-s-line"></i>
                        </button>
                    </>
                )}

                {/* Banner Content */}
                <div className="shopping-banner-content">
                    {/* Logo */}
                    <div className="shopping-banner-logo">
                        {currentShop.logo_url ? (
                            <img src={currentShop.logo_url} alt={currentShop.name} />
                        ) : (
                            <div className="shopping-banner-logo-placeholder">
                                <i className="ri-store-2-fill"></i>
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="shopping-banner-info">
                        <h3 className="shopping-banner-title">{currentShop.name}</h3>
                        {currentShop.description && (
                            <p className="shopping-banner-desc">{currentShop.description}</p>
                        )}
                        <div className="shopping-banner-cta">
                            <span>자세히 보기</span>
                            <i className="ri-arrow-right-line"></i>
                        </div>
                    </div>
                </div>

                {/* Indicators */}
                {shops.length > 1 && (
                    <div className="shopping-banner-indicators">
                        {shops.map((_, index) => (
                            <button
                                key={index}
                                className={`shopping-banner-dot ${index === currentIndex ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentIndex(index);
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedShop && (
                <ShopDetailModal
                    shop={selectedShop}
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedShop(null);
                    }}
                    onUpdate={handleUpdate}
                />
            )}
        </>
    );
}

// React.memo로 불필요한 리렌더링 방지
export default memo(ShoppingBanner);
