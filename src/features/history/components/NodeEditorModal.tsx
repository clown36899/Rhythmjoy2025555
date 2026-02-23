//
// 🏛️ History Node Editor
//
// ⚠️ ARCHITECTURE NOTE:
// For Linked Nodes, this editor acts as a "Proxy Editor" for the underlying Learning Resource.
// - All inputs (Title, Desc, Year) are UNLOCKED.
// - Changes are passed to `onSave`, which then performs a Direct Sync to `learning_resources`.
// - This ensures the user can edit the "Source of Truth" without leaving the Timeline.
//

import React, { useState, useEffect, useRef } from 'react';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import { supabase } from '../../../lib/supabase';
import { renderTextWithLinksAndResources } from '../../../pages/learning/utils/linkRenderer';
import { AutocompleteMenu } from './AutocompleteMenu';
import { createResizedImages } from '../../../utils/imageResize';
import ImageCropModal from '../../../components/ImageCropModal';
import './NodeEditorModal.css';

interface NodeEditorModalProps {
    node: any | null;
    onSave: (data: any) => void;
    onDelete?: (id: number) => void;
    onClose: () => void;
    onEditSource?: () => void;
}

export const NodeEditorModal: React.FC<NodeEditorModalProps> = ({ node, onSave, onDelete, onClose }) => {
    const [formData, setFormData] = useState({
        title: '',
        year: '',
        date: '',
        description: '',
        youtube_url: '',
        attachment_url: '',
        category: 'general',
        tags: '',
        addToDrawer: false,
        image_url: '',
        content: '', // 사용자 상세 메모
        arrow_rotation: 0,
        arrow_length: 200,
        arrow_text: '',
    });
    // Multi-image states
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [originalImageFiles, setOriginalImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [playlists, setPlaylists] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingResources, setLoadingResources] = useState(false);

    // --- Autocomplete State ---
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [autocompleteQuery, setAutocompleteQuery] = useState('');
    const [cursorPosition, setCursorPosition] = useState({ top: 0, left: 0 });
    const [allResources, setAllResources] = useState<any[]>([]);
    const [filteredResources, setFilteredResources] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch all resources and nodes for autocomplete
    useEffect(() => {
        const fetchAllItems = async () => {
            const [resourcesResponse, nodesResponse] = await Promise.all([
                supabase.from('learning_resources').select('id, title, type').order('title'),
                supabase.from('history_nodes').select('id, title, category').order('title')
            ]);

            let combined: any[] = [];

            if (resourcesResponse.data) {
                combined = [...combined, ...resourcesResponse.data];
            }

            if (nodesResponse.data) {
                const nodes = nodesResponse.data.map((n: any) => ({
                    id: n.id,
                    title: n.title,
                    type: n.category === 'canvas' ? 'canvas' : 'node'
                }));
                combined = [...combined, ...nodes];
            }

            // Remove duplicates by title (optional, but good if resource and node share name)
            // For now keep all.
            setAllResources(combined);
        };
        fetchAllItems();
    }, []);

    // Filter resources based on query
    useEffect(() => {
        if (autocompleteQuery) {
            const lowerQuery = autocompleteQuery.toLowerCase();
            const filtered = allResources.filter(r =>
                r.title && r.title.toLowerCase().includes(lowerQuery)
            ).slice(0, 10); // Limit to 10 suggestions
            setFilteredResources(filtered);
            setSelectedIndex(0);
        } else {
            setFilteredResources([]);
        }
    }, [autocompleteQuery, allResources]);

    // Handle key navigation for autocomplete
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showAutocomplete) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredResources.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredResources.length) % filteredResources.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredResources[selectedIndex]) {
                handleSelectResource(filteredResources[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowAutocomplete(false);
        }
    };

    const handleSelectResource = (item: any) => {
        if (!textareaRef.current) return;

        const textarea = textareaRef.current;
        const value = textarea.value;
        const selectionEnd = textarea.selectionEnd;
        const currentScrollTop = textarea.scrollTop; // 🔥 Capture scroll position

        // Find the start of the hashtag trigger
        const lastHash = value.lastIndexOf('#', selectionEnd - 1);
        if (lastHash === -1) return;

        const safeTitle = item.title.replace(/\s+/g, '_');
        // Replace ONLY the typed part with the full tag
        // We need to properly replace 'search term' with 'tag'
        // Actually, we replace from 'lastHash' to 'selectionEnd'.
        const newValue = value.substring(0, lastHash) +
            `#${safeTitle} ` + // Insert title with space
            value.substring(selectionEnd);

        setFormData(prev => ({ ...prev, content: newValue }));
        setShowAutocomplete(false);

        // Restore focus (timeout needed for React re-render)
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newCursorPos = lastHash + safeTitle.length + 2; // +1 for #, +1 for space, uses safeTitle length
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                textareaRef.current.scrollTop = currentScrollTop; // 🔥 Restore scroll position
            }
        }, 0);
    };

    // Calculate caret coordinates for absolute positioning
    const getCaretCoordinates = () => {
        if (!textareaRef.current) return { top: 0, left: 0 };
        const textarea = textareaRef.current;
        const { selectionEnd } = textarea;

        // Create a mirror div to calculate position
        const div = document.createElement('div');
        const computedStyle = window.getComputedStyle(textarea);

        // Copy styles
        Array.from(computedStyle).forEach(prop => {
            div.style.setProperty(prop, computedStyle.getPropertyValue(prop), computedStyle.getPropertyPriority(prop));
        });

        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.top = '0';
        div.style.left = '0';

        // Content up to selection
        div.textContent = textarea.value.substring(0, selectionEnd);

        // Add a span for the caret
        const span = document.createElement('span');
        span.textContent = '.';
        div.appendChild(span);

        document.body.appendChild(div);

        const { offsetLeft, offsetTop } = span;
        const { top, left } = textarea.getBoundingClientRect();

        document.body.removeChild(div);

        return {
            top: top + offsetTop + window.scrollY - textarea.scrollTop + 24, // +24 for line height approx
            left: left + offsetLeft + window.scrollX
        };
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setFormData({ ...formData, content: val });

        // Check for trigger '#'
        const selectionEnd = e.target.selectionEnd;
        const lastHash = val.lastIndexOf('#', selectionEnd - 1);

        if (lastHash !== -1) {
            // Check if there's a space between hash and cursor (meaning we might be done typing tag)
            // But we want to allow multi-word titles for resources, so we stop at newline or some other delimiter?
            // Actually, usually tags stop at space. BUT resource titles contain spaces.
            // Let's assume we search ALL text after # until cursor.

            // Check if there is a newline between hash and cursor -> Invalid
            const textAfterHash = val.substring(lastHash + 1, selectionEnd);
            if (textAfterHash.includes('\n')) {
                setShowAutocomplete(false);
                return;
            }

            // Valid trigger!
            setAutocompleteQuery(textAfterHash);

            if (!showAutocomplete) {
                const pos = getCaretCoordinates();
                setCursorPosition(pos);
                setShowAutocomplete(true);
            }
        } else {
            setShowAutocomplete(false);
        }
    };


    useEffect(() => {
        if (node) {
            setFormData({
                title: node.title || '',
                year: node.year?.toString() || '',
                date: node.date || '',
                description: node.description || '',
                youtube_url: node.youtube_url || '',
                attachment_url: node.attachment_url || '',
                category: node.category || 'general',
                tags: node.tags?.join(', ') || '',
                addToDrawer: false,
                image_url: node.image_url || '',
                content: node.content || '',
                arrow_rotation: node.arrow_rotation || 0,
                arrow_length: node.arrow_length || 200,
                arrow_text: node.arrow_text || '',
            });

            // Handle Multi-Image Preview Loading
            const meta = node.metadata || {};
            let previews: string[] = [];

            if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
                // Use medium size for previews by default, fallback to other sizes
                previews = meta.images.map((img: any) => img.medium || img.full || img.thumbnail || img.micro);
            } else if (node.image_url) {
                previews = [node.image_url];
            } else if (meta.image_medium || meta.image_full) { // Backward compatibility
                previews = [meta.image_medium || meta.image_full];
            }

            setImagePreviews(previews);

            // Reset files (since we're editing existing node, we don't have File objects yet unless we add new ones)
            setImageFiles([]);
            setOriginalImageFiles([]); // We don't have original files for existing images
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
                        if (parsed.image_url) {
                            setImagePreviews([parsed.image_url]); // Use plural and array
                        }
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
            // Load playlists from unified table
            const { data: playlistResources } = await supabase
                .from('learning_resources')
                .select('id, title, url')
                .eq('type', 'playlist')
                .order('created_at', { ascending: false })
                .limit(20);

            // Load individual videos from unified table
            const { data: videoResources } = await supabase
                .from('learning_resources')
                .select('id, title, url')
                .eq('type', 'video')
                .order('created_at', { ascending: false })
                .limit(20);

            // Map 'url' to 'youtube_url' for compatibility with existing UI logic
            const mappedPlaylists = (playlistResources || []).map(r => ({ ...r, youtube_url: r.url }));
            const mappedVideos = (videoResources || []).map(r => ({ ...r, youtube_url: r.url }));

            setPlaylists(mappedPlaylists);
            setVideos(mappedVideos);
        } catch (error) {
            console.error('Failed to load resources:', error);
        } finally {
            setLoadingResources(false);
        }
    };

    // Helper to read file as Data URL with compression
    const fileToDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Canvas context not available'));
                        return;
                    }

                    const maxSize = 1920;
                    let width = img.width;
                    let height = img.height;

                    if (width > height && width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                };
                img.onerror = reject;
                img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    // Multi-Image Handlers
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            try {
                const dataUrl = await fileToDataURL(file);
                setTempImageSrc(dataUrl);
                setCurrentEditIndex(imageFiles.length); // Adding new image
                setOriginalImageFiles([...originalImageFiles, file]);
                setIsCropModalOpen(true);
            } catch (error) {
                console.error('Failed to load image:', error);
                alert('이미지를 불러오는데 실패했습니다.');
            }
        }
        e.target.value = '';
    };

    const handleImageUpdate = async (file: File) => {
        if (currentEditIndex === null) return;

        try {
            const dataUrl = await fileToDataURL(file);
            setTempImageSrc(dataUrl);

            const newOriginals = [...originalImageFiles];
            newOriginals[currentEditIndex] = file;
            setOriginalImageFiles(newOriginals);
        } catch (error) {
            console.error('Failed to update image preview:', error);
        }
    };

    const handleCropComplete = (croppedFile: File, previewUrl: string, _isModified: boolean) => {
        if (currentEditIndex === null) return;

        const newFiles = [...imageFiles];
        const newPreviews = [...imagePreviews];

        newFiles[currentEditIndex] = croppedFile;
        newPreviews[currentEditIndex] = previewUrl;

        setImageFiles(newFiles);
        setImagePreviews(newPreviews);
        setTempImageSrc(null);
        setIsCropModalOpen(false);
        setCurrentEditIndex(null);
    };

    const handleRemoveImage = (index: number) => {
        setImageFiles(imageFiles.filter((_, i) => i !== index));
        setImagePreviews(imagePreviews.filter((_, i) => i !== index));
        setOriginalImageFiles(originalImageFiles.filter((_, i) => i !== index));
    };

    const handleEditImage = async (index: number) => {
        setCurrentEditIndex(index);
        setTempImageSrc(imagePreviews[index]);
        setIsCropModalOpen(true);
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Prepare Images Metadata
        const imagesMetadata: any[] = [];

        // If there are previews, we need to handle them
        if (imagePreviews.length > 0) {
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 9);
            // Use consistent folder path for Documents and Persons
            const folderName = `${timestamp}-${randomStr}`;
            const basePath = `documents/${folderName}`;

            for (let i = 0; i < imagePreviews.length; i++) {
                const file = imageFiles[i];

                if (file) {
                    // 1. Upload new file (4 sizes)
                    try {
                        const { micro, thumbnail, medium, full } = await createResizedImages(file);

                        const uploadPromises = [
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-micro.webp`, micro, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-thumbnail.webp`, thumbnail, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-medium.webp`, medium, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-full.webp`, full, { contentType: 'image/webp', upsert: true })
                        ];

                        const results = await Promise.all(uploadPromises);
                        // Check for errors
                        results.forEach((result, _idx) => { // Use underscore
                            if (result.error) throw new Error(`Image upload failed: ${result.error.message}`);
                        });

                        imagesMetadata.push({
                            micro: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-micro.webp`).data.publicUrl,
                            thumbnail: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-thumbnail.webp`).data.publicUrl,
                            medium: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-medium.webp`).data.publicUrl,
                            full: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-full.webp`).data.publicUrl
                        });
                    } catch (err) {
                        console.error(`Failed to upload image ${i}`, err);
                        alert('이미지 업로드 중 오류가 발생했습니다.');
                        return;
                    }
                } else {
                    // 2. Existing image - find stored metadata
                    const previewUrl = imagePreviews[i];
                    const existing = node?.metadata?.images?.find((img: any) =>
                        img.medium === previewUrl || img.full === previewUrl || img.thumbnail === previewUrl || img.micro === previewUrl
                    );

                    if (existing) {
                        imagesMetadata.push(existing);
                    } else {
                        // Fallback for legacy or unmatched URLs
                        imagesMetadata.push({
                            micro: previewUrl, thumbnail: previewUrl, medium: previewUrl, full: previewUrl
                        });
                    }
                }
            }
        }

        // Determine primary image URL (backward compatibility)
        let primaryImageUrl: string | null = formData.image_url;
        if (imagesMetadata.length > 0) {
            primaryImageUrl = imagesMetadata[0].medium || imagesMetadata[0].full || imagesMetadata[0].thumbnail;
        } else if (imagePreviews.length === 0) {
            primaryImageUrl = null; // All images removed
        }

        // Construct Metadata
        const metadata = {
            ...(node?.metadata || {}), // Keep existing metadata (like youtube info if any)
            images: imagesMetadata,
            // Backward compatibility fields
            image_micro: imagesMetadata[0]?.micro || null,
            image_thumbnail: imagesMetadata[0]?.thumbnail || null,
            image_medium: imagesMetadata[0]?.medium || null,
            image_full: imagesMetadata[0]?.full || null,
        };

        const data = {
            id: node?.id,
            title: formData.title,
            year: formData.year ? parseInt(formData.year) : null,
            date: formData.date || null,
            description: formData.description,
            youtube_url: formData.youtube_url,
            attachment_url: formData.attachment_url,
            category: formData.category,
            tags: formData.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            image_url: primaryImageUrl,
            metadata: metadata, // Save metadata with images array
            content: formData.content,
            // Pass existing linked IDs
            linked_video_id: node?.linked_video_id,
            linked_document_id: node?.linked_document_id,
            linked_playlist_id: node?.linked_playlist_id,
            linked_category_id: node?.linked_category_id,
            // Arrow fields
            arrow_rotation: formData.category === 'arrow' ? formData.arrow_rotation : null,
            arrow_length: formData.category === 'arrow' ? formData.arrow_length : null,
            arrow_text: formData.category === 'arrow' ? formData.arrow_text : null,
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

    // Detect if this is a linked node (Source of Truth is elsewhere)
    const isLinked = node && (node.linked_playlist_id || node.linked_document_id || node.linked_video_id || node.linked_category_id);

    const videoInfo = formData.youtube_url ? parseVideoUrl(formData.youtube_url) : null;

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <>
            <div className="node-editor-modal-overlay" onMouseDown={handleOverlayClick}>
                <div className="node-editor-modal" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="node-editor-header">
                        <h2>{node ? (isLinked ? '연동된 노드 수정' : '노드 수정') : '새 노드 추가'}</h2>
                        <button className="node-editor-close" onClick={onClose}>
                            <i className="ri-close-line"></i>
                        </button>
                    </div >

                    <form id="node-editor-form" className="node-editor-form" onSubmit={handleSubmit}>

                        <div className="form-group">
                            <label>제목 * {isLinked && <span style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: 'normal', marginLeft: '8px' }}>(원본과 동기화됨)</span>}</label>
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



                            {formData.category !== 'person' && (
                                <div className="form-group">
                                    <label>정확한 날짜</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label>카테고리</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                disabled={!!node}
                                style={{
                                    cursor: node ? 'not-allowed' : 'pointer',
                                    opacity: node ? 0.7 : 1,
                                    backgroundColor: node ? 'rgba(255, 255, 255, 0.05)' : undefined
                                }}
                            >
                                <option value="general">일반 (폴더)</option>
                                <option value="canvas">서브 캔버스 (방)</option>
                                <option value="person">인물</option>
                                <option value="playlist">재생목록</option>
                                <option value="video">영상</option>
                                <option value="document">문서</option>
                                <option value="arrow">화살표</option>
                            </select>
                            {formData.category === 'canvas' && (
                                <small style={{ color: '#a78bfa', display: 'block', marginTop: '6px', fontSize: '0.85rem' }}>
                                    🚪 더블 클릭하여 들어갈 수 있는 새로운 캔버스 공간을 만듭니다.
                                </small>
                            )}
                            {formData.category === 'arrow' && (
                                <small style={{ color: '#ff6b6b', display: 'block', marginTop: '6px', fontSize: '0.85rem' }}>
                                    ➡️ 회전 가능하고 길이 조정이 가능한 화살표를 만듭니다.
                                </small>
                            )}
                            {!!node && (
                                <small style={{ color: '#888', display: 'block', marginTop: '6px', fontSize: '0.85rem' }}>
                                    ℹ️ 기존 노드의 카테고리는 수정할 수 없습니다. 변경이 필요하면 새 노드를 생성해 주세요.
                                </small>
                            )}
                        </div>

                        {(formData.category === 'person' || formData.category === 'document') && (
                            <>
                                <div className="info-message" style={{
                                    padding: '12px',
                                    backgroundColor: formData.category === 'person' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                    border: `1px solid ${formData.category === 'person' ? 'rgba(59, 130, 246, 0.3)' : '#555'}`,
                                    borderRadius: '8px',
                                    marginBottom: '16px',
                                    color: formData.category === 'person' ? '#60a5fa' : '#ccc'
                                }}>
                                    {formData.category === 'person'
                                        ? 'ℹ️ 인물 노드는 자동으로 자료 서랍에 추가됩니다'
                                        : 'ℹ️ 문서는 여러 장의 이미지를 업로드할 수 있습니다'}
                                </div>
                                <div className="form-group">
                                    <label>{formData.category === 'person' ? '인물 사진' : `이미지 (${imagePreviews.length}장)`}</label>

                                    {/* Image Assets Gallery */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                                        gap: '10px',
                                        padding: '10px',
                                        border: '1px solid #374151',
                                        borderRadius: '8px',
                                        background: 'rgba(0, 0, 0, 0.2)',
                                        marginBottom: '12px'
                                    }}>
                                        {imagePreviews.map((preview, index) => (
                                            <div key={index} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #555' }}>
                                                <img
                                                    src={preview}
                                                    alt={`Image ${index + 1}`}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                                    onClick={() => handleEditImage(index)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveImage(index);
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '4px',
                                                        right: '4px',
                                                        background: 'rgba(0, 0, 0, 0.7)',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: '20px',
                                                        height: '20px',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}

                                        {/* Add Button */}
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{
                                                aspectRatio: '1',
                                                border: '2px dashed #555',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <i className="ri-image-add-line" style={{ fontSize: '1.5rem', color: '#888' }}></i>
                                            <span style={{ fontSize: '0.7rem', color: '#888', marginTop: '4px' }}>추가</span>
                                        </div>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageSelect}
                                        style={{ display: 'none' }}
                                        multiple={formData.category === 'document'} // Document allows multiple
                                    />
                                </div>
                            </>
                        )}

                        {formData.category === 'arrow' && (
                            <>
                                <div className="info-message" style={{
                                    padding: '12px',
                                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                                    border: '1px solid rgba(255, 107, 107, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '16px',
                                    color: '#ff6b6b'
                                }}>
                                    ➡️ 화살표 노드는 회전과 길이 조정이 가능합니다
                                </div>

                                <div className="form-group">
                                    <label>화살표 텍스트</label>
                                    <input
                                        type="text"
                                        value={formData.arrow_text}
                                        onChange={(e) => setFormData({ ...formData, arrow_text: e.target.value })}
                                        placeholder="화살표에 표시할 텍스트 (선택사항)"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>회전 각도: {formData.arrow_rotation}°</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={formData.arrow_rotation}
                                        onChange={(e) => setFormData({ ...formData, arrow_rotation: parseInt(e.target.value) })}
                                        style={{ width: '100%' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>
                                        <span>0°</span>
                                        <span>90°</span>
                                        <span>180°</span>
                                        <span>270°</span>
                                        <span>360°</span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>화살표 길이: {formData.arrow_length}px</label>
                                    <input
                                        type="range"
                                        min="100"
                                        max="500"
                                        value={formData.arrow_length}
                                        onChange={(e) => setFormData({ ...formData, arrow_length: parseInt(e.target.value) })}
                                        style={{ width: '100%' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>
                                        <span>100px</span>
                                        <span>300px</span>
                                        <span>500px</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {formData.category === 'video' && !isLinked && (
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

                        {formData.category === 'video' && !isLinked && (
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

                        {['playlist', 'video'].includes(formData.category) && (
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
                        )}

                        <div className="form-group">
                            <label>첨부 링크 (선택)</label>
                            <input
                                type="url"
                                value={formData.attachment_url}
                                onChange={(e) => setFormData({ ...formData, attachment_url: e.target.value })}
                                placeholder="https://ko.wikipedia.org/wiki/..."
                            />
                            <small style={{ color: '#888', fontSize: '0.85rem', marginTop: '4px', display: 'block' }}>
                                위키피디아, 참고 자료 등의 링크를 입력하세요
                            </small>
                        </div>

                        {/* (영상/재생목록 연동 시에만) 원본 설명 - 항상 읽기 전용 */}
                        {isLinked && ['video', 'playlist'].includes(formData.category) && (
                            <div className="form-group">
                                <label>원본 설명 <span style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: 'normal', marginLeft: '8px' }}>(원본과 동기화됨)</span></label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="원본 설명이 없습니다."
                                    rows={3}
                                    disabled={false}
                                />
                            </div>
                        )}

                        {/* 상세 메모 - 모든 노드의 "기본" 편집 필드 */}
                        <div className="form-group" style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                            <label style={{ color: '#60a5fa', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>상세 메모 (직접 편집)</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#9ca3af', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                    💡 Tip: <span style={{ color: '#8b5cf6' }}>[[위키백과]]</span> <span style={{ color: '#3b82f6' }}>#자료연동</span>
                                </span>
                            </label>
                            <textarea
                                ref={textareaRef}
                                value={formData.content}
                                onChange={handleInput}
                                onKeyDown={handleKeyDown}
                                placeholder="이 노드에 대한 설명이나 나만의 노트를 자유롭게 입력하세요. 내용이 길어지면 자동으로 스크롤됩니다."
                                rows={8}
                                style={{ border: '1px solid rgba(96, 165, 250, 0.3)', background: 'rgba(96, 165, 250, 0.02)', lineHeight: '1.6' }}
                            />
                            {showAutocomplete && filteredResources.length > 0 && (
                                <AutocompleteMenu
                                    items={filteredResources}
                                    position={cursorPosition}
                                    selectedIndex={selectedIndex}
                                    onSelect={handleSelectResource}
                                    onClose={() => setShowAutocomplete(false)}
                                />
                            )}
                            {/* Live Preview */}
                            {formData.content && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '12px',
                                    background: 'rgba(17, 24, 39, 0.5)',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    color: '#e5e7eb',
                                    border: '1px border rgba(255, 255, 255, 0.05)'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Preview</div>
                                    <div className="content-preview" style={{ lineHeight: '1.6' }}>
                                        {renderTextWithLinksAndResources(formData.content, () => { })}
                                    </div>
                                </div>
                            )}
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


                        {(!node || !isLinked) && (
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
                    </form>

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
                            <button type="submit" form="node-editor-form" className="btn-save">
                                {node ? '수정' : '생성'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <ImageCropModal
                isOpen={isCropModalOpen}
                imageUrl={tempImageSrc}
                onClose={() => {
                    setIsCropModalOpen(false);
                    setCurrentEditIndex(null);
                }}
                onCropComplete={handleCropComplete}
                onChangeImage={() => fileInputRef.current?.click()}
                onImageUpdate={handleImageUpdate}
                fileName={`document-image-${currentEditIndex !== null ? currentEditIndex : 'new'}.jpg`}
                originalImageUrl={currentEditIndex !== null && originalImageFiles[currentEditIndex] ? URL.createObjectURL(originalImageFiles[currentEditIndex]) : null}
                hasOriginal={currentEditIndex !== null && !!originalImageFiles[currentEditIndex]}
            />
        </>
    );
}
