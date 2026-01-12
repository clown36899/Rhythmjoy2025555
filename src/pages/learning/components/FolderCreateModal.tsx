import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
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

export const FolderCreateModal = ({ onClose, onSuccess, context }: Props) => {
    const { isAdmin } = useAuth();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [year, setYear] = useState<string>('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [saveToLibrary, setSaveToLibrary] = useState(true);

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

    const handleCreate = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            setIsLoading(true);
            setError(null);

            if (!name.trim()) throw new Error('폴더 이름을 입력해주세요.');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            // A "Folder" is a learning_resource of type 'general' or a learning_category.
            // In the context of the timeline, we want to create a node. 
            // If the user chooses 'Save to Library', we create a learning_resource (type=general).

            const { data: newResource, error: insertError } = await supabase
                .from('learning_resources')
                .insert({
                    title: name,
                    description: description,
                    category_id: categoryId,
                    user_id: user.id,
                    type: 'general',
                    year: year ? parseInt(year) : null,
                    metadata: {
                        is_public: true,
                        created_at: new Date().toISOString(),
                        is_hidden_from_drawer: !saveToLibrary
                    }
                })
                .select()
                .single();

            if (insertError) throw insertError;

            console.log('✅ [FolderCreateModal] Success:', newResource);
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
            <div className={styles.modal} style={{ maxWidth: '500px', width: '90%' }}>
                <div className={styles.header}>
                    <h3 className={styles.title}>새 폴더 생성</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>폴더 이름 <span className={styles.required}>*</span></label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="폴더 이름을 입력하세요"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>상위 폴더 (선택사항)</label>
                        <select
                            className={styles.select}
                            value={categoryId || ''}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            <option value="">최상위 (Root)</option>
                            {flatCategoryList.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {'\u00A0\u00A0'.repeat(cat.level || 0)} {cat.level && cat.level > 0 ? '└ ' : ''}{cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>연도 (타임라인 배치용)</label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="예: 1940"
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
                        <label className={styles.label}>설명</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="폴더에 대한 설명을 설명하세요..."
                            className={styles.input}
                            style={{ minHeight: '100px', resize: 'vertical' }}
                        />
                    </div>

                    {error && (
                        <div className={`${styles.message} ${styles.error}`}>
                            {error}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelButton}>취소</button>
                    <button
                        onClick={handleCreate}
                        disabled={isLoading || !name}
                        className={styles.importButton}
                    >
                        {isLoading ? '생성 중...' : '폴더 저장'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
