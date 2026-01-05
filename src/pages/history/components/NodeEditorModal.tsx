import React, { useState, useEffect } from 'react';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import { supabase } from '../../../lib/supabase';
import './NodeEditorModal.css';

interface NodeEditorModalProps {
    node: any | null;
    onSave: (data: any) => void;
    onDelete?: (id: number) => void;
    onClose: () => void;
}

export const NodeEditorModal: React.FC<NodeEditorModalProps> = ({ node, onSave, onDelete, onClose }) => {
    const [formData, setFormData] = useState({
        title: '',
        year: '',
        date: '',
        description: '',
        youtube_url: '',
        category: 'general',
        tags: '',
        addToDrawer: false,
        image_url: '',
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    useEffect(() => {
        if (node) {
            setFormData({
                title: node.title || '',
                year: node.year?.toString() || '',
                date: node.date || '',
                description: node.description || '',
                youtube_url: node.youtube_url || '',
                category: node.category || 'general',
                tags: node.tags?.join(', ') || '',
                addToDrawer: false,
                image_url: node.image_url || '',
            });
            if (node.image_url) {
                setImagePreview(node.image_url);
            }
        }
    }, [node]);

    // Auto-check drawer for person category
    useEffect(() => {
        if (formData.category === 'person') {
            setFormData(prev => ({ ...prev, addToDrawer: true }));
        }
    }, [formData.category]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const resizeImageToWebP = (file: File, maxSize: number = 300): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions (square crop)
                    const size = Math.min(width, height);
                    const x = (width - size) / 2;
                    const y = (height - size) / 2;

                    canvas.width = maxSize;
                    canvas.height = maxSize;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Canvas context not available'));
                        return;
                    }

                    // Draw cropped and resized image
                    ctx.drawImage(img, x, y, size, size, 0, 0, maxSize, maxSize);

                    // Convert to WebP
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error('Failed to create blob'));
                            }
                        },
                        'image/webp',
                        0.85 // Quality
                    );
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let image_url = formData.image_url;

        // Upload image if person category and file selected
        if (formData.category === 'person' && imageFile) {
            try {
                // Resize to 300x300 WebP
                const resizedBlob = await resizeImageToWebP(imageFile, 300);

                const fileName = `${Date.now()}.webp`;
                const filePath = `documents/temp/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('learning-images')
                    .upload(filePath, resizedBlob, {
                        contentType: 'image/webp',
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('learning-images')
                    .getPublicUrl(filePath);

                image_url = publicUrl;
            } catch (error) {
                console.error('Image upload error:', error);
                alert('이미지 업로드 실패');
                return;
            }
        }

        const data = {
            title: formData.title,
            year: formData.year ? parseInt(formData.year) : null,
            date: formData.date || null,
            description: formData.description,
            youtube_url: formData.youtube_url,
            category: formData.category,
            tags: formData.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            addToDrawer: formData.addToDrawer,
            image_url,
        };

        onSave(data);
    };

    const handleDelete = () => {
        if (!node || !onDelete) return;

        if (window.confirm('정말로 이 노드를 삭제하시겠습니까? 연결된 모든 관계도 함께 삭제될 수 있습니다.')) {
            onDelete(node.id);
        }
    };

    const videoInfo = formData.youtube_url ? parseVideoUrl(formData.youtube_url) : null;

    return (
        <div className="node-editor-modal-overlay" onClick={onClose}>
            <div className="node-editor-modal" onClick={(e) => e.stopPropagation()}>
                <div className="node-editor-header">
                    <h2>{node ? '노드 수정' : '새 노드 추가'}</h2>
                    <button className="node-editor-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form className="node-editor-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>제목 *</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="예: 린디합의 탄생"
                            required
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>연도</label>
                            <input
                                type="number"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                                placeholder="1920"
                            />
                        </div>

                        <div className="form-group">
                            <label>정확한 날짜</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>카테고리</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                            <option value="general">일반</option>
                            <option value="genre">장르</option>
                            <option value="person">인물</option>
                            <option value="event">이벤트</option>
                            <option value="music">음악</option>
                        </select>
                    </div>

                    {formData.category === 'person' && (
                        <>
                            <div className="info-message" style={{
                                padding: '12px',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                color: '#60a5fa'
                            }}>
                                ℹ️ 인물 노드는 자동으로 자료 서랍에 추가됩니다
                            </div>
                            <div className="form-group">
                                <label>인물 사진</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageSelect}
                                    style={{ marginBottom: '12px' }}
                                />
                                {imagePreview && (
                                    <div style={{
                                        width: '120px',
                                        height: '120px',
                                        borderRadius: '50%',
                                        overflow: 'hidden',
                                        margin: '0 auto',
                                        border: '2px solid rgba(255, 255, 255, 0.2)'
                                    }}>
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label>유튜브 URL</label>
                        <input
                            type="url"
                            value={formData.youtube_url}
                            onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                            placeholder="https://www.youtube.com/watch?v=..."
                        />
                        {videoInfo?.thumbnailUrl && (
                            <div className="video-preview">
                                <img src={videoInfo.thumbnailUrl} alt="Preview" />
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>설명</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            onPaste={(e) => {
                                // Preserve line breaks when pasting HTML content
                                e.preventDefault();
                                const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');

                                if (text.includes('<')) {
                                    // HTML content - convert block elements to newlines
                                    const div = document.createElement('div');
                                    div.innerHTML = text;

                                    // Replace block elements with newlines
                                    div.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6').forEach(el => {
                                        if (el.tagName === 'BR') {
                                            el.replaceWith('\n');
                                        } else {
                                            el.insertAdjacentText('afterend', '\n');
                                        }
                                    });

                                    const plainText = div.innerText || div.textContent || '';
                                    const target = e.target as HTMLTextAreaElement;
                                    const start = target.selectionStart;
                                    const end = target.selectionEnd;
                                    const currentValue = formData.description;
                                    const newValue = currentValue.substring(0, start) + plainText + currentValue.substring(end);

                                    setFormData({ ...formData, description: newValue });

                                    // Set cursor position after pasted text
                                    setTimeout(() => {
                                        target.selectionStart = target.selectionEnd = start + plainText.length;
                                    }, 0);
                                } else {
                                    // Plain text - insert as is
                                    const target = e.target as HTMLTextAreaElement;
                                    const start = target.selectionStart;
                                    const end = target.selectionEnd;
                                    const currentValue = formData.description;
                                    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);

                                    setFormData({ ...formData, description: newValue });

                                    setTimeout(() => {
                                        target.selectionStart = target.selectionEnd = start + text.length;
                                    }, 0);
                                }
                            }}
                            placeholder="이 노드에 대한 설명을 입력하세요..."
                            rows={4}
                        />
                    </div>

                    <div className="form-group">
                        <label>태그 (쉼표로 구분)</label>
                        <input
                            type="text"
                            value={formData.tags}
                            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            placeholder="스윙, 린디합, 사보이볼룸"
                        />
                    </div>

                    {(!node || (!node.linked_playlist_id && !node.linked_document_id && !node.linked_video_id)) && (
                        <div className="form-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                id="addToDrawer"
                                checked={formData.addToDrawer}
                                onChange={(e) => setFormData({ ...formData, addToDrawer: e.target.checked })}
                                style={{ width: 'auto', margin: 0 }}
                            />
                            <label htmlFor="addToDrawer" style={{ margin: 0, cursor: 'pointer', color: '#60a5fa' }}>
                                자료 서랍에 원본 추가하기
                            </label>
                        </div>
                    )}

                    <div className="form-actions">
                        {node && onDelete && (
                            <button type="button" className="btn-delete" onClick={handleDelete}>
                                삭제
                            </button>
                        )}
                        <div className="form-actions-right">
                            <button type="button" className="btn-cancel" onClick={onClose}>
                                취소
                            </button>
                            <button type="submit" className="btn-save">
                                {node ? '수정' : '생성'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
