import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { createResizedImages } from '../../../utils/imageResize';
import { retryOperation } from '../../../utils/asyncUtils';
import ImageCropModal from '../../../components/ImageCropModal';
import styles from './DocumentCreateModal.module.css'; // Updated to new 2-column layout styles

interface Props {
    onClose: () => void;
    onSuccess: (resource: any) => void;
    context: 'drawer' | 'canvas';
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    level?: number;
    children?: Category[];
}

export const DocumentCreateModal = ({ onClose, onSuccess, context }: Props) => {
    const { isAdmin } = useAuth();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [year, setYear] = useState<string>('');
    const [isOnTimeline, _setIsOnTimeline] = useState(false); // _ prefix to suppress warning or remove if truly unneeded
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isPublic, setIsPublic] = useState(true);
    const [saveToLibrary, setSaveToLibrary] = useState(true);

    // Multi-image states
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [originalImageFiles, setOriginalImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
    const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null); // Which image is being edited
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('learning_categories').select('*').order('created_at');
            if (data) {
                setCategories(buildTree(data));
            }
        };
        fetchCategories();
    }, []);

    const buildTree = (items: any[], parentId: string | null = null, level: number = 0): Category[] => {
        return items
            .filter(item => item.parent_id === parentId)
            .map(item => ({
                ...item,
                level,
                children: buildTree(items, item.id, level + 1)
            }));
    };

    const flattenCategories = (cats: Category[]): Category[] => {
        let result: Category[] = [];
        cats.forEach(cat => {
            result.push(cat);
            if (cat.children) {
                result = [...result, ...flattenCategories(cat.children)];
            }
        });
        return result;
    };

    const flatCategoryList = flattenCategories(categories);

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

    const handleCreate = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            setIsLoading(true);
            setError(null);

            if (!title.trim()) throw new Error('제목을 입력해주세요.');
            if (!categoryId) throw new Error('카테고리를 선택해주세요.');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const imagesMetadata: Array<{
                micro: string;
                thumbnail: string;
                medium: string;
                full: string;
            }> = [];

            // Upload multiple images if files are selected
            if (imageFiles.length > 0) {
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 9);
                const folderName = `${timestamp}-${randomStr}`;
                const basePath = `documents/${folderName}`;

                for (let i = 0; i < imageFiles.length; i++) {
                    const file = imageFiles[i];
                    const fileUrl = URL.createObjectURL(file);

                    try {
                        // Create 4 sizes using existing utility
                        const { micro, thumbnail, medium, full } = await createResizedImages(file);

                        // Upload all 4 sizes with index prefix
                        const uploadPromises = [
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-micro.webp`, micro, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-thumbnail.webp`, thumbnail, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-medium.webp`, medium, { contentType: 'image/webp', upsert: true }),
                            supabase.storage.from('learning-images').upload(`${basePath}/image-${i}-full.webp`, full, { contentType: 'image/webp', upsert: true })
                        ];

                        const results = await Promise.all(uploadPromises);

                        // Check for errors
                        results.forEach((result, idx) => {
                            if (result.error) throw new Error(`이미지 ${i + 1} 업로드 실패 (${['micro', 'thumbnail', 'medium', 'full'][idx]})`);
                        });

                        // Get public URLs
                        imagesMetadata.push({
                            micro: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-micro.webp`).data.publicUrl,
                            thumbnail: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-thumbnail.webp`).data.publicUrl,
                            medium: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-medium.webp`).data.publicUrl,
                            full: supabase.storage.from('learning-images').getPublicUrl(`${basePath}/image-${i}-full.webp`).data.publicUrl
                        });
                    } finally {
                        URL.revokeObjectURL(fileUrl);
                    }
                }
            }

            const { data: newResource, error: insertError } = await supabase
                .from('learning_resources')
                .insert({
                    title,
                    description: content, // Map content to description
                    category_id: categoryId,
                    user_id: user.id, // Map author_id to user_id
                    type: 'document', // Explicit type
                    year: year ? parseInt(year) : null,
                    image_url: imagesMetadata[0]?.medium || null, // Primary image for compatibility
                    metadata: {
                        is_public: isPublic,
                        is_on_timeline: context === 'canvas' || isOnTimeline,
                        created_at: new Date().toISOString(),
                        is_hidden_from_drawer: context === 'canvas' && !saveToLibrary,
                        // Multi-image support
                        images: imagesMetadata,
                        // Backward compatibility: first image as default
                        image_micro: imagesMetadata[0]?.micro || null,
                        image_thumbnail: imagesMetadata[0]?.thumbnail || null,
                        image_medium: imagesMetadata[0]?.medium || null,
                        image_full: imagesMetadata[0]?.full || null
                    }
                })
                .select()
                .single();

            if (insertError) throw insertError;

            console.log('✅ [DocumentCreateModal] Success:', newResource);
            onSuccess(newResource);
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.message || '저장 실패');
        } finally {
            setIsLoading(false);
        }
    };

    const modalContent = (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>새 문서(Markdown) 작성</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    {/* Left Column: Form Fields */}
                    <div className={styles.leftColumn}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>
                                저장할 폴더 (카테고리) <span className={styles.required}>*</span>
                            </label>
                            <select
                                className={styles.select}
                                value={categoryId || ''}
                                onChange={(e) => setCategoryId(e.target.value)}
                            >
                                <option value="">폴더 선택...</option>
                                {flatCategoryList.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                        {'\u00A0\u00A0'.repeat(cat.level || 0)} {cat.level && cat.level > 0 ? '└ ' : ''}{cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>제목 <span className={styles.required}>*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="문서 제목을 입력하세요"
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>연도 (역사 타임라인용)</label>
                            <input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                placeholder="예: 1980"
                                className={styles.input}
                            />
                        </div>

                        {context === 'canvas' && (
                            <div className={styles.formGroup}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={saveToLibrary}
                                        onChange={(e) => setSaveToLibrary(e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <span style={{ color: '#60a5fa', fontWeight: '600' }}>서랍(자료실)에도 저장하기</span>
                                </label>
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                    className={styles.checkbox}
                                />
                                <span>공개 문서로 설정 (체크 해제 시 비공개)</span>
                            </label>
                        </div>

                        <div className={styles.formGroup} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label className={styles.label}>내용 (Markdown 지원 예정)</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="문서 내용을 입력하세요..."
                                className={`${styles.input} ${styles.textarea}`}
                                style={{ flex: 1, minHeight: '200px' }}
                            />
                        </div>
                    </div>

                    {/* Right Column: Multi-Image Upload */}
                    <div className={styles.rightColumn}>
                        <div className={styles.formGroup} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <label className={styles.label}>이미지 ({imagePreviews.length}장)</label>

                            {/* Image Gallery */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                gap: '12px',
                                padding: '8px',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.02)'
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
                                                width: '24px',
                                                height: '24px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                {/* Add Image Button */}
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
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                                >
                                    <i className="ri-image-add-line" style={{ fontSize: '2rem', color: '#888' }}></i>
                                    <span style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>추가</span>
                                </div>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                style={{ display: 'none' }}
                                multiple // Allow multiple file selection
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '0 24px' }}>
                        <div className={`${styles.message} ${styles.error}`}>
                            {error}
                        </div>
                    </div>
                )}

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelButton}>취소</button>
                    <button
                        onClick={handleCreate}
                        disabled={isLoading || !title || !categoryId}
                        className={styles.importButton}
                    >
                        {isLoading ? '저장 중...' : '문서 저장'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {createPortal(modalContent, document.body)}
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
};
