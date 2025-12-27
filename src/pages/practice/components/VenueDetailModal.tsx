import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabase";
import { useModalHistory } from "../../../hooks/useModalHistory";
import { useAuth } from "../../../contexts/AuthContext";
import "./VenueDetailModal.css";

interface Venue {
    id: string;
    name: string;
    address: string;
    phone?: string;
    description: string;
    images: (string | any)[];
    website_url?: string;
    map_url?: string;
    category: string;
    created_at?: string;
    user_id?: string;
    registrant_nickname?: string;
}

interface VenueDetailModalProps {
    venueId: string;
    onClose: () => void;
    onSelect?: (venue: Venue) => void; // For event registration
    onEdit?: () => void;
}

export default function VenueDetailModal({ venueId, onClose, onSelect, onEdit }: VenueDetailModalProps) {
    const { isAdmin } = useAuth();
    // Enable mobile back gesture to close modal
    useModalHistory(true, onClose);

    const [venue, setVenue] = useState<Venue | null>(null);
    const [authorNickname, setAuthorNickname] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (venueId) {
            fetchVenue();
        }
    }, [venueId]);

    const fetchVenue = async () => {
        try {
            const tableName = "venues";
            const { data, error } = await supabase
                .from(tableName)
                .select("*")
                .eq("id", venueId)
                .single();

            if (error) throw error;

            const venueData: any = data || {};

            // Parse images if it's a JSON string
            if (venueData.images && typeof venueData.images === 'string') {
                venueData.images = JSON.parse(venueData.images);
            }

            // [수정] venues와 board_users 간 외래키 관계가 없어 조인 대신 별도 쿼리 실행
            if (isAdmin && venueData.user_id) {
                const { data: userData } = await supabase
                    .from('board_users')
                    .select('nickname')
                    .eq('user_id', venueData.user_id)
                    .maybeSingle();

                if (userData?.nickname) {
                    setAuthorNickname(userData.nickname);
                }
            }

            setVenue(venueData);
        } catch (error) {
            console.error("Error fetching venue:", error);
            setVenue(null);
        } finally {
            setLoading(false);
        }
    };

    const copyAddress = () => {
        if (venue) {
            navigator.clipboard.writeText(venue.address);
            alert("주소가 복사되었습니다!");
        }
    };

    const openMap = () => {
        if (venue?.map_url) {
            window.open(venue.map_url, "_blank");
        }
    };

    const handleSelect = () => {
        if (venue && onSelect) {
            onSelect(venue);
            onClose();
        }
    };

    if (loading) {
        return createPortal(
            <div className="room-modal-overlay" onClick={onClose}>
                <div className="room-modal-container" onClick={(e) => e.stopPropagation()}>
                    <div className="room-detail-page-loading">
                        <i className="ri-loader-4-line ri-spin"></i>
                        <p>로딩 중...</p>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    if (!venue) {
        return createPortal(
            <div className="room-modal-overlay" onClick={onClose}>
                <div className="room-modal-container" onClick={(e) => e.stopPropagation()}>
                    <div className="room-detail-page-loading">
                        <i className="ri-error-warning-line" style={{ fontSize: '3rem', color: '#ef4444' }}></i>
                        <p>장소 정보를 불러올 수 없습니다.</p>
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>ID: {venueId}</p>
                        <button onClick={onClose} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#333', border: 'none', borderRadius: '0.5rem', color: 'white', cursor: 'pointer' }}>
                            닫기
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="room-modal-overlay" onClick={onClose}>
            <div className="room-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* New Header Section */}
                <div className="room-modal-header-bar">
                    <button onClick={onClose} className="room-modal-back-btn">
                        <i className="ri-arrow-left-line"></i>
                    </button>
                    <h2 className="room-modal-header-title">{venue.name}</h2>
                    <div className="room-modal-header-actions">
                        {onEdit && (
                            <button onClick={onEdit} className="room-modal-edit-btn">
                                <i className="ri-edit-line"></i> 수정
                            </button>
                        )}
                    </div>
                </div>

                <div className="room-detail-page">
                    {/* 1. Info Section (Top) */}
                    <div className="venue-info-section">
                        {/* Title removed from here as it is now in header, or we can keep a larger one if needed, but user complained about overlap. Let's keep a spacer or just start with content. */}
                        {/* If we strictly follow "Header with Back and Edit", putting title there is standard. */}

                        {/* Compact Info Box */}

                        {/* Compact Info Box */}
                        <div className="venue-compact-info-box">
                            {/* Address Row */}
                            {venue.address && (
                                <div className="venue-compact-row">
                                    <i className="ri-map-pin-line"></i>
                                    <div className="venue-compact-content">
                                        <span>{venue.address}</span>
                                        <div className="venue-compact-actions">
                                            <button onClick={copyAddress} className="venue-xs-btn">
                                                <i className="ri-file-copy-line"></i> 복사
                                            </button>
                                            {venue.map_url && (
                                                <button onClick={openMap} className="venue-xs-btn">
                                                    <i className="ri-map-2-line"></i> 지도
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Phone Row */}
                            {venue.phone && (
                                <div className="venue-compact-row">
                                    <i className="ri-phone-line"></i>
                                    <span>{venue.phone}</span>
                                </div>
                            )}

                            {/* Website Row */}
                            {venue.website_url && (
                                <div className="venue-compact-row">
                                    <i className="ri-global-line"></i>
                                    <a
                                        href={venue.website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="venue-xs-btn"
                                        style={{ marginTop: '-2px' }}
                                    >
                                        웹사이트 방문 <i className="ri-external-link-line"></i>
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        {venue.description && venue.description.trim() && (
                            <div className="room-description-box">
                                <p className="room-description-text">{venue.description}</p>
                            </div>
                        )}

                        {/* Event Select Button */}
                        {onSelect && (
                            <button onClick={handleSelect} className="venue-select-btn">
                                이 장소로 선택하기
                            </button>
                        )}

                        {/* Admin Info Section */}
                        {isAdmin && venue.created_at && (
                            <div className="created-at-text">
                                <span>
                                    등록:{" "}
                                    {new Date(venue.created_at).toLocaleDateString("ko-KR", {
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                    {authorNickname && ` | 계정: ${authorNickname}`}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* 2. Gallery Section (Bottom, Vertical) */}
                    {venue.images && venue.images.length > 0 && (
                        <div className="venue-gallery-section">
                            <h3 className="venue-gallery-title">
                                <i className="ri-image-line"></i>
                                사진 ({venue.images.filter((img: any) => typeof img === 'string' || !img.isThumbnail).length})
                            </h3>
                            {venue.images
                                .filter((image: any) => typeof image === 'string' || !image.isThumbnail)
                                .map((image, index) => {
                                    const imageUrl = typeof image === 'string' ? image : (image.url || image.medium || image.full || image.thumbnail);
                                    return (
                                        <img
                                            key={index}
                                            src={imageUrl}
                                            alt={`${venue.name} ${index + 1}`}
                                            className="venue-vertical-image"
                                            loading="lazy"
                                        />
                                    );
                                })}
                        </div>
                    )}

                    {/* Debug ID */}
                    <div style={{ fontSize: '0.7rem', color: '#333', textAlign: 'center', marginTop: '2rem' }}>
                        ID: {venue.id}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
