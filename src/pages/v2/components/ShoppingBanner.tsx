import { useState, useEffect, memo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Shop } from '../../shopping/page';
import ShopDetailModal from '../../shopping/components/ShopDetailModal';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import './ShoppingBanner.css';

function ShoppingBanner() {
    const [shops, setShops] = useState<Shop[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [showModal, setShowModal] = useState(false);

    const [imageBlobs, setImageBlobs] = useState<Record<number, string>>({});

    // Touch swipe state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isSwiping, setIsSwiping] = useState(false);

    // Minimum swipe distance (in px) to trigger navigation
    const minSwipeDistance = 50;

    // Helper to convert blob to data URL
    const blobToDataURL = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // Fetch shops from Supabase
    const fetchShops = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('shops')
            .select('*, featured_items (*)')
            .order('created_at', { ascending: false });

        if (data && !error) {
            setShops(data);

            // Prefetch images as Data URLs (safer than Blobs) to prevent network requests during rotation
            const blobs: Record<number, string> = {};
            await Promise.all(data.map(async (shop) => {
                if (shop.logo_url) {
                    try {
                        const response = await fetch(shop.logo_url);
                        const blob = await response.blob();
                        blobs[shop.id] = await blobToDataURL(blob);
                    } catch (e) {
                        console.error('Failed to prefetch image:', shop.logo_url);
                    }
                }
            }));
            setImageBlobs(blobs);
        }
        setLoading(false);
    };

    // Visibility check
    const { ref, isIntersecting } = useIntersectionObserver({ threshold: 0.1 });

    useEffect(() => {
        fetchShops();
        // No cleanup needed for Data URLs
    }, []);

    // Auto-slide timer (only when visible, not hovered, and not swiping)
    useEffect(() => {
        if (shops.length === 0 || isHovered || !isIntersecting || isSwiping) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % shops.length);
        }, 4000); // 4 seconds

        return () => clearInterval(timer);
    }, [shops.length, isHovered, isIntersecting, isSwiping]);

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

    // Touch event handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null); // Reset touch end
        setTouchStart(e.targetTouches[0].clientX);
        setIsSwiping(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) {
            setIsSwiping(false);
            return;
        }

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            handleNext();
        } else if (isRightSwipe) {
            handlePrev();
        }

        // Reset touch state
        setTouchStart(null);
        setTouchEnd(null);
        setIsSwiping(false);
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
                ref={ref}
                className="shopping-banner"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => handleShopClick(currentShop)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                            <img src={imageBlobs[currentShop.id] || currentShop.logo_url} alt={currentShop.name} />
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
