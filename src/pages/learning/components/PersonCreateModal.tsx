import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import { convertToWebP } from '../../../utils/imageUtils';
import styles from './PlaylistImportModal.module.css';

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
export const PersonCreateModal = ({ onClose, onSuccess, context: _context }: Props) => {
    const { isAdmin } = useAuth();
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [year, setYear] = useState('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);

    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await cafe24.from('learning_categories').select('*').order('created_at');
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

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert('이미지 크기는 5MB 이하여야 합니다.');
                return;
            }
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            setIsLoading(true);
            setError(null);

            if (!name.trim()) throw new Error('이름을 입력해주세요.');
            if (!categoryId) throw new Error('카테고리를 선택해주세요.');

            const { data: { user } } = await cafe24.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            let imageUrl = null;
            if (selectedFile) {
                const webpBlob = await convertToWebP(selectedFile, 400, 400, 0.8);
                const fileName = `person-${Date.now()}.webp`;
                const filePath = `persons/${fileName}`;

                const { error: uploadError } = await cafe24.storage
                    .from('images')
                    .upload(filePath, webpBlob, {
                        contentType: 'image/webp',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = cafe24.storage
                    .from('images')
                    .getPublicUrl(filePath);
                imageUrl = publicUrl;
            }

            const { data: newResource, error: insertError } = await cafe24
                .from('learning_resources')
                .insert({
                    title: name,
                    description: bio,
                    image_url: imageUrl,
                    category_id: categoryId,
                    user_id: user.id,
                    type: 'person',
                    year: year ? parseInt(year) : null,
                    metadata: {
                        is_public: true, // Correct location
                        created_at: new Date().toISOString()
                    }
                })
                .select()
                .single();

            if (insertError) throw insertError;

            console.log('✅ [PersonCreateModal] Success:', newResource);
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
            <div className={styles.modal} style={{ maxWidth: '600px', width: '90%' }}>
                <div className={styles.header}>
                    <h3 className={styles.title}>새 인물 추가</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', marginBottom: '16px' }}>
                        {/* Profile Image Preview/Upload */}
                        <div style={{ flexShrink: 0 }}>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: '120px', height: '120px', borderRadius: '12px',
                                    backgroundColor: '#111827', border: '1px solid #374151',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', overflow: 'hidden', position: 'relative'
                                }}
                            >
                                {previewImage ? (
                                    <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#6b7280' }}>
                                        <div style={{ fontSize: '24px' }}>👤</div>
                                        <div style={{ fontSize: '12px', marginTop: '4px' }}>사진 업로드</div>
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                                accept="image/*"
                            />
                        </div>

                        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>이름 <span className={styles.required}>*</span></label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="인물 이름을 입력하세요"
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>연도 (활동 시기)</label>
                                <input
                                    type="number"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    placeholder="예: 1930"
                                    className={styles.input}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                        <label className={styles.label}>저장할 폴더 (카테고리) <span className={styles.required}>*</span></label>
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
                        <label className={styles.label}>약력 / 설명</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="인물에 대한 설명을 입력하세요..."
                            className={styles.input}
                            style={{ minHeight: '120px', resize: 'vertical' }}
                        />
                    </div>


                    {error && (
                        <div className={`${styles.message} ${styles.error}`} style={{ marginTop: '16px' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelButton}>취소</button>
                    <button
                        onClick={handleCreate}
                        disabled={isLoading || !name || !categoryId}
                        className={styles.importButton}
                    >
                        {isLoading ? '저장 중...' : '인물 저장'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
