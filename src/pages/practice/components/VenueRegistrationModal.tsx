import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useModalHistory } from "../../../hooks/useModalHistory";
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
    images: string[];
}

export default function VenueRegistrationModal({
    isOpen,
    onClose,
    onVenueCreated,
    onVenueDeleted,
    editVenueId
}: VenueRegistrationModalProps) {
    useAuth();

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

    const [loading, setLoading] = useState(false);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);

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
            setImageFiles([]);
            setImagePreviews([]);
        }
    }, [isOpen, editVenueId]);

    const loadVenueData = async (id: string) => {
        setLoading(true);
        const { data } = await supabase
            .from('venues')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
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
            // Set existing images as previews
            const existingImages = typeof data.images === 'string' ? JSON.parse(data.images) : (data.images || []);
            setImagePreviews(existingImages);
        }
        setLoading(false);
    };

    const handleChange = (field: keyof VenueFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const newPreviews = files.map(file => URL.createObjectURL(file));

            setImageFiles(prev => [...prev, ...files]);
            setImagePreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeImage = (index: number) => {
        setImageFiles(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) return alert("이름을 입력해주세요.");

        setLoading(true);
        try {
            let finalImages = [...formData.images]; // Start with existing

            // Upload new images
            if (imageFiles.length > 0) {
                const uploadPromises = imageFiles.map(async (file) => {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
                    const filePath = `venue-images/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('images')
                        .upload(filePath, file);

                    if (uploadError) throw uploadError;

                    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
                    return data.publicUrl;
                });

                const newUrls = await Promise.all(uploadPromises);
                finalImages = [...finalImages, ...newUrls]; // Append new
                // Note: Logic needs to handle "Removing existing images" correctly if user deleted them from preview
                // Current simplistic logic assumes appending.
                // For accurate editing, we should track which existing images were kept.
                // Let's assume imagePreviews contains EVERYTHING (existing URLs + new blob URLs).
                // But blob URLs are not valid for DB.

                // Revised Logic:
                // Filter imagePreviews to find which are http/https (existing)
                const keptExisting = imagePreviews.filter(url => url.startsWith('http'));
                finalImages = [...keptExisting, ...newUrls];
            } else {
                // Just keep existing if no new files
                const keptExisting = imagePreviews.filter(url => url.startsWith('http'));
                finalImages = keptExisting;
            }

            const payload = {
                ...formData,
                images: finalImages, // JSONB
                updated_at: new Date().toISOString()
            };

            if (editVenueId) {
                const { error } = await supabase.from('venues').update(payload).eq('id', editVenueId);
                if (error) throw error;
                alert("수정되었습니다.");
            } else {
                const { error } = await supabase.from('venues').insert([payload]);
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
            <div className="vrm-container" onClick={e => e.stopPropagation()}>
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

                    {/* Section 4: Images */}
                    <div className="vrm-section">
                        <label className="vrm-label">이미지</label>
                        <div className="vrm-image-upload">
                            <label className="vrm-upload-btn">
                                <i className="ri-add-line"></i>
                                <span>사진 추가</span>
                                <input type="file" multiple accept="image/*" onChange={handleImageChange} hidden />
                            </label>

                            <div className="vrm-image-list">
                                {imagePreviews.map((src, idx) => (
                                    <div key={idx} className="vrm-image-preview">
                                        <img src={src} alt="" />
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
