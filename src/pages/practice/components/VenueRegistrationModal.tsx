import React, { useState, useEffect, useRef } from "react";
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
    const { user, isAdmin } = useAuth(); // Destructure required auth methods



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

    // Kakao Map Search State
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);
    const skipNextSearch = useRef(false);

    // Ensure Kakao SDK is loaded
    useEffect(() => {
        let isMounted = true;
        const checkAndLoadSdk = () => {
            console.log('[VRM] checkAndLoadSdk - window.kakao:', !!window.kakao, 'window.kakao.maps:', !!window.kakao?.maps, 'window.kakao.maps.services:', !!window.kakao?.maps?.services);
            if (window.kakao && window.kakao.maps) {
                window.kakao.maps.load(() => {
                    if (isMounted) {
                        console.log('[VRM] Kakao Maps SDK Loaded Successfully');
                        setIsSdkLoaded(true);
                    }
                });
            } else {
                if (isMounted) {
                    console.warn('[VRM] Kakao SDK not fully available yet.');
                    setIsSdkLoaded(false);
                }
            }
        };

        if (isOpen) {
            checkAndLoadSdk();
            const timer1 = setTimeout(checkAndLoadSdk, 500);
            const timer2 = setTimeout(checkAndLoadSdk, 1500);
            const timer3 = setTimeout(checkAndLoadSdk, 3000);
            return () => {
                isMounted = false;
                clearTimeout(timer1);
                clearTimeout(timer2);
                clearTimeout(timer3);
            };
        } else {
            setIsSdkLoaded(false);
            setSearchKeyword('');
            setSearchResults([]);
        }
    }, [isOpen]);

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
            setSearchKeyword('');
            setSearchResults([]);
        }
    }, [isOpen, editVenueId, user]); // Add user dependency to re-check if login state changes

    // Search Logic
    const performSearch = async (keyword: string) => {
        console.log('[VRM] performSearch called with keyword:', keyword);
        if (!keyword.trim()) {
            console.log('[VRM] Keyword is empty, aborting search.');
            setSearchResults([]);
            return;
        }
        if (!isSdkLoaded) {
            console.error('[VRM] 카카오 지도 SDK가 로드되지 않아 검색을 실행할 수 없습니다.');
            alert('지도 서비스를 준비 중입니다. 잠시만 기다려주세요.');
            return;
        }

        setIsSearching(true);
        const ps = new window.kakao.maps.services.Places();

        const cleanKeyword = keyword.trim();
        const noSpaceKeyword = cleanKeyword.replace(/\s+/g, '');

        const searchQueries = [
            cleanKeyword,
            `${cleanKeyword} 연습실`,
            `${cleanKeyword} 스튜디오`,
            `${cleanKeyword} 바`
        ];

        if (noSpaceKeyword !== cleanKeyword) {
            searchQueries.push(`${noSpaceKeyword}연습실`);
            searchQueries.push(noSpaceKeyword);
        }

        if (cleanKeyword.includes('홉')) {
            const hopReplaced = cleanKeyword.replace(/홉/g, '홉댄스');
            searchQueries.push(hopReplaced);
            searchQueries.push(`${hopReplaced} 연습실`);
            searchQueries.push('신촌 홉댄스');
            searchQueries.push('신촌 홉댄스 연습실');
            searchQueries.push('신촌 HOP');
        }

        const searchPromises = searchQueries.map(q => {
            return new Promise<any[]>((resolve) => {
                ps.keywordSearch(q, (data: any, status: any) => {
                    if (status === window.kakao.maps.services.Status.OK) {
                        resolve(data);
                    } else {
                        resolve([]);
                    }
                });
            });
        });

        try {
            const resultsArrays = await Promise.all(searchPromises);
            let mergedResults: any[] = [];
            resultsArrays.forEach(arr => {
                mergedResults = [...mergedResults, ...arr];
            });

            const uniqueResults = Array.from(
                new Map(mergedResults.map(item => [item.id, item])).values()
            );

            setSearchResults(uniqueResults);
        } catch (error) {
            console.error('Search failed', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (skipNextSearch.current) {
                skipNextSearch.current = false;
                return;
            }
            performSearch(searchKeyword);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [searchKeyword, isSdkLoaded]);

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

        // Photo Validation
        if (!thumbnailPreview && images.length === 0) {
            return alert("대표 썸네일 또는 이미지를 최소 1장 이상 등록해주세요.");
        }

        // Auth check is handled by Overlay, but for safety:
        if (!user) {
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: { message: '장소 등록은 로그인 후 이용 가능합니다.' }
            }));
            return;
        }

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

                    {/* Section: Search (Auto-fill) */}
                    <div className="vrm-section vrm-search-section">
                        <label className="vrm-label">장소 검색</label>
                        <form
                            className="vrm-search-bar"
                            onSubmit={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                performSearch(searchKeyword);
                            }}
                        >
                            <input
                                type="text"
                                value={searchKeyword}
                                onChange={e => {
                                    setSearchKeyword(e.target.value);
                                    if (e.target.value.trim() === '') setSearchResults([]);
                                }}
                                placeholder="장소명 또는 주소를 입력 후 엔터"
                                className="vrm-search-input"
                            />
                            <button type="submit" className="vrm-search-btn" disabled={isSearching}>
                                {isSearching
                                    ? <i className="ri-loader-4-line spin"></i>
                                    : <i className="ri-search-line"></i>
                                }
                            </button>
                        </form>

                        {searchResults.length > 0 && (
                            <ul className="vrm-search-results">
                                {searchResults.map((place, idx) => (
                                    <li key={idx} className="vrm-search-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleChange('name', place.place_name);
                                            handleChange('address', place.road_address_name || place.address_name);
                                            handleChange('map_url', place.place_url);
                                            if (place.phone) handleChange('phone', place.phone);
                                            setSearchResults([]);
                                            skipNextSearch.current = true;
                                            setSearchKeyword(place.place_name);
                                        }}
                                    >
                                        <div className="vrm-search-item-info">
                                            <span className="vrm-search-item-title">{place.place_name}</span>
                                            <span className="vrm-search-item-address">{place.road_address_name || place.address_name}</span>
                                        </div>
                                        <span className="vrm-search-item-btn">적용</span>
                                    </li>
                                ))}
                            </ul>
                        )}
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
