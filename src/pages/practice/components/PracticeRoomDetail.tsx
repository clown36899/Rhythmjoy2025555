import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import "../../../components/PracticeRoomModal.css";

interface PracticeRoom {
    id: number;
    name: string;
    address: string;
    address_link: string;
    additional_link: string;
    images: string[];
    description: string;
    created_at?: string;
    mapUrl?: string;
    additional_link_title?: string;
    location?: string;
    hourly_rate?: number;
    contact_info?: string;
    capacity?: number;
    password?: string;
}

interface PracticeRoomDetailProps {
    roomId: string;
    onClose: () => void;
}

export default function PracticeRoomDetail({ roomId, onClose }: PracticeRoomDetailProps) {
    const [room, setRoom] = useState<PracticeRoom | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    useEffect(() => {
        if (roomId) {
            fetchRoom();
        }
    }, [roomId]);

    const fetchRoom = async () => {
        try {
            const { data, error } = await supabase
                .from("practice_rooms")
                .select("*")
                .eq("id", roomId)
                .single();

            if (error) throw error;

            // Parse images if it's a JSON string
            if (data && typeof data.images === 'string') {
                data.images = JSON.parse(data.images);
            }

            setRoom(data);
        } catch (error) {
            console.error("Error fetching room:", error);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const nextImage = () => {
        if (room) {
            setSelectedImageIndex((prev) =>
                prev === room.images.length - 1 ? 0 : prev + 1
            );
        }
    };

    const prevImage = () => {
        if (room) {
            setSelectedImageIndex((prev) =>
                prev === 0 ? room.images.length - 1 : prev - 1
            );
        }
    };

    const goToImage = (index: number) => {
        setSelectedImageIndex(index);
    };

    const copyAddress = () => {
        if (room) {
            navigator.clipboard.writeText(room.address);
            alert("주소가 복사되었습니다!");
        }
    };

    const openMap = () => {
        if (room?.address_link) {
            window.open(room.address_link, "_blank");
        }
    };

    if (loading) {
        return (
            <div className="room-detail-page-loading">
                <i className="ri-loader-4-line animate-spin"></i>
                <p>로딩 중...</p>
            </div>
        );
    }

    if (!room) {
        return null;
    }

    return (
        <div className="room-detail-page">
            {/* Gallery Section */}
            <div className="room-gallery-container">
                {/* Main image */}
                <div className="room-gallery-main">
                    <img
                        src={room.images[selectedImageIndex]}
                        alt={`${room.name} ${selectedImageIndex + 1}`}
                        className="room-gallery-image"
                        onClick={nextImage}
                    />
                    {room.images.length > 1 && (
                        <>
                            <button
                                onClick={prevImage}
                                className="room-gallery-nav-btn room-gallery-nav-btn-left"
                            >
                                <i className="ri-arrow-left-line room-gallery-nav-icon"></i>
                            </button>
                            <button
                                onClick={nextImage}
                                className="room-gallery-nav-btn room-gallery-nav-btn-right"
                            >
                                <i className="ri-arrow-right-line room-gallery-nav-icon"></i>
                            </button>

                            {/* Image counter */}
                            <div className="room-gallery-counter">
                                {selectedImageIndex + 1} / {room.images.length}
                            </div>

                            {/* Image indicators */}
                            <div className="room-gallery-indicators">
                                {room.images.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => goToImage(idx)}
                                        className={`room-gallery-indicator ${idx === selectedImageIndex
                                            ? "room-gallery-indicator-active"
                                            : ""
                                            }`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Thumbnail list */}
                <div className="room-thumbnails-container">
                    {room.images.length > 3 && (
                        <>
                            <button className="room-thumbnails-arrow room-thumbnails-arrow-left">
                                <i className="ri-arrow-left-s-line"></i>
                            </button>
                            <button className="room-thumbnails-arrow room-thumbnails-arrow-right">
                                <i className="ri-arrow-right-s-line"></i>
                            </button>
                        </>
                    )}

                    <div className="room-thumbnails-list">
                        {room.images.map((image, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedImageIndex(index)}
                                className={`room-thumbnail-btn ${selectedImageIndex === index
                                    ? "room-thumbnail-btn-active"
                                    : "room-thumbnail-btn-inactive"
                                    }`}
                            >
                                <img
                                    src={image}
                                    alt={`썸네일 ${index + 1}`}
                                    className="room-thumbnail-image"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className="room-info-container">
                {/* Address */}
                <div className="room-address-section">
                    <div className="room-address-box">
                        <div className="room-address-content">
                            <span className="room-address-text">{room.address}</span>
                            <div className="room-address-btns">
                                <button onClick={copyAddress} className="room-copy-btn">
                                    복사
                                </button>
                                <button onClick={openMap} className="room-map-btn">
                                    지도 바로보기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Description - Only show if there's content */}
                {room.description && room.description.trim() && (
                    <div className="room-description-section">
                        <h3 className="room-description-header">
                            <i className="ri-information-line room-description-icon"></i>
                            상세 정보
                        </h3>
                        <div className="room-description-box">
                            <p className="room-description-text">{room.description}</p>
                        </div>
                    </div>
                )}

                {/* Additional link - Only show if exists */}
                {room.additional_link && (
                    <a
                        href={room.additional_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="room-additional-link"
                    >
                        <i className="ri-external-link-line room-additional-link-icon"></i>
                        {room.additional_link_title || "추가 정보 보기"}
                    </a>
                )}
            </div>
        </div>
    );
}
