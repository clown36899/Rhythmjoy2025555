import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabase";
import { useModalHistory } from "../../../hooks/useModalHistory";
import { useAuth } from "../../../contexts/AuthContext";
import { sanitizeAddressForMap } from "../../../utils/mapUtils";
import LocalLoading from "../../../components/LocalLoading";
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
}

interface VenueDetailModalProps {
    venueId: string;
    onClose: () => void;
    onSelect?: (venue: Venue) => void;
    onEdit?: () => void;
}

export default function VenueDetailModal({ venueId, onClose, onSelect, onEdit }: VenueDetailModalProps) {
    const { isAdmin } = useAuth();
    useModalHistory(true, onClose);

    const [venue, setVenue] = useState<Venue | null>(null);
    const [authorNickname, setAuthorNickname] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    useEffect(() => {
        if (venueId) fetchVenue();
    }, [venueId]);

    const fetchVenue = async () => {
        try {
            const { data, error } = await supabase
                .from("venues")
                .select("*")
                .eq("id", venueId)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Venue not found");

            const venueData: any = data;
            if (venueData.images && typeof venueData.images === "string") {
                venueData.images = JSON.parse(venueData.images);
            }

            if (isAdmin && venueData.user_id) {
                const { data: userData } = await supabase
                    .from("board_users")
                    .select("nickname")
                    .eq("user_id", venueData.user_id)
                    .maybeSingle();
                if (userData?.nickname) setAuthorNickname(userData.nickname);
            }

            setVenue(venueData);
        } catch (error) {
            console.error("Error fetching venue:", error);
            setVenue(null);
        } finally {
            setLoading(false);
        }
    };

    // 모든 이미지 목록 구성 (썸네일 포함, URL만 추출)
    const getAllImages = (venue: Venue): string[] => {
        if (!venue.images || !Array.isArray(venue.images)) return [];
        return venue.images
            .map((img: any) => {
                if (typeof img === "string") return img;
                return img.url || img.medium || img.full || img.thumbnail || "";
            })
            .filter(Boolean);
    };

    // map_url 파싱
    const parseMapUrls = (mapUrl?: string) => {
        if (!mapUrl) return { kakao: "", naver: "", google: "" };
        if (mapUrl.startsWith("{")) {
            try { return JSON.parse(mapUrl); } catch { /* ignore */ }
        }
        if (mapUrl.includes("naver")) return { kakao: "", naver: mapUrl, google: "" };
        return { kakao: mapUrl, naver: "", google: "" };
    };

    const copyAddress = () => {
        if (venue?.address) {
            navigator.clipboard.writeText(venue.address);
            alert("주소가 복사되었습니다!");
        }
    };

    if (loading) {
        return createPortal(
            <div className="vdm-overlay" onClick={onClose}>
                <div className="vdm-container" onClick={(e) => e.stopPropagation()}>
                    <div className="room-detail-page-loading">
                        <LocalLoading message="로딩 중..." size="lg" />
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    if (!venue) {
        return createPortal(
            <div className="vdm-overlay" onClick={onClose}>
                <div className="vdm-container" onClick={(e) => e.stopPropagation()}>
                    <div className="room-detail-page-loading">
                        <i className="ri-error-warning-line" style={{ fontSize: "3rem", color: "#ef4444" }}></i>
                        <p>장소 정보를 불러올 수 없습니다.</p>
                        <button onClick={onClose} className="room-detail-error-close-btn">닫기</button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    const allImages = getAllImages(venue);
    const mapUrls = parseMapUrls(venue.map_url);

    return createPortal(
        <div className="vdm-overlay" onClick={onClose}>
            <div className="vdm-container" onClick={(e) => e.stopPropagation()}>

                {/* ── 상단 헤더바 ── */}
                <div className="vdm-header-bar">
                    <button className="vdm-back-btn" onClick={onClose}>
                        <i className="ri-arrow-left-line"></i>
                    </button>
                    <h2 className="vdm-header-title">{venue.name}</h2>
                    <div className="vdm-header-actions">
                        {onEdit && (
                            <button className="vdm-edit-btn" onClick={onEdit}>
                                <i className="ri-edit-line"></i> 수정
                            </button>
                        )}
                    </div>
                </div>

                {/* ── 스크롤 영역 ── */}
                <div className="vdm-scroll-body">

                    {/* ── 이미지 히어로 (썸네일 포함 전체) ── */}
                    <div className="vdm-hero-section">
                        {allImages.length > 0 ? (
                            <img
                                key={currentImageIndex}
                                src={allImages[currentImageIndex]}
                                alt={venue.name}
                                className="vdm-hero-image"
                                draggable={false}
                            />
                        ) : (
                            <div className="vdm-hero-placeholder">
                                <i className="ri-map-pin-line"></i>
                            </div>
                        )}
                        {allImages.length > 1 && (
                            <>
                                <button
                                    className="vdm-nav-btn vdm-nav-prev"
                                    onClick={() => setCurrentImageIndex((i) => (i - 1 + allImages.length) % allImages.length)}
                                >
                                    <i className="ri-arrow-left-s-line"></i>
                                </button>
                                <button
                                    className="vdm-nav-btn vdm-nav-next"
                                    onClick={() => setCurrentImageIndex((i) => (i + 1) % allImages.length)}
                                >
                                    <i className="ri-arrow-right-s-line"></i>
                                </button>
                                <div className="vdm-image-counter">{currentImageIndex + 1} / {allImages.length}</div>
                                <div className="vdm-dots">
                                    {allImages.map((_, idx) => (
                                        <button
                                            key={idx}
                                            className={`vdm-dot${idx === currentImageIndex ? " active" : ""}`}
                                            onClick={() => setCurrentImageIndex(idx)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── 장소 정보 ── */}
                    <div className="vdm-info-section">
                        {/* 카테고리 뱃지 + 이름 */}
                        <div className="vdm-name-row">
                            <span className="vdm-category-badge">{venue.category}</span>
                            <h3 className="vdm-place-name">{venue.name}</h3>
                        </div>

                        {/* 정보 박스 */}
                        <div className="vdm-info-box">
                            {venue.address && (
                                <div className="vdm-info-row">
                                    <i className="ri-map-pin-line"></i>
                                    <div className="vdm-info-content">
                                        <span>{venue.address}</span>
                                        <div className="vdm-map-btns">
                                            <button onClick={copyAddress} className="vdm-tag-btn">
                                                <i className="ri-file-copy-line"></i> 복사
                                            </button>
                                            {mapUrls.kakao && (
                                                <button onClick={() => window.open(mapUrls.kakao, "_blank")} className="vdm-tag-btn kakao">
                                                    <i className="ri-road-map-line"></i> 카카오
                                                </button>
                                            )}
                                            {mapUrls.naver && (
                                                <button onClick={() => window.open(mapUrls.naver, "_blank")} className="vdm-tag-btn naver">
                                                    <i className="ri-map-pin-2-fill"></i> 네이버
                                                </button>
                                            )}
                                            {(venue.address || venue.name) && (
                                                <button
                                                    onClick={() => {
                                                        const q = venue.address ? sanitizeAddressForMap(venue.address) : venue.name;
                                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
                                                    }}
                                                    className="vdm-tag-btn google"
                                                >
                                                    <i className="ri-google-fill"></i> Google
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {venue.phone && (
                                <div className="vdm-info-row">
                                    <i className="ri-phone-line"></i>
                                    <span>{venue.phone}</span>
                                </div>
                            )}

                            {venue.website_url && (
                                <div className="vdm-info-row">
                                    <i className="ri-global-line"></i>
                                    <a href={venue.website_url} target="_blank" rel="noopener noreferrer" className="vdm-link">
                                        웹사이트 방문 <i className="ri-external-link-line"></i>
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* 설명 */}
                        {venue.description && venue.description.trim() && (
                            <div className="vdm-desc-box">
                                <p className="vdm-desc-text">{venue.description}</p>
                            </div>
                        )}

                        {/* 갤러리 (썸네일 제외한 추가 이미지들 - 하단 세로 나열) */}
                        {allImages.length > 1 && (
                            <div className="vdm-gallery-section">
                                <h4 className="vdm-gallery-title">
                                    <i className="ri-image-line"></i> 사진 ({allImages.length})
                                </h4>
                                {allImages.map((url, idx) => (
                                    <img
                                        key={idx}
                                        src={url}
                                        alt={`${venue.name} ${idx + 1}`}
                                        className="vdm-gallery-image"
                                        onClick={() => setCurrentImageIndex(idx)}
                                        loading="lazy"
                                    />
                                ))}
                            </div>
                        )}

                        {/* 이벤트에서 장소 선택 버튼 */}
                        {onSelect && (
                            <button onClick={() => { onSelect(venue); onClose(); }} className="venue-select-btn">
                                이 장소로 선택하기
                            </button>
                        )}

                        {/* 어드민 정보 */}
                        {isAdmin && venue.created_at && (
                            <div className="room-detail-debug-id">
                                ID: {venue.id}
                                {" | "}
                                {new Date(venue.created_at).toLocaleDateString("ko-KR")}
                                {authorNickname && ` | ${authorNickname}`}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
