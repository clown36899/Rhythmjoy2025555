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
    map_kakao: string;
    map_naver: string;
    map_google: string;
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
    const { user, isAdmin, userProfile } = useAuth(); // Destructure required auth methods

    const logVenueEdit = async (action: 'created' | 'updated' | 'deleted', venueId: string, venueName: string, changes?: object) => {
        if (!user) return;
        try {
            await supabase.from('venue_edit_logs').insert({
                venue_id: venueId,
                venue_name: venueName,
                user_id: user.id,
                user_nickname: userProfile?.nickname || user.email?.split('@')[0] || user.id,
                action,
                changes: changes || null,
            });
        } catch (e) {
            console.error('[VRM] Failed to log venue edit:', e);
        }
    };



    // Stages: 0: Category, 1: Basic Info, 2: Images & Desc, 3: Preview/Confirm? or just 1 big form
    // User asked for "multi-step or multi-column". Let's do a clean multi-section form.

    const [formData, setFormData] = useState<VenueFormData>({
        category: "연습실",
        name: "",
        address: "",
        phone: "",
        description: "",
        website_url: "",
        map_kakao: "",
        map_naver: "",
        map_google: "",
        images: []
    });


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
                map_kakao: "",
                map_naver: "",
                map_google: "",
                images: []
            });
            setImages([]);
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

            let parsedMapUrls = { kakao: '', naver: '', google: '' };
            if (data.map_url) {
                if (data.map_url.startsWith('{')) {
                    try { parsedMapUrls = JSON.parse(data.map_url); } catch(e){}
                } else if (data.map_url.includes('naver')) {
                    parsedMapUrls.naver = data.map_url;
                } else {
                    parsedMapUrls.kakao = data.map_url;
                }
            }

            setFormData({
                category: data.category,
                name: data.name,
                address: data.address || "",
                phone: data.phone || "",
                description: data.description || "",
                website_url: data.website_url || "",
                map_kakao: parsedMapUrls.kakao || "",
                map_naver: parsedMapUrls.naver || "",
                map_google: parsedMapUrls.google || "",
                images: typeof data.images === 'string' ? JSON.parse(data.images) : (data.images || [])
            });

            // Load all images (first = thumbnail)
            const rawImages: any[] = typeof data.images === 'string' ? JSON.parse(data.images) : (data.images || []);
            const loadedImages: ImageItem[] = rawImages.map((img: any) => {
                const preview = typeof img === 'string' ? img : (img.url || img.medium || img.full || img.thumbnail || "");
                return { type: 'existing', url: img, preview };
            });
            setImages(loadedImages);
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

    const moveImage = (index: number, direction: -1 | 1) => {
        const newIdx = index + direction;
        setImages(prev => {
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const arr = [...prev];
            [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
            return arr;
        });
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) return alert("이름을 입력해주세요.");

        // Photo Validation
        if (images.length === 0) {
            return alert("이미지를 최소 1장 이상 등록해주세요.");
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
            // 폴더 기반 업로드: venue-images/{venueId}/{idx}.webp
            const venueId = editVenueId || crypto.randomUUID();
            const folderPath = `venue-images/${venueId}`;

            // 수정 시 기존 폴더 파일 삭제 (새로 덮어쓰기 위해)
            if (editVenueId) {
                const { data: oldFiles } = await supabase.storage.from('images').list(folderPath);
                if (oldFiles && oldFiles.length > 0) {
                    await supabase.storage.from('images').remove(oldFiles.map(f => `${folderPath}/${f.name}`));
                }
            }

            const finalImages = await Promise.all(images.map(async (item, idx) => {
                const fullPath = `${folderPath}/${idx}.webp`;

                if (item.type === 'existing') {
                    // 기존 이미지는 이미 폴더 형식 → 그대로 유지
                    return item.url;
                }

                const file = item.file;
                const fullImage = await resizeImage(file, 700, 0.85, 'image.webp', 'width');
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(fullPath, fullImage, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
                if (uploadError) throw uploadError;
                const fullUrl = supabase.storage.from('images').getPublicUrl(fullPath).data.publicUrl;

                if (idx === 0) {
                    const thumbImage = await resizeImage(file, 200, 0.8, 'thumb.webp', 'width');
                    const thumbPath = `${folderPath}/0_thumb.webp`;
                    await supabase.storage.from('images').upload(thumbPath, thumbImage, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
                    const thumbUrl = supabase.storage.from('images').getPublicUrl(thumbPath).data.publicUrl;
                    return { url: fullUrl, thumb: thumbUrl };
                }
                return fullUrl;
            }));

            const allImages = finalImages;

            const payload = {
                category: formData.category,
                name: formData.name,
                address: formData.address,
                phone: formData.phone,
                description: formData.description,
                website_url: formData.website_url,
                map_url: JSON.stringify({
                    kakao: formData.map_kakao,
                    naver: formData.map_naver,
                    google: formData.map_google
                }),
                images: allImages, // JSONB array of gallery images (thumbnail at index 0)
                updated_at: new Date().toISOString()
            };

            if (editVenueId) {
                const { error } = await supabase.from('venues').update(payload).eq('id', editVenueId);
                if (error) throw error;
                await logVenueEdit('updated', editVenueId, payload.name, payload);
                alert("수정되었습니다.");
            } else {
                const { data: inserted, error } = await supabase.from('venues').insert([{ ...payload, id: venueId, user_id: user.id }]).select('id').single();
                if (error) throw error;
                if (inserted) await logVenueEdit('created', inserted.id, payload.name, payload);
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
            const venueName = formData.name;
            // storage 폴더 삭제
            const folderPath = `venue-images/${editVenueId}`;
            const { data: files } = await supabase.storage.from('images').list(folderPath);
            if (files && files.length > 0) {
                await supabase.storage.from('images').remove(files.map(f => `${folderPath}/${f.name}`));
            }
            const { error } = await supabase.from('venues').delete().eq('id', editVenueId);
            if (error) throw error;
            await logVenueEdit('deleted', editVenueId, venueName);
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
                                            handleChange('map_kakao', place.place_url);
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
                            <label>웹사이트/링크 <span style={{ fontSize: '11px', fontWeight: 'normal', opacity: 0.6, marginLeft: '4px' }}>(사진 클릭 시 이동)</span></label>
                            <input
                                value={formData.website_url}
                                onChange={e => handleChange('website_url', e.target.value)}
                                placeholder="https://"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>카카오 지도 링크</label>
                            <input
                                value={formData.map_kakao}
                                onChange={e => handleChange('map_kakao', e.target.value)}
                                placeholder="카카오맵 공유 URL"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>네이버 지도 링크</label>
                            <input
                                value={formData.map_naver}
                                onChange={e => handleChange('map_naver', e.target.value)}
                                placeholder="네이버 지도 공유 URL"
                            />
                        </div>
                        <div className="vrm-input-group">
                            <label>구글 지도 링크</label>
                            <input
                                value={formData.map_google}
                                onChange={e => handleChange('map_google', e.target.value)}
                                placeholder="구글 지도 공유 URL"
                            />
                        </div>
                    </div>

                    {/* Section: Images */}
                    <div className="vrm-section">
                        <label className="vrm-label">이미지 ({images.length}/{MAX_GALLERY_IMAGES}) — 첫 번째 = 썸네일</label>
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
                                    <div key={idx} className={`vrm-image-preview${idx === 0 ? ' vrm-image-thumb' : ''}`}>
                                        <img src={item.preview} alt="" />
                                        {idx === 0 && <span className="vrm-thumb-badge">썸네일</span>}
                                        <div className="vrm-image-controls">
                                            {idx > 0 && (
                                                <button className="vrm-move-btn" onClick={() => moveImage(idx, -1)}><i className="ri-arrow-left-s-line"></i></button>
                                            )}
                                            {idx < images.length - 1 && (
                                                <button className="vrm-move-btn" onClick={() => moveImage(idx, 1)}><i className="ri-arrow-right-s-line"></i></button>
                                            )}
                                        </div>
                                        <button className="vrm-remove-btn" onClick={() => removeImage(idx)}><i className="ri-close-circle-fill"></i></button>
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
