import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useModalHistory } from "../../../hooks/useModalHistory";
import { resizeImage } from "../../../utils/imageResize";
import "./VenueRegistrationModal.css";

interface VenueRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVenueCreated?: () => void;
    onVenueDeleted?: () => void;
    editVenueId?: string | null; // If provided, edit mode
}

interface VenueFormData {
    category: "연습실" | "스윙바";
    name: string;
    address: string;
    phone: string;
    description: string;
    website_url: string;
    map_url: string;
    images: (string | any)[]; // Supports legacy strings and new objects
}

const MAX_GALLERY_IMAGES = 5;

export default function VenueRegistrationModal({
    isOpen,
    onClose,
    onVenueCreated,
    onVenueDeleted,
    editVenueId
}: VenueRegistrationModalProps) {
    const { user, signInWithKakao, isAdmin } = useAuth(); // Destructure required auth methods

    const handleLogin = () => signInWithKakao();

    // Login Overlay Component
    const LoginOverlay = () => (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            borderRadius: 'inherit'
        }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>로그인 필요</h2>
            <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                연습실 등록을 위해 로그인이 필요합니다.<br />
                간편하게 로그인하고 계속하세요!
            </p>
            <button
                onClick={handleLogin}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '1rem',
                    background: '#FEE500',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}
            >
                <i className="ri-kakao-talk-fill" style={{ fontSize: '1.5rem' }}></i>
                카카오로 로그인
            </button>
            <button
                onClick={onClose}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '0.75rem',
                    background: 'transparent',
                    color: '#9ca3af',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                }}
            >
                취소
            </button>
        </div>
    );

    // Stages: 0: Category, 1: Basic Info, 2: Images & Desc, 3: Preview/Confirm? or just 1 big form
    // User asked for "multi-step or multi-column". Let's do a clean multi-section form.

    const [formData, setFormData] = useState<VenueFormData>({
        category: "연습실",
        name: "",
        address: "",
        phone: "",
        description: "",
        website_url: "",
        map_url: "",
        images: []
    });

    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string>("");

    const [loading, setLoading] = useState(false);

    // Unified Image State
    type ImageItem =
        | { type: 'existing', url: string | any, preview: string }
        | { type: 'new', file: File, preview: string };

    const [images, setImages] = useState<ImageItem[]>([]);

    useModalHistory(isOpen, onClose);

    // Load data for edit mode
    useEffect(() => {
        if (isOpen && editVenueId) {
            loadVenueData(editVenueId);
        } else if (isOpen && !editVenueId) {
            // Reset form
            setFormData({
                category: "연습실",
                name: "",
                address: "",
                phone: "",
                description: "",
                website_url: "",
                map_url: "",
                images: []
            });
            setImages([]);
            setThumbnailFile(null);
            setThumbnailPreview("");
        }
    }, [isOpen, editVenueId, user]); // Add user dependency to re-check if login state changes

    const loadVenueData = async (id: string) => {
        setLoading(true);
        const { data } = await supabase
            .from('venues')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (data) {
            // Ownership check (only if user is logged in - if not, Overlay covers it)
            if (user && data.user_id && user.id !== data.user_id && !isAdmin) {
                alert("본인이 등록한 장소만 수정할 수 있습니다.");
                onClose();
                return;
            }

            setFormData({
                category: data.category,
                name: data.name,
                address: data.address || "",
                phone: data.phone || "",
                description: data.description || "",
                website_url: data.website_url || "",
                map_url: data.map_url || "",
                images: typeof data.images === 'string' ? JSON.parse(data.images) : (data.images || [])
            });

            // Set existing images
            const rawImages: any[] = typeof data.images === 'string' ? JSON.parse(data.images) : (data.images || []);

            // Identify dedicated thumbnail (it's at index 0 and has isThumbnail: true)
            const hasDedicatedThumbnail = rawImages.length > 0 && rawImages[0].isThumbnail;
            const dbThumbnail = hasDedicatedThumbnail ? rawImages[0].url : (data.image || "");
            const galleryPhotos = hasDedicatedThumbnail ? rawImages.slice(1) : rawImages;

            const loadedImages: ImageItem[] = galleryPhotos.map((img: any) => {
                let preview = "";
                if (typeof img === 'string') preview = img;
                else preview = img.url || img.medium || img.full || img.thumbnail || "";

                return { type: 'existing', url: img, preview };
            });
            setImages(loadedImages);
            setThumbnailPreview(dbThumbnail);
        }
        setLoading(false);
    };

    const handleChange = (field: keyof VenueFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);

            if (images.length + files.length > MAX_GALLERY_IMAGES) {
                alert(`이미지는 최대 ${MAX_GALLERY_IMAGES}개까지만 등록 가능합니다.`);
                // Only take the first few files that fit
                const remainingSlots = MAX_GALLERY_IMAGES - images.length;
                if (remainingSlots <= 0) return;

                const allowedFiles = files.slice(0, remainingSlots);
                const newItems: ImageItem[] = allowedFiles.map(file => ({
                    type: 'new',
                    file,
                    preview: URL.createObjectURL(file)
                }));
                setImages(prev => [...prev, ...newItems]);
                return;
            }

            const newItems: ImageItem[] = files.map(file => ({
                type: 'new',
                file,
                preview: URL.createObjectURL(file)
            }));

            setImages(prev => [...prev, ...newItems]);
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setThumbnailFile(file);
            setThumbnailPreview(URL.createObjectURL(file));
        }
    };

    const uploadThumbnail = async (file: File): Promise<string> => {
        try {
            // 썸네일 리사이징 (세로 기준 170px)
            const thumbImage = await resizeImage(file, 170, 0.75, 'thumb.webp', 'height');

            const timestamp = Date.now();
            const fileName = `${timestamp}_thumb.webp`;
            const filePath = `venue-images/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, thumbImage, {
                    contentType: 'image/webp',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('images').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (err) {
            console.error("Thumbnail upload failed:", err);
            return "";
        }
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) return alert("이름을 입력해주세요.");

        // Auth check is handled by Overlay, but for safety:
        if (!user) return;

        setLoading(true);
        try {
            // 1. Thumbnail Upload
            let thumbnailUrl = thumbnailPreview;
            if (thumbnailFile) {
                thumbnailUrl = await uploadThumbnail(thumbnailFile);
            }

            // 2. Gallery Images Upload (Resized to 700px width)
            const finalImages = await Promise.all(images.map(async (item) => {
                if (item.type === 'existing') {
                    return item.url;
                } else {
                    // Upload new image
                    const file = item.file;
                    const baseName = `${Date.now()}_${Math.random().toString(36).substring(2)}`;

                    // 리사이징 (연습실 이미지 최적화: 가로 700px)
                    const targetImage = await resizeImage(file, 700, 0.85, 'image.webp', 'width');

                    const filePath = `venue-images/${baseName}.webp`;

                    const { error: uploadError } = await supabase.storage
                        .from('images')
                        .upload(filePath, targetImage, {
                            contentType: 'image/webp',
                            cacheControl: '31536000',
                            upsert: true
                        });

                    if (uploadError) throw uploadError;

                    const { data: publicData } = supabase.storage.from('images').getPublicUrl(filePath);
                    return publicData.publicUrl;
                }
            }));

            // Combine thumbnail and gallery images
            // Tag explicitly provided thumbnail to hide it from the photo gallery in detail view
            const allImages = thumbnailUrl
                ? [{ url: thumbnailUrl, isThumbnail: true }, ...finalImages.filter(img => img !== thumbnailUrl)]
                : finalImages;

            const payload = {
                ...formData,
                images: allImages, // JSONB array of gallery images (thumbnail at index 0)
                updated_at: new Date().toISOString()
            };

            if (editVenueId) {
                const { error } = await supabase.from('venues').update(payload).eq('id', editVenueId);
                if (error) throw error;
                alert("수정되었습니다.");
            } else {
                const { error } = await supabase.from('venues').insert([{ ...payload, user_id: user.id }]);
                if (error) throw error;
                alert("등록되었습니다.");
            }

            onVenueCreated?.();
            onClose();

        } catch (e) {
            console.error(e);
            alert("오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!editVenueId) return;
        if (!confirm("정말로 이 장소를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('venues').delete().eq('id', editVenueId);
            if (error) throw error;
            alert("삭제되었습니다.");
            onVenueDeleted?.();
            onClose();
        } catch (e) {
            console.error(e);
            alert("삭제 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="vrm-overlay" onClick={onClose}>
            <div className="vrm-container" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                {/* Login Requirement Overlay */}
                {!user && <LoginOverlay />}
                <div className="vrm-header">
                    <h2>{editVenueId ? "장소 수정" : "장소 등록"}</h2>
                    <button onClick={onClose} className="vrm-close-btn"><i className="ri-close-line"></i></button>
                </div>

                <div className="vrm-content">
                    {/* Section 1: Category */}
                    <div className="vrm-section">
                        <label className="vrm-label">카테고리</label>
                        <div className="vrm-radio-group">
                            <button
                                className={`vrm-radio-btn ${formData.category === '연습실' ? 'active' : ''}`}
                                onClick={() => handleChange('category', '연습실')}
                            >
                                <i className="ri-music-2-line"></i> 연습실
                            </button>
                            <button
                                className={`vrm-radio-btn ${formData.category === '스윙바' ? 'active' : ''}`}
                                onClick={() => handleChange('category', '스윙바')}
                            >
                                <i className="ri- goblet-line"></i> 스윙바
                            </button>
                        </div>
                    </div>

                    {/* Section 2: Basic Info */}
                    <div className="vrm-section">
                        <div className="vrm-input-group">
                            <label>이름</label>
                            <input
                                value={formData.name}
                                onChange={e => handleChange('name', e.target.value)}
                                placeholder="장소 이름 (예: 리듬앤조이 연습실)"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>주소</label>
                            <input
                                value={formData.address}
                                onChange={e => handleChange('address', e.target.value)}
                                placeholder="상세 주소"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>전화번호</label>
                            <input
                                value={formData.phone}
                                onChange={e => handleChange('phone', e.target.value)}
                                placeholder="010-0000-0000"
                            />
                        </div>
                    </div>

                    {/* Section 3: Details */}
                    <div className="vrm-section">
                        <div className="vrm-input-group">
                            <label>설명</label>
                            <textarea
                                value={formData.description}
                                onChange={e => handleChange('description', e.target.value)}
                                placeholder="장소에 대한 설명을 입력해주세요."
                                rows={4}
                            />
                        </div>

                        <div className="vrm-input-group">
                            <label>웹사이트/링크</label>
                            <input
                                value={formData.website_url}
                                onChange={e => handleChange('website_url', e.target.value)}
                                placeholder="https://"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>지도 링크</label>
                            <input
                                value={formData.map_url}
                                onChange={e => handleChange('map_url', e.target.value)}
                                placeholder="네이버/카카오맵 URL"
                            />
                        </div>
                    </div>

                    {/* Section: Thumbnail */}
                    <div className="vrm-section">
                        <label className="vrm-label">대표 썸네일 (최소 150px)</label>
                        <div className="vrm-thumbnail-upload">
                            <label className="vrm-thumb-btn">
                                {thumbnailPreview ? (
                                    <img src={thumbnailPreview} alt="Thumbnail" className="vrm-thumb-preview" />
                                ) : (
                                    <div className="vrm-thumb-placeholder">
                                        <i className="ri-image-add-line"></i>
                                        <span>썸네일 추가</span>
                                    </div>
                                )}
                                <input type="file" accept="image/*" onChange={handleThumbnailChange} hidden />
                            </label>
                        </div>
                    </div>

                    {/* Section 4: Images */}
                    <div className="vrm-section">
                        <label className="vrm-label">이미지 ({images.length}/{MAX_GALLERY_IMAGES})</label>
                        <div className="vrm-image-upload">
                            {images.length < MAX_GALLERY_IMAGES && (
                                <label className="vrm-upload-btn">
                                    <i className="ri-add-line"></i>
                                    <span>사진 추가</span>
                                    <input type="file" multiple accept="image/*" onChange={handleImageChange} hidden />
                                </label>
                            )}

                            <div className="vrm-image-list">
                                {images.map((item, idx) => (
                                    <div key={idx} className="vrm-image-preview">
                                        <img src={item.preview} alt="" />
                                        <button onClick={() => removeImage(idx)}><i className="ri-close-circle-fill"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="vrm-footer">
                    {editVenueId && (
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="vrm-delete-btn"
                            style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                padding: '0.875rem 1.5rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            삭제
                        </button>
                    )}
                    <button onClick={handleSubmit} disabled={loading} className="vrm-submit-btn">
                        {loading ? "저장 중..." : "저장하기"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
