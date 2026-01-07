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
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingResources, setLoadingResources] = useState(false);

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

    // --- Draft Recovery Logic ---
    const DRAFT_KEY = 'node_editor_draft';

    useEffect(() => {
        if (!node) {
            const draft = localStorage.getItem(DRAFT_KEY);
            if (draft) {
                try {
                    const parsed = JSON.parse(draft);
                    if (parsed && (parsed.title || parsed.description || parsed.youtube_url) && window.confirm('작성 중인 임시 내용이 있습니다. 복구하시겠습니까?')) {
                        setFormData(prev => ({ ...prev, ...parsed }));
                        if (parsed.image_url) setImagePreview(parsed.image_url);
                    } else {
                        // If user declines, or draft is empty/invalid, clear it? 
                        // Maybe keep it if they just want to start fresh but keep draft for later? 
                        // Standard behavior is usually clear or ignore. I'll clear if they decline explicitly.
                        if (draft) localStorage.removeItem(DRAFT_KEY);
                    }
                } catch (e) {
                    console.error('Failed to parse draft', e);
                }
            }
        }
    }, [node]);

    useEffect(() => {
        if (!node) {
            const timer = setTimeout(() => {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [formData, node]);
    // ---------------------------


    // Auto-check drawer for person category and load resources for video category
    // Auto-Detect Category from URL
    useEffect(() => {
        const url = formData.youtube_url;
        if (url) {
            if (url.includes('list=')) {
                setFormData(prev => {
                    if (prev.category !== 'playlist') return { ...prev, category: 'playlist', addToDrawer: true };
                    return prev;
                });
            } else if (url.includes('v=') || url.includes('youtu.be/')) {
                setFormData(prev => {
                    if (prev.category !== 'video') return { ...prev, category: 'video', addToDrawer: true };
                    return prev;
                });
            }
        }
    }, [formData.youtube_url]);

    // Enforce Drawer Policy & Load Resources
    useEffect(() => {
        const strictCategories = ['person', 'playlist', 'video', 'document'];
        if (strictCategories.includes(formData.category)) {
            setFormData(prev => {
                if (!prev.addToDrawer) return { ...prev, addToDrawer: true };
                return prev;
            });

            if (formData.category === 'video') {
                loadResources();
            }
        }
    }, [formData.category]);

    const loadResources = async () => {
        setLoadingResources(true);
        try {
            // Load playlists
            const { data: playlistData } = await supabase
                .from('playlists')
                .select('id, title, youtube_url')
                .order('created_at', { ascending: false })
                .limit(20);

            // Load individual videos
            const { data: videoData } = await supabase
                .from('videos')
                .select('id, title, youtube_url')
                .order('created_at', { ascending: false })
                .limit(20);

            setPlaylists(playlistData || []);
            setVideos(videoData || []);
        } catch (error) {
            console.error('Failed to load resources:', error);
        } finally {
            setLoadingResources(false);
        }
    };

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
        localStorage.removeItem(DRAFT_KEY);
    };

    const handleResourceSelect = (resource: any, type: 'playlist' | 'video') => {
        setFormData(prev => ({
            ...prev,
            title: resource.title,
            youtube_url: resource.youtube_url || '',
            category: type,
            addToDrawer: true
        }));
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
                            <option value="general">일반 (폴더)</option>
                            <option value="person">인물</option>
                            <option value="playlist">재생목록</option>
                            <option value="video">영상</option>
                            <option value="document">문서</option>
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

                    {formData.category === 'video' && (
                        <div className="info-message" style={{
                            padding: '12px',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            color: '#a78bfa'
                        }}>
                            📹 영상 노드는 자동으로 자료 서랍에 추가됩니다
                        </div>
                    )}

                    {formData.category === 'video' && (
                        <div className="form-group">
                            <label>영상 선택</label>
                            {loadingResources ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                    로딩 중...
                                </div>
                            ) : (
                                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #333', borderRadius: '8px', padding: '8px', marginBottom: '16px' }}>
                                    {playlists.length > 0 && (
                                        <>
                                            <div style={{ padding: '8px', fontWeight: 'bold', color: '#a78bfa', fontSize: '0.9rem' }}>
                                                📹 재생목록
                                            </div>
                                            {playlists.map(playlist => (
                                                <div
                                                    key={`playlist-${playlist.id}`}
                                                    onClick={() => handleResourceSelect(playlist, 'playlist')}
                                                    style={{
                                                        padding: '12px',
                                                        margin: '4px 0',
                                                        background: formData.title === playlist.title ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        border: formData.title === playlist.title ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (formData.title !== playlist.title) {
                                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (formData.title !== playlist.title) {
                                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                        }
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.95rem', color: '#fff' }}>{playlist.title}</div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {videos.length > 0 && (
                                        <>
                                            <div style={{ padding: '8px', fontWeight: 'bold', color: '#60a5fa', fontSize: '0.9rem', marginTop: playlists.length > 0 ? '12px' : '0' }}>
                                                🎬 개별 영상
                                            </div>
                                            {videos.map(video => (
                                                <div
                                                    key={`video-${video.id}`}
                                                    onClick={() => handleResourceSelect(video, 'video')}
                                                    style={{
                                                        padding: '12px',
                                                        margin: '4px 0',
                                                        background: formData.title === video.title ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        border: formData.title === video.title ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (formData.title !== video.title) {
                                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (formData.title !== video.title) {
                                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                        }
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.95rem', color: '#fff' }}>{video.title}</div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {playlists.length === 0 && videos.length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                            영상이 없습니다
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <label>
                            {['playlist', 'video'].includes(formData.category) ? '유튜브 URL' : '참조 링크 (URL)'}
                        </label>
                        <input
                            type="url"
                            value={formData.youtube_url}
                            onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                            placeholder={['playlist', 'video'].includes(formData.category) ? "https://www.youtube.com/watch?v=..." : "https://example.com/..."}
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
                                disabled={formData.category !== 'general'}
                                style={{ width: 'auto', margin: 0, opacity: formData.category !== 'general' ? 0.5 : 1, cursor: formData.category !== 'general' ? 'not-allowed' : 'pointer' }}
                            />
                            <label
                                htmlFor="addToDrawer"
                                style={{
                                    margin: 0,
                                    cursor: formData.category !== 'general' ? 'not-allowed' : 'pointer',
                                    color: formData.category !== 'general' ? '#888' : '#60a5fa'
                                }}
                            >
                                {formData.category !== 'general' ? '자료 서랍에 자동 저장됩니다' : '자료 서랍에 원본 추가하기'}
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
